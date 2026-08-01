import {
  FORMULA,
  MIN_SPEED_FACTOR,
  MAX_SPEED_FACTOR,
  SPEED_MULTIPLIER,
  SPEED_SMOOTHING,
  TARGET_DISTANCE_METERS,
  BASE_METERS_PER_SECOND,
  getCoinsByIds,
  syncRacerSpeedFromChange
} from "./src/config.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=13";
import { RaceAudioController } from "./src/raceAudio.js";
import { ThreeRaceRenderer } from "./src/renderer.js?v=25";
import { getLoginSession, supabase } from "./src/supabaseClient.js?v=8";
import { RaceUI } from "./src/ui.js?v=19";

const params = new URLSearchParams(window.location.search);
const MARKET_ID = params.get("id") ?? "market-03";
const REQUESTED_REPLAY_STARTED_AT = params.get("race_started_at");
const MARKET = getMarketById(MARKET_ID);
const MARKET_COINS = getCoinsByIds(getMarketSymbolIds(MARKET));
const MARKET_SYMBOLS = formatMarketSymbols(MARKET);
const REPLAY_HISTORY_LIMIT = 10;
const REPLAY_PREP_MS = 5000;
const REPLAY_COUNTDOWN_MS = 3000;
// Live market-main uses RaceEngine PREP_DURATION_MS (10s). race_started_at is backend/prep start;
// visible race start and live speed compounding both use backend + this offset.
const LIVE_PREP_DURATION_MS = 10_000;
const RACE_INTERVAL_MS = 5 * 60 * 1000;
const VPS_SNAPSHOT_SOURCE_LABEL = "vps-browser";
const marketCoinIds = MARKET_COINS.map((coin) => coin.id);
const marketSlotTuning = buildPlaceholderBallTuning(marketCoinIds);

const engine = new RaceEngine({ autoRestart: false, coins: MARKET_COINS });
const raceAudio = new RaceAudioController();
const renderer = new ThreeRaceRenderer({
  container: document.querySelector("#viewport"),
  coins: MARKET_COINS,
  useCustomModels: true,
  showBallAnchors: false,
  enableEditorInteractions: false,
  onSelectRacer: (id) => {
    engine.selectRacer(id);
    ui?.render(engine);
  }
});

let ui;
let selectedReplayResult = null;
let replayHistory = [];
let replaySessionStartedAtMs = 0;
let replayLocalRaceStartedAtMs = 0;
let replayOriginalBackendStartedAtMs = 0;
let replayOriginalVisibleStartedAtMs = 0;
let replayFrames = [];
let replayEvents = [];
let replayNextFrameIndex = 0;
let replayNextEventIndex = 0;
let replayMode = "none"; // snapshot | ticks | official-scrub | none
let replayOfficialResultApplied = false;
let lastAppliedSnapshotKey = null;

ui = new RaceUI({
  root: document,
  coins: MARKET_COINS,
  onSelectRacer: (id) => engine.selectRacer(id),
  onPlayCamera: () => {
    renderer.playStartAnimation1();
    ui.render(engine);
  },
  onStart: async () => {
    if (selectedReplayResult) await loadReplay(selectedReplayResult);
  },
  onRestart: async () => {
    renderer.stopCameraAnimation(false);
    if (replayHistory[0]) await loadReplay(replayHistory[0]);
  },
  onToggleCamera: () => {
    renderer.toggleCameraMode();
    ui.setCameraMode(renderer.getCameraMode());
  },
  onCycleCameraFocus: () => {
    renderer.cycleCameraFocusPreset();
    ui.setCameraMode(renderer.getCameraMode());
    ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  },
  onToggleLogos: () => {
    ui.setLogoVisibility(renderer.toggleMarkerVisibility());
  }
});

ui.setCameraMode(renderer.getCameraMode());
ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
ui.setLogoVisibility(renderer.getMarkerVisibility());
renderer.setTuning({
  ...renderer.getTuning(),
  ...marketSlotTuning
});
applyPageCopy();
applyFormulaTooltip();
engine.reset();
engine.addNote(
  `${formatMarketTitle(MARKET)} replay uses VPS race snapshots when they match the official result; otherwise live-aligned 5s ticks.`
);
void updateAccountLink();
void bootstrapReplayHistory();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNowMs = Date.now();

  if (selectedReplayResult && engine.state.raceStarted && !replayOfficialResultApplied) {
    if (replayMode === "ticks") {
      applyReplayTickEvents(wallNowMs);
    } else if (replayMode === "snapshot" || replayMode === "official-scrub") {
      applyReplayTimeline(wallNowMs);
    }
  }

  engine.step(deltaSeconds, wallNowMs);
  maybeApplyOfficialReplayResult(wallNowMs);

  if (!previousRaceStarted && engine.state.raceStarted) {
    renderer.setCameraFocusPreset("auto");
    renderer.setCameraMode("behind");
  }

  raceAudio.sync(engine.state);
  previousRaceStarted = engine.state.raceStarted;
  ui.setCameraMode(renderer.getCameraMode());
  ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  ui.render(engine);
  renderer.render(engine, now / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  raceAudio.dispose();
  renderer.dispose();
});

function applyPageCopy() {
  document.querySelector("title").textContent = `Binance Ring Rally ${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#replayTitle").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#replayCopy").textContent =
    "Replay uses the same visible-start price window as live (race_started_at + 10s prep).";
  document.querySelector("#hubLabel").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubLabelSecondary").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} race replay`;
  document.querySelector("#hubCopy").textContent =
    "Snapshots from the VPS recorder play first. Otherwise ticks use the live visible-start time basis so order matches the official finish.";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Replay Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Click a coin card to inspect replay samples from the same 5s window live uses.";
  document.querySelector("#leaderValue").textContent = `${MARKET_COINS[0].id} 0.0m`;
}

function applyFormulaTooltip() {
  const formulaEl = document.querySelector("#speedFormulaCard");
  const tooltipText =
    `5s % = ((current price - price from 5 seconds ago) / price from 5 seconds ago) x 100\n` +
    `target speed = clamp(previous target speed x (1 + 5s % x ${SPEED_MULTIPLIER}), ${MIN_SPEED_FACTOR.toFixed(2)}x, ${MAX_SPEED_FACTOR.toFixed(2)}x)\n` +
    `current speed += (target speed - current speed) x ${SPEED_SMOOTHING.toFixed(2)}`;

  formulaEl.dataset.tooltip = tooltipText;
  formulaEl.setAttribute("aria-label", tooltipText);
  formulaEl.title = FORMULA;
  document.querySelector("#finishValue").textContent = `${TARGET_DISTANCE_METERS}m`;
}

async function bootstrapReplayHistory() {
  const { data, error } = await supabase
    .from("market_results_v2")
    .select(
      "id, market_id, race_started_at, race_finished_at, compared_finish_elapsed_ms, first_place, second_place, third_place, fourth_place, created_at"
    )
    .eq("market_id", MARKET_ID)
    .order("race_started_at", { ascending: false })
    .limit(REPLAY_HISTORY_LIMIT);

  if (error) {
    engine.addNote("Race history could not be loaded from market results.");
    return;
  }

  replayHistory = (data ?? []).map((entry) => ({ ...entry }));
  if (!replayHistory.length) {
    engine.addNote("No official race results found for this market.");
    return;
  }

  renderReplayHistory();
  const requestedReplay = REQUESTED_REPLAY_STARTED_AT
    ? replayHistory.find((entry) => entry.race_started_at === REQUESTED_REPLAY_STARTED_AT)
    : null;
  const initialReplay = requestedReplay ?? replayHistory[0];
  if (initialReplay) {
    await loadReplay(initialReplay);
  }
}

function renderReplayHistory() {
  const root = document.querySelector("#replayHistoryList");
  if (!root) return;

  root.innerHTML = replayHistory
    .map((entry) => {
      const active = selectedReplayResult?.id === entry.id ? "is-active" : "";
      return `
        <button class="ghost-button replay-history-item ${active}" type="button" data-replay-id="${entry.id}">
          <span class="replay-history-copy">
            <span>${formatReplayStart(entry.race_started_at)} KST</span>
            <span>1.${entry.first_place} ${formatBackendFinishTime(entry, entry.first_place)} 2.${entry.second_place} ${formatBackendFinishTime(entry, entry.second_place)} 3.${entry.third_place} ${formatBackendFinishTime(entry, entry.third_place)} 4.${entry.fourth_place} ${formatBackendFinishTime(entry, entry.fourth_place)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  root.querySelectorAll("[data-replay-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const replay = replayHistory.find((entry) => entry.id === button.dataset.replayId);
      if (replay) await loadReplay(replay);
    });
  });
}

async function loadReplay(replayResult) {
  selectedReplayResult = replayResult;
  replayOriginalBackendStartedAtMs = new Date(replayResult.race_started_at).getTime();
  // Must match live: visible start = backend race_started_at + 10s prep.
  replayOriginalVisibleStartedAtMs = replayOriginalBackendStartedAtMs + LIVE_PREP_DURATION_MS;
  replaySessionStartedAtMs = Date.now();
  replayLocalRaceStartedAtMs = replaySessionStartedAtMs + REPLAY_PREP_MS;
  replayNextFrameIndex = 0;
  replayNextEventIndex = 0;
  replayOfficialResultApplied = false;
  lastAppliedSnapshotKey = null;
  replayFrames = [];
  replayEvents = [];
  replayMode = "none";
  renderer.stopCameraAnimation(false);
  engine.reset();
  engine.state.prepDurationMs = REPLAY_PREP_MS;
  engine.state.finalCountdownDurationMs = REPLAY_COUNTDOWN_MS;
  engine.startPrepAt(replaySessionStartedAtMs);

  const officialOrder = getReplayFinishOrder(replayResult);
  const snapshotTimeline = await fetchRaceStateSnapshotTimeline(replayResult.race_started_at);
  if (
    snapshotTimeline.ok &&
    snapshotTimeline.frames.length &&
    snapshotFramesMatchOfficialOrder(snapshotTimeline.frames, officialOrder)
  ) {
    replayMode = "snapshot";
    replayFrames = snapshotTimeline.frames;
    engine.addNote(
      `Loaded ${snapshotTimeline.frames.length} VPS race snapshot frames for ${formatReplayStart(replayResult.race_started_at)} KST.`
    );
  } else {
    const tickTimeline = await fetchLiveAlignedTickTimeline(replayResult.race_started_at);
    if (tickTimeline.ok) {
      replayMode = "ticks";
      replayEvents = tickTimeline.events;
      applySeedPrices(tickTimeline.seedPrices);
      engine.addNote(
        snapshotTimeline.message
          ? `${snapshotTimeline.message} Using live-aligned 5s ticks (visible start = race_started_at + 10s).`
          : `Using live-aligned 5s ticks for ${formatReplayStart(replayResult.race_started_at)} KST.`
      );
    } else {
      replayMode = "official-scrub";
      replayFrames = buildOfficialScrubFrames(replayResult);
      engine.addNote(
        tickTimeline.message ||
          "No matching snapshots/ticks. Scrubbing distances from official finish times."
      );
    }
  }

  renderReplayHistory();
}

async function fetchRaceStateSnapshotTimeline(raceStartedAt) {
  const { data, error } = await supabase
    .from("race_state_snapshots")
    .select(
      "symbol, price, bucket_at, speed_factor, target_speed_factor, distance_meters, change_percent, speed_effect_percent, finish_place, finished_at, snapshot"
    )
    .eq("market_id", MARKET_ID)
    .eq("race_started_at", raceStartedAt)
    .in("symbol", marketCoinIds)
    .order("bucket_at", { ascending: true })
    .limit(5000);

  if (error) {
    return { ok: false, frames: [], message: "Race state snapshots could not be loaded." };
  }

  const rows = (data ?? []).filter((row) => {
    const source = row?.snapshot?.source_label;
    // Prefer VPS recorder rows; allow legacy rows with no source_label.
    return !source || source === VPS_SNAPSHOT_SOURCE_LABEL;
  });

  const rowsByBucket = new Map();
  for (const row of rows) {
    const key = row.bucket_at;
    const bucketRows = rowsByBucket.get(key) ?? [];
    bucketRows.push(row);
    rowsByBucket.set(key, bucketRows);
  }

  const frames = [...rowsByBucket.entries()]
    .map(([bucketAt, bucketRows]) => ({
      bucketAtMs: new Date(bucketAt).getTime(),
      rows: bucketRows
    }))
    .filter((frame) => {
      // Snapshots are wall-clock during the live race; ignore prep-era buckets.
      if (frame.bucketAtMs < replayOriginalVisibleStartedAtMs - 250) {
        return false;
      }
      return marketCoinIds.every((id) => frame.rows.some((row) => row.symbol === id));
    })
    .sort((left, right) => left.bucketAtMs - right.bucketAtMs);

  if (!frames.length) {
    return {
      ok: false,
      frames: [],
      message: "No VPS race_state_snapshots frames for this race (or they were polluted by non-VPS writers)."
    };
  }

  return { ok: true, frames, message: "" };
}

function snapshotFramesMatchOfficialOrder(frames, officialOrder) {
  if (!officialOrder.length || officialOrder.length !== marketCoinIds.length) {
    return false;
  }

  const lastFrame = frames[frames.length - 1];
  if (!lastFrame) {
    return false;
  }

  const ranked = [...lastFrame.rows]
    .map((row) => ({
      symbol: row.symbol,
      finishPlace: row.finish_place ? Number(row.finish_place) : null,
      distanceMeters: Number(row.distance_meters ?? 0)
    }))
    .sort((left, right) => {
      if (Number.isInteger(left.finishPlace) && Number.isInteger(right.finishPlace)) {
        return left.finishPlace - right.finishPlace;
      }
      if (Number.isInteger(left.finishPlace)) return -1;
      if (Number.isInteger(right.finishPlace)) return 1;
      return right.distanceMeters - left.distanceMeters;
    })
    .map((row) => row.symbol);

  return ranked.length === officialOrder.length && ranked.every((symbol, index) => symbol === officialOrder[index]);
}

async function fetchLiveAlignedTickTimeline(raceStartedAt) {
  const backendStartedAtMs = new Date(raceStartedAt).getTime();
  const visibleStartedAtMs = backendStartedAtMs + LIVE_PREP_DURATION_MS;
  const sampleStartAt = new Date(backendStartedAtMs).toISOString();
  const raceEndsAt = new Date(backendStartedAtMs + RACE_INTERVAL_MS).toISOString();

  const { data, error } = await supabase
    .from("coin_ticks_5s")
    .select("symbol, price, previous_price, change_percent, speed_factor, bucket_at")
    .in("symbol", marketCoinIds)
    .gte("bucket_at", sampleStartAt)
    .lt("bucket_at", raceEndsAt)
    .order("bucket_at", { ascending: true });

  if (error) {
    return { ok: false, events: [], seedPrices: null, message: "Backend 5-second prices could not be loaded." };
  }

  const rowsByBucket = new Map();
  for (const row of data ?? []) {
    const bucketRows = rowsByBucket.get(row.bucket_at) ?? [];
    bucketRows.push(row);
    rowsByBucket.set(row.bucket_at, bucketRows);
  }

  const frames = [...rowsByBucket.entries()]
    .map(([bucketAt, rows]) => ({
      bucketAtMs: new Date(bucketAt).getTime(),
      rows
    }))
    .filter((frame) => marketCoinIds.every((id) => frame.rows.some((row) => row.symbol === id)))
    .sort((left, right) => left.bucketAtMs - right.bucketAtMs);

  if (!frames.length) {
    return { ok: false, events: [], seedPrices: null, message: "No complete 5s tick frames for this race." };
  }

  // Same rule as live applyCompoundedSpeedFromSamples: only ticks at/after visible race start.
  const playbackFrames = frames.filter((frame) => frame.bucketAtMs >= visibleStartedAtMs);
  if (!playbackFrames.length) {
    return {
      ok: false,
      events: [],
      seedPrices: null,
      message: "No 5s ticks at/after visible race start (race_started_at + 10s)."
    };
  }

  const seedSource =
    frames.find((frame) => frame.bucketAtMs >= visibleStartedAtMs - LIVE_PREP_DURATION_MS) ?? frames[0];
  const seedPrices = Object.fromEntries(
    seedSource.rows.map((row) => [row.symbol, Number(row.price)])
  );

  const events = playbackFrames.map((frame) => ({
    applyAtWallMs: replayLocalRaceStartedAtMs + (frame.bucketAtMs - visibleStartedAtMs),
    rows: frame.rows.map((row) => ({
      symbol: row.symbol,
      price: Number(row.price),
      previous_price: Number(row.previous_price ?? row.price),
      change_percent: Number(row.change_percent ?? 0),
      speed_factor: Number(row.speed_factor ?? 1)
    }))
  }));

  return { ok: true, events, seedPrices, message: "" };
}

function applySeedPrices(seedPrices) {
  if (!seedPrices) return;
  for (const racer of engine.state.racers) {
    const price = seedPrices[racer.id];
    if (!Number.isFinite(price)) continue;
    racer.price = price;
    racer.speedWindowStartPrice = price;
    racer.speedWindowStartAt = replayLocalRaceStartedAtMs;
  }
}

function buildOfficialScrubFrames(replayResult) {
  const compared = replayResult?.compared_finish_elapsed_ms ?? {};
  const maxElapsed = Math.max(
    0,
    ...Object.values(compared)
      .map(Number)
      .filter((value) => value > 0)
  );
  if (maxElapsed <= 0) {
    return [];
  }

  const stepMs = 250;
  const frames = [];
  for (let elapsedMs = 0; elapsedMs <= maxElapsed + 4000; elapsedMs += stepMs) {
    const bucketAtMs = replayOriginalVisibleStartedAtMs + elapsedMs;
    frames.push({
      bucketAtMs,
      rows: marketCoinIds.map((symbol) => {
        const officialElapsed = Number(compared[symbol]);
        const safeElapsed = officialElapsed > 0 ? officialElapsed : maxElapsed;
        const progress = Math.min(1, Math.max(0, elapsedMs / safeElapsed));
        const finished = elapsedMs >= safeElapsed;
        const runoutSeconds = finished ? (elapsedMs - safeElapsed) / 1000 : 0;
        const distanceMeters = finished
          ? Math.min(
              TARGET_DISTANCE_METERS + BASE_METERS_PER_SECOND * Math.max(1, runoutSeconds),
              TARGET_DISTANCE_METERS + 50
            )
          : TARGET_DISTANCE_METERS * progress;
        return {
          symbol,
          price: null,
          speed_factor: 1,
          target_speed_factor: 1,
          distance_meters: distanceMeters,
          change_percent: 0,
          speed_effect_percent: 0,
          finish_place: finished ? getReplayFinishOrder(replayResult).indexOf(symbol) + 1 : null,
          finished_at: finished
            ? new Date(replayOriginalVisibleStartedAtMs + safeElapsed).toISOString()
            : null
        };
      })
    });
  }
  return frames;
}

function applyReplayTickEvents(nowWallMs) {
  if (!replayEvents.length) return;

  while (replayNextEventIndex < replayEvents.length && replayEvents[replayNextEventIndex].applyAtWallMs <= nowWallMs) {
    const event = replayEvents[replayNextEventIndex];
    for (const row of event.rows) {
      const racer = engine.state.racers.find((entry) => entry.id === row.symbol);
      if (!racer) continue;

      racer.price = Number(row.price);
      syncRacerSpeedFromChange(racer, Number(row.change_percent ?? 0));
      racer.lastCandleAt = event.applyAtWallMs;

      engine.recordSample?.(racer, {
        closeTime: event.applyAtWallMs,
        start: Number(row.previous_price),
        end: Number(row.price),
        changePercent: racer.changePercent,
        racePercent: racer.racePercent,
        speedFactor: racer.targetSpeedFactor
      });
    }
    replayNextEventIndex += 1;
  }
}

function applyReplayTimeline(nowWallMs) {
  if (!engine.state.raceStarted || !replayFrames.length || replayOfficialResultApplied) {
    return;
  }

  while (
    replayNextFrameIndex < replayFrames.length &&
    getLocalApplyAtMs(replayFrames[replayNextFrameIndex].bucketAtMs) <= nowWallMs
  ) {
    applyReplayFrameAt(replayFrames[replayNextFrameIndex], nowWallMs);
    replayNextFrameIndex += 1;
  }
}

function getLocalApplyAtMs(bucketAtMs) {
  // Snapshot buckets are absolute wall times from the live race.
  // Map them from the live visible start onto the local replay race start.
  return replayLocalRaceStartedAtMs + Math.max(0, bucketAtMs - replayOriginalVisibleStartedAtMs);
}

function applyReplayFrameAt(frame, nowWallMs) {
  if (!frame) {
    for (const racer of engine.state.racers) {
      racer.distanceMeters = 0;
      racer.finishPlace = null;
      racer.finishedAtWallMs = 0;
    }
    return;
  }

  const snapshotKey = String(frame.bucketAtMs);
  if (snapshotKey === lastAppliedSnapshotKey) {
    return;
  }
  lastAppliedSnapshotKey = snapshotKey;

  const racers = frame.rows.map((row) => {
    const originalFinishedAtMs = row.finished_at ? new Date(row.finished_at).getTime() : 0;
    const localFinishedAtMs =
      originalFinishedAtMs > 0
        ? replayLocalRaceStartedAtMs + Math.max(0, originalFinishedAtMs - replayOriginalVisibleStartedAtMs)
        : 0;
    return {
      id: row.symbol,
      price: row.price == null ? null : Number(row.price),
      changePercent: Number(row.change_percent ?? 0),
      speedFactor: Number(row.speed_factor ?? 1),
      targetSpeedFactor: Number(row.target_speed_factor ?? row.speed_factor ?? 1),
      lastSpeedEffectPercent: Number(row.speed_effect_percent ?? 0),
      distanceMeters: Number(row.distance_meters ?? 0),
      finishPlace: row.finish_place ? Number(row.finish_place) : null,
      finishedAtWallMs: localFinishedAtMs,
      snapshotAtWallMs: nowWallMs
    };
  });

  engine.applyOfficialSnapshotState({
    prepStartedAtWallMs: replaySessionStartedAtMs,
    raceStartedAtWallMs: replayLocalRaceStartedAtMs,
    snapshotAtWallMs: nowWallMs,
    racers
  });
}

function maybeApplyOfficialReplayResult(nowWallMs) {
  if (replayOfficialResultApplied || !selectedReplayResult || !engine.state.raceStarted) {
    return;
  }

  const maxOfficialElapsedMs = getMaxOfficialFinishElapsedMs(selectedReplayResult);
  const finishOrder = getReplayFinishOrder(selectedReplayResult);
  if (finishOrder.length !== marketCoinIds.length || maxOfficialElapsedMs <= 0) {
    return;
  }

  const officialRaceFinishedAtWallMs = replayLocalRaceStartedAtMs + maxOfficialElapsedMs;
  const readyByTime = nowWallMs >= officialRaceFinishedAtWallMs;
  const readyByEngine = engine.state.raceFinished;
  if (!readyByTime && !readyByEngine) {
    return;
  }

  engine.applyOfficialFinishOrder(
    finishOrder,
    officialRaceFinishedAtWallMs,
    selectedReplayResult.compared_finish_elapsed_ms ?? {}
  );
  // Align track distances to official finish order so cards and positions cannot disagree.
  alignDistancesToOfficialFinish(selectedReplayResult, nowWallMs);
  replayOfficialResultApplied = true;
  engine.state.externalSnapshotMode = true;
  engine.addNote("Replay finish order locked to backend official result.");
}

function alignDistancesToOfficialFinish(replayResult, nowWallMs) {
  const compared = replayResult?.compared_finish_elapsed_ms ?? {};
  const order = getReplayFinishOrder(replayResult);
  for (const racer of engine.state.racers) {
    const elapsedMs = Number(compared[racer.id]);
    const finishIndex = order.indexOf(racer.id);
    if (!(elapsedMs > 0) || finishIndex < 0) continue;
    const finishedAt = replayLocalRaceStartedAtMs + elapsedMs;
    const runoutSeconds = Math.max(0, (nowWallMs - finishedAt) / 1000);
    racer.finishPlace = finishIndex + 1;
    racer.finishedAtWallMs = finishedAt;
    racer.distanceMeters = Math.min(
      TARGET_DISTANCE_METERS + BASE_METERS_PER_SECOND * Math.max(1, runoutSeconds),
      TARGET_DISTANCE_METERS + 50
    );
  }
  engine.state.finishOrder = [...order];
  engine.state.winnerId = order[0] ?? null;
  engine.state.raceFinished = true;
  engine.state.visualRaceComplete = true;
}

function getReplayFinishOrder(entry) {
  return [entry?.first_place, entry?.second_place, entry?.third_place, entry?.fourth_place].filter((id) =>
    marketCoinIds.includes(id)
  );
}

function getMaxOfficialFinishElapsedMs(entry) {
  const values = Object.values(entry?.compared_finish_elapsed_ms ?? {})
    .map(Number)
    .filter((value) => value > 0);
  return values.length ? Math.max(...values) : 0;
}

function formatBackendFinishTime(entry, symbol) {
  const elapsedMs = Number(entry?.compared_finish_elapsed_ms?.[symbol]);
  return elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(3)}s` : "";
}

function formatReplayStart(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

async function updateAccountLink() {
  const accountLink = document.querySelector("#accountLink");
  const pointsEl = document.querySelector("#headerPoints");
  if (!accountLink) return;
  const { session } = await getLoginSession();
  accountLink.href = session ? "./profile.html" : "./login.html";
  accountLink.textContent = session ? "Profile" : "Login";
  if (pointsEl) {
    pointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

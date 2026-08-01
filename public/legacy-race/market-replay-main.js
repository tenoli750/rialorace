import {
  FORMULA,
  MIN_SPEED_FACTOR,
  MAX_SPEED_FACTOR,
  SPEED_MULTIPLIER,
  SPEED_SMOOTHING,
  TARGET_DISTANCE_METERS,
  BASE_METERS_PER_SECOND,
  getCoinsByIds
} from "./src/config.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=12";
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
let replayNextFrameIndex = 0;
let replayMode = "none"; // snapshot | official-scrub | none
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
engine.addNote(`${formatMarketTitle(MARKET)} replay uses recorded race state snapshots when available.`);
void updateAccountLink();
void bootstrapReplayHistory();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNowMs = Date.now();

  if (selectedReplayResult && engine.state.raceStarted) {
    applyReplayTimeline(wallNowMs);
  }

  // Snapshot / scrub modes drive distances directly; engine.step is a no-op in externalSnapshotMode.
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
    "Replay recorded race state snapshots so the track matches the official finish order.";
  document.querySelector("#hubLabel").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubLabelSecondary").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} race snapshot replay`;
  document.querySelector("#hubCopy").textContent =
    "This page plays back race_state_snapshots from the live race. If snapshots are missing, it scrubs distances from official finish times.";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Replay Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Click a coin card to inspect replay samples from recorded race state.";
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
  replayOriginalVisibleStartedAtMs = replayOriginalBackendStartedAtMs + engine.state.prepDurationMs;
  replaySessionStartedAtMs = Date.now();
  replayLocalRaceStartedAtMs = replaySessionStartedAtMs + REPLAY_PREP_MS;
  replayNextFrameIndex = 0;
  replayOfficialResultApplied = false;
  lastAppliedSnapshotKey = null;
  renderer.stopCameraAnimation(false);
  engine.reset();
  engine.state.prepDurationMs = REPLAY_PREP_MS;
  engine.state.finalCountdownDurationMs = REPLAY_COUNTDOWN_MS;
  engine.startPrepAt(replaySessionStartedAtMs);

  const snapshotTimeline = await fetchRaceStateSnapshotTimeline(replayResult.race_started_at);
  if (snapshotTimeline.ok && snapshotTimeline.frames.length) {
    replayMode = "snapshot";
    replayFrames = snapshotTimeline.frames;
    engine.addNote(
      `Loaded ${snapshotTimeline.frames.length} race state snapshot frames for ${formatReplayStart(replayResult.race_started_at)} KST.`
    );
  } else {
    replayMode = "official-scrub";
    replayFrames = buildOfficialScrubFrames(replayResult);
    engine.addNote(
      snapshotTimeline.message ||
        "No race_state_snapshots found. Scrubbing track distances from official finish times so order matches the result."
    );
  }

  // Seed zero distances until race starts.
  applyReplayFrameAt(null, replaySessionStartedAtMs);
  renderReplayHistory();
}

async function fetchRaceStateSnapshotTimeline(raceStartedAt) {
  const { data, error } = await supabase
    .from("race_state_snapshots")
    .select(
      "symbol, price, bucket_at, speed_factor, target_speed_factor, distance_meters, change_percent, speed_effect_percent, finish_place, finished_at"
    )
    .eq("market_id", MARKET_ID)
    .eq("race_started_at", raceStartedAt)
    .in("symbol", marketCoinIds)
    .order("bucket_at", { ascending: true })
    .limit(5000);

  if (error) {
    return { ok: false, frames: [], message: "Race state snapshots could not be loaded." };
  }

  const rowsByBucket = new Map();
  for (const row of data ?? []) {
    const key = row.bucket_at;
    const rows = rowsByBucket.get(key) ?? [];
    rows.push(row);
    rowsByBucket.set(key, rows);
  }

  const frames = [...rowsByBucket.entries()]
    .map(([bucketAt, rows]) => ({
      bucketAtMs: new Date(bucketAt).getTime(),
      rows
    }))
    .filter((frame) => marketCoinIds.every((id) => frame.rows.some((row) => row.symbol === id)))
    .sort((left, right) => left.bucketAtMs - right.bucketAtMs);

  if (!frames.length) {
    return { ok: false, frames: [], message: "No complete race_state_snapshots frames for this race." };
  }

  return { ok: true, frames, message: "" };
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

function applyReplayTimeline(nowWallMs) {
  if (!engine.state.raceStarted || !replayFrames.length) {
    return;
  }

  while (
    replayNextFrameIndex < replayFrames.length &&
    getLocalApplyAtMs(replayFrames[replayNextFrameIndex].bucketAtMs) <= nowWallMs
  ) {
    applyReplayFrameAt(replayFrames[replayNextFrameIndex], nowWallMs);
    replayNextFrameIndex += 1;
  }

  // Keep showing latest frame while waiting between buckets.
  if (replayNextFrameIndex > 0) {
    const latest = replayFrames[Math.min(replayNextFrameIndex - 1, replayFrames.length - 1)];
    if (latest && lastAppliedSnapshotKey !== `${latest.bucketAtMs}`) {
      applyReplayFrameAt(latest, nowWallMs);
    }
  }
}

function getLocalApplyAtMs(bucketAtMs) {
  // Snapshots recorded after visible race start map 1:1 onto local race start.
  const sourceStartMs =
    replayMode === "snapshot"
      ? Math.max(replayOriginalVisibleStartedAtMs, replayFrames[0]?.bucketAtMs ?? replayOriginalVisibleStartedAtMs)
      : replayOriginalVisibleStartedAtMs;
  return replayLocalRaceStartedAtMs + Math.max(0, bucketAtMs - sourceStartMs);
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

  // Keep sample strip useful for the detail panel.
  for (const racer of engine.state.racers) {
    const row = frame.rows.find((entry) => entry.symbol === racer.id);
    if (!row) continue;
    const sample = {
      closeTime: getLocalApplyAtMs(frame.bucketAtMs),
      start: Number(racer.price ?? row.price ?? 0),
      end: Number(row.price ?? racer.price ?? 0),
      changePercent: Number(row.change_percent ?? 0),
      racePercent: 0,
      speedFactor: Number(row.speed_factor ?? 1),
      remainingDistanceMeters: Math.max(0, TARGET_DISTANCE_METERS - Number(row.distance_meters ?? 0))
    };
    if (!racer.sampleKeys) racer.sampleKeys = new Set();
    if (!racer.samples) racer.samples = [];
    if (!racer.sampleKeys.has(sample.closeTime)) {
      racer.samples.push(sample);
      racer.sampleKeys.add(sample.closeTime);
    }
  }
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
  if (nowWallMs < officialRaceFinishedAtWallMs) {
    return;
  }

  engine.applyOfficialFinishOrder(
    finishOrder,
    officialRaceFinishedAtWallMs,
    selectedReplayResult.compared_finish_elapsed_ms ?? {}
  );
  replayOfficialResultApplied = true;
  engine.addNote("Replay finish times synced to backend official result.");
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

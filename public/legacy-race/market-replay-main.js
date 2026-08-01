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
const LIVE_PREP_DURATION_MS = 10_000;
const RACE_INTERVAL_MS = 5 * 60 * 1000;
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
let replayOriginalVisibleStartedAtMs = 0;
let replayPriceEvents = [];
let replayNextPriceEventIndex = 0;
let replayOfficialResultApplied = false;
let replayFinishOrder = [];
let replayComparedElapsedMs = {};

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
  `${formatMarketTitle(MARKET)} replay: official finish times drive place/distance; live-aligned 5s ticks drive price and speed labels.`
);
void updateAccountLink();
void bootstrapReplayHistory();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNowMs = Date.now();

  if (selectedReplayResult && engine.state.raceStarted) {
    // Smooth every-frame distance from official times (fixes choppy 200ms scrub jumps).
    applyOfficialDistances(wallNowMs);
    // Price / change% / speed labels from the same visible-start tick window live uses.
    applyReplayPriceEvents(wallNowMs);
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
    "Official finish times set place order; backend 5s prices fill price, change, and speed.";
  document.querySelector("#hubLabel").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubLabelSecondary").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} official + price replay`;
  document.querySelector("#hubCopy").textContent =
    "Track order follows market_results_v2. Cards show coin_ticks_5s from the live visible-start window (race_started_at + 10s).";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Replay Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Click a coin card to inspect official finish timing and 5s price samples.";
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
  const backendStartedAtMs = new Date(replayResult.race_started_at).getTime();
  replayOriginalVisibleStartedAtMs = backendStartedAtMs + LIVE_PREP_DURATION_MS;
  replaySessionStartedAtMs = Date.now();
  replayLocalRaceStartedAtMs = replaySessionStartedAtMs + REPLAY_PREP_MS;
  replayNextPriceEventIndex = 0;
  replayOfficialResultApplied = false;
  replayFinishOrder = getReplayFinishOrder(replayResult);
  replayComparedElapsedMs = replayResult.compared_finish_elapsed_ms ?? {};
  renderer.stopCameraAnimation(false);
  engine.reset();
  engine.state.prepDurationMs = REPLAY_PREP_MS;
  engine.state.finalCountdownDurationMs = REPLAY_COUNTDOWN_MS;
  // Distances are driven externally every frame; keep step() from also advancing them.
  engine.state.externalSnapshotMode = true;
  engine.startPrepAt(replaySessionStartedAtMs);

  const tickTimeline = await fetchLiveAlignedTickTimeline(replayResult.race_started_at);
  replayPriceEvents = tickTimeline.events;
  if (tickTimeline.seedPrices) {
    applySeedPrices(tickTimeline.seedPrices);
  }

  const orderLabel = replayFinishOrder.join(" > ") || "unknown";
  if (!getMaxOfficialFinishElapsedMs(replayResult)) {
    engine.addNote("Official finish times missing; cannot scrub distances.");
  } else if (tickTimeline.ok) {
    engine.addNote(
      `Official scrub + ${replayPriceEvents.length} price frames for ${formatReplayStart(replayResult.race_started_at)} KST (${orderLabel}).`
    );
  } else {
    engine.addNote(
      `Official scrub ready (${orderLabel}). ${tickTimeline.message || "Price ticks unavailable."}`
    );
  }

  renderReplayHistory();
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

  // Same rule as live: only ticks at/after visible race start feed speed/price during the race.
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
  const seedPrices = Object.fromEntries(seedSource.rows.map((row) => [row.symbol, Number(row.price)]));

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
  for (const racer of engine.state.racers) {
    const price = seedPrices[racer.id];
    if (!Number.isFinite(price)) continue;
    racer.price = price;
    racer.speedWindowStartPrice = price;
    racer.speedWindowStartAt = replayLocalRaceStartedAtMs;
  }
}

function applyOfficialDistances(nowWallMs) {
  if (!selectedReplayResult || !engine.state.raceStarted) {
    return;
  }

  const maxElapsed = getMaxOfficialFinishElapsedMs(selectedReplayResult);
  if (maxElapsed <= 0 || replayFinishOrder.length !== marketCoinIds.length) {
    return;
  }

  engine.state.externalSnapshotMode = true;
  engine.state.prepStarted = true;
  engine.state.raceStartedAtWallMs = replayLocalRaceStartedAtMs;

  const elapsedMs = Math.max(0, nowWallMs - replayLocalRaceStartedAtMs);

  for (const racer of engine.state.racers) {
    const officialElapsed = Number(replayComparedElapsedMs[racer.id]);
    const safeElapsed = officialElapsed > 0 ? officialElapsed : maxElapsed;
    const finishIndex = replayFinishOrder.indexOf(racer.id);
    const finished = elapsedMs >= safeElapsed;

    if (finished) {
      const runoutSeconds = (elapsedMs - safeElapsed) / 1000;
      racer.distanceMeters = Math.min(
        TARGET_DISTANCE_METERS + BASE_METERS_PER_SECOND * Math.max(1, runoutSeconds),
        TARGET_DISTANCE_METERS + 50
      );
      racer.finishPlace = finishIndex >= 0 ? finishIndex + 1 : null;
      racer.finishedAtWallMs = replayLocalRaceStartedAtMs + safeElapsed;
    } else {
      racer.distanceMeters = TARGET_DISTANCE_METERS * Math.min(1, elapsedMs / safeElapsed);
      racer.finishPlace = null;
      racer.finishedAtWallMs = 0;
    }
  }

  const finishedCount = engine.state.racers.filter((racer) => Number.isInteger(racer.finishPlace)).length;
  if (finishedCount === engine.state.racers.length) {
    engine.state.finishOrder = [...replayFinishOrder];
    engine.state.winnerId = replayFinishOrder[0] ?? null;
    engine.state.raceFinished = true;
    engine.state.visualRaceComplete = true;
    engine.state.raceFinishedAtWallMs = replayLocalRaceStartedAtMs + maxElapsed;
  } else {
    engine.state.finishOrder = [...engine.state.racers]
      .filter((racer) => Number.isInteger(racer.finishPlace))
      .sort((left, right) => left.finishPlace - right.finishPlace)
      .map((racer) => racer.id);
    engine.state.winnerId = null;
    engine.state.raceFinished = false;
    engine.state.visualRaceComplete = false;
  }
}

function applyReplayPriceEvents(nowWallMs) {
  if (!replayPriceEvents.length) return;

  while (
    replayNextPriceEventIndex < replayPriceEvents.length &&
    replayPriceEvents[replayNextPriceEventIndex].applyAtWallMs <= nowWallMs
  ) {
    const event = replayPriceEvents[replayNextPriceEventIndex];
    for (const row of event.rows) {
      const racer = engine.state.racers.find((entry) => entry.id === row.symbol);
      if (!racer) continue;

      racer.price = Number(row.price);
      syncRacerSpeedFromChange(racer, Number(row.change_percent ?? 0));
      racer.lastCandleAt = event.applyAtWallMs;

      engine.recordSample(racer, {
        closeTime: event.applyAtWallMs,
        start: Number(row.previous_price),
        end: Number(row.price),
        changePercent: racer.changePercent,
        racePercent: racer.racePercent,
        speedFactor: racer.targetSpeedFactor
      });
    }
    replayNextPriceEventIndex += 1;
  }
}

function maybeApplyOfficialReplayResult(nowWallMs) {
  if (replayOfficialResultApplied || !selectedReplayResult || !engine.state.raceStarted) {
    return;
  }

  const maxOfficialElapsedMs = getMaxOfficialFinishElapsedMs(selectedReplayResult);
  if (replayFinishOrder.length !== marketCoinIds.length || maxOfficialElapsedMs <= 0) {
    return;
  }

  if (nowWallMs < replayLocalRaceStartedAtMs + maxOfficialElapsedMs) {
    return;
  }

  engine.applyOfficialFinishOrder(
    replayFinishOrder,
    replayLocalRaceStartedAtMs + maxOfficialElapsedMs,
    replayComparedElapsedMs
  );
  engine.state.externalSnapshotMode = true;
  replayOfficialResultApplied = true;
  engine.addNote(`Official finish locked: ${replayFinishOrder.join(" > ")}.`);
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

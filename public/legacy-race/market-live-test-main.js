import { FORMULA, SPEED_MULTIPLIER, getCoinsByIds, TARGET_DISTANCE_METERS } from "./src/config.js";
import { SceneEditor } from "./src/editor.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=5";
import { RaceAudioController } from "./src/raceAudio.js";
import { ThreeRaceRenderer } from "./src/renderer.js?v=2";
import { supabase } from "./src/supabaseClient.js?v=3";
import { SupabasePriceFeed } from "./src/supabasePriceFeed.js";
import { recordRealtimeTestResult } from "./src/supabaseBettingStore.js";
import { RaceUI } from "./src/ui.js";

const params = new URLSearchParams(window.location.search);
const MARKET_ID = params.get("id") ?? "market-03";
const MARKET = getMarketById(MARKET_ID);
const MARKET_COINS = getCoinsByIds(getMarketSymbolIds(MARKET));
const MARKET_SYMBOLS = formatMarketSymbols(MARKET);
const MARKET_TITLE = formatMarketTitle(MARKET);
const STORAGE_KEY = `binance-ring-rally-${MARKET_ID}-live-test-tuning-v1`;

const RACE_INTERVAL_MS = 5 * 60 * 1000;
const RACE_CLOCK_POLL_MS = 5000;
const PLAYBACK_DELAY_MS = 5000;
const LIVE_POST_FINISH_HOLD_MS = 10000;
const USE_BACKEND_INTERVAL_LIVE = false;
const USE_COIN_TICK_LIVE = true;

const engine = new RaceEngine({ autoRestart: false, coins: MARKET_COINS });
const comparisonEngine = null;
const raceAudio = new RaceAudioController();
let ui;
let scheduledRaceStartAtMs = getNextRaceBoundary(Date.now());
let currentRaceStartAtMs = null;
let nextPrepStartAtMs = null;
let officialServerOffsetMs = 0;
let raceClockTimer = null;
let liveSampleTimer = null;
let prepStartedForScheduledRace = false;
let liveTimeline = [];
let liveTimelineVisibleRaceStartMs = 0;
let liveLastAppliedSnapshotKey = null;
let livePriceSamplesBySymbol = new Map();
let nextRaceScheduledFromFinish = false;
let showPostRaceOverlay = false;

const marketCoinIds = getMarketSymbolIds(MARKET);
const defaultMarketTuning = buildPlaceholderBallTuning(marketCoinIds);
const renderer = new ThreeRaceRenderer({
  container: document.querySelector("#viewport"),
  coins: MARKET_COINS,
  useCustomModels: true,
  showBallAnchors: false,
  onSelectRacer: (id) => {
    engine.selectRacer(id);
    ui?.render(engine);
  }
});

renderer.setTuning({
  ...renderer.getTuning(),
  ...loadSavedMarketTuning()
});

ui = new RaceUI({
  root: document,
  coins: MARKET_COINS,
  onSelectRacer: (id) => engine.selectRacer(id),
  onPlayCamera: () => {
    renderer.playStartAnimation1();
    ui.render(engine);
  },
  onStart: async () => {
    await syncOfficialRaceClock();
    maybeStartScheduledPrep(getOfficialNowMs());
    ui.render(engine);
  },
  onRestart: async () => {
    renderer.stopCameraAnimation(false);
    engine.reset();
    prepStartedForScheduledRace = false;
    ui.render(engine);
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
updatePostRaceOverlay();

const feed = USE_BACKEND_INTERVAL_LIVE
  ? null
  : new SupabasePriceFeed(engine, MARKET_COINS, {
      playbackDelayMs: PLAYBACK_DELAY_MS,
      getNowMs: () => getOfficialNowMs()
    });
const comparisonFeed = null;

const editor = new SceneEditor({
  root: document,
  renderer,
  storageKey: STORAGE_KEY,
  defaultTuning: {
    ...renderer.getTuning(),
    ...defaultMarketTuning
  }
});

applyPageCopy();
applyFormulaTooltip();
engine.reset();
engine.addNote(`${MARKET_TITLE} live editor follows the public implementation.`);
void bootstrapOfficialRaceState();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNow = getOfficialNowMs();

  maybeStartScheduledPrep(wallNow);
  if (USE_BACKEND_INTERVAL_LIVE && liveTimeline.length) {
    applyLiveIntervalFrame(wallNow);
  }
  engine.step(deltaSeconds);
  if (!previousRaceStarted && engine.state.raceStarted) {
    renderer.setCameraFocusPreset("auto");
    renderer.setCameraMode("behind");
  }
  if (engine.state.raceFinished && !nextRaceScheduledFromFinish) {
    nextRaceScheduledFromFinish = true;
  }
  if (
    nextRaceScheduledFromFinish &&
    engine.state.raceFinished &&
    wallNow - engine.state.raceFinishedAtWallMs >= LIVE_POST_FINISH_HOLD_MS
  ) {
    scheduleFollowingRace();
  }
  raceAudio.sync(engine.state);
  previousRaceStarted = engine.state.raceStarted;
  if (USE_BACKEND_INTERVAL_LIVE || USE_COIN_TICK_LIVE) {
    applyCachedLivePriceSamples();
  }
  if (USE_BACKEND_INTERVAL_LIVE && liveTimeline.length) {
    applyLiveSamplesToRacers(liveTimeline);
  }
  ui.setCameraMode(renderer.getCameraMode());
  ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  ui.render(engine);
  renderer.render(engine, now / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  if (raceClockTimer) {
    window.clearInterval(raceClockTimer);
    raceClockTimer = null;
  }
  if (liveSampleTimer) {
    window.clearInterval(liveSampleTimer);
    liveSampleTimer = null;
  }
  raceAudio.dispose();
  feed?.disconnect();
  renderer.dispose();
});

void editor;

function applyPageCopy() {
  document.querySelector("title").textContent = `Binance Ring Rally ${MARKET_TITLE} Live Editor`;
  document.querySelector("h1").textContent = `${MARKET_TITLE} Live Test`;
  document.querySelector("#hubLabel").textContent = `${MARKET_TITLE} Live Test`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} coin-ticks live structure`;
  document.querySelector("#hubCopy").textContent =
    "This test page uses the same live market structure against backend coin ticks before applying it to the public runtime.";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Race Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Click a coin card or a 3D racer to inspect backend coin ticks for the selected market.";
  document.querySelector("#leaderValue").textContent = `${MARKET_COINS[0].id} 0.0m`;
}

function applyFormulaTooltip() {
  const formulaEl = document.querySelector("#speedFormulaCard");
  formulaEl.dataset.tooltip = FORMULA;
  formulaEl.setAttribute("aria-label", FORMULA);
  formulaEl.title = FORMULA;
  document.querySelector("#finishValue").textContent = `${TARGET_DISTANCE_METERS}m`;
}

function maybeStartScheduledPrep(now) {
  if (
    engine.state.prepStarted ||
    (engine.state.raceStarted && !engine.state.raceFinished) ||
    prepStartedForScheduledRace
  ) {
    return;
  }

  const prepLeadMs = engine.state.prepDurationMs;
  if (now >= scheduledRaceStartAtMs - prepLeadMs) {
    prepStartedForScheduledRace = true;
    renderer.stopCameraAnimation(false);
    if (engine.state.raceFinished) {
      engine.reset();
    }
    showPostRaceOverlay = false;
    updatePostRaceOverlay();
    engine.startPrepAt(scheduledRaceStartAtMs - prepLeadMs);
    engine.addNote(`Scheduled race prep started. Official start at ${formatClockTime(scheduledRaceStartAtMs)}.`);
  }
}

function scheduleFollowingRace() {
  engine.reset();
  prepStartedForScheduledRace = false;
  nextRaceScheduledFromFinish = false;
  liveLastAppliedSnapshotKey = null;
  liveTimeline = [];
  liveTimelineVisibleRaceStartMs = 0;
  livePriceSamplesBySymbol = new Map();
  showPostRaceOverlay = true;
  updatePostRaceOverlay();
  void syncOfficialRaceClock();
  engine.addNote(`Next race start scheduled for ${formatClockTime(scheduledRaceStartAtMs)}.`);
}

function updatePostRaceOverlay() {
  const overlay = document.querySelector("#postRaceOverlay");
  if (!overlay) {
    return;
  }
  overlay.hidden = !showPostRaceOverlay;
}

function getNextRaceBoundary(timestampMs) {
  return Math.ceil(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function getCurrentRaceBoundary(timestampMs) {
  return Math.floor(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function getLiveVisibleSchedule(nowMs, prepDurationMs) {
  const currentBoundaryMs = getCurrentRaceBoundary(nowMs);
  const currentVisibleStartMs = currentBoundaryMs + prepDurationMs;

  if (nowMs < currentVisibleStartMs) {
    return {
      currentRaceStartAtMs: currentVisibleStartMs,
      nextPrepStartAtMs: currentBoundaryMs,
      scheduledRaceStartAtMs: currentVisibleStartMs
    };
  }

  const nextBoundaryMs = currentBoundaryMs + RACE_INTERVAL_MS;
  return {
    currentRaceStartAtMs: currentVisibleStartMs,
    nextPrepStartAtMs: nextBoundaryMs,
    scheduledRaceStartAtMs: nextBoundaryMs + prepDurationMs
  };
}

function formatClockTime(timestampMs) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestampMs));
}

function loadSavedMarketTuning() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultMarketTuning;
  } catch {
    return defaultMarketTuning;
  }
}

function getOfficialNowMs() {
  return Date.now() + officialServerOffsetMs;
}

async function bootstrapOfficialRaceState() {
  await syncOfficialRaceClock();
  if (USE_BACKEND_INTERVAL_LIVE) {
    await refreshLiveIntervalTimeline();
    await refreshLivePriceSamples();
  } else if (USE_COIN_TICK_LIVE) {
    await restoreLiveCoinTickState();
    await refreshLivePriceSamples();
  } else {
    await restoreOfficialViewState();
  }
  raceClockTimer = window.setInterval(syncOfficialRaceClock, RACE_CLOCK_POLL_MS);
  if (USE_BACKEND_INTERVAL_LIVE) {
    window.setInterval(refreshLiveIntervalTimeline, RACE_CLOCK_POLL_MS);
    liveSampleTimer = window.setInterval(refreshLivePriceSamples, RACE_CLOCK_POLL_MS);
  } else if (USE_COIN_TICK_LIVE) {
    liveSampleTimer = window.setInterval(refreshLivePriceSamples, RACE_CLOCK_POLL_MS);
  } else {
    feed.connect();
  }
}

async function restoreLiveCoinTickState() {
  const officialNowMs = getOfficialNowMs();
  const visibleRaceStartMs = currentRaceStartAtMs;
  if (!visibleRaceStartMs) {
    return;
  }

  const prepStartedAtWallMs = visibleRaceStartMs - engine.state.prepDurationMs;
  if (officialNowMs >= prepStartedAtWallMs && officialNowMs < visibleRaceStartMs) {
    prepStartedForScheduledRace = true;
    engine.startPrepAt(prepStartedAtWallMs);
    engine.addNote(`Prep restored from UTC clock. Official visible start at ${formatClockTime(visibleRaceStartMs)}.`);
    return;
  }

  if (officialNowMs < visibleRaceStartMs) {
    return;
  }

  const backendRaceStartMs = visibleRaceStartMs - engine.state.prepDurationMs;
  const { data, error } = await supabase
    .from("coin_ticks_5s")
    .select("symbol, price, bucket_at")
    .in("symbol", marketCoinIds)
    .gte("bucket_at", new Date(backendRaceStartMs).toISOString())
    .lte("bucket_at", new Date(officialNowMs).toISOString())
    .order("bucket_at", { ascending: true });

  if (error || !(data?.length)) {
    return;
  }

  const bucketsBySymbol = new Map();
  const latestBucketByCoinId = new Map();

  for (const row of data) {
    const rows = bucketsBySymbol.get(row.symbol) ?? [];
    const visibleBucketMs = new Date(row.bucket_at).getTime() + engine.state.prepDurationMs;
    rows.push({ price: Number(row.price), timeMs: visibleBucketMs });
    bucketsBySymbol.set(row.symbol, rows);
    latestBucketByCoinId.set(row.symbol, row.bucket_at);
  }

  if (![...marketCoinIds].every((coinId) => (bucketsBySymbol.get(coinId)?.length ?? 0) > 0)) {
    return;
  }

  prepStartedForScheduledRace = true;
  engine.restoreOfficialRace({
    prepStartedAtWallMs,
    raceStartedAtWallMs: visibleRaceStartMs,
    replayedAtWallMs: officialNowMs,
    bucketsBySymbol
  });
}

async function syncOfficialRaceClock() {
  const requestedAt = Date.now();
  const { data, error } = await supabase.rpc("get_official_race_clock", {
    requested_interval_ms: RACE_INTERVAL_MS,
    requested_prep_duration_ms: engine.state.prepDurationMs
  });

  if (error) {
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.server_now || !row?.next_race_start_at || !row?.current_race_start_at) {
    return;
  }

  const receivedAt = Date.now();
  const roundTripMs = receivedAt - requestedAt;
  const estimatedServerNowMs = new Date(row.server_now).getTime() + roundTripMs / 2;
  officialServerOffsetMs = estimatedServerNowMs - receivedAt;

  if (USE_COIN_TICK_LIVE) {
    const liveSchedule = getLiveVisibleSchedule(estimatedServerNowMs, engine.state.prepDurationMs);
    currentRaceStartAtMs = liveSchedule.currentRaceStartAtMs;
    nextPrepStartAtMs = liveSchedule.nextPrepStartAtMs;
    scheduledRaceStartAtMs = liveSchedule.scheduledRaceStartAtMs;
    return;
  }

  currentRaceStartAtMs = new Date(row.current_race_start_at).getTime();
  nextPrepStartAtMs = new Date(row.next_prep_start_at).getTime();
  scheduledRaceStartAtMs = new Date(row.next_race_start_at).getTime();
}

function getTargetVisibleRaceStartMs(nowMs = getOfficialNowMs()) {
  if (nextPrepStartAtMs && scheduledRaceStartAtMs && nowMs >= nextPrepStartAtMs) {
    return scheduledRaceStartAtMs;
  }
  return currentRaceStartAtMs;
}

async function refreshLiveIntervalTimeline() {
  if (!USE_BACKEND_INTERVAL_LIVE) {
    return;
  }
}

function applyLiveSeedFrame(frame) {
  const rowsBySymbol = new Map(frame.rows.map((row) => [row.symbol, row]));
  for (const racer of engine.state.racers) {
    const row = rowsBySymbol.get(racer.id);
    if (!row) {
      continue;
    }
    racer.price = Number(row.price);
    racer.changePercent = Number(row.change_percent ?? 0);
    racer.speedFactor = Number(row.speed_factor ?? 1);
    racer.targetSpeedFactor = Number(row.speed_factor ?? 1);
    racer.postFinishSpeedFactor = Number(row.speed_factor ?? 1);
    racer.lastSpeedEffectPercent = Number(row.change_percent ?? 0) * SPEED_MULTIPLIER * 100;
    racer.distanceMeters = Number(row.cumulative_distance_meters ?? 0);
    racer.finishPlace = row.finish_place ? Number(row.finish_place) : null;
    racer.finishedAtWallMs = 0;
  }
}

function applyLiveIntervalFrame(nowMs) {
  const currentIndex = liveTimeline.findLastIndex((entry) => entry.frontendVisibleAtMs <= nowMs);
  if (currentIndex < 0) {
    return;
  }

  const frame = liveTimeline[currentIndex];
  const nextFrame = liveTimeline[currentIndex + 1] ?? null;
  const nextVisibleAtMs = nextFrame?.frontendVisibleAtMs ?? frame.frontendVisibleAtMs;
  const windowDurationMs = Math.max(1, nextVisibleAtMs - frame.frontendVisibleAtMs);
  const progress =
    nextFrame && nowMs > frame.frontendVisibleAtMs
      ? Math.min(1, Math.max(0, (nowMs - frame.frontendVisibleAtMs) / windowDurationMs))
      : 0;
  const snapshotKey = `${frame.frontendVisibleAtMs}:${Math.round(progress * 1000)}`;
  if (liveLastAppliedSnapshotKey === snapshotKey) {
    return;
  }

  liveLastAppliedSnapshotKey = snapshotKey;
  const nextRowsBySymbol = new Map((nextFrame?.rows ?? []).map((row) => [row.symbol, row]));
  engine.applyOfficialSnapshotState({
    prepStartedAtWallMs: liveTimelineVisibleRaceStartMs - engine.state.prepDurationMs,
    raceStartedAtWallMs: liveTimelineVisibleRaceStartMs,
    snapshotAtWallMs: nowMs,
    racers: frame.rows.map((row) => {
      const nextRow = nextRowsBySymbol.get(row.symbol) ?? row;
      const currentDistance = Number(row.cumulative_distance_meters ?? 0);
      const nextDistance = Number(nextRow.cumulative_distance_meters ?? currentDistance);
      const interpolatedDistance =
        nextFrame && nextDistance >= currentDistance
          ? currentDistance + (nextDistance - currentDistance) * progress
          : currentDistance;

      return {
        id: row.symbol,
        price: Number(row.price),
        changePercent: Number(row.change_percent ?? 0),
        speedFactor: Number(row.speed_factor ?? 1),
        targetSpeedFactor: Number(row.speed_factor ?? 1),
        lastSpeedEffectPercent: Number(row.change_percent ?? 0) * SPEED_MULTIPLIER * 100,
        distanceMeters: interpolatedDistance,
        finishPlace: row.finish_place ? Number(row.finish_place) : null,
        finishedAtWallMs: row.finished_at ? new Date(row.finished_at).getTime() : 0,
        snapshotAtWallMs: nowMs
      };
    })
  });
}

function applyLiveSamplesToRacers(timeline) {
  const samplesBySymbol = new Map(marketCoinIds.map((coinId) => [coinId, []]));

  for (const frame of timeline) {
    for (const row of frame.rows) {
      samplesBySymbol.get(row.symbol)?.push({
        closeTime: frame.frontendVisibleAtMs,
        start: Number(row.previous_price ?? row.price),
        end: Number(row.price),
        changePercent: Number(row.change_percent ?? 0),
        racePercent: 0,
        speedFactor: Number(row.speed_factor ?? 1),
        remainingDistanceMeters: Math.max(
          0,
          TARGET_DISTANCE_METERS - Number(row.cumulative_distance_meters ?? 0)
        )
      });
    }
  }
  for (const racer of engine.state.racers) {
    racer.samples = samplesBySymbol.get(racer.id) ?? [];
    racer.sampleKeys = new Set(racer.samples.map((sample) => sample.closeTime));
  }
}

async function refreshLivePriceSamples() {
  if (!USE_COIN_TICK_LIVE && !USE_BACKEND_INTERVAL_LIVE) {
    return;
  }

  const visibleRaceStartMs = getTargetVisibleRaceStartMs();
  const sampleStartAt = new Date((visibleRaceStartMs ?? getOfficialNowMs()) - 20000).toISOString();
  const sampleEndAt = new Date(getOfficialNowMs()).toISOString();

  const { data, error } = await supabase
    .from("coin_ticks_5s")
    .select("symbol, price, previous_price, change_percent, speed_factor, bucket_at")
    .in("symbol", marketCoinIds)
    .gte("bucket_at", sampleStartAt)
    .lte("bucket_at", sampleEndAt)
    .order("bucket_at", { ascending: true });

  if (error) {
    return;
  }

  const rowsBySymbol = new Map(marketCoinIds.map((coinId) => [coinId, []]));
  for (const row of data ?? []) {
    rowsBySymbol.get(row.symbol)?.push(row);
  }

  livePriceSamplesBySymbol = new Map();

  for (const racer of engine.state.racers) {
    const rows = (rowsBySymbol.get(racer.id) ?? []).slice().sort(
      (left, right) => new Date(left.bucket_at).getTime() - new Date(right.bucket_at).getTime()
    );
    const samples = rows.map((row, index) => {
      const previous = rows[index - 1] ?? row;
      const start = Number(row.previous_price ?? previous.price);
      const end = Number(row.price);
      const changePercent = Number(row.change_percent ?? (index === 0 || start <= 0 ? 0 : ((end - start) / start) * 100));
      return {
        closeTime: new Date(row.bucket_at).getTime(),
        start,
        end,
        changePercent,
        racePercent: 0,
        speedFactor: Number(row.speed_factor ?? racer.targetSpeedFactor ?? 1),
        remainingDistanceMeters: Math.max(0, TARGET_DISTANCE_METERS - Number(racer.distanceMeters ?? 0))
      };
    });
    livePriceSamplesBySymbol.set(racer.id, samples);
    racer.samples = samples;
    racer.sampleKeys = new Set(samples.map((sample) => sample.closeTime));

    const latest = rows.at(-1);
    const previous = rows.at(-2) ?? latest;
    if (latest) {
      racer.price = Number(latest.price);
      racer.speedFactor = Number(latest.speed_factor ?? racer.speedFactor ?? 1);
      racer.targetSpeedFactor = Number(latest.speed_factor ?? racer.targetSpeedFactor ?? 1);
      racer.changePercent = Number(
        latest.change_percent ??
          (previous && Number(previous.price) > 0
            ? ((Number(latest.price) - Number(previous.price)) / Number(previous.price)) * 100
            : 0)
      );
      racer.lastSpeedEffectPercent = racer.changePercent * SPEED_MULTIPLIER * 100;
    }
  }

  if (!liveTimeline.length) {
    engine.state.connectionStatus = "live";
    engine.state.connectionMessage = "Backend coin ticks live";
  }
}

function applyCachedLivePriceSamples() {
  for (const racer of engine.state.racers) {
    const samples = livePriceSamplesBySymbol.get(racer.id);
    if (!samples?.length) {
      continue;
    }
    racer.samples = samples;
    racer.sampleKeys = new Set(samples.map((sample) => sample.closeTime));
  }
}

async function restoreOfficialViewState() {
  const officialNowMs = getOfficialNowMs();
  const playbackNowMs = officialNowMs - PLAYBACK_DELAY_MS;

  if (nextPrepStartAtMs && officialNowMs >= nextPrepStartAtMs && officialNowMs < scheduledRaceStartAtMs) {
    prepStartedForScheduledRace = true;
    engine.startPrepAt(nextPrepStartAtMs);
    engine.addNote(`Prep restored from official clock. Official start at ${formatClockTime(scheduledRaceStartAtMs)}.`);
    return;
  }

  if (!currentRaceStartAtMs || playbackNowMs < currentRaceStartAtMs) {
    return;
  }

  const { data, error } = await supabase
    .from("price_history_5s")
    .select("symbol, price, bucket_at")
    .in("symbol", marketCoinIds)
    .gte("bucket_at", new Date(currentRaceStartAtMs).toISOString())
    .lte("bucket_at", new Date(playbackNowMs).toISOString())
    .order("bucket_at", { ascending: true });

  if (error || !(data?.length)) {
    return;
  }

  const bucketsBySymbol = new Map();
  const latestBucketByCoinId = new Map();

  for (const row of data) {
    const rows = bucketsBySymbol.get(row.symbol) ?? [];
    const timeMs = new Date(row.bucket_at).getTime();
    rows.push({ price: Number(row.price), timeMs });
    bucketsBySymbol.set(row.symbol, rows);
    latestBucketByCoinId.set(row.symbol, row.bucket_at);
  }

  if (![...marketCoinIds].every((coinId) => (bucketsBySymbol.get(coinId)?.length ?? 0) > 0)) {
    return;
  }

  prepStartedForScheduledRace = true;
  engine.restoreOfficialRace({
    prepStartedAtWallMs: currentRaceStartAtMs - engine.state.prepDurationMs,
    raceStartedAtWallMs: currentRaceStartAtMs,
    replayedAtWallMs: playbackNowMs,
    bucketsBySymbol
  });
  feed.primeLastBuckets(latestBucketByCoinId);
}

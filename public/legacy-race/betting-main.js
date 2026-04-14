import { COINS } from "./src/config.js";
import { RaceEngine } from "./src/raceEngine.js";
import { ThreeRaceRenderer } from "./src/renderer.js";
import { BettingUI } from "./src/bettingUi.js?v=3";
import { supabase } from "./src/supabaseClient.js";
import { SupabasePriceFeed } from "./src/supabasePriceFeed.js";
import { createBetRecord, fetchRaceResults, initializeBettingProfile, resolveOfficialRaceResult } from "./src/supabaseBettingStore.js?v=2";
import { RaceAudioController } from "./src/raceAudio.js";

const RACE_INTERVAL_MS = 5 * 60 * 1000;
const RACE_CLOCK_POLL_MS = 5000;
const PLAYBACK_DELAY_MS = 5000;
const RESULT_RESOLVE_DELAY_MS = 2500;
const RESULT_RESOLVE_RETRY_MS = 5000;
const MARKET_ID = "market-core";

const engine = new RaceEngine({ autoRestart: false });
let ui;
const raceAudio = new RaceAudioController();
let supabaseProfileInitialized = false;
let scheduledRaceStartAtMs = getNextRaceBoundary(Date.now());
let currentRaceStartAtMs = null;
let nextPrepStartAtMs = null;
let officialServerOffsetMs = 0;
let raceClockTimer = null;
const renderer = new ThreeRaceRenderer({
  container: document.querySelector("#viewport"),
  coins: COINS,
  enableEditorInteractions: false
});

ui = new BettingUI({
  root: document,
  coins: COINS,
  onSelectRacer: (id) => {
    engine.selectRacer(id);
    ui.setSelectedCoin(id);
  },
  onPlaceBet: async (betDraft) => {
    await ensureBettingProfileInitialized();
    return createBetRecord(betDraft);
  },
  onStart: () => {
    renderer.stopCameraAnimation(false);
    engine.startRace();
    ui.render(engine);
  },
  onRestart: () => {
    renderer.stopCameraAnimation(false);
    engine.reset();
    ui.resetForNewRace(engine.getSelectedRacer().id);
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
ui.setScheduledRaceStartAt(scheduledRaceStartAtMs);

const feed = new SupabasePriceFeed(engine, COINS, {
  playbackDelayMs: PLAYBACK_DELAY_MS,
  getNowMs: () => getOfficialNowMs()
});

engine.reset();
ui.resetForNewRace(engine.getSelectedRacer().id);
engine.addNote(`Next race start scheduled for ${formatClockTime(scheduledRaceStartAtMs)}.`);
refreshResultHistory();
bootstrapOfficialRaceState();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;
let previousRaceFinished = engine.state.raceFinished;
let prepStartedForScheduledRace = false;
let recordedResultKey = null;
let resultResolutionTimer = null;
let resultResolutionInFlight = false;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNow = getOfficialNowMs();

  maybeStartScheduledPrep(wallNow);
  engine.step(deltaSeconds);
  if (!previousRaceStarted && engine.state.raceStarted) {
    renderer.setCameraFocusPreset("auto");
    renderer.setCameraMode("behind");
    ui.lockBetting();
  }
  if (!previousRaceFinished && engine.state.raceFinished) {
    ui.settleBet(engine);
    queueOfficialResultResolution();
    scheduleFollowingRace();
  }
  raceAudio.sync(engine.state);

  previousRaceStarted = engine.state.raceStarted;
  previousRaceFinished = engine.state.raceFinished;
  ui.setCameraMode(renderer.getCameraMode());
  ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  ui.setScheduledRaceStartAt(scheduledRaceStartAtMs);
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
  raceAudio.dispose();
  feed.disconnect();
  renderer.dispose();
  if (resultResolutionTimer) {
    window.clearTimeout(resultResolutionTimer);
    resultResolutionTimer = null;
  }
});

async function initializeSupabase() {
  const result = await initializeBettingProfile(ui.getDefaultPointsBalance());
  if (result.ok) {
    ui.setPointsBalance(result.balance);
  }
  engine.addNote(result.message);
}

async function ensureBettingProfileInitialized() {
  if (supabaseProfileInitialized) {
    return;
  }

  supabaseProfileInitialized = true;
  await initializeSupabase();
}

function maybeStartScheduledPrep(now) {
  if (engine.state.prepStarted || engine.state.raceStarted || prepStartedForScheduledRace) {
    return;
  }

  const prepLeadMs = engine.state.prepDurationMs;
  if (now >= scheduledRaceStartAtMs - prepLeadMs) {
    prepStartedForScheduledRace = true;
    renderer.stopCameraAnimation(false);
    if (engine.state.raceFinished) {
      engine.reset();
      ui.resetForNewRace(engine.getSelectedRacer().id);
      recordedResultKey = null;
      resultResolutionInFlight = false;
    }
    engine.startPrepAt(scheduledRaceStartAtMs - prepLeadMs);
    engine.addNote(`Scheduled race prep started. Official start at ${formatClockTime(scheduledRaceStartAtMs)}.`);
  }
}

function scheduleFollowingRace() {
  prepStartedForScheduledRace = false;
  if (resultResolutionTimer) {
    window.clearTimeout(resultResolutionTimer);
    resultResolutionTimer = null;
  }
  syncOfficialRaceClock();
  ui.setScheduledRaceStartAt(scheduledRaceStartAtMs);
  engine.addNote(`Next race start scheduled for ${formatClockTime(scheduledRaceStartAtMs)}.`);
}

function queueOfficialResultResolution(delayMs = RESULT_RESOLVE_DELAY_MS) {
  if (recordedResultKey || resultResolutionInFlight) {
    return;
  }
  if (resultResolutionTimer) {
    window.clearTimeout(resultResolutionTimer);
  }
  resultResolutionTimer = window.setTimeout(() => {
    resultResolutionTimer = null;
    resolveOfficialResult();
  }, delayMs);
}

async function resolveOfficialResult() {
  const officialRaceStartedAtMs = currentRaceStartAtMs ?? engine.state.raceStartedAtWallMs;
  if (!officialRaceStartedAtMs) {
    return;
  }

  const resultKey = `${MARKET_ID}:${officialRaceStartedAtMs}`;
  if (recordedResultKey === resultKey) {
    return;
  }
  if (resultResolutionInFlight) {
    return;
  }

  resultResolutionInFlight = true;

  const result = await resolveOfficialRaceResult({
    marketId: MARKET_ID,
    raceStartedAtWallMs: officialRaceStartedAtMs,
    intervalMs: RACE_INTERVAL_MS
  });

  if (result.ok) {
    recordedResultKey = resultKey;
    resultResolutionInFlight = false;
    engine.applyOfficialFinishOrder(
      [result.result.first_place, result.result.second_place, result.result.third_place, result.result.fourth_place],
      new Date(result.result.race_finished_at ?? Date.now()).getTime()
    );
    ui.settleBet(engine);
    engine.addNote("Official podium resolved by Supabase.");
    refreshResultHistory();
  } else {
    resultResolutionInFlight = false;
    engine.addNote(result.message);
    queueOfficialResultResolution(RESULT_RESOLVE_RETRY_MS);
  }
}

async function refreshResultHistory() {
  const result = await fetchRaceResults(MARKET_ID);
  if (result.ok) {
    ui.setResultHistory(result.results);
    ui.render(engine);
  }
}

function getNextRaceBoundary(timestampMs) {
  return Math.ceil(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function formatClockTime(timestampMs) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestampMs));
}

function getOfficialNowMs() {
  return Date.now() + officialServerOffsetMs;
}

async function bootstrapOfficialRaceState() {
  await syncOfficialRaceClock();
  await restoreOfficialViewState();
  raceClockTimer = window.setInterval(syncOfficialRaceClock, RACE_CLOCK_POLL_MS);
  feed.connect();
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
  currentRaceStartAtMs = new Date(row.current_race_start_at).getTime();
  nextPrepStartAtMs = new Date(row.next_prep_start_at).getTime();
  scheduledRaceStartAtMs = new Date(row.next_race_start_at).getTime();
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

  const coinIds = COINS.map((coin) => coin.id);
  const { data, error } = await supabase
    .from("price_history_5s")
    .select("symbol, price, bucket_at")
    .in("symbol", coinIds)
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

  if (![...coinIds].every((coinId) => (bucketsBySymbol.get(coinId)?.length ?? 0) > 0)) {
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
  ui.resetForNewRace(engine.getSelectedRacer().id);
  if (engine.state.raceStarted && !engine.state.raceFinished) {
    ui.lockBetting();
  }
}

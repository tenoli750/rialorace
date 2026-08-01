import { FORMULA, getCoinsByIds, TARGET_DISTANCE_METERS, compoundSpeedFactor, normalizeChangePercent, getSpeedEffectPercentFromChangePercent } from "./src/config.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=11";
import { RaceAudioController } from "./src/raceAudio.js";
import { ThreeRaceRenderer } from "./src/renderer.js?v=24";
import { getLoginSession, supabase } from "./src/supabaseClient.js?v=8";
import { BettingUI } from "./src/bettingUi.js?v=29";
import { createBetRecord, fetchCurrentRaceBets, fetchPastRaceBets, initializeBettingProfile } from "./src/supabaseBettingStore.js?v=14";

const params = new URLSearchParams(window.location.search);
const MARKET_ID = params.get("id") ?? "market-03";
const MARKET = getMarketById(MARKET_ID);
const MARKET_COINS = getCoinsByIds(getMarketSymbolIds(MARKET));
const MARKET_SYMBOLS = formatMarketSymbols(MARKET);
const MARKET_TITLE = formatMarketTitle(MARKET);
const STORAGE_KEY = `binance-ring-rally-${MARKET_ID}-public-live-tuning-v1`;
const BET_HISTORY_MODE_STORAGE_KEY = `binance-ring-rally-${MARKET_ID}-bet-history-mode-v1`;
const VPS_RECORDING_MODE = params.get("vps") === "1";

const RACE_INTERVAL_MS = 5 * 60 * 1000;
const RACE_CLOCK_POLL_MS = 5000;
const PLAYBACK_DELAY_MS = 5000;
const LIVE_POST_FINISH_HOLD_MS = 10000;
const USE_COIN_TICK_LIVE = true;
const USE_NEXT_MATCH_BETTING = true;
const ODDS_HISTORY_LIMIT = 100;
const ODDS_REFRESH_MS = 60 * 1000;
const MIN_ODDS = 1.01;
const MAX_ODDS = 99;
const BET_HISTORY_MODES = new Set(["now", "next", "past", "test"]);
const RECORD_FRONTEND_RACE_CLOCK = VPS_RECORDING_MODE || params.get("recordClock") === "1";
const FRONTEND_CLOCK_SOURCE_LABEL = RECORD_FRONTEND_RACE_CLOCK
  ? (params.get("clockSource") || (VPS_RECORDING_MODE ? "vps-browser" : "browser"))
  : "browser";
const FRONTEND_CLOCK_RECORD_MIN_MS = RACE_CLOCK_POLL_MS - 250;
const FRONTEND_FINISH_RECORD_BACKOFF_MS = 60_000;
const FRAME_DELTA_CAP_SECONDS = VPS_RECORDING_MODE ? RACE_INTERVAL_MS / 1000 : 0.25;
const POST_RACE_BACKEND_RESULT_POLL_MS = 2000;
const KST_TIME_ZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const engine = new RaceEngine({ autoRestart: false, coins: MARKET_COINS });
const raceAudio = new RaceAudioController();
let ui;
let supabaseProfileInitialized = false;
let scheduledRaceStartAtMs = getNextRaceBoundary(Date.now());
let currentRaceStartAtMs = null;
let nextPrepStartAtMs = null;
let officialServerOffsetMs = 0;
let raceClockTimer = null;
let liveSampleTimer = null;
let raceStateSnapshotTimer = null;
let oddsRefreshTimer = null;
let prepStartedForScheduledRace = false;
let livePriceSamplesBySymbol = new Map();
let nextRaceScheduledFromFinish = false;
let showPostRaceOverlay = false;
let bettingTargetRaceStartAtMs = null;
let betHistoryTargetRaceStartAtMs = null;
let betHistoryMode = getInitialBetHistoryMode();
let betHistoryRequestId = 0;
let postRaceRankingRequestId = 0;
let lastFrontendClockRecordedAt = 0;
let frontendClockRecordInFlight = false;
let frontendClockRecordErrorLogged = false;
let frontendClockRecordBackoffUntil = 0;
let frontendFinishRecordInFlight = false;
let frontendFinishRecordBackoffUntil = 0;
let frontendFinishRecordErrorLogged = false;
let lastFrontendFinishSignature = "";
let postRaceBackendResultRaceKey = "";
let postRaceBackendResultCheckedAt = 0;
let postRaceBackendResultInFlight = false;
const frontendFinishRowsByRaceKey = new Map();
let testChatStarted = false;
let testChatChannel = null;

const marketCoinIds = getMarketSymbolIds(MARKET);
const defaultMarketTuning = buildPlaceholderBallTuning(marketCoinIds);
const renderer = new ThreeRaceRenderer({
  container: document.querySelector("#viewport"),
  coins: MARKET_COINS,
  useCustomModels: true,
  showBallAnchors: false,
  enableEditorInteractions: false
});

renderer.setTuning({
  ...renderer.getTuning(),
  ...loadSavedMarketTuning()
});

ui = new BettingUI({
  root: document,
  coins: MARKET_COINS,
  onSelectRacer: (id) => engine.selectRacer(id),
  onPlaceBet: async (betDraft) => {
    await ensureBettingProfileInitialized();
    const targetRaceStartedAt = new Date(getBetTargetRaceStartMs()).toISOString();
    const result = await createBetRecord({
      ...betDraft,
      marketId: MARKET_ID,
      targetRaceStartedAt
    });
    if (result.ok) {
      await syncBetHistoryTarget(getOfficialNowMs(), true);
    }
    return result;
  },
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
  },
  onSendTestChat: sendTestChatMessage
});

ui.setCameraMode(renderer.getCameraMode());
ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
ui.setLogoVisibility(renderer.getMarkerVisibility());
syncBettingTarget();
updatePostRaceOverlay();
publishFrontendRaceClock(buildFrontendRaceClockSnapshot(), { shouldRecord: false });

applyPageCopy();
applyFormulaTooltip();
setupBetHistoryModeMenu();
if (betHistoryMode === "test") {
  void ensureTestChatStarted();
}
engine.reset();
ui.resetForNewRace(engine.getSelectedRacer().id);
engine.addNote(`${MARKET_TITLE} live market follows backend coin ticks.`);
void updateAccountLink();
void bootstrapOfficialRaceState();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min(Math.max(0, (now - lastFrameAt) / 1000), FRAME_DELTA_CAP_SECONDS);
  lastFrameAt = now;
  const wallNow = getOfficialNowMs();

  const prepStartAtMs = nextPrepStartAtMs ?? (scheduledRaceStartAtMs - engine.state.prepDurationMs);
  if (showPostRaceOverlay && wallNow >= prepStartAtMs) {
    showPostRaceOverlay = false;
    ui.setPostRaceRanking(null);
    updatePostRaceOverlay();
  }
  maybeStartScheduledPrep(wallNow);
  if (USE_COIN_TICK_LIVE) {
    applyCachedLivePriceSamples();
  }
  engine.step(deltaSeconds, wallNow);
  captureFrontendFinishEvents();
  maybeRefreshBackendFinishResult(wallNow);
  if (!previousRaceStarted && engine.state.raceStarted) {
    renderer.setCameraFocusPreset("auto");
    renderer.setCameraMode("behind");
    if (!USE_NEXT_MATCH_BETTING) {
      ui.lockBetting();
    }
  }
  if (
    engine.state.raceFinished &&
    !nextRaceScheduledFromFinish &&
    wallNow - engine.state.raceFinishedAtWallMs >= LIVE_POST_FINISH_HOLD_MS
  ) {
    ui.settleBet(engine);
    scheduleFollowingRace();
    nextRaceScheduledFromFinish = true;
  }
  if (!VPS_RECORDING_MODE) {
    if (showPostRaceOverlay) {
      raceAudio.stopRaceLoop();
    } else {
      raceAudio.sync(engine.state);
    }
  }
  previousRaceStarted = engine.state.raceStarted;
  renderer.setWinnerShowcase(null);
  updatePostRaceOverlay(wallNow);
  if (!VPS_RECORDING_MODE) {
    ui.setCameraMode(renderer.getCameraMode());
    ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  }
  syncBettingTarget(wallNow);
  void syncBetHistoryTarget(wallNow);
  if (!VPS_RECORDING_MODE) {
    ui.render(engine);
    renderer.render(engine, now / 1000);
  }
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
  if (raceStateSnapshotTimer) {
    window.clearInterval(raceStateSnapshotTimer);
    raceStateSnapshotTimer = null;
  }
  if (oddsRefreshTimer) {
    window.clearInterval(oddsRefreshTimer);
    oddsRefreshTimer = null;
  }
  if (testChatChannel) {
    void supabase.removeChannel(testChatChannel);
    testChatChannel = null;
  }
  raceAudio.dispose();
  renderer.dispose();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    void refreshVisiblePageState();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshVisiblePageState();
  }
});

function applyPageCopy() {
  document.querySelector("title").textContent = `Binance Ring Rally ${MARKET_TITLE}`;
  document.querySelector("#hubLabel").textContent = `${MARKET_TITLE} Live`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} live market`;
  document.querySelector("#hubCopy").textContent =
    "This page follows backend coin ticks with the same live structure as the Market 03 live editor.";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Betting Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Use this panel for user-facing race stats, then extend it with Supabase bet and payout data.";
  document.querySelector("#leaderValue").textContent = `${MARKET_COINS[0].id} 0.0m`;
  const heading = document.querySelector("#marketHistoryTitle");
  if (heading) {
    heading.textContent = `${MARKET_TITLE} Bet History`;
  }
  const badge = document.querySelector("#marketBadge");
  if (badge) {
    badge.textContent = MARKET_TITLE;
  }
}

function applyFormulaTooltip() {
  const formulaEl = document.querySelector("#speedFormulaCard");
  if (!formulaEl) {
    return;
  }
  formulaEl.dataset.tooltip = FORMULA;
  formulaEl.setAttribute("aria-label", FORMULA);
  formulaEl.title = FORMULA;
  document.querySelector("#finishValue").textContent = `${TARGET_DISTANCE_METERS}m`;
}

function maybeStartScheduledPrep(now) {
  if (
    (engine.state.prepStarted && !engine.state.raceStarted) ||
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
      nextRaceScheduledFromFinish = false;
      engine.reset();
      livePriceSamplesBySymbol = new Map();
      ui.resetForNewRace(engine.getSelectedRacer().id);
      ui.setPostRaceRanking(null);
    }
    showPostRaceOverlay = false;
    ui.setPostRaceRanking(null);
    updatePostRaceOverlay();
    engine.startPrepAt(scheduledRaceStartAtMs - prepLeadMs);
    engine.addNote(`Scheduled race prep started. Official start at ${formatClockTime(scheduledRaceStartAtMs)}.`);
  }
}

function scheduleFollowingRace() {
  const completedRaceStartedAtMs = engine.state.raceStartedAtWallMs
    ? engine.state.raceStartedAtWallMs - engine.state.prepDurationMs
    : getCurrentRaceBoundary(getOfficialNowMs());
  const liveSchedule = getLiveVisibleSchedule(getOfficialNowMs(), engine.state.prepDurationMs);
  prepStartedForScheduledRace = false;
  currentRaceStartAtMs = liveSchedule.currentRaceStartAtMs;
  nextPrepStartAtMs = liveSchedule.nextPrepStartAtMs;
  scheduledRaceStartAtMs = liveSchedule.scheduledRaceStartAtMs;
  showPostRaceOverlay = true;
  ui.setPostRaceRanking(null);
  if (!engine.state.officialFinishTimesApplied) {
    void refreshPostRaceRankingFromBackend(completedRaceStartedAtMs);
  }
  updatePostRaceOverlay(getOfficialNowMs());
  syncBettingTarget();
  void refreshBettingOdds();
  void syncOfficialRaceClock();
  engine.addNote(`Next race start scheduled for ${formatClockTime(scheduledRaceStartAtMs)}.`);
}

function maybeRefreshBackendFinishResult(nowMs = getOfficialNowMs()) {
  if (
    VPS_RECORDING_MODE ||
    !engine.state.raceFinished ||
    engine.state.officialFinishTimesApplied ||
    !engine.state.raceStartedAtWallMs
  ) {
    return;
  }

  const completedRaceStartedAtMs = engine.state.raceStartedAtWallMs - engine.state.prepDurationMs;
  const raceKey = new Date(completedRaceStartedAtMs).toISOString();
  if (
    postRaceBackendResultInFlight ||
    (postRaceBackendResultRaceKey === raceKey &&
      nowMs - postRaceBackendResultCheckedAt < POST_RACE_BACKEND_RESULT_POLL_MS)
  ) {
    return;
  }

  postRaceBackendResultRaceKey = raceKey;
  postRaceBackendResultCheckedAt = nowMs;
  postRaceBackendResultInFlight = true;
  void refreshPostRaceRankingFromBackend(completedRaceStartedAtMs).finally(() => {
    postRaceBackendResultInFlight = false;
  });
}

function updatePostRaceOverlay(nowMs = getOfficialNowMs()) {
  const overlay = document.querySelector("#postRaceOverlay");
  document.body.classList.toggle("is-next-race-soon", showPostRaceOverlay);
  if (!overlay) {
    return;
  }
  overlay.hidden = !showPostRaceOverlay;
  if (!showPostRaceOverlay) {
    return;
  }
  const countdownTargetMs = nextPrepStartAtMs ?? getNextRaceBoundary(nowMs);
  const secondsRemaining = Math.max(0, Math.ceil((countdownTargetMs - nowMs) / 1000));
  overlay.textContent = `WAITING FOR NEXT ROUND ${String(secondsRemaining).padStart(3, "0")}s`;
}

function getNextRaceBoundary(timestampMs) {
  return Math.ceil(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function getBetTargetRaceStartMs(nowMs = getOfficialNowMs()) {
  return USE_NEXT_MATCH_BETTING ? getNextRaceBoundary(nowMs) : scheduledRaceStartAtMs;
}

function syncBettingTarget(nowMs = getOfficialNowMs()) {
  const nextTargetMs = getBetTargetRaceStartMs(nowMs);
  if (USE_NEXT_MATCH_BETTING && nextTargetMs !== bettingTargetRaceStartAtMs) {
    bettingTargetRaceStartAtMs = nextTargetMs;
    ui.resetForNewRace(engine.getSelectedRacer().id);
    void refreshBettingOdds();
  } else if (!USE_NEXT_MATCH_BETTING) {
    bettingTargetRaceStartAtMs = nextTargetMs;
    void refreshBettingOdds();
  }

  ui.setScheduledRaceStartAt(USE_NEXT_MATCH_BETTING ? bettingTargetRaceStartAtMs : scheduledRaceStartAtMs);
}

function getBetHistoryTargetRaceStartMs(nowMs = getOfficialNowMs()) {
  if (!USE_NEXT_MATCH_BETTING) {
    return scheduledRaceStartAtMs;
  }

  if (betHistoryMode === "next") {
    return getBetTargetRaceStartMs(nowMs);
  }

  if (betHistoryMode === "past") {
    return getCurrentRaceBoundary(nowMs);
  }

  if (betHistoryMode === "test") {
    return -1;
  }

  return getCurrentRaceBoundary(nowMs);
}

async function syncBetHistoryTarget(nowMs = getOfficialNowMs(), forceRefresh = false) {
  const nextTargetMs = getBetHistoryTargetRaceStartMs(nowMs);
  if (!forceRefresh && nextTargetMs === betHistoryTargetRaceStartAtMs) {
    return;
  }

  betHistoryTargetRaceStartAtMs = nextTargetMs;
  const requestId = ++betHistoryRequestId;
  ui.setBetHistoryMode(betHistoryMode);
  ui.setCurrentRaceBets([]);
  if (betHistoryMode === "test") {
    void ensureTestChatStarted();
    ui.render(engine);
    return;
  }

  if (betHistoryMode === "past") {
    await refreshPastRaceBets(requestId);
    return;
  }

  await refreshCurrentRaceBets(new Date(betHistoryTargetRaceStartAtMs).toISOString(), requestId);
}

function getCurrentRaceBoundary(timestampMs) {
  return Math.floor(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function setupBetHistoryModeMenu() {
  const menu = document.querySelector("#betHistoryModeMenu");
  if (!menu) {
    return;
  }

  updateBetHistoryModeMenu();
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bet-history-mode]");
    if (!button) {
      return;
    }

    const mode = button.dataset.betHistoryMode;
    if (!BET_HISTORY_MODES.has(mode)) {
      return;
    }

    betHistoryMode = mode;
    saveBetHistoryMode(mode);
    updateBetHistoryModeMenu();
    if (mode === "test") {
      void ensureTestChatStarted();
    }
    if (mode === "past") {
      betHistoryTargetRaceStartAtMs = null;
      void refreshPastRaceBets(++betHistoryRequestId);
      return;
    }
    void syncBetHistoryTarget(getOfficialNowMs(), true);
  });
}

function getInitialBetHistoryMode() {
  const requestedMode = params.get("history");
  if (BET_HISTORY_MODES.has(requestedMode)) {
    return requestedMode;
  }

  try {
    const savedMode = localStorage.getItem(BET_HISTORY_MODE_STORAGE_KEY);
    if (BET_HISTORY_MODES.has(savedMode) && savedMode !== "past") {
      return savedMode;
    }
  } catch {}

  return "now";
}

function saveBetHistoryMode(mode) {
  try {
    if (mode === "past") {
      localStorage.removeItem(BET_HISTORY_MODE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(BET_HISTORY_MODE_STORAGE_KEY, mode);
  } catch {}
}

function updateBetHistoryModeMenu() {
  for (const button of document.querySelectorAll("[data-bet-history-mode]")) {
    const isActive = button.dataset.betHistoryMode === betHistoryMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
  ui?.setBetHistoryMode(betHistoryMode);
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

function toIsoOrNull(timestampMs) {
  return Number.isFinite(timestampMs) && timestampMs > 0 ? new Date(timestampMs).toISOString() : null;
}

function getFrontendRaceClockPhase(nowMs, currentVisibleRaceStartAtMs, prepStartAtMs) {
  if (engine.state.raceFinished) {
    return "finished";
  }
  if (engine.state.raceStarted) {
    return "running";
  }
  if (engine.state.prepStarted) {
    return "prep";
  }
  if (
    Number.isFinite(prepStartAtMs) &&
    Number.isFinite(currentVisibleRaceStartAtMs) &&
    nowMs >= prepStartAtMs &&
    nowMs < currentVisibleRaceStartAtMs
  ) {
    return "prep_due";
  }
  if (Number.isFinite(currentVisibleRaceStartAtMs) && nowMs >= currentVisibleRaceStartAtMs) {
    return "start_due";
  }
  return "waiting";
}

function buildFrontendRaceClockSnapshot({
  backendServerNow = null,
  estimatedServerNowMs = getOfficialNowMs(),
  roundTripMs = null
} = {}) {
  const nowMs = Number.isFinite(estimatedServerNowMs) ? estimatedServerNowMs : getOfficialNowMs();
  const prepDurationMs = engine.state.prepDurationMs;
  const liveSchedule = getLiveVisibleSchedule(nowMs, prepDurationMs);
  const currentVisibleRaceStartAtMs = Number.isFinite(currentRaceStartAtMs)
    ? currentRaceStartAtMs
    : liveSchedule.currentRaceStartAtMs;
  const resolvedNextPrepStartAtMs = Number.isFinite(nextPrepStartAtMs)
    ? nextPrepStartAtMs
    : liveSchedule.nextPrepStartAtMs;
  const scheduledVisibleRaceStartAtMs = Number.isFinite(scheduledRaceStartAtMs)
    ? scheduledRaceStartAtMs
    : liveSchedule.scheduledRaceStartAtMs;
  const backendRaceStartAtMs = Number.isFinite(currentVisibleRaceStartAtMs)
    ? currentVisibleRaceStartAtMs - prepDurationMs
    : null;

  return {
    marketId: MARKET_ID,
    sourceLabel: FRONTEND_CLOCK_SOURCE_LABEL,
    pageUrl: window.location.href.slice(0, 1024),
    clientReportedAt: new Date().toISOString(),
    backendServerNow,
    estimatedFrontendNow: toIsoOrNull(nowMs),
    officialOffsetMs: officialServerOffsetMs,
    roundTripMs,
    currentVisibleRaceStartAt: toIsoOrNull(currentVisibleRaceStartAtMs),
    backendRaceStartAt: toIsoOrNull(backendRaceStartAtMs),
    nextPrepStartAt: toIsoOrNull(resolvedNextPrepStartAtMs),
    scheduledVisibleRaceStartAt: toIsoOrNull(scheduledVisibleRaceStartAtMs),
    engineRaceStartedAt: toIsoOrNull(engine.state.raceStartedAtWallMs),
    engineRaceFinishedAt: toIsoOrNull(engine.state.raceFinishedAtWallMs),
    phase: getFrontendRaceClockPhase(nowMs, currentVisibleRaceStartAtMs, resolvedNextPrepStartAtMs),
    prepDurationMs,
    raceIntervalMs: RACE_INTERVAL_MS,
    documentVisibility: document.visibilityState,
    userAgent: navigator.userAgent.slice(0, 512)
  };
}

function publishFrontendRaceClock(snapshot, { shouldRecord = true } = {}) {
  window.__RIALO_RACE_CLOCK__ = snapshot;
  window.__RIALO_GET_RACE_CLOCK__ = () => buildFrontendRaceClockSnapshot();
  if (shouldRecord) {
    void recordFrontendRaceClock(snapshot);
  }
}

async function recordFrontendRaceClock(snapshot) {
  if (!RECORD_FRONTEND_RACE_CLOCK || frontendClockRecordInFlight) {
    return;
  }

  const now = Date.now();
  if (now < frontendClockRecordBackoffUntil) {
    return;
  }
  if (now - lastFrontendClockRecordedAt < FRONTEND_CLOCK_RECORD_MIN_MS) {
    return;
  }

  frontendClockRecordInFlight = true;
  lastFrontendClockRecordedAt = now;
  try {
    const { error } = await supabase.rpc("record_frontend_race_clock", {
      requested_market_id: snapshot.marketId,
      requested_source_label: snapshot.sourceLabel,
      requested_page_url: snapshot.pageUrl,
      requested_client_reported_at: snapshot.clientReportedAt,
      requested_backend_server_now: snapshot.backendServerNow,
      requested_estimated_frontend_now: snapshot.estimatedFrontendNow,
      requested_official_offset_ms: snapshot.officialOffsetMs,
      requested_round_trip_ms: snapshot.roundTripMs,
      requested_current_visible_race_start_at: snapshot.currentVisibleRaceStartAt,
      requested_backend_race_start_at: snapshot.backendRaceStartAt,
      requested_next_prep_start_at: snapshot.nextPrepStartAt,
      requested_scheduled_visible_race_start_at: snapshot.scheduledVisibleRaceStartAt,
      requested_engine_race_started_at: snapshot.engineRaceStartedAt,
      requested_engine_race_finished_at: snapshot.engineRaceFinishedAt,
      requested_phase: snapshot.phase,
      requested_prep_duration_ms: snapshot.prepDurationMs,
      requested_race_interval_ms: snapshot.raceIntervalMs,
      requested_document_visibility: snapshot.documentVisibility,
      requested_user_agent: snapshot.userAgent
    });

    if (error && !frontendClockRecordErrorLogged) {
      frontendClockRecordBackoffUntil = Date.now() + 60_000;
      frontendClockRecordErrorLogged = true;
      console.warn("Frontend race clock record failed.", error.message);
    } else if (error) {
      frontendClockRecordBackoffUntil = Date.now() + 60_000;
    }
  } catch (error) {
    frontendClockRecordBackoffUntil = Date.now() + 60_000;
    if (!frontendClockRecordErrorLogged) {
      frontendClockRecordErrorLogged = true;
      console.warn("Frontend race clock record failed.", error instanceof Error ? error.message : String(error));
    }
  } finally {
    frontendClockRecordInFlight = false;
  }
}

let raceStateSnapshotRecordInFlight = false;
let raceStateSnapshotRecordBackoffUntil = 0;
let lastRaceStateSnapshotBucketKey = "";

async function maybeRecordRaceStateSnapshot() {
  // Only the VPS recorder may write snapshots. Random viewer tabs were poisoning
  // race_state_snapshots and making replay disagree with the official live race.
  if (!RECORD_FRONTEND_RACE_CLOCK) {
    return;
  }
  if (!engine.state.raceStarted) {
    return;
  }
  if (raceStateSnapshotRecordInFlight || Date.now() < raceStateSnapshotRecordBackoffUntil) {
    return;
  }

  const { backendRaceStartAtMs, visibleRaceStartAtMs } = getFrontendFinishRaceParts();
  if (!Number.isFinite(backendRaceStartAtMs) || !Number.isFinite(visibleRaceStartAtMs)) {
    return;
  }

  const nowMs = getOfficialNowMs();
  const bucketAtMs = Math.floor(nowMs / RACE_CLOCK_POLL_MS) * RACE_CLOCK_POLL_MS;
  const bucketKey = `${backendRaceStartAtMs}:${bucketAtMs}`;
  if (bucketKey === lastRaceStateSnapshotBucketKey) {
    return;
  }

  const snapshots = engine.state.racers.map((racer) => ({
    symbol: racer.id,
    price: Number.isFinite(racer.price) ? racer.price : null,
    speed_factor: Number(racer.speedFactor ?? 1),
    target_speed_factor: Number(racer.targetSpeedFactor ?? racer.speedFactor ?? 1),
    distance_meters: Number(racer.distanceMeters ?? 0),
    change_percent: Number(racer.changePercent ?? 0),
    speed_effect_percent: Number(racer.lastSpeedEffectPercent ?? 0),
    finish_place: Number.isInteger(racer.finishPlace) ? racer.finishPlace : null,
    finished_at: racer.finishedAtWallMs ? new Date(racer.finishedAtWallMs).toISOString() : null
  }));

  raceStateSnapshotRecordInFlight = true;
  try {
    const { error } = await supabase.rpc("record_race_state_snapshots", {
      requested_market_id: MARKET_ID,
      requested_race_started_at: toIsoOrNull(backendRaceStartAtMs),
      requested_bucket_at: toIsoOrNull(bucketAtMs),
      requested_source_label: FRONTEND_CLOCK_SOURCE_LABEL,
      requested_snapshots: snapshots
    });
    if (error) {
      raceStateSnapshotRecordBackoffUntil = Date.now() + 60_000;
      console.warn("Race state snapshot record failed.", error.message);
    } else {
      lastRaceStateSnapshotBucketKey = bucketKey;
    }
  } catch (error) {
    raceStateSnapshotRecordBackoffUntil = Date.now() + 60_000;
    console.warn("Race state snapshot record failed.", error instanceof Error ? error.message : String(error));
  } finally {
    raceStateSnapshotRecordInFlight = false;
  }
}

function getFrontendFinishRaceParts() {
  const engineVisibleRaceStartAtMs =
    Number.isFinite(engine.state.raceStartedAtWallMs) && engine.state.raceStartedAtWallMs > 0
      ? engine.state.raceStartedAtWallMs
      : currentRaceStartAtMs;
  const visibleRaceStartAtMs = Number.isFinite(engineVisibleRaceStartAtMs)
    ? engineVisibleRaceStartAtMs
    : null;
  const backendRaceStartAtMs = Number.isFinite(visibleRaceStartAtMs)
    ? visibleRaceStartAtMs - engine.state.prepDurationMs
    : null;
  return {
    visibleRaceStartAtMs,
    backendRaceStartAtMs
  };
}

function getFrontendFinishRowMap(backendRaceStartAtMs) {
  const raceKey = `${MARKET_ID}:${new Date(backendRaceStartAtMs).toISOString()}`;
  let rowsBySymbol = frontendFinishRowsByRaceKey.get(raceKey);
  if (!rowsBySymbol) {
    rowsBySymbol = new Map();
    frontendFinishRowsByRaceKey.set(raceKey, rowsBySymbol);
  }
  return rowsBySymbol;
}

function captureFrontendFinishEvents() {
  if (!engine.state.raceStarted) {
    return;
  }

  const { backendRaceStartAtMs, visibleRaceStartAtMs } = getFrontendFinishRaceParts();
  if (!Number.isFinite(backendRaceStartAtMs) || !Number.isFinite(visibleRaceStartAtMs)) {
    return;
  }

  const rowsBySymbol = getFrontendFinishRowMap(backendRaceStartAtMs);
  let changed = false;
  for (const racer of engine.state.racers) {
    const existing = rowsBySymbol.get(racer.id) ?? {};
    const hasOfficialFinishApplied = Boolean(engine.state.officialFinishTimesApplied);
    const actualFinishedAtMs =
      Number.isFinite(existing.actualEngineFinishedAtMs) && existing.actualEngineFinishedAtMs > 0
        ? existing.actualEngineFinishedAtMs
        : hasOfficialFinishApplied
          ? null
          : racer.finishedAtWallMs || null;
    const actualRaceStartedAtMs =
      Number.isFinite(existing.actualEngineRaceStartedAtMs) && existing.actualEngineRaceStartedAtMs > 0
        ? existing.actualEngineRaceStartedAtMs
        : hasOfficialFinishApplied
          ? null
          : engine.state.raceStartedAtWallMs || visibleRaceStartAtMs;
    const actualElapsedMs =
      Number.isFinite(actualFinishedAtMs) && Number.isFinite(actualRaceStartedAtMs)
        ? actualFinishedAtMs - actualRaceStartedAtMs
        : null;
    const nextRow = {
      ...existing,
      symbol: racer.id,
      frontendFinishPlace: existing.frontendFinishPlace ?? racer.finishPlace ?? null,
      actualEngineRaceStartedAtMs: actualRaceStartedAtMs,
      actualEngineFinishedAtMs: actualFinishedAtMs,
      actualEngineElapsedMs: Number.isFinite(actualElapsedMs) ? actualElapsedMs : null,
      distanceMeters: Number(racer.distanceMeters ?? 0)
    };
    if (nextRow.expectedFrontendFinishedAtMs && nextRow.actualEngineFinishedAtMs) {
      nextRow.finishDeltaMs = nextRow.actualEngineFinishedAtMs - nextRow.expectedFrontendFinishedAtMs;
    }

    if (JSON.stringify(existing) !== JSON.stringify(nextRow)) {
      rowsBySymbol.set(racer.id, nextRow);
      changed = true;
    }
  }

  if (changed && [...rowsBySymbol.values()].some((row) => row.actualEngineFinishedAtMs)) {
    void recordFrontendFinishSnapshot({ backendRaceStartAtMs, visibleRaceStartAtMs });
  }
}

function mergeBackendFinishResult(backendResult, backendRaceStartAtMs) {
  if (!backendResult || !Number.isFinite(backendRaceStartAtMs)) {
    return;
  }

  const visibleRaceStartAtMs = backendRaceStartAtMs + engine.state.prepDurationMs;
  const rowsBySymbol = getFrontendFinishRowMap(backendRaceStartAtMs);
  const finishOrder = [
    backendResult.first_place,
    backendResult.second_place,
    backendResult.third_place,
    backendResult.fourth_place
  ].filter(Boolean);
  const comparedElapsed = backendResult.compared_finish_elapsed_ms ?? {};

  for (const symbol of marketCoinIds) {
    const existing = rowsBySymbol.get(symbol) ?? { symbol };
    const backendElapsedMs = Number(comparedElapsed?.[symbol]);
    const backendFinishedAtMs =
      Number.isFinite(backendElapsedMs) && backendElapsedMs > 0 ? backendRaceStartAtMs + backendElapsedMs : null;
    const expectedFrontendFinishedAtMs =
      Number.isFinite(backendElapsedMs) && backendElapsedMs > 0 ? visibleRaceStartAtMs + backendElapsedMs : null;
    const actualEngineFinishedAtMs = existing.actualEngineFinishedAtMs ?? null;
    rowsBySymbol.set(symbol, {
      ...existing,
      symbol,
      backendFinishPlace: finishOrder.indexOf(symbol) >= 0 ? finishOrder.indexOf(symbol) + 1 : null,
      backendElapsedMs: Number.isFinite(backendElapsedMs) && backendElapsedMs > 0 ? backendElapsedMs : null,
      backendFinishedAtMs,
      expectedFrontendFinishedAtMs,
      finishDeltaMs:
        actualEngineFinishedAtMs && expectedFrontendFinishedAtMs
          ? actualEngineFinishedAtMs - expectedFrontendFinishedAtMs
          : existing.finishDeltaMs ?? null
    });
  }

  void recordFrontendFinishSnapshot({ backendRaceStartAtMs, visibleRaceStartAtMs });
}

function buildFrontendFinishPayload(backendRaceStartAtMs) {
  const rowsBySymbol = getFrontendFinishRowMap(backendRaceStartAtMs);
  return marketCoinIds.map((symbol) => {
    const row = rowsBySymbol.get(symbol) ?? { symbol };
    return {
      symbol,
      frontend_finish_place: row.frontendFinishPlace ?? null,
      backend_finish_place: row.backendFinishPlace ?? null,
      backend_elapsed_ms: row.backendElapsedMs ?? null,
      backend_finish_at: toIsoOrNull(row.backendFinishedAtMs),
      expected_frontend_finish_at: toIsoOrNull(row.expectedFrontendFinishedAtMs),
      actual_engine_race_started_at: toIsoOrNull(row.actualEngineRaceStartedAtMs),
      actual_engine_finished_at: toIsoOrNull(row.actualEngineFinishedAtMs),
      actual_engine_elapsed_ms: row.actualEngineElapsedMs ?? null,
      finish_delta_ms: row.finishDeltaMs ?? null,
      distance_meters: Number.isFinite(row.distanceMeters) ? row.distanceMeters : null
    };
  });
}

async function recordFrontendFinishSnapshot({ backendRaceStartAtMs, visibleRaceStartAtMs }) {
  if (!RECORD_FRONTEND_RACE_CLOCK || frontendFinishRecordInFlight || !Number.isFinite(backendRaceStartAtMs)) {
    return;
  }

  if (Date.now() < frontendFinishRecordBackoffUntil) {
    return;
  }

  const payload = buildFrontendFinishPayload(backendRaceStartAtMs);
  if (!payload.some((row) => row.actual_engine_finished_at || row.backend_elapsed_ms)) {
    return;
  }

  const signature = JSON.stringify({
    backendRaceStartAt: toIsoOrNull(backendRaceStartAtMs),
    payload
  });
  if (signature === lastFrontendFinishSignature) {
    return;
  }

  frontendFinishRecordInFlight = true;
  try {
    const { error } = await supabase.rpc("record_frontend_race_finish_times", {
      requested_market_id: MARKET_ID,
      requested_source_label: FRONTEND_CLOCK_SOURCE_LABEL,
      requested_backend_race_start_at: toIsoOrNull(backendRaceStartAtMs),
      requested_visible_race_start_at: toIsoOrNull(visibleRaceStartAtMs),
      requested_page_url: window.location.href.slice(0, 1024),
      requested_phase: buildFrontendRaceClockSnapshot().phase,
      requested_finish_payload: payload
    });

    if (error) {
      frontendFinishRecordBackoffUntil = Date.now() + FRONTEND_FINISH_RECORD_BACKOFF_MS;
      if (!frontendFinishRecordErrorLogged) {
        frontendFinishRecordErrorLogged = true;
        console.warn("Frontend finish record failed.", error.message);
      }
    } else {
      lastFrontendFinishSignature = signature;
      frontendFinishRecordErrorLogged = false;
    }
  } catch (error) {
    frontendFinishRecordBackoffUntil = Date.now() + FRONTEND_FINISH_RECORD_BACKOFF_MS;
    if (!frontendFinishRecordErrorLogged) {
      frontendFinishRecordErrorLogged = true;
      console.warn("Frontend finish record failed.", error instanceof Error ? error.message : String(error));
    }
  } finally {
    frontendFinishRecordInFlight = false;
  }
}

function toKstOffsetIso(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return null;
  }
  const date = new Date(timestampMs + KST_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+09:00`;
}

function buildFrontendOfficialResultSnapshot() {
  const { backendRaceStartAtMs, visibleRaceStartAtMs } = getFrontendFinishRaceParts();
  if (!Number.isFinite(backendRaceStartAtMs) || !Number.isFinite(visibleRaceStartAtMs)) {
    return null;
  }

  const rowsBySymbol = getFrontendFinishRowMap(backendRaceStartAtMs);
  const rows = marketCoinIds
    .map((symbol) => {
      const row = rowsBySymbol.get(symbol) ?? {};
      const actualEngineRaceStartedAtMs =
        Number.isFinite(row.actualEngineRaceStartedAtMs) && row.actualEngineRaceStartedAtMs > 0
          ? row.actualEngineRaceStartedAtMs
          : null;
      const actualEngineFinishedAtMs =
        Number.isFinite(row.actualEngineFinishedAtMs) && row.actualEngineFinishedAtMs > 0
          ? row.actualEngineFinishedAtMs
          : null;
      const actualEngineElapsedMs =
        Number.isFinite(row.actualEngineElapsedMs) && row.actualEngineElapsedMs > 0
          ? row.actualEngineElapsedMs
          : actualEngineFinishedAtMs && actualEngineRaceStartedAtMs
            ? actualEngineFinishedAtMs - actualEngineRaceStartedAtMs
            : null;
      return {
        symbol,
        frontendFinishPlace: row.frontendFinishPlace ?? null,
        actualEngineRaceStartedAtMs,
        actualEngineFinishedAtMs,
        actualEngineElapsedMs: Number.isFinite(actualEngineElapsedMs) ? actualEngineElapsedMs : null,
        distanceMeters: row.distanceMeters ?? null
      };
    })
    .filter((row) => row.symbol);

  const complete = rows.length === marketCoinIds.length && rows.every((row) => row.actualEngineElapsedMs > 0);
  if (!complete) {
    return {
      marketId: MARKET_ID,
      sourceLabel: FRONTEND_CLOCK_SOURCE_LABEL,
      sourceTimeZone: KST_TIME_ZONE,
      complete: false,
      raceStartedAt: toIsoOrNull(backendRaceStartAtMs),
      raceStartedAtKst: toKstOffsetIso(backendRaceStartAtMs),
      visibleRaceStartAt: toIsoOrNull(visibleRaceStartAtMs),
      visibleRaceStartAtKst: toKstOffsetIso(visibleRaceStartAtMs),
      rows
    };
  }

  const sortedRows = [...rows].sort((left, right) => {
    const leftPlace = Number(left.frontendFinishPlace);
    const rightPlace = Number(right.frontendFinishPlace);
    if (Number.isFinite(leftPlace) && Number.isFinite(rightPlace)) {
      return leftPlace - rightPlace;
    }
    return left.actualEngineElapsedMs - right.actualEngineElapsedMs;
  });
  const finishOrder = sortedRows.map((row) => row.symbol);
  const comparedFinishElapsedMs = Object.fromEntries(
    rows.map((row) => [row.symbol, Math.round(row.actualEngineElapsedMs)])
  );
  const raceFinishedAtMs = visibleRaceStartAtMs + Math.max(...Object.values(comparedFinishElapsedMs));

  return {
    marketId: MARKET_ID,
    sourceLabel: FRONTEND_CLOCK_SOURCE_LABEL,
    sourceTimeZone: KST_TIME_ZONE,
    complete: true,
    raceStartedAt: toIsoOrNull(backendRaceStartAtMs),
    raceStartedAtKst: toKstOffsetIso(backendRaceStartAtMs),
    visibleRaceStartAt: toIsoOrNull(visibleRaceStartAtMs),
    visibleRaceStartAtKst: toKstOffsetIso(visibleRaceStartAtMs),
    raceFinishedAt: toIsoOrNull(raceFinishedAtMs),
    raceFinishedAtKst: toKstOffsetIso(raceFinishedAtMs),
    firstPlace: finishOrder[0] ?? null,
    secondPlace: finishOrder[1] ?? null,
    thirdPlace: finishOrder[2] ?? null,
    fourthPlace: finishOrder[3] ?? null,
    comparedFinishElapsedMs,
    rows: rows.map((row) => ({
      symbol: row.symbol,
      frontendFinishPlace: row.frontendFinishPlace,
      actualEngineRaceStartedAt: toIsoOrNull(row.actualEngineRaceStartedAtMs),
      actualEngineRaceStartedAtKst: toKstOffsetIso(row.actualEngineRaceStartedAtMs),
      actualEngineFinishedAt: toIsoOrNull(row.actualEngineFinishedAtMs),
      actualEngineFinishedAtKst: toKstOffsetIso(row.actualEngineFinishedAtMs),
      actualEngineElapsedMs: Math.round(row.actualEngineElapsedMs),
      distanceMeters: row.distanceMeters
    })),
    capturedAt: new Date().toISOString(),
    capturedAtKst: toKstOffsetIso(Date.now())
  };
}

window.__RIALO_GET_FRONTEND_OFFICIAL_RESULT__ = buildFrontendOfficialResultSnapshot;

async function bootstrapOfficialRaceState() {
  await ensureBettingProfileInitialized();
  await refreshBettingOdds();
  await syncOfficialRaceClock();
  await syncBetHistoryTarget(getOfficialNowMs(), true);
  await restoreLiveCoinTickState();
  await refreshLivePriceSamples();
  raceClockTimer = window.setInterval(syncOfficialRaceClock, RACE_CLOCK_POLL_MS);
  liveSampleTimer = window.setInterval(refreshLivePriceSamples, RACE_CLOCK_POLL_MS);
  oddsRefreshTimer = window.setInterval(refreshBettingOdds, ODDS_REFRESH_MS);
  raceStateSnapshotTimer = window.setInterval(() => {
    void maybeRecordRaceStateSnapshot();
  }, RACE_CLOCK_POLL_MS);
}

async function refreshVisiblePageState() {
  await syncOfficialRaceClock();
  await syncBetHistoryTarget(getOfficialNowMs(), true);
}

async function refreshCurrentRaceBets(
  targetRaceStartedAt = new Date(getBetTargetRaceStartMs()).toISOString(),
  requestId = ++betHistoryRequestId
) {
  const result = await fetchCurrentRaceBets({
    marketId: MARKET_ID,
    targetRaceStartedAt
  });
  if (requestId !== betHistoryRequestId || betHistoryMode === "past" || betHistoryMode === "test") {
    return;
  }
  ui.setCurrentRaceBets(result.ok ? result.bets : []);
  ui.render(engine);
}

async function refreshPastRaceBets(requestId = ++betHistoryRequestId) {
  const result = await fetchPastRaceBets({
    marketId: MARKET_ID
  });
  if (requestId !== betHistoryRequestId || betHistoryMode !== "past") {
    return;
  }
  ui.setCurrentRaceBets(result.ok ? result.bets : []);
  ui.render(engine);
}

async function ensureTestChatStarted() {
  if (testChatStarted) {
    return;
  }

  testChatStarted = true;
  await loadTestChatMessages();
  subscribeTestChatMessages();
}

async function loadTestChatMessages() {
  const { data, error } = await supabase
    .from("market_chat_messages")
    .select("id, market_id, author_login_id, message, created_at")
    .eq("market_id", MARKET_ID)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    ui.setTestChatMessages([]);
    return;
  }

  ui.setTestChatMessages([...(data ?? [])].reverse().map(mapChatMessage));
}

function subscribeTestChatMessages() {
  if (testChatChannel) {
    return;
  }

  testChatChannel = supabase
    .channel(`market-chat:${MARKET_ID}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "market_chat_messages",
        filter: `market_id=eq.${MARKET_ID}`
      },
      (payload) => {
        ui.addTestChatMessage(mapChatMessage(payload.new));
      }
    )
    .subscribe();
}

async function sendTestChatMessage(message) {
  const { session } = await getLoginSession();
  if (!session?.sessionToken) {
    ui.addTestChatMessage({
      author: "System",
      message: "Login required to chat.",
      timestamp: Date.now()
    });
    return;
  }

  const { data, error } = await supabase.rpc("create_market_chat_message", {
    requested_session_token: session.sessionToken,
    requested_market_id: MARKET_ID,
    requested_message: message
  });

  if (error) {
    ui.addTestChatMessage({
      author: "System",
      message: "Message could not be sent.",
      timestamp: Date.now()
    });
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    ui.addTestChatMessage(mapChatMessage(row));
  }
}

function mapChatMessage(row) {
  return {
    id: row?.id,
    author: row?.author_login_id ?? "Unknown",
    message: row?.message ?? "",
    timestamp: row?.created_at ?? Date.now()
  };
}

async function ensureBettingProfileInitialized() {
  if (supabaseProfileInitialized) {
    return;
  }
  supabaseProfileInitialized = true;
  const result = await initializeBettingProfile(ui.getDefaultPointsBalance());
  if (result.ok) {
    ui.setPointsBalance(result.balance);
  }
  engine.addNote(result.message);
}

async function updateAccountLink() {
  const accountLink = document.querySelector("#accountLink");
  const pointsEl = document.querySelector("#headerPoints");
  if (!accountLink) {
    return;
  }

  const { session } = await getLoginSession();
  accountLink.href = session ? "./profile.html" : "./login.html";
  accountLink.textContent = session ? "Profile" : "Login";
  if (pointsEl) {
    pointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

async function refreshBettingOdds() {
  const targetRaceStartedAt = new Date(getBetTargetRaceStartMs()).toISOString();
  const savedSnapshot = await fetchMarketRatioSnapshot(targetRaceStartedAt);
  if (savedSnapshot) {
    ui.setBetRatios(savedSnapshot);
    return;
  }

  const { data, error } = await supabase
    .from("market_results_v2")
    .select("first_place, second_place, third_place, fourth_place, race_started_at")
    .eq("market_id", MARKET_ID)
    .order("race_started_at", { ascending: false })
    .limit(ODDS_HISTORY_LIMIT);

  if (error || !data?.length) {
    return;
  }

  const ratios = buildOddsFromRecentResults(data);
  ui.setBetRatios(ratios);
  void saveMarketRatioSnapshot(targetRaceStartedAt, ratios, data.length);
}

async function fetchMarketRatioSnapshot(targetRaceStartedAt) {
  const { data, error } = await supabase
    .from("market_ratio_snapshots")
    .select("ratio_snapshot")
    .eq("market_id", MARKET_ID)
    .eq("target_race_started_at", targetRaceStartedAt)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.ratio_snapshot ?? null;
}

async function saveMarketRatioSnapshot(targetRaceStartedAt, ratios, sampleCount) {
  await supabase.rpc("upsert_market_ratio_snapshot", {
    requested_market_id: MARKET_ID,
    requested_target_race_started_at: targetRaceStartedAt,
    requested_ratio_snapshot: ratios,
    requested_sample_count: sampleCount,
    requested_source_label: "frontend"
  });
}

async function refreshPostRaceRankingFromBackend(raceStartedAtMs) {
  if (VPS_RECORDING_MODE) {
    return;
  }

  const requestId = ++postRaceRankingRequestId;
  const { data, error } = await supabase
    .from("market_results_v2")
    .select("first_place, second_place, third_place, fourth_place, race_started_at, race_finished_at, compared_finish_elapsed_ms")
    .eq("market_id", MARKET_ID)
    .eq("race_started_at", new Date(raceStartedAtMs).toISOString())
    .maybeSingle();

  if (requestId !== postRaceRankingRequestId || error) {
    return;
  }

  const finishOrder = [data?.first_place, data?.second_place, data?.third_place, data?.fourth_place].filter((id) =>
    marketCoinIds.includes(id)
  );
  if (finishOrder.length !== marketCoinIds.length) {
    return;
  }

  mergeBackendFinishResult(data, raceStartedAtMs);
  engine.applyOfficialFinishOrder(
    finishOrder,
    new Date(data.race_finished_at ?? engine.state.raceFinishedAtWallMs ?? Date.now()).getTime(),
    data.compared_finish_elapsed_ms ?? {}
  );
  ui.setPostRaceRanking(engine.getRanking());
  ui.render(engine);
}

function buildOddsFromRecentResults(results) {
  const ratioPlaces = {
    first: "first_place",
    second: "second_place",
    third: "third_place",
    fourth: "fourth_place"
  };
  const ratios = {};
  const sampleCount = Math.max(1, results.length);

  for (const [place, field] of Object.entries(ratioPlaces)) {
    const counts = new Map(marketCoinIds.map((coinId) => [coinId, 0]));
    for (const result of results) {
      const symbol = result[field];
      if (counts.has(symbol)) {
        counts.set(symbol, counts.get(symbol) + 1);
      }
    }

    ratios[place] = Object.fromEntries(
      marketCoinIds.map((coinId) => {
        const count = counts.get(coinId) ?? 0;
        const odds = count > 0 ? sampleCount / count : MAX_ODDS;
        return [coinId, Number(clamp(odds, MIN_ODDS, MAX_ODDS).toFixed(2))];
      })
    );
  }

  return ratios;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  for (const row of data) {
    const rows = bucketsBySymbol.get(row.symbol) ?? [];
    const visibleBucketMs = new Date(row.bucket_at).getTime() + engine.state.prepDurationMs;
    rows.push({ price: Number(row.price), timeMs: visibleBucketMs });
    bucketsBySymbol.set(row.symbol, rows);
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

  const liveSchedule = getLiveVisibleSchedule(estimatedServerNowMs, engine.state.prepDurationMs);
  currentRaceStartAtMs = liveSchedule.currentRaceStartAtMs;
  nextPrepStartAtMs = liveSchedule.nextPrepStartAtMs;
  scheduledRaceStartAtMs = liveSchedule.scheduledRaceStartAtMs;
  syncBettingTarget(estimatedServerNowMs);
  publishFrontendRaceClock(
    buildFrontendRaceClockSnapshot({
      backendServerNow: row.server_now,
      estimatedServerNowMs,
      roundTripMs
    })
  );
}

function getTargetVisibleRaceStartMs(nowMs = getOfficialNowMs()) {
  if (nextPrepStartAtMs && scheduledRaceStartAtMs && nowMs >= nextPrepStartAtMs) {
    return scheduledRaceStartAtMs;
  }
  return currentRaceStartAtMs;
}

async function refreshLivePriceSamples() {
  if (!USE_COIN_TICK_LIVE) {
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
      const changePercent = Number(
        row.change_percent ?? (index === 0 || start <= 0 ? 0 : ((end - start) / start) * 100)
      );
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
    if (latest) {
      racer.price = Number(latest.price);
      applyCompoundedSpeedFromSamples(racer, samples);
    }
  }

  engine.state.connectionStatus = "live";
  engine.state.connectionMessage = "Backend coin ticks live";
}

function applyCompoundedSpeedFromSamples(racer, samples) {
  const raceStartMs = engine.state.raceStartedAtWallMs || 0;
  let speed = 1;
  let latestChange = 0;
  for (const sample of samples) {
    if (raceStartMs && sample.closeTime < raceStartMs) {
      continue;
    }
    latestChange = sample.changePercent;
    speed = compoundSpeedFactor(speed, sample.changePercent);
  }
  racer.changePercent = normalizeChangePercent(latestChange);
  racer.lastSpeedEffectPercent = getSpeedEffectPercentFromChangePercent(latestChange);
  racer.targetSpeedFactor = speed;
  racer.displaySpeedFactor = speed;
  racer.speedFactor = speed;
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

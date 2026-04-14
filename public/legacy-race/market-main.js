import { FORMULA, SPEED_MULTIPLIER, getCoinsByIds, TARGET_DISTANCE_METERS } from "./src/config.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=5";
import { RaceAudioController } from "./src/raceAudio.js";
import { ThreeRaceRenderer } from "./src/renderer.js?v=20";
import { getLoginSession, supabase } from "./src/supabaseClient.js?v=5";
import { BettingUI } from "./src/bettingUi.js?v=16";
import { createBetRecord, fetchCurrentRaceBets, fetchPastRaceBets, initializeBettingProfile } from "./src/supabaseBettingStore.js?v=13";

const params = new URLSearchParams(window.location.search);
const MARKET_ID = params.get("id") ?? "market-03";
const MARKET = getMarketById(MARKET_ID);
const MARKET_COINS = getCoinsByIds(getMarketSymbolIds(MARKET));
const MARKET_SYMBOLS = formatMarketSymbols(MARKET);
const MARKET_TITLE = formatMarketTitle(MARKET);
const STORAGE_KEY = `binance-ring-rally-${MARKET_ID}-public-live-tuning-v1`;
const BET_HISTORY_MODE_STORAGE_KEY = `binance-ring-rally-${MARKET_ID}-bet-history-mode-v1`;

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
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNow = getOfficialNowMs();

  const prepStartAtMs = nextPrepStartAtMs ?? (scheduledRaceStartAtMs - engine.state.prepDurationMs);
  if (showPostRaceOverlay && wallNow >= prepStartAtMs) {
    showPostRaceOverlay = false;
    ui.setPostRaceRanking(null);
    updatePostRaceOverlay();
  }
  maybeStartScheduledPrep(wallNow);
  engine.step(deltaSeconds);
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
  if (showPostRaceOverlay) {
    raceAudio.stopRaceLoop();
  } else {
    raceAudio.sync(engine.state);
  }
  previousRaceStarted = engine.state.raceStarted;
  if (USE_COIN_TICK_LIVE) {
    applyCachedLivePriceSamples();
  }
  renderer.setWinnerShowcase(null);
  updatePostRaceOverlay(wallNow);
  ui.setCameraMode(renderer.getCameraMode());
  ui.setCameraFocusPreset(renderer.getCameraFocusPreset());
  syncBettingTarget(wallNow);
  void syncBetHistoryTarget(wallNow);
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
  void refreshPostRaceRankingFromBackend(completedRaceStartedAtMs);
  updatePostRaceOverlay(getOfficialNowMs());
  syncBettingTarget();
  void refreshBettingOdds();
  void syncOfficialRaceClock();
  engine.addNote(`Next race start scheduled for ${formatClockTime(scheduledRaceStartAtMs)}.`);
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
  overlay.textContent = `NEXT RACE IN ${String(secondsRemaining).padStart(3, "0")}s`;
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
  const requestId = ++postRaceRankingRequestId;
  const { data, error } = await supabase
    .from("market_results_v2")
    .select("first_place, second_place, third_place, fourth_place, race_started_at")
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

  ui.setPostRaceRanking(finishOrder.map((id) => ({ id })));
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
    const previous = rows.at(-2) ?? latest;
    if (latest) {
      racer.price = Number(latest.price);
      racer.speedFactor = Number(latest.speed_factor ?? racer.speedFactor ?? 1);
      racer.targetSpeedFactor = Number(latest.speed_factor ?? racer.targetSpeedFactor ?? 1);
      racer.displaySpeedFactor = Number(latest.speed_factor ?? racer.speedFactor ?? 1);
      racer.changePercent = Number(
        latest.change_percent ??
          (previous && Number(previous.price) > 0
            ? ((Number(latest.price) - Number(previous.price)) / Number(previous.price)) * 100
            : 0)
      );
      racer.lastSpeedEffectPercent = racer.changePercent * SPEED_MULTIPLIER * 100;
    }
  }

  engine.state.connectionStatus = "live";
  engine.state.connectionMessage = "Backend coin ticks live";
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

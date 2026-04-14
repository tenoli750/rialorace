import {
  FORMULA,
  MIN_SPEED_FACTOR,
  MAX_SPEED_FACTOR,
  SPEED_MULTIPLIER,
  SPEED_SMOOTHING,
  TARGET_DISTANCE_METERS,
  getCoinsByIds
} from "./src/config.js";
import { buildPlaceholderBallTuning } from "./src/marketSlots.js";
import { getMarketById, getMarketSymbolIds, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";
import { RaceEngine } from "./src/raceEngine.js?v=5";
import { RaceAudioController } from "./src/raceAudio.js";
import { ThreeRaceRenderer } from "./src/renderer.js?v=20";
import { getLoginSession, supabase } from "./src/supabaseClient.js?v=5";
import { RaceUI } from "./src/ui.js?v=5";

const params = new URLSearchParams(window.location.search);
const MARKET_ID = params.get("id") ?? "market-03";
const REQUESTED_REPLAY_STARTED_AT = params.get("race_started_at");
const MARKET = getMarketById(MARKET_ID);
const MARKET_COINS = getCoinsByIds(getMarketSymbolIds(MARKET));
const MARKET_SYMBOLS = formatMarketSymbols(MARKET);
const REPLAY_HISTORY_LIMIT = 10;
const REPLAY_PREP_MS = 5000;
const REPLAY_COUNTDOWN_MS = 3000;
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
let replaySeedFrame = null;
let replayEvents = [];
let replaySessionStartedAtMs = 0;
let replayLocalRaceStartedAtMs = 0;
let replayNextEventIndex = 0;

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
engine.addNote(`${formatMarketTitle(MARKET)} replay uses backend 5-second prices and local simulation only.`);
void updateAccountLink();
void bootstrapReplayHistory();

let lastFrameAt = performance.now();
let previousRaceStarted = engine.state.raceStarted;

function frame(now) {
  const deltaSeconds = Math.min((now - lastFrameAt) / 1000, 0.25);
  lastFrameAt = now;
  const wallNowMs = Date.now();

  if (selectedReplayResult && engine.state.raceStarted) {
    applyReplayEvents(wallNowMs);
  }

  engine.step(deltaSeconds, wallNowMs);

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
    "Replay backend 5-second prices and simulate movement locally.";
  document.querySelector("#hubLabel").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubLabelSecondary").textContent = `${formatMarketTitle(MARKET)} Replay`;
  document.querySelector("#hubTitle").textContent = `${MARKET_SYMBOLS} backend price replay`;
  document.querySelector("#hubCopy").textContent =
    "This page replays backend 5-second price history and lets the frontend simulate the race locally.";
  document.querySelector("#detailHeading").textContent = `${MARKET_COINS[0].id} Replay Detail`;
  document.querySelector("#detailSubtitle").textContent =
    "Click a coin card to inspect backend 5-second price samples.";
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
    .select("id, market_id, race_started_at, race_finished_at, first_place, second_place, third_place, fourth_place, created_at")
    .eq("market_id", MARKET_ID)
    .order("race_started_at", { ascending: false })
    .limit(REPLAY_HISTORY_LIMIT);

  if (error) {
    engine.addNote("Race history could not be loaded from market results. Falling back to coin ticks.");
  }

  replayHistory = (data ?? []).map((entry) => ({ ...entry }));
  if (!replayHistory.length) {
    const fallbackHistory = await buildReplayHistoryFromCoinTicks();
    if (!fallbackHistory.ok) {
      engine.addNote(fallbackHistory.message);
      return;
    }
    replayHistory = fallbackHistory.results;
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

async function buildReplayHistoryFromCoinTicks() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const primarySymbol = MARKET_COINS[0]?.id ?? "SOL";
  const { data, error } = await supabase
    .from("coin_ticks_5s")
    .select("bucket_at")
    .eq("symbol", primarySymbol)
    .gte("bucket_at", since)
    .order("bucket_at", { ascending: false })
    .limit(500);

  if (error) {
    return { ok: false, results: [], message: "Backend coin ticks could not be loaded." };
  }

  const seen = new Set();
  const results = [];
  for (const row of data ?? []) {
    const bucketAtMs = new Date(row.bucket_at).getTime();
    const boundaryMs = Math.floor(bucketAtMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
    const key = new Date(boundaryMs).toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: `tick-${key}`,
      market_id: MARKET_ID,
      race_started_at: key,
      race_finished_at: key,
      first_place: "—",
      second_place: "—",
      third_place: "—",
      fourth_place: "—",
      created_at: key
    });
    if (results.length >= REPLAY_HISTORY_LIMIT) break;
  }

  return results.length
    ? { ok: true, results, message: "Replay history loaded from backend coin ticks." }
    : { ok: false, results: [], message: "No backend coin ticks found for replay history." };
}

function renderReplayHistory() {
  const root = document.querySelector("#replayHistory");
  root.innerHTML = replayHistory
    .map((entry, index) => {
      const active = selectedReplayResult?.id === entry.id;
      return `
        <button class="note-row${active ? " is-active" : ""}" type="button" data-replay-id="${entry.id}">
          <span class="note-stamp">Game ${index + 1}</span>
          <span class="replay-history-copy">
            <span>${formatReplayStart(entry.race_started_at)} KST</span>
            <span>1.${entry.first_place} 2.${entry.second_place} 3.${entry.third_place} 4.${entry.fourth_place}</span>
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
  const replayData = await fetchPriceTickTimeline(replayResult.race_started_at);
  if (!replayData.ok) {
    engine.addNote(replayData.message);
    return;
  }

  replaySeedFrame = replayData.seedFrame;
  replaySessionStartedAtMs = Date.now();
  replayLocalRaceStartedAtMs = replaySessionStartedAtMs + REPLAY_PREP_MS;
  replayEvents = buildReplayEvents(replayData.playbackFrames, new Date(replayResult.race_started_at).getTime());
  replayNextEventIndex = 0;
  renderer.stopCameraAnimation(false);
  engine.reset();
  engine.state.prepDurationMs = REPLAY_PREP_MS;
  engine.state.finalCountdownDurationMs = REPLAY_COUNTDOWN_MS;
  engine.startPrepAt(replaySessionStartedAtMs);
  applySeedFrame(replaySeedFrame);
  applyBackendSamplesToRacers(replayData.sampleFrames);
  engine.addNote(`Loaded backend price replay for ${formatReplayStart(replayResult.race_started_at)} KST.`);
  renderReplayHistory();
}

function applySeedFrame(seedFrame) {
  if (!seedFrame) return;
  const rowsBySymbol = new Map(seedFrame.rows.map((row) => [row.symbol, row]));
  for (const racer of engine.state.racers) {
    const row = rowsBySymbol.get(racer.id);
    if (!row) continue;
    racer.price = Number(row.price);
    racer.changePercent = 0;
    racer.speedFactor = 1;
    racer.targetSpeedFactor = 1;
    racer.displaySpeedFactor = 1;
    racer.postFinishSpeedFactor = 1;
    racer.lastSpeedEffectPercent = 0;
    racer.distanceMeters = 0;
    racer.finishPlace = null;
    racer.finishedAtWallMs = 0;
    racer.speedWindowStartPrice = Number(row.price);
    racer.speedWindowStartAt = replayLocalRaceStartedAtMs;
  }
}

function applyReplayEvents(nowWallMs) {
  if (!replayEvents.length) return;
  while (replayNextEventIndex < replayEvents.length && replayEvents[replayNextEventIndex].applyAtWallMs <= nowWallMs) {
    const event = replayEvents[replayNextEventIndex];
    for (const row of event.rows) {
      const racer = engine.state.racers.find((entry) => entry.id === row.symbol);
      if (!racer) continue;

      const backendSpeedFactor = Number(row.speed_factor ?? 1);
      const backendChangePercent = Number(row.change_percent ?? 0);
      const previousSpeedFactor = Number(racer.speedFactor ?? 1);

      racer.price = Number(row.price);
      racer.changePercent = backendChangePercent;
      racer.targetSpeedFactor = backendSpeedFactor;
      racer.speedFactor = backendSpeedFactor;
      racer.displaySpeedFactor = backendSpeedFactor;
      racer.lastSpeedEffectPercent =
        previousSpeedFactor > 0 ? ((backendSpeedFactor - previousSpeedFactor) / previousSpeedFactor) * 100 : 0;
      racer.lastCandleAt = event.applyAtWallMs;

      engine.recordSample(racer, {
        closeTime: event.applyAtWallMs,
        start: Number(row.previous_price),
        end: Number(row.price),
        changePercent: backendChangePercent,
        racePercent: racer.racePercent,
        speedFactor: backendSpeedFactor
      });
    }
    replayNextEventIndex += 1;
  }
}

async function fetchPriceTickTimeline(raceStartedAt) {
  const raceStartedAtMs = new Date(raceStartedAt).getTime();
  const sampleStartAt = new Date(raceStartedAtMs).toISOString();
  const raceEndsAt = new Date(raceStartedAtMs + RACE_INTERVAL_MS).toISOString();
  const { data, error } = await supabase
    .from("coin_ticks_5s")
    .select("symbol, price, previous_price, change_percent, speed_factor, bucket_at")
    .in("symbol", MARKET_COINS.map((coin) => coin.id))
    .gte("bucket_at", sampleStartAt)
    .lt("bucket_at", raceEndsAt)
    .order("bucket_at", { ascending: true });

  if (error) {
    return { ok: false, seedFrame: null, ticks: [], message: "Backend 5-second prices could not be loaded." };
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
    .filter((frame) => frame.rows.length === MARKET_COINS.length)
    .sort((a, b) => a.bucketAtMs - b.bucketAtMs);

  if (!frames.length) {
    return { ok: false, seedFrame: null, ticks: [], message: "No backend 5-second price frames found for this race." };
  }

  const seedSourceFrame = frames[0];
  const playbackFrames = frames.filter((frame) => frame.bucketAtMs >= raceStartedAtMs);
  if (!playbackFrames.length) {
    return { ok: false, seedFrame: null, ticks: [], message: "No backend playback frames found for this race." };
  }

  const seedFrame = {
    rows: seedSourceFrame.rows.map((row) => ({
      symbol: row.symbol,
      price: Number(row.price)
    }))
  };

  return { ok: true, seedFrame, sampleFrames: frames, playbackFrames };
}

function buildReplayEvents(playbackFrames, raceStartedAtMs) {
  return playbackFrames.map((frame) => ({
    applyAtWallMs: replayLocalRaceStartedAtMs + (frame.bucketAtMs - raceStartedAtMs),
    rows: frame.rows.map((row) => ({
      symbol: row.symbol,
      price: Number(row.price),
      previous_price: Number(row.previous_price ?? row.price),
      change_percent: Number(row.change_percent ?? 0),
      speed_factor: Number(row.speed_factor ?? 1)
    }))
  }));
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

function applyBackendSamplesToRacers(sampleFrames) {
  const samplesBySymbol = new Map(MARKET_COINS.map((coin) => [coin.id, []]));

  for (const frame of sampleFrames) {
    const previousBySymbol = new Map(frame.rows.map((row) => [row.symbol, row]));
    for (const row of frame.rows) {
      const start = Number(row.previous_price ?? previousBySymbol.get(row.symbol)?.price ?? row.price);
      const end = Number(row.price);
      samplesBySymbol.get(row.symbol)?.push({
        closeTime: frame.bucketAtMs,
        start,
        end,
        changePercent: Number(row.change_percent ?? 0),
        racePercent: 0,
        speedFactor: Number(row.speed_factor ?? 1)
      });
    }
  }

  for (const racer of engine.state.racers) {
    racer.samples = samplesBySymbol.get(racer.id) ?? [];
    racer.sampleKeys = new Set(racer.samples.map((sample) => sample.closeTime));
  }
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

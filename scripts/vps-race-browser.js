#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_MARKETS = [
  ...Array.from({ length: 20 }, (_, index) => `market-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `stock-market-${String(index + 1).padStart(2, "0")}`)
];

function printHelp() {
  console.log(`Usage:
  RACE_BROWSER_BASE_URL=https://rialoracev1.vercel.app npm run race:browser

Environment:
  RACE_BROWSER_BASE_URL    Site origin to open. Default: http://127.0.0.1:5178
  RACE_BROWSER_MARKETS     Comma-separated market ids. Default: market-01..market-20, stock-market-01..stock-market-20
  RACE_BROWSER_HEADLESS    Set false to show Chrome. Default: true
  RACE_BROWSER_RELOAD_MS   Periodic page reload interval. Default: 21600000
  RACE_BROWSER_CHECK_MS    Health check interval. Default: 30000
  RACE_BROWSER_OPEN_CONCURRENCY
                           Number of market pages to open at once. Default: 20
  RACE_BROWSER_VIEWPORT_WIDTH
                           Browser viewport width. Default: 960
  RACE_BROWSER_VIEWPORT_HEIGHT
                           Browser viewport height. Default: 720
  RACE_BROWSER_TIME_ZONE   Browser timezone id. Default: Asia/Seoul
  RACE_BROWSER_RECORD_OFFICIAL_RESULTS
                           Set true on the VPS to save frontend finish order as official.
  RACE_BROWSER_RECORD_PAGE_OFFICIAL_RESULTS
                           Set false to disable direct page snapshots. Default: true.
  SUPABASE_URL             Required when official result recording is enabled.
  SUPABASE_PUBLISHABLE_KEY Required when official result recording is enabled.
  RACE_OFFICIAL_RESULT_TOKEN
                           Required when official result recording is enabled.
`);
}

loadEnvFile();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const baseUrl = (process.env.RACE_BROWSER_BASE_URL || "http://127.0.0.1:5178").replace(/\/+$/, "");
const markets = (process.env.RACE_BROWSER_MARKETS || DEFAULT_MARKETS.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const headless = process.env.RACE_BROWSER_HEADLESS !== "false";
const reloadMs = readPositiveInt(process.env.RACE_BROWSER_RELOAD_MS, 6 * 60 * 60 * 1000);
const checkMs = readPositiveInt(process.env.RACE_BROWSER_CHECK_MS, 30 * 1000);
const openConcurrency = Math.max(1, Math.floor(readPositiveInt(process.env.RACE_BROWSER_OPEN_CONCURRENCY, 20)));
const viewportWidth = Math.floor(readPositiveInt(process.env.RACE_BROWSER_VIEWPORT_WIDTH, 960));
const viewportHeight = Math.floor(readPositiveInt(process.env.RACE_BROWSER_VIEWPORT_HEIGHT, 720));
const browserTimeZone = process.env.RACE_BROWSER_TIME_ZONE || "Asia/Seoul";
const recordOfficialResults = process.env.RACE_BROWSER_RECORD_OFFICIAL_RESULTS === "true";
const recordPageOfficialResults = process.env.RACE_BROWSER_RECORD_PAGE_OFFICIAL_RESULTS !== "false";
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const officialResultToken = process.env.RACE_OFFICIAL_RESULT_TOKEN || "";
const officialResolverVersion = process.env.RACE_BROWSER_OFFICIAL_RESOLVER_VERSION || "vps-frontend-v1";
const officialResolvedBy = process.env.RACE_BROWSER_OFFICIAL_RESOLVED_BY || "vps-browser";

let shuttingDown = false;
let officialConfigWarningLogged = false;
const officialResultSignatures = new Map();
const officialResultBackoffs = new Map();
let lastFinishStateOfficialSweepAt = 0;
let finishStateOfficialSweepBackoffUntil = 0;

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMarketUrl(marketId) {
  const path =
    marketId === "market-01"
      ? "/legacy-race/market01-betting.html"
      : marketId === "market-02"
        ? "/legacy-race/market02-betting.html"
        : "/legacy-race/market.html";
  return `${baseUrl}${path}?id=${encodeURIComponent(marketId)}&vps=1`;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Missing Playwright. Install on the VPS with:");
    console.error("  npm install --no-save playwright");
    console.error("  npx playwright install chromium");
    process.exit(1);
  }
}

async function openMarketPage(context, marketId) {
  const page = await context.newPage();
  const url = getMarketUrl(marketId);
  page.setDefaultNavigationTimeout(15_000);

  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    console.log(`[${marketId}] console ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    console.log(`[${marketId}] page error: ${error.message}`);
  });
  page.on("crash", () => {
    console.log(`[${marketId}] page crashed`);
  });

  await gotoWithRetry(page, url, marketId);
  return { marketId, page, url, openedAt: Date.now(), reloadedAt: Date.now() };
}

async function gotoWithRetry(page, url, marketId) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 15_000 });
      console.log(`[${marketId}] opened ${url}`);
      return;
    } catch (error) {
      console.log(`[${marketId}] open failed (${attempt}/3): ${error instanceof Error ? error.message : String(error)}`);
      await wait(2_000 * attempt);
    }
  }
}

async function keepAlive(entry) {
  if (entry.page.isClosed()) {
    return false;
  }

  try {
    await entry.page.evaluate(() => document.readyState);
  } catch (error) {
    console.log(`[${entry.marketId}] health check failed: ${error instanceof Error ? error.message : String(error)}`);
    await gotoWithRetry(entry.page, entry.url, entry.marketId);
    entry.reloadedAt = Date.now();
    return true;
  }

  await maybeRecordOfficialResult(entry);

  if (Date.now() - entry.reloadedAt >= reloadMs) {
    try {
      await entry.page.reload({ waitUntil: "domcontentloaded" });
      entry.reloadedAt = Date.now();
      console.log(`[${entry.marketId}] reloaded`);
    } catch (error) {
      console.log(`[${entry.marketId}] reload failed: ${error instanceof Error ? error.message : String(error)}`);
      await gotoWithRetry(entry.page, entry.url, entry.marketId);
      entry.reloadedAt = Date.now();
    }
  }

  return true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function maybeRecordOfficialResult(entry) {
  if (!recordOfficialResults || !recordPageOfficialResults) {
    return;
  }

  if (!supabaseUrl || !supabasePublishableKey || !officialResultToken) {
    if (!officialConfigWarningLogged) {
      officialConfigWarningLogged = true;
      console.log(
        "[race-browser] official result recording disabled: missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, or RACE_OFFICIAL_RESULT_TOKEN"
      );
    }
    return;
  }

  let result = null;
  try {
    result = await entry.page.evaluate(() => window.__RIALO_GET_FRONTEND_OFFICIAL_RESULT__?.() ?? null);
  } catch (error) {
    console.log(`[${entry.marketId}] official result read failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (!result?.complete || result.marketId !== entry.marketId || !result.raceStartedAt) {
    return;
  }

  await saveOfficialResult(result);
}

async function saveOfficialResult(result) {
  const payload = buildOfficialResultPayload(result);
  if (!payload) {
    return;
  }

  const key = `${payload.market_id}:${payload.race_started_at}`;
  const signature = JSON.stringify(payload);
  if (officialResultSignatures.get(key) === signature) {
    return;
  }
  if ((officialResultBackoffs.get(key) ?? 0) > Date.now()) {
    return;
  }

  const writeResult = await requestSupabaseRpc("record_vps_frontend_official_race_result", {
    requested_source_label: officialResolvedBy,
    requested_token: officialResultToken,
    requested_market_id: payload.market_id,
    requested_race_started_at: payload.race_started_at,
    requested_race_finished_at: payload.race_finished_at,
    requested_first_place: payload.first_place,
    requested_second_place: payload.second_place,
    requested_third_place: payload.third_place,
    requested_fourth_place: payload.fourth_place,
    requested_compared_finish_elapsed_ms: payload.compared_finish_elapsed_ms,
    requested_result_snapshot: payload.result_snapshot
  });

  if (!writeResult.ok) {
    officialResultBackoffs.set(key, Date.now() + 60_000);
    console.log(`[${payload.market_id}] official result save failed: ${writeResult.message}`);
    return;
  }

  officialResultSignatures.set(key, signature);
  officialResultBackoffs.delete(key);
  console.log(
    `[${payload.market_id}] official result saved ${
      payload.result_snapshot?.race_started_at_kst || payload.race_started_at
    } ${[
      payload.first_place,
      payload.second_place,
      payload.third_place,
      payload.fourth_place
    ].join(" > ")}`
  );
}

async function maybeRecordOfficialResultsFromFinishState() {
  if (!recordOfficialResults) {
    return;
  }

  if (!supabaseUrl || !supabasePublishableKey || !officialResultToken) {
    return;
  }

  const now = Date.now();
  if (now - lastFinishStateOfficialSweepAt < 15_000 || now < finishStateOfficialSweepBackoffUntil) {
    return;
  }
  lastFinishStateOfficialSweepAt = now;

  const writeResult = await requestSupabaseRpc("record_vps_frontend_official_race_results_from_finish_state_v2", {
    requested_source_label: officialResolvedBy,
    requested_token: officialResultToken,
    requested_limit: 80
  });

  if (!writeResult.ok) {
    finishStateOfficialSweepBackoffUntil = Date.now() + 60_000;
    console.log(`[race-browser] official finish-state sweep failed: ${writeResult.message}`);
    return;
  }

  const savedRows = Array.isArray(writeResult.data) ? writeResult.data : [];
  if (savedRows.length > 0) {
    console.log(
      `[race-browser] official finish-state saved ${savedRows
        .map((row) => `${row.saved_market_id}:${row.saved_race_started_at}`)
        .join(", ")}`
    );
  }
}

function buildOfficialResultPayload(result) {
  const finishOrder = [result.firstPlace, result.secondPlace, result.thirdPlace, result.fourthPlace].filter(Boolean);
  if (finishOrder.length !== 4 || !result.raceStartedAt || !result.raceFinishedAt) {
    return null;
  }

  const comparedFinishElapsedMs = result.comparedFinishElapsedMs ?? {};
  const elapsedValues = finishOrder.map((symbol) => Number(comparedFinishElapsedMs[symbol]));
  if (elapsedValues.some((elapsed) => !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 180_000)) {
    return null;
  }

  const normalizedRaceStartedAtMs = normalizeRaceStartedAtMs(Date.parse(result.raceStartedAt));
  if (!Number.isFinite(normalizedRaceStartedAtMs)) {
    return null;
  }
  const raceFinishedAtMs = Date.parse(result.raceFinishedAt);
  if (
    !Number.isFinite(raceFinishedAtMs) ||
    raceFinishedAtMs <= normalizedRaceStartedAtMs ||
    raceFinishedAtMs > normalizedRaceStartedAtMs + 3 * 60 * 1000
  ) {
    return null;
  }

  return {
    market_id: result.marketId,
    race_started_at: new Date(normalizedRaceStartedAtMs).toISOString(),
    race_finished_at: new Date(raceFinishedAtMs).toISOString(),
    first_place: result.firstPlace,
    second_place: result.secondPlace,
    third_place: result.thirdPlace,
    fourth_place: result.fourthPlace,
    compared_finish_elapsed_ms: Object.fromEntries(
      Object.entries(comparedFinishElapsedMs)
        .map(([symbol, elapsed]) => [symbol, Math.round(Number(elapsed))])
        .filter(([, elapsed]) => Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 180_000)
    ),
    result_snapshot: {
      source: "vps-frontend",
      source_label: result.sourceLabel,
      source_timezone: result.sourceTimeZone || browserTimeZone,
      race_started_at_kst: result.raceStartedAtKst,
      visible_race_start_at: result.visibleRaceStartAt,
      visible_race_start_at_kst: result.visibleRaceStartAtKst,
      race_finished_at_kst: result.raceFinishedAtKst,
      frontend_rows: result.rows ?? [],
      captured_at: result.capturedAt,
      captured_at_kst: result.capturedAtKst
    },
    resolved_by: officialResolvedBy,
    resolver_version: officialResolverVersion
  };
}

function normalizeRaceStartedAtMs(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return Math.floor(timestampMs / (5 * 60 * 1000)) * 5 * 60 * 1000;
}

async function requestSupabaseRpc(functionName, body) {
  let response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        authorization: `Bearer ${supabasePublishableKey}`,
        "content-type": "application/json",
        prefer: "return=representation"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    return {
      ok: false,
      data: null,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      data: null,
      message: `${response.status} ${await response.text()}`
    };
  }

  return {
    ok: true,
    data: await response.json().catch(() => null),
    message: "ok"
  };
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
      "--mute-audio"
    ]
  });
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: 1,
    timezoneId: browserTimeZone
  });

  const entries = await mapWithConcurrency(markets, openConcurrency, (marketId) => openMarketPage(context, marketId));

  console.log(`[race-browser] watching ${entries.length} markets from ${baseUrl}`);

  process.on("SIGINT", () => {
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });

  while (!shuttingDown) {
    const checkedEntries = await Promise.all(
      entries.map(async (entry) => {
        try {
          const alive = await keepAlive(entry);
          return alive ? entry : await openMarketPage(context, entry.marketId);
        } catch (error) {
          console.log(`[${entry.marketId}] check failed: ${error instanceof Error ? error.message : String(error)}`);
          return openMarketPage(context, entry.marketId);
        }
      })
    );
    entries.splice(0, entries.length, ...checkedEntries);
    await maybeRecordOfficialResultsFromFinishState();
    await wait(checkMs);
  }

  await browser.close();
  console.log("[race-browser] stopped");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

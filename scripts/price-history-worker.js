import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_COINS, MAX_SPEED_FACTOR, MIN_SPEED_FACTOR, SPEED_MULTIPLIER } from "../public/legacy-race/src/config.js";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = join(rootDir, ".env.local");
const bucketMs = 5_000;
const defaultPollMs = 5_000;
const bootstrapStaleMs = 30_000;
const requestTimeoutMs = 8_000;
const watchedCoinIds = ["BTC", "ETH", "SOL", "DOGE", "XRP", "TRX", "BNB", "ADA", "SUI", "LTC"];
const watchedCoins = ALL_COINS.filter((coin) => watchedCoinIds.includes(coin.id));
const isOnce = process.argv.includes("--once");

let lastWrittenBucketAt = null;
let stopping = false;

function loadLocalEnv() {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Add it to .env.local before starting the price worker.`);
  }
  return value;
}

function getPollMs() {
  const configured = Number(process.env.PRICE_WORKER_POLL_MS);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : defaultPollMs;
}

function getBucketStartMs(timestampMs = Date.now()) {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

function toIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 240)}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinancePrices() {
  const symbols = watchedCoins.map((coin) => coin.symbol);
  const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
  const rows = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);
  const priceBySymbol = new Map(rows.map((row) => [row.symbol, Number(row.price)]));

  return watchedCoins.map((coin) => {
    const price = priceBySymbol.get(coin.symbol);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Binance returned an invalid price for ${coin.symbol}.`);
    }
    return { coin, price };
  });
}

async function fetchLatestBucketBySymbol({ supabaseUrl, serviceRoleKey }) {
  const symbolsParam = watchedCoins.map((coin) => coin.id).join(",");
  const rows = await fetchJson(
    `${supabaseUrl}/rest/v1/coin_ticks_5s?select=symbol,price,bucket_at&symbol=in.(${symbolsParam})&order=bucket_at.desc&limit=80`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );

  const latest = new Map();
  for (const row of rows ?? []) {
    if (!latest.has(row.symbol)) {
      latest.set(row.symbol, row);
    }
  }
  return latest;
}

async function writePriceRows({ supabaseUrl, serviceRoleKey, rows }) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/coin_ticks_5s?on_conflict=symbol,bucket_at`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(rows)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${text.slice(0, 300)}`);
  }
}

async function buildRows(prices, currentBucketAtMs, latestBucketBySymbol) {
  const sourceEventAt = toIso(currentBucketAtMs);
  const rows = [];

  for (const { coin, price } of prices) {
    const latestRow = latestBucketBySymbol.get(coin.id);
    const latestBucketAtMs = latestRow?.bucket_at ? new Date(latestRow.bucket_at).getTime() : 0;
    const shouldSeedPreviousBucket = !latestBucketAtMs || currentBucketAtMs - latestBucketAtMs > bootstrapStaleMs;
    const previousPrice = shouldSeedPreviousBucket ? price : Number(latestRow.price);
    const changePercent =
      Number.isFinite(previousPrice) && previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0;

    if (shouldSeedPreviousBucket) {
      rows.push({
        symbol: coin.id,
        source: "binance",
        source_event_at: toIso(currentBucketAtMs - bucketMs),
        price,
        previous_price: price,
        change_percent: 0,
        speed_factor: 1,
        bucket_at: toIso(currentBucketAtMs - bucketMs),
      });
    }

    rows.push({
      symbol: coin.id,
      source: "binance",
      source_event_at: sourceEventAt,
      price,
      previous_price: previousPrice,
      change_percent: changePercent,
      speed_factor: getSpeedFactor(changePercent),
      bucket_at: toIso(currentBucketAtMs),
    });
  }

  return rows;
}

function getSpeedFactor(changePercent) {
  const nextSpeed = 1 + changePercent * SPEED_MULTIPLIER;
  return Math.min(MAX_SPEED_FACTOR, Math.max(MIN_SPEED_FACTOR, nextSpeed));
}

async function tick(config) {
  const currentBucketAtMs = getBucketStartMs();
  const currentBucketAt = toIso(currentBucketAtMs);
  if (lastWrittenBucketAt === currentBucketAt) {
    return;
  }

  const [prices, latestBucketBySymbol] = await Promise.all([
    fetchBinancePrices(),
    fetchLatestBucketBySymbol(config)
  ]);
  const rows = await buildRows(prices, currentBucketAtMs, latestBucketBySymbol);
  await writePriceRows({ ...config, rows });
  lastWrittenBucketAt = currentBucketAt;

  const seededCount = rows.length - prices.length;
  const seedLabel = seededCount > 0 ? `, seeded ${seededCount} stale previous buckets` : "";
  console.log(`[price-worker] wrote ${prices.length} prices for ${currentBucketAt}${seedLabel}`);
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function main() {
  loadLocalEnv();
  const config = {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  };

  console.log(
    `[price-worker] starting ${watchedCoins.map((coin) => coin.id).join(", ")} at ${getPollMs()}ms intervals`
  );

  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  do {
    try {
      await tick(config);
    } catch (error) {
      console.error(`[price-worker] ${error instanceof Error ? error.message : "tick failed"}`);
    }

    if (isOnce) break;
    await wait(getPollMs());
  } while (!stopping);

  console.log("[price-worker] stopped");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

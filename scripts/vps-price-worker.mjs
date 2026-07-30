const SUPABASE_URL = "https://rialorace.duckdns.org";
const ENV_PATH = "/opt/rialo-supabase/.env";
const symbols = [
  ["BTC", "BTCUSDT"],
  ["ETH", "ETHUSDT"],
  ["SOL", "SOLUSDT"],
  ["DOGE", "DOGEUSDT"],
  ["XRP", "XRPUSDT"],
  ["TRX", "TRXUSDT"],
  ["BNB", "BNBUSDT"],
  ["ADA", "ADAUSDT"],
  ["SUI", "SUIUSDT"],
  ["LTC", "LTCUSDT"],
  ["CRCL", "CRCLBUSDT"],
  ["COINBASE", "COINBUSDT"],
  ["GOOGLE", "GOOGLBUSDT"],
  ["IBM", "IBMBUSDT"],
  ["META", "METABUSDT"],
  ["MSFT", "MSFTBUSDT"],
  ["NVDA", "NVDABUSDT"],
  ["PLTR", "PLTRBUSDT"],
  ["TSLA", "TSLABUSDT"],
  ["SPCX", "SPCXBUSDT"]
];
const bucketMs = 5000;
const pollMs = Number(process.env.PRICE_WORKER_POLL_MS || 5000);
let lastBucketAt = "";

async function readServiceKey() {
  const text = await import("node:fs/promises").then((fs) => fs.readFile(ENV_PATH, "utf8"));
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith("SERVICE_ROLE_KEY="));
  const key = line?.slice("SERVICE_ROLE_KEY=".length).trim();
  if (!key) throw new Error("SERVICE_ROLE_KEY missing");
  return key;
}
function iso(ms) {
  return new Date(ms).toISOString();
}
function speedFactor(changePercent) {
  return Math.min(1.75, Math.max(0.72, 1 + changePercent * 0.8));
}
async function fetchPrices() {
  const binanceSymbols = symbols.map(([, symbol]) => symbol);
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`);
  if (!response.ok) throw new Error(`binance ${response.status}`);
  const rows = await response.json();
  const bySymbol = new Map(rows.map((row) => [row.symbol, Number(row.price)]));
  return symbols.map(([id, binanceSymbol]) => ({ id, price: bySymbol.get(binanceSymbol) })).filter((row) => Number.isFinite(row.price));
}
async function fetchLatest(serviceKey) {
  const ids = symbols.map(([id]) => id).join(",");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/coin_ticks_5s?select=symbol,price,bucket_at&symbol=in.(${ids})&order=bucket_at.desc&limit=160`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  if (!response.ok) throw new Error(`latest ${response.status}`);
  const rows = await response.json();
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.symbol)) latest.set(row.symbol, row);
  return latest;
}
async function writeRows(serviceKey, rows) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/coin_ticks_5s?on_conflict=symbol,bucket_at`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`insert ${response.status} ${await response.text()}`);
}
async function tick(serviceKey) {
  const bucketStart = Math.floor(Date.now() / bucketMs) * bucketMs;
  const bucketAt = iso(bucketStart);
  if (bucketAt === lastBucketAt) return;
  const [prices, latest] = await Promise.all([fetchPrices(), fetchLatest(serviceKey)]);
  const rows = prices.map(({ id, price }) => {
    const previous = Number(latest.get(id)?.price ?? price);
    const change = previous > 0 ? ((price - previous) / previous) * 100 : 0;
    return {
      symbol: id,
      source: "binance",
      source_event_at: bucketAt,
      price,
      previous_price: previous,
      change_percent: change,
      speed_factor: speedFactor(change),
      bucket_at: bucketAt
    };
  });
  await writeRows(serviceKey, rows);
  lastBucketAt = bucketAt;
  console.log(`[price-worker] wrote ${rows.length} rows ${bucketAt}`);
}
async function main() {
  const serviceKey = await readServiceKey();
  await tick(serviceKey);
  setInterval(() => tick(serviceKey).catch((error) => console.error(`[price-worker] ${error.message}`)), pollMs);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

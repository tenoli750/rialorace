export const TRACK_LOOP_METERS = 50;
export const TARGET_DISTANCE_METERS = 200;
export const BASE_METERS_PER_SECOND = 3.5;
export const SPEED_MULTIPLIER = 0.8;
export const SPEED_SMOOTHING = 0.08;
export const MIN_SPEED_FACTOR = 0.72;
export const MAX_SPEED_FACTOR = 1.75;
export const STALE_CANDLE_MS = 3_500;

/** Round change % to the same 3dp the UI prints, so price % and speed effect stay in lockstep. */
export function normalizeChangePercent(changePercent) {
  const value = Number(changePercent);
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

function clampSpeedFactor(value) {
  return Math.min(MAX_SPEED_FACTOR, Math.max(MIN_SPEED_FACTOR, value));
}

/** Compound from the previous speed: previous * (1 + change% * multiplier). 0% keeps speed unchanged. */
export function compoundSpeedFactor(previousSpeed, changePercent) {
  const change = normalizeChangePercent(changePercent);
  const previous = Number.isFinite(previousSpeed) && previousSpeed > 0 ? previousSpeed : 1;
  return clampSpeedFactor(previous * (1 + change * SPEED_MULTIPLIER));
}

/** Keep the ×100 scale used on the speed effect label. */
export function getSpeedEffectPercentFromChangePercent(changePercent) {
  return normalizeChangePercent(changePercent) * SPEED_MULTIPLIER * 100;
}

/**
 * Apply a closed candle to a racer.
 * - changePercent drives the effect label (same sign/timing as price %)
 * - speed compounds from the previous target (does not reset to 1 on 0%)
 * - reset:true restores baseline 1x (race start / hard reset only)
 */
export function syncRacerSpeedFromChange(racer, changePercent, { reset = false } = {}) {
  const change = normalizeChangePercent(changePercent);
  if (!racer) {
    return {
      changePercent: change,
      displaySpeedFactor: reset ? 1 : compoundSpeedFactor(1, change),
      lastSpeedEffectPercent: getSpeedEffectPercentFromChangePercent(change)
    };
  }

  racer.changePercent = change;
  racer.lastSpeedEffectPercent = getSpeedEffectPercentFromChangePercent(change);

  if (reset) {
    racer.speedFactor = 1;
    racer.targetSpeedFactor = 1;
    racer.displaySpeedFactor = 1;
    return {
      changePercent: change,
      displaySpeedFactor: 1,
      lastSpeedEffectPercent: 0
    };
  }

  const previous =
    Number.isFinite(racer.targetSpeedFactor) && racer.targetSpeedFactor > 0
      ? racer.targetSpeedFactor
      : Number.isFinite(racer.displaySpeedFactor) && racer.displaySpeedFactor > 0
        ? racer.displaySpeedFactor
        : Number.isFinite(racer.speedFactor) && racer.speedFactor > 0
          ? racer.speedFactor
          : 1;
  const next = compoundSpeedFactor(previous, change);
  racer.targetSpeedFactor = next;
  racer.displaySpeedFactor = next;
  racer.speedFactor = next;

  return {
    changePercent: change,
    displaySpeedFactor: next,
    lastSpeedEffectPercent: racer.lastSpeedEffectPercent
  };
}

/** @deprecated Use syncRacerSpeedFromChange. Kept as alias for older imports. */
export function syncSpeedDisplayFromChangePercent(racer, changePercent, options) {
  return syncRacerSpeedFromChange(racer, changePercent, options);
}

export const ALL_COINS = [
  { id: "BTC", symbol: "BTCUSDT", stream: "btcusdt@kline_1s", css: "#f2a900", three: 0xf2a900 },
  { id: "ETH", symbol: "ETHUSDT", stream: "ethusdt@kline_1s", css: "#576ee7", three: 0x576ee7 },
  { id: "SOL", symbol: "SOLUSDT", stream: "solusdt@kline_1s", css: "#1dbf85", three: 0x1dbf85 },
  { id: "DOGE", symbol: "DOGEUSDT", stream: "dogeusdt@kline_1s", css: "#d9872a", three: 0xd9872a },
  { id: "XRP", symbol: "XRPUSDT", stream: "xrpusdt@kline_1s", css: "#7f98a6", three: 0x7f98a6 },
  { id: "TRX", symbol: "TRXUSDT", stream: "trxusdt@kline_1s", css: "#ef4444", three: 0xef4444 },
  { id: "BNB", symbol: "BNBUSDT", stream: "bnbusdt@kline_1s", css: "#f0b90b", three: 0xf0b90b },
  { id: "ADA", symbol: "ADAUSDT", stream: "adausdt@kline_1s", css: "#2f6bff", three: 0x2f6bff },
  { id: "SUI", symbol: "SUIUSDT", stream: "suiusdt@kline_1s", css: "#6fc8ff", three: 0x6fc8ff },
  { id: "LTC", symbol: "LTCUSDT", stream: "ltcusdt@kline_1s", css: "#8fa8c9", three: 0x8fa8c9 },
  { id: "CRCL", symbol: "CRCLBUSDT", stream: "crclbusdt@kline_1s", css: "#1d4ed8", three: 0x1d4ed8 },
  { id: "COINBASE", symbol: "COINBUSDT", stream: "coinbusdt@kline_1s", css: "#0052ff", three: 0x0052ff },
  { id: "GOOGLE", symbol: "GOOGLBUSDT", stream: "googlbusdt@kline_1s", css: "#4285f4", three: 0x4285f4 },
  { id: "IBM", symbol: "IBMBUSDT", stream: "ibmbusdt@kline_1s", css: "#2563eb", three: 0x2563eb },
  { id: "META", symbol: "METABUSDT", stream: "metabusdt@kline_1s", css: "#0866ff", three: 0x0866ff },
  { id: "MSFT", symbol: "MSFTBUSDT", stream: "msftbusdt@kline_1s", css: "#00a4ef", three: 0x00a4ef },
  { id: "NVDA", symbol: "NVDABUSDT", stream: "nvdabusdt@kline_1s", css: "#76b900", three: 0x76b900 },
  { id: "PLTR", symbol: "PLTRBUSDT", stream: "pltrbusdt@kline_1s", css: "#111827", three: 0x111827 },
  { id: "TSLA", symbol: "TSLABUSDT", stream: "tslabusdt@kline_1s", css: "#e82127", three: 0xe82127 },
  { id: "SPCX", symbol: "SPCXBUSDT", stream: "spcxbusdt@kline_1s", css: "#7c3aed", three: 0x7c3aed }
];

export const COINS = ALL_COINS.filter((coin) => ["BTC", "ETH", "SOL", "DOGE"].includes(coin.id));
export const TEST_MARKET_01_COINS = ALL_COINS.filter((coin) => ["ETH", "SOL", "TRX", "BNB"].includes(coin.id));
export const TEST_MARKET_02_COINS = ALL_COINS.filter((coin) => ["ETH", "XRP", "ADA", "LTC"].includes(coin.id));

export function getCoinsByIds(ids) {
  return ids
    .map((id) => ALL_COINS.find((coin) => coin.id === id))
    .filter(Boolean);
}

/** Short UI labels for long stock ids. Keep full ids for DB/odds keys. */
const DISPLAY_SYMBOLS = {
  COINBASE: "COIN",
  GOOGLE: "GOOG"
};

export function formatDisplaySymbol(symbol) {
  if (!symbol) {
    return "";
  }
  return DISPLAY_SYMBOLS[symbol] ?? String(symbol);
}

export const RACER_MODEL_LIBRARY = {
  bull: { asset: "bull.glb", headingOffset: -Math.PI / 2 },
  wolf: { asset: "wolf.glb", headingOffset: -Math.PI / 2 },
  stag: { asset: "stag.glb", headingOffset: -Math.PI / 2 },
  shibaInu: { asset: "shiba-inu.glb", headingOffset: -Math.PI / 2, scaleMultiplier: 0.58 },
  alpaca: { asset: "alpaca.glb", headingOffset: -Math.PI / 2 },
  cow: { asset: "cow.glb", headingOffset: -Math.PI / 2 },
  deer: { asset: "deer.glb", headingOffset: -Math.PI / 2 },
  donkey: { asset: "donkey.glb", headingOffset: -Math.PI / 2 },
  sloth: { asset: "sloth.glb", headingOffset: -Math.PI / 2, scaleMultiplier: 1.05, animationSpeedMultiplier: 2 },
  horse: { asset: "horse.glb", headingOffset: -Math.PI / 2 },
  whiteHorse: { asset: "white-horse.glb", headingOffset: -Math.PI / 2 },
  fox: { asset: "fox.glb", headingOffset: -Math.PI / 2 },
  husky: { asset: "husky.glb", headingOffset: -Math.PI / 2 },
  pig: { asset: "pig.glb", headingOffset: -Math.PI / 2 },
  sheep: { asset: "sheep.glb", headingOffset: -Math.PI / 2, scaleMultiplier: 0.5 },
  zebra: { asset: "zebra.glb", headingOffset: -Math.PI / 2 },
  pug: { asset: "pug.glb", headingOffset: -Math.PI / 2, scaleMultiplier: 0.425 },
  llama: { asset: "llama.glb", headingOffset: -Math.PI / 2 }
};

export const MARKET_MODEL_LINKS = {
  core: {
    BTC: "bull",
    ETH: "wolf",
    SOL: "stag",
    DOGE: "shibaInu"
  },
  market02: {
    XRP: "alpaca",
    TRX: "cow",
    BNB: "deer",
    ADA: "donkey"
  },
  market03: {
    SUI: "horse",
    LTC: "whiteHorse"
  },
  stocks: {
    CRCL: "bull",
    COINBASE: "fox",
    GOOGLE: "husky",
    IBM: "pig",
    META: "pug",
    MSFT: "llama",
    NVDA: "zebra",
    PLTR: "sheep",
    TSLA: "sloth",
    SPCX: "wolf"
  }
};

export const FORMULA = `every closed 5s move compounds target speed: clamp(previous target speed * (1 + 5s % * ${SPEED_MULTIPLIER}), ${MIN_SPEED_FACTOR.toFixed(2)}x, ${MAX_SPEED_FACTOR.toFixed(2)}x), current speed eases toward target by ${Math.round(SPEED_SMOOTHING * 100)}% each frame`;

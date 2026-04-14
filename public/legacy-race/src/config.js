export const TRACK_LOOP_METERS = 50;
export const TARGET_DISTANCE_METERS = 200;
export const BASE_METERS_PER_SECOND = 3.5;
export const SPEED_MULTIPLIER = 0.8;
export const SPEED_SMOOTHING = 0.08;
export const MIN_SPEED_FACTOR = 0.72;
export const MAX_SPEED_FACTOR = 1.75;
export const STALE_CANDLE_MS = 3_500;

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
  { id: "LTC", symbol: "LTCUSDT", stream: "ltcusdt@kline_1s", css: "#8fa8c9", three: 0x8fa8c9 }
];

export const COINS = ALL_COINS.filter((coin) => ["BTC", "ETH", "SOL", "DOGE"].includes(coin.id));
export const TEST_MARKET_01_COINS = ALL_COINS.filter((coin) => ["ETH", "SOL", "TRX", "BNB"].includes(coin.id));
export const TEST_MARKET_02_COINS = ALL_COINS.filter((coin) => ["ETH", "XRP", "ADA", "LTC"].includes(coin.id));

export function getCoinsByIds(ids) {
  return ids
    .map((id) => ALL_COINS.find((coin) => coin.id === id))
    .filter(Boolean);
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
  horse: { asset: "horse.glb", headingOffset: -Math.PI / 2 },
  whiteHorse: { asset: "white-horse.glb", headingOffset: -Math.PI / 2 }
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
  }
};

export const FORMULA = `every closed 5s move compounds target speed: clamp(previous target speed * (1 + 5s % * ${SPEED_MULTIPLIER}), ${MIN_SPEED_FACTOR.toFixed(2)}x, ${MAX_SPEED_FACTOR.toFixed(2)}x), current speed eases toward target by ${Math.round(SPEED_SMOOTHING * 100)}% each frame`;

export const CRYPTO_TOKEN_LEGEND = {
  A: { symbol: "BTC", name: "Bitcoin", image: "./assets/icons/Bull.png" },
  B: { symbol: "ETH", name: "Ethereum", image: "./assets/icons/Wolf.png" },
  C: { symbol: "SOL", name: "Solana", image: "./assets/icons/Stag.png" },
  D: { symbol: "DOGE", name: "Dogecoin", image: "./assets/icons/Shib.png" },
  E: { symbol: "XRP", name: "XRP", image: "./assets/icons/alpaca.png" },
  F: { symbol: "TRX", name: "TRON", image: "./assets/icons/cow.png" },
  G: { symbol: "BNB", name: "BNB", image: "./assets/icons/Deer.png" },
  H: { symbol: "ADA", name: "Cardano", image: "./assets/icons/Donkey.png" },
  I: { symbol: "SUI", name: "Sui", image: "./assets/icons/Horse.png" },
  J: { symbol: "LTC", name: "Litecoin", image: "./assets/icons/White Horse.png" }
};

export const STOCK_TOKEN_LEGEND = {
  A: { symbol: "CRCL", name: "Circle", image: "./assets/stock-logos/CRCL.png" },
  B: { symbol: "COINBASE", name: "Coinbase", image: "./assets/stock-logos/COINBASE.png" },
  C: { symbol: "GOOGLE", name: "Google", image: "./assets/stock-logos/GOOGLE.png" },
  D: { symbol: "IBM", name: "IBM", image: "./assets/stock-logos/IBM.png" },
  E: { symbol: "META", name: "Meta", image: "./assets/stock-logos/META.png" },
  F: { symbol: "MSFT", name: "Microsoft", image: "./assets/stock-logos/MSFT.png" },
  G: { symbol: "NVDA", name: "NVIDIA", image: "./assets/stock-logos/NVDA.png" },
  H: { symbol: "PLTR", name: "Palantir", image: "./assets/stock-logos/PLTR.png" },
  I: { symbol: "TSLA", name: "Tesla", image: "./assets/stock-logos/TSLA.png" },
  J: { symbol: "SPCX", name: "SPCX", image: "./assets/stock-logos/SPCX.png" }
};

export const TOKEN_LEGENDS_BY_CATEGORY = {
  crypto: CRYPTO_TOKEN_LEGEND,
  stocks: STOCK_TOKEN_LEGEND
};

export const TOKEN_LEGEND = CRYPTO_TOKEN_LEGEND;

const MARKET_COMBINATIONS = [
  ["B", "C", "F", "G"],
  ["B", "E", "H", "J"],
  ["C", "E", "H", "I"],
  ["A", "C", "E", "G"],
  ["A", "C", "F", "H"],
  ["A", "B", "G", "J"],
  ["B", "C", "G", "H"],
  ["A", "B", "F", "I"],
  ["B", "D", "H", "I"],
  ["A", "H", "I", "J"],
  ["A", "B", "D", "F"],
  ["A", "C", "D", "E"],
  ["D", "E", "F", "H"],
  ["B", "C", "D", "J"],
  ["D", "E", "F", "J"],
  ["E", "G", "H", "J"],
  ["C", "F", "I", "J"],
  ["E", "F", "G", "I"],
  ["A", "D", "G", "I"],
  ["D", "G", "I", "J"]
];

export const MARKET_DEFINITIONS = [
  ...MARKET_COMBINATIONS.map((letters, index) => ({
    id: `market-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    letters,
    category: "crypto"
  })),
  ...MARKET_COMBINATIONS.map((letters, index) => ({
    id: `stock-market-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    letters,
    category: "stocks"
  }))
];

export function getTokenLegendForCategory(category = "crypto") {
  return TOKEN_LEGENDS_BY_CATEGORY[category] ?? CRYPTO_TOKEN_LEGEND;
}

export function expandMarketTokens(letters, category = "crypto") {
  const legend = getTokenLegendForCategory(category);
  return letters.map((letter) => ({
    letter,
    ...legend[letter]
  }));
}

export function getMarketById(marketId) {
  return MARKET_DEFINITIONS.find((market) => market.id === marketId) ?? null;
}

export function formatMarketTitle(market) {
  if (market?.category === "stocks") {
    return `Stock Market ${String(market.number).padStart(2, "0")}`;
  }
  return `Market ${String(market.number).padStart(2, "0")}`;
}

export function formatMarketSymbols(market) {
  return expandMarketTokens(market.letters, market.category)
    .map((token) => token.symbol)
    .join(", ");
}

export function getMarketSymbolIds(market) {
  return expandMarketTokens(market.letters, market.category).map((token) => token.symbol);
}

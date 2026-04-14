export const TOKEN_LEGEND = {
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

export const MARKET_DEFINITIONS = [
  { id: "market-01", number: 1, letters: ["B", "C", "F", "G"] },
  { id: "market-02", number: 2, letters: ["B", "E", "H", "J"] },
  { id: "market-03", number: 3, letters: ["C", "E", "H", "I"] },
  { id: "market-04", number: 4, letters: ["A", "C", "E", "G"] },
  { id: "market-05", number: 5, letters: ["A", "C", "F", "H"] },
  { id: "market-06", number: 6, letters: ["A", "B", "G", "J"] },
  { id: "market-07", number: 7, letters: ["B", "C", "G", "H"] },
  { id: "market-08", number: 8, letters: ["A", "B", "F", "I"] },
  { id: "market-09", number: 9, letters: ["B", "D", "H", "I"] },
  { id: "market-10", number: 10, letters: ["A", "H", "I", "J"] },
  { id: "market-11", number: 11, letters: ["A", "B", "D", "F"] },
  { id: "market-12", number: 12, letters: ["A", "C", "D", "E"] },
  { id: "market-13", number: 13, letters: ["D", "E", "F", "H"] },
  { id: "market-14", number: 14, letters: ["B", "C", "D", "J"] },
  { id: "market-15", number: 15, letters: ["D", "E", "F", "J"] },
  { id: "market-16", number: 16, letters: ["E", "G", "H", "J"] },
  { id: "market-17", number: 17, letters: ["C", "F", "I", "J"] },
  { id: "market-18", number: 18, letters: ["E", "F", "G", "I"] },
  { id: "market-19", number: 19, letters: ["A", "D", "G", "I"] },
  { id: "market-20", number: 20, letters: ["D", "G", "I", "J"] }
];

export function expandMarketTokens(letters) {
  return letters.map((letter) => ({
    letter,
    ...TOKEN_LEGEND[letter]
  }));
}

export function getMarketById(marketId) {
  return MARKET_DEFINITIONS.find((market) => market.id === marketId) ?? null;
}

export function formatMarketTitle(market) {
  return `Market ${String(market.number).padStart(2, "0")}`;
}

export function formatMarketSymbols(market) {
  return expandMarketTokens(market.letters)
    .map((token) => token.symbol)
    .join(", ");
}

export function getMarketSymbolIds(market) {
  return expandMarketTokens(market.letters).map((token) => token.symbol);
}

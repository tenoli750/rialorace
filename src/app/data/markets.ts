import type { MarketCategory } from "./tokens";

export interface Market {
  id: string;
  number: number;
  name: string;
  tokenLetters: string[];
  category?: MarketCategory;
}

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
  ["D", "G", "I", "J"],
];

const CRYPTO_MARKET_NAMES = [
  "Genesis Derby",
  "Moonlight Sprint",
  "Summit Stakes",
  "Apex Circuit",
  "Iron Gate Run",
  "Silver Rail Cup",
  "Crownline Dash",
  "Storm Track",
  "Nightfall Chase",
  "Emerald Loop",
  "Thunder Mile",
  "Harbor Heat",
  "Wildwood Classic",
  "Skyline Rally",
  "Copper Lane",
  "Royal Finish",
  "Velocity Ring",
  "Frontier Rush",
  "Victory Bend",
  "Final Furlong",
];

const STOCK_MARKET_NAMES = [
  "Ticker Derby",
  "Bull Run Sprint",
  "Exchange Stakes",
  "Blue Chip Circuit",
  "Opening Bell Run",
  "Wall Street Cup",
  "Capital Dash",
  "Volatility Track",
  "After Hours Chase",
  "Equity Loop",
  "Ledger Mile",
  "Harbor Floor Heat",
  "Margin Classic",
  "Skyline Board Rally",
  "Copper Tape Lane",
  "Dividend Finish",
  "Momentum Ring",
  "Frontier Float Rush",
  "Victory Bid Bend",
  "Final Bell Furlong",
];

export const cryptoMarkets: Market[] = MARKET_COMBINATIONS.map((tokenLetters, index) => ({
  id: `market-${String(index + 1).padStart(2, "0")}`,
  number: index + 1,
  name: CRYPTO_MARKET_NAMES[index],
  tokenLetters,
  category: "crypto",
}));

export const stockMarkets: Market[] = MARKET_COMBINATIONS.map((tokenLetters, index) => ({
  id: `stock-market-${String(index + 1).padStart(2, "0")}`,
  number: index + 1,
  name: STOCK_MARKET_NAMES[index],
  tokenLetters,
  category: "stocks",
}));

export const markets: Market[] = [...cryptoMarkets, ...stockMarkets];

export function getMarketById(id: string | undefined): Market | undefined {
  return markets.find((market) => market.id === id);
}

export function getMarketsByCategory(category: MarketCategory = "crypto"): Market[] {
  return markets.filter((market) => market.category === category);
}

export interface Token {
  id: string;
  symbol: string;
  /** Short UI label when symbol is longer than 4 chars (e.g. COINBASE → COIN). */
  shortSymbol?: string;
  name: string;
  letter: string;
  color: string;
  image: string;
  category?: MarketCategory;
  sourceSymbol?: string;
  /** Lower = higher market cap within the category catalog. */
  marketCapRank?: number;
}

export type MarketCategory = "crypto" | "stocks" | "rwa";

export const cryptoTokens: Token[] = [
  { id: "btc", symbol: "BTC", name: "Bitcoin", letter: "A", color: "#f2a900", image: "/assets/icons/Bull.png", category: "crypto", marketCapRank: 1 },
  { id: "eth", symbol: "ETH", name: "Ethereum", letter: "B", color: "#576ee7", image: "/assets/icons/Wolf.png", category: "crypto", marketCapRank: 2 },
  { id: "bnb", symbol: "BNB", name: "BNB", letter: "G", color: "#f0b90b", image: "/assets/icons/Deer.png", category: "crypto", marketCapRank: 3 },
  { id: "sol", symbol: "SOL", name: "Solana", letter: "C", color: "#1dbf85", image: "/assets/icons/Stag.png", category: "crypto", marketCapRank: 4 },
  { id: "xrp", symbol: "XRP", name: "XRP", letter: "E", color: "#7f98a6", image: "/assets/icons/alpaca.png", category: "crypto", marketCapRank: 5 },
  { id: "doge", symbol: "DOGE", name: "Dogecoin", letter: "D", color: "#d9872a", image: "/assets/icons/Shib.png", category: "crypto", marketCapRank: 6 },
  { id: "trx", symbol: "TRX", name: "TRON", letter: "F", color: "#ef4444", image: "/assets/icons/cow.png", category: "crypto", marketCapRank: 7 },
  { id: "ada", symbol: "ADA", name: "Cardano", letter: "H", color: "#2f6bff", image: "/assets/icons/Donkey.png", category: "crypto", marketCapRank: 8 },
  { id: "sui", symbol: "SUI", name: "Sui", letter: "I", color: "#6fc8ff", image: "/assets/icons/Horse.png", category: "crypto", marketCapRank: 9 },
  { id: "ltc", symbol: "LTC", name: "Litecoin", letter: "J", color: "#8fa8c9", image: "/assets/icons/White Horse.png", category: "crypto", marketCapRank: 10 },
];

export const stockTokens: Token[] = [
  { id: "nvda", symbol: "NVDA", name: "NVIDIA", letter: "G", color: "#76b900", image: "/legacy-race/assets/stock-logos/NVDA.png", category: "stocks", sourceSymbol: "NVDABUSDT", marketCapRank: 1 },
  { id: "msft", symbol: "MSFT", name: "Microsoft", letter: "F", color: "#00a4ef", image: "/legacy-race/assets/stock-logos/MSFT.png", category: "stocks", sourceSymbol: "MSFTBUSDT", marketCapRank: 2 },
  { id: "google", symbol: "GOOGLE", shortSymbol: "GOOG", name: "Google", letter: "C", color: "#4285f4", image: "/legacy-race/assets/stock-logos/GOOGLE.png", category: "stocks", sourceSymbol: "GOOGLBUSDT", marketCapRank: 3 },
  { id: "meta", symbol: "META", name: "Meta", letter: "E", color: "#0866ff", image: "/legacy-race/assets/stock-logos/META.png", category: "stocks", sourceSymbol: "METABUSDT", marketCapRank: 4 },
  { id: "tsla", symbol: "TSLA", name: "Tesla", letter: "I", color: "#e82127", image: "/legacy-race/assets/stock-logos/TSLA.png", category: "stocks", sourceSymbol: "TSLABUSDT", marketCapRank: 5 },
  { id: "ibm", symbol: "IBM", name: "IBM", letter: "D", color: "#2563eb", image: "/legacy-race/assets/stock-logos/IBM.png", category: "stocks", sourceSymbol: "IBMBUSDT", marketCapRank: 6 },
  { id: "pltr", symbol: "PLTR", name: "Palantir", letter: "H", color: "#111827", image: "/legacy-race/assets/stock-logos/PLTR.png", category: "stocks", sourceSymbol: "PLTRBUSDT", marketCapRank: 7 },
  { id: "coinbase", symbol: "COINBASE", shortSymbol: "COIN", name: "Coinbase", letter: "B", color: "#0052ff", image: "/legacy-race/assets/stock-logos/COINBASE.png", category: "stocks", sourceSymbol: "COINBUSDT", marketCapRank: 8 },
  { id: "crcl", symbol: "CRCL", name: "Circle", letter: "A", color: "#1d4ed8", image: "/legacy-race/assets/stock-logos/CRCL.png", category: "stocks", sourceSymbol: "CRCLBUSDT", marketCapRank: 9 },
  { id: "spcx", symbol: "SPCX", name: "SPCX", letter: "J", color: "#7c3aed", image: "/legacy-race/assets/stock-logos/SPCX.png", category: "stocks", sourceSymbol: "SPCXBUSDT", marketCapRank: 10 },
];

export const tokens: Token[] = [...cryptoTokens, ...stockTokens];

export function getTokensByCategory(category: MarketCategory = "crypto"): Token[] {
  return tokens.filter((token) => token.category === category);
}

/** Category tokens sorted by market-cap rank (highest first). */
export function getTokensByMarketCap(category: MarketCategory = "crypto"): Token[] {
  return [...getTokensByCategory(category)].sort(
    (a, b) => (a.marketCapRank ?? 99) - (b.marketCapRank ?? 99) || a.symbol.localeCompare(b.symbol)
  );
}

export function getTokenByLetter(letter: string, category: MarketCategory = "crypto"): Token | undefined {
  return tokens.find((token) => token.letter === letter && token.category === category);
}

export function getTokenById(id: string): Token | undefined {
  return tokens.find((token) => token.id === id);
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  return tokens.find((token) => token.symbol === symbol);
}

export function formatDisplaySymbol(symbol: string | null | undefined): string {
  if (!symbol) return "";
  const token = getTokenBySymbol(symbol);
  return token?.shortSymbol ?? symbol;
}

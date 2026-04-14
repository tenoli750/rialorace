export interface Token {
  id: string;
  symbol: string;
  name: string;
  letter: string;
  color: string;
  image: string;
}

export const tokens: Token[] = [
  { id: "btc", symbol: "BTC", name: "Bitcoin", letter: "A", color: "#f2a900", image: "/assets/icons/Bull.png" },
  { id: "eth", symbol: "ETH", name: "Ethereum", letter: "B", color: "#576ee7", image: "/assets/icons/Wolf.png" },
  { id: "sol", symbol: "SOL", name: "Solana", letter: "C", color: "#1dbf85", image: "/assets/icons/Stag.png" },
  { id: "doge", symbol: "DOGE", name: "Dogecoin", letter: "D", color: "#d9872a", image: "/assets/icons/Shib.png" },
  { id: "xrp", symbol: "XRP", name: "XRP", letter: "E", color: "#7f98a6", image: "/assets/icons/alpaca.png" },
  { id: "trx", symbol: "TRX", name: "TRON", letter: "F", color: "#ef4444", image: "/assets/icons/cow.png" },
  { id: "bnb", symbol: "BNB", name: "BNB", letter: "G", color: "#f0b90b", image: "/assets/icons/Deer.png" },
  { id: "ada", symbol: "ADA", name: "Cardano", letter: "H", color: "#2f6bff", image: "/assets/icons/Donkey.png" },
  { id: "sui", symbol: "SUI", name: "Sui", letter: "I", color: "#6fc8ff", image: "/assets/icons/Horse.png" },
  { id: "ltc", symbol: "LTC", name: "Litecoin", letter: "J", color: "#8fa8c9", image: "/assets/icons/White Horse.png" },
];

export function getTokenByLetter(letter: string): Token | undefined {
  return tokens.find((token) => token.letter === letter);
}

export function getTokenById(id: string): Token | undefined {
  return tokens.find((token) => token.id === id);
}

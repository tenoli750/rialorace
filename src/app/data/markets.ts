export interface Market {
  id: string;
  number: number;
  name: string;
  tokenLetters: string[];
}

export const markets: Market[] = [
  { id: "market-01", number: 1, name: "Genesis Derby", tokenLetters: ["B", "C", "F", "G"] },
  { id: "market-02", number: 2, name: "Moonlight Sprint", tokenLetters: ["B", "E", "H", "J"] },
  { id: "market-03", number: 3, name: "Summit Stakes", tokenLetters: ["C", "E", "H", "I"] },
  { id: "market-04", number: 4, name: "Apex Circuit", tokenLetters: ["A", "C", "E", "G"] },
  { id: "market-05", number: 5, name: "Iron Gate Run", tokenLetters: ["A", "C", "F", "H"] },
  { id: "market-06", number: 6, name: "Silver Rail Cup", tokenLetters: ["A", "B", "G", "J"] },
  { id: "market-07", number: 7, name: "Crownline Dash", tokenLetters: ["B", "C", "G", "H"] },
  { id: "market-08", number: 8, name: "Storm Track", tokenLetters: ["A", "B", "F", "I"] },
  { id: "market-09", number: 9, name: "Nightfall Chase", tokenLetters: ["B", "D", "H", "I"] },
  { id: "market-10", number: 10, name: "Emerald Loop", tokenLetters: ["A", "H", "I", "J"] },
  { id: "market-11", number: 11, name: "Thunder Mile", tokenLetters: ["A", "B", "D", "F"] },
  { id: "market-12", number: 12, name: "Harbor Heat", tokenLetters: ["A", "C", "D", "E"] },
  { id: "market-13", number: 13, name: "Wildwood Classic", tokenLetters: ["D", "E", "F", "H"] },
  { id: "market-14", number: 14, name: "Skyline Rally", tokenLetters: ["B", "C", "D", "J"] },
  { id: "market-15", number: 15, name: "Copper Lane", tokenLetters: ["D", "E", "F", "J"] },
  { id: "market-16", number: 16, name: "Royal Finish", tokenLetters: ["E", "G", "H", "J"] },
  { id: "market-17", number: 17, name: "Velocity Ring", tokenLetters: ["C", "F", "I", "J"] },
  { id: "market-18", number: 18, name: "Frontier Rush", tokenLetters: ["E", "F", "G", "I"] },
  { id: "market-19", number: 19, name: "Victory Bend", tokenLetters: ["A", "D", "G", "I"] },
  { id: "market-20", number: 20, name: "Final Furlong", tokenLetters: ["D", "G", "I", "J"] },
];

export function getMarketById(id: string | undefined): Market | undefined {
  return markets.find((market) => market.id === id);
}

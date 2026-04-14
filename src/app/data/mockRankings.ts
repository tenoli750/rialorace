const firstNames = [
  "Alex", "Jordan", "Casey", "Morgan", "Taylor", "Riley", "Jamie", "Avery", 
  "Quinn", "Sage", "River", "Phoenix", "Skyler", "Dakota", "Parker", "Reese",
  "Cameron", "Kendall", "Rowan", "Drew", "Blake", "Charlie", "Finley", "Kai"
];

const lastNames = [
  "Chen", "Smith", "Johnson", "Kim", "Lee", "Garcia", "Martinez", "Rodriguez",
  "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson",
  "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez"
];

export function generateUsername(seed: number): string {
  const first = firstNames[seed % firstNames.length];
  const last = lastNames[Math.floor(seed / firstNames.length) % lastNames.length];
  const num = (seed * 37) % 100;
  return `${first}${last}${num}`;
}

export function generateMockPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    username: generateUsername(i),
    points: 10000 - i * 150 + Math.floor(Math.sin(i) * 100),
  }));
}

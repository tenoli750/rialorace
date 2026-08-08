import type { PriceDirection } from "./paxgFeed";

export type SlotSymbolId =
  | "cherry"
  | "lemon"
  | "orange"
  | "plum"
  | "bell"
  | "bar"
  | "seven"
  | "diamond";

export interface SlotSymbol {
  id: SlotSymbolId;
  label: string;
  glyph: string;
  /** Relative reel weight. Higher = more common. */
  weight: number;
  /**
   * 3-of-a-kind payout vs one line bet.
   * Total stake is split evenly across paylines (stake / LINE_COUNT).
   * Vertical columns do not pay — only rows + diagonals.
   */
  linePay: number;
  tone: string;
}

/**
 * Classic 3×3 fruit / bar / seven strip.
 * Paylines: 3 horizontals + 2 diagonals (no vertical columns).
 * Weights + line pays tuned so Monte Carlo RTP ≈ 96%.
 * Each reel is driven by DOGE / XRP / ETH 1s trade direction (UP↑ DOWN↓ FLAT hold).
 */
export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: "cherry", label: "Cherry", glyph: "🍒", weight: 28, linePay: 17, tone: "border-rose-300 bg-rose-50 text-rose-800" },
  { id: "lemon", label: "Lemon", glyph: "🍋", weight: 22, linePay: 21, tone: "border-yellow-300 bg-yellow-50 text-yellow-900" },
  { id: "orange", label: "Orange", glyph: "🍊", weight: 18, linePay: 31, tone: "border-orange-300 bg-orange-50 text-orange-900" },
  { id: "plum", label: "Plum", glyph: "🍇", weight: 14, linePay: 46, tone: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900" },
  { id: "bell", label: "Bell", glyph: "🔔", weight: 9, linePay: 72, tone: "border-amber-400 bg-amber-50 text-amber-900" },
  { id: "bar", label: "BAR", glyph: "BAR", weight: 6, linePay: 102, tone: "border-neutral-800 bg-neutral-100 text-black" },
  { id: "seven", label: "Seven", glyph: "7", weight: 2.5, linePay: 305, tone: "border-neutral-800 bg-neutral-100 text-black" },
  { id: "diamond", label: "Diamond", glyph: "◆", weight: 0.5, linePay: 1525, tone: "border-cyan-400 bg-cyan-50 text-cyan-900" }
];

/** Rows + diagonals only — vertical columns are not winning lines. */
export const SLOT_PAYLINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 4, 8],
  [2, 4, 6]
];

export const TARGET_RTP = 0.96;
export const CELL_COUNT = 9;
export const REEL_COUNT = 3;
export const VISIBLE_ROWS = 3;
export const LINE_COUNT = SLOT_PAYLINES.length;

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);

export function getSymbol(id: SlotSymbolId) {
  return SLOT_SYMBOLS.find((symbol) => symbol.id === id) ?? SLOT_SYMBOLS[0];
}

/** Mulberry32 — fast deterministic PRNG for client demo fairness. */
export function createRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: Array<string | number>) {
  const text = parts.join("|");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickWeightedSymbol(rand: number): SlotSymbolId {
  let cursor = Math.max(0, Math.min(0.999999, rand)) * TOTAL_WEIGHT;
  for (const symbol of SLOT_SYMBOLS) {
    cursor -= symbol.weight;
    if (cursor <= 0) return symbol.id;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].id;
}

/** Build a weighted strip for one vertical reel (deterministic per round). */
export function buildReelStrip(roundId: number, reelIndex: number): SlotSymbolId[] {
  const rng = createRng(hashSeed(roundId, reelIndex, "reel-strip-v2"));
  const bag: SlotSymbolId[] = [];
  for (const symbol of SLOT_SYMBOLS) {
    const copies = Math.max(1, Math.round(symbol.weight));
    for (let i = 0; i < copies; i += 1) bag.push(symbol.id);
  }
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag;
}

export function buildRoundReels(roundId: number) {
  const strips = Array.from({ length: REEL_COUNT }, (_, reelIndex) =>
    buildReelStrip(roundId, reelIndex)
  );
  const rng = createRng(hashSeed(roundId, "offsets-v2"));
  const offsets = strips.map((strip) => Math.floor(rng() * strip.length));
  return { strips, offsets };
}

export const REEL_DRIVERS = [
  { reel: 0 as const, symbol: "dogeusdt", label: "DOGE" },
  { reel: 1 as const, symbol: "xrpusdt", label: "XRP" },
  { reel: 2 as const, symbol: "ethusdt", label: "ETH" }
] as const;

/**
 * Each vertical reel is driven by its own live trade pair.
 * UP → symbols move up one row, DOWN → move down one row, FLAT → hold.
 */
export function stepReelDown(offsets: number[], strips: SlotSymbolId[][], reelIndex: number) {
  const len = strips[reelIndex]?.length ?? 1;
  const next = offsets.slice();
  next[reelIndex] = (next[reelIndex] - 1 + len) % len;
  return next;
}

/** Advance one reel so symbols visually move up one row. */
export function stepReelUp(offsets: number[], strips: SlotSymbolId[][], reelIndex: number) {
  const len = strips[reelIndex]?.length ?? 1;
  const next = offsets.slice();
  next[reelIndex] = (next[reelIndex] + 1) % len;
  return next;
}

export function stepReelByDirection(
  offsets: number[],
  strips: SlotSymbolId[][],
  reelIndex: number,
  direction: PriceDirection
) {
  if (direction === "UP") return stepReelUp(offsets, strips, reelIndex);
  if (direction === "DOWN") return stepReelDown(offsets, strips, reelIndex);
  return offsets;
}

/** Map 3 reel windows (3 rows × 3 cols) onto flat 3×3 board indexes. */
export function boardFromReels(strips: SlotSymbolId[][], offsets: number[]): SlotSymbolId[] {
  const board: SlotSymbolId[] = Array(CELL_COUNT);
  for (let col = 0; col < REEL_COUNT; col += 1) {
    const strip = strips[col];
    const len = strip.length;
    const off = ((offsets[col] % len) + len) % len;
    for (let row = 0; row < VISIBLE_ROWS; row += 1) {
      board[row * REEL_COUNT + col] = strip[(off + row) % len];
    }
  }
  return board;
}

/** Read strip symbol at visible row (0 = top). Supports negative rows for animation peek. */
export function symbolAt(strip: SlotSymbolId[], offset: number, row: number): SlotSymbolId {
  const len = strip.length || 1;
  const off = ((offset % len) + len) % len;
  return strip[((off + row) % len + len) % len];
}

export interface PaylineWin {
  lineIndex: number;
  line: number[];
  symbol: SlotSymbolId;
  linePay: number;
  payout: number;
}

export function lineBet(stake: number) {
  return stake / LINE_COUNT;
}

export function evaluateClassicPaylines(board: Array<SlotSymbolId | null>, stake: number): PaylineWin[] {
  const perLine = lineBet(stake);
  const wins: PaylineWin[] = [];
  SLOT_PAYLINES.forEach((line, lineIndex) => {
    const [a, b, c] = line.map((index) => board[index] ?? null);
    if (!a || !b || !c) return;
    if (a === b && b === c) {
      const symbol = getSymbol(a);
      const payout = Math.floor(perLine * symbol.linePay);
      wins.push({
        lineIndex,
        line,
        symbol: a,
        linePay: symbol.linePay,
        payout
      });
    }
  });
  return wins;
}

export function totalPayout(wins: PaylineWin[]) {
  return wins.reduce((sum, win) => sum + win.payout, 0);
}

/** Independent-line analytic approx (ignores cell-share correlation). */
export function estimateIndependentRtp() {
  let oneLine = 0;
  for (const symbol of SLOT_SYMBOLS) {
    const p = symbol.weight / TOTAL_WEIGHT;
    oneLine += p ** 3 * symbol.linePay;
  }
  return oneLine;
}

export function simulateRtp(spins = 200_000) {
  const rng = createRng(0xc0ffee);
  let paid = 0;
  const stake = 100;
  // Match live loop shape: 120 ticks × 3 reels, ~20% flat hold per reel-tick.
  for (let i = 0; i < spins; i += 1) {
    const { strips, offsets } = buildRoundReels(i);
    let liveOffsets = offsets.slice();
    for (let step = 0; step < 120; step += 1) {
      for (let reel = 0; reel < REEL_COUNT; reel += 1) {
        const r = rng();
        const direction = r < 0.2 ? "FLAT" : r < 0.6 ? "UP" : "DOWN";
        liveOffsets = stepReelByDirection(liveOffsets, strips, reel, direction);
      }
    }
    paid += totalPayout(evaluateClassicPaylines(boardFromReels(strips, liveOffsets), stake));
  }
  return paid / (spins * stake);
}

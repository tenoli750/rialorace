import type { PriceDirection } from "./paxgFeed";
import { type SlotSymbolId } from "./slotRules";
import { supabase } from "./supabase";

export const SLOT_GAME_ID = "doge-xrp-eth-classic-v1";
export const SLOT_SEED_VERSION = "reel-strip-v2+offsets-v2";
export const SLOT_RULES_VERSION = "classic-5line-v1";

export interface SlotRoundRecord {
  game_id: string;
  round_id: number;
  seed_version: string;
  rules_version: string;
  status: "open" | "live" | "settled" | string;
  wait_started_at: string;
  game_started_at: string;
  game_ends_at: string;
  strips: SlotSymbolId[][];
  initial_offsets: number[];
  drivers: unknown;
  final_board: SlotSymbolId[] | null;
  final_offsets: number[] | null;
  reel_steps: number[] | null;
  end_quotes: unknown;
  payline_wins_at_100: unknown;
  payout_preview_100: number | null;
  tick_count: number | null;
  sample_ms: number | null;
  result_snapshot: Record<string, unknown>;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlotRoundTickRecord {
  game_id: string;
  round_id: number;
  tick: number;
  sampled_at: string;
  moves: Array<PriceDirection | null>;
  offsets: number[];
  board: SlotSymbolId[];
  quotes: unknown;
  step_counts: number[];
  created_at: string;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallback);
}

function asSymbolMatrix(value: unknown): SlotSymbolId[][] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const matrix = value.map((reel) => {
    if (!Array.isArray(reel)) return null;
    return reel.map((cell) => String(cell) as SlotSymbolId);
  });
  if (matrix.some((reel) => !reel || reel.length < 3)) return null;
  return matrix as SlotSymbolId[][];
}

function asSymbolBoard(value: unknown): SlotSymbolId[] | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  return value.map((cell) => String(cell) as SlotSymbolId);
}

function asInt3(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const nums = value.map((item) => Number(item));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums.map((n) => Math.trunc(n));
}

function asMoves(value: unknown): Array<PriceDirection | null> {
  if (!Array.isArray(value) || value.length !== 3) return [null, null, null];
  return value.map((item) => {
    const text = String(item || "").toUpperCase();
    if (text === "UP" || text === "DOWN" || text === "FLAT") return text;
    return null;
  });
}

function normalizeRound(row: any): SlotRoundRecord | null {
  if (!row || row.round_id == null) return null;
  const strips = asSymbolMatrix(row.strips);
  const initialOffsets = asInt3(row.initial_offsets);
  if (!strips || !initialOffsets) return null;
  return {
    game_id: String(row.game_id ?? SLOT_GAME_ID),
    round_id: Number(row.round_id),
    seed_version: String(row.seed_version ?? SLOT_SEED_VERSION),
    rules_version: String(row.rules_version ?? SLOT_RULES_VERSION),
    status: String(row.status ?? "open"),
    wait_started_at: String(row.wait_started_at ?? ""),
    game_started_at: String(row.game_started_at ?? ""),
    game_ends_at: String(row.game_ends_at ?? ""),
    strips,
    initial_offsets: initialOffsets,
    drivers: row.drivers ?? [],
    final_board: asSymbolBoard(row.final_board),
    final_offsets: asInt3(row.final_offsets),
    reel_steps: asInt3(row.reel_steps),
    end_quotes: row.end_quotes ?? [],
    payline_wins_at_100: row.payline_wins_at_100 ?? [],
    payout_preview_100: Number.isFinite(Number(row.payout_preview_100))
      ? Number(row.payout_preview_100)
      : null,
    tick_count: Number.isFinite(Number(row.tick_count)) ? Number(row.tick_count) : null,
    sample_ms: Number.isFinite(Number(row.sample_ms)) ? Number(row.sample_ms) : null,
    result_snapshot:
      row.result_snapshot && typeof row.result_snapshot === "object"
        ? (row.result_snapshot as Record<string, unknown>)
        : {},
    settled_at: row.settled_at ? String(row.settled_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}

function normalizeTick(row: any): SlotRoundTickRecord | null {
  if (!row || row.tick == null || row.round_id == null) return null;
  const board = asSymbolBoard(row.board);
  const offsets = asInt3(row.offsets);
  const stepCounts = asInt3(row.step_counts) ?? [0, 0, 0];
  if (!board || !offsets) return null;
  return {
    game_id: String(row.game_id ?? SLOT_GAME_ID),
    round_id: Number(row.round_id),
    tick: Number(row.tick),
    sampled_at: String(row.sampled_at ?? ""),
    moves: asMoves(row.moves),
    offsets,
    board,
    quotes: row.quotes ?? [],
    step_counts: stepCounts,
    created_at: String(row.created_at ?? "")
  };
}

export async function getSlotRound(roundId: number, gameId = SLOT_GAME_ID) {
  const { data, error } = await supabase.rpc("get_slot_round", {
    requested_round_id: roundId,
    requested_game_id: gameId
  });
  if (error) throw toError(error, "Could not load slot round.");
  return normalizeRound(firstRow(data));
}

export async function getLatestSlotRoundTick(roundId: number, gameId = SLOT_GAME_ID) {
  const { data, error } = await supabase.rpc("get_latest_slot_round_tick", {
    requested_round_id: roundId,
    requested_game_id: gameId
  });
  if (error) throw toError(error, "Could not load latest slot tick.");
  return normalizeTick(firstRow(data));
}

export async function listSlotRoundTicksAfter(
  roundId: number,
  afterTick = 0,
  limit = 30,
  gameId = SLOT_GAME_ID
) {
  const { data, error } = await supabase.rpc("list_slot_round_ticks_after", {
    requested_round_id: roundId,
    after_tick: afterTick,
    requested_limit: limit,
    requested_game_id: gameId
  });
  if (error) throw toError(error, "Could not list slot ticks.");
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map(normalizeTick).filter((row): row is SlotRoundTickRecord => Boolean(row));
}

export async function listRecentSlotRounds(limit = 12, gameId = SLOT_GAME_ID) {
  const { data, error } = await supabase.rpc("list_recent_slot_rounds", {
    requested_limit: limit,
    requested_game_id: gameId
  });
  if (error) throw toError(error, "Could not list slot rounds.");
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map(normalizeRound).filter((row): row is SlotRoundRecord => Boolean(row));
}

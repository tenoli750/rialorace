import { SLOT_GAME_ID } from "./slotOfficial";
import { supabase } from "./supabase";

const LOGIN_SESSION_STORAGE_KEY = "binance-ring-rally-login-session-v1";
const WAGER_MIRROR_KEY = "xrp-classic-slot-wager-mirror-v1";

export type SlotBetStatus = "open" | "won" | "lost";

export interface SlotBetRecord {
  id: string;
  roundId: number;
  stake: number;
  status: SlotBetStatus;
  payout: number;
  settledAt: string | null;
  createdAt: string | null;
  gameId: string;
}

function getLoginSessionToken() {
  return localStorage.getItem(LOGIN_SESSION_STORAGE_KEY);
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

/** Bigint-safe round id compare (PostgREST may return string). */
export function sameSlotRoundId(a: unknown, b: unknown) {
  if (a == null || b == null) return false;
  try {
    return BigInt(a as string | number | bigint) === BigInt(b as string | number | bigint);
  } catch {
    return Number(a) === Number(b);
  }
}

function mapBet(row: Record<string, unknown>): SlotBetRecord {
  const statusRaw = String(row.status ?? "open");
  const status: SlotBetStatus =
    statusRaw === "won" || statusRaw === "lost" ? statusRaw : "open";
  const roundIdRaw = row.round_id ?? row.roundId;
  return {
    id: String(row.bet_id ?? row.id ?? ""),
    roundId: Number(roundIdRaw),
    stake: Number(row.stake_points ?? row.stake ?? 0),
    status,
    payout: Number(row.payout_points ?? row.payout ?? 0),
    settledAt: row.settled_at ? String(row.settled_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    gameId: String(row.game_id ?? SLOT_GAME_ID)
  };
}

function readWagerMirror(): SlotBetRecord[] {
  try {
    const raw = sessionStorage.getItem(WAGER_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => mapBet(row as Record<string, unknown>))
      .filter((bet) => bet.id && Number.isFinite(bet.roundId) && bet.stake > 0);
  } catch {
    return [];
  }
}

function writeWagerMirror(bets: SlotBetRecord[]) {
  try {
    const openOrRecent = bets
      .filter((bet) => bet.status === "open" || bet.status === "won" || bet.status === "lost")
      .slice(0, 40);
    sessionStorage.setItem(WAGER_MIRROR_KEY, JSON.stringify(openOrRecent));
  } catch {
    // ignore quota
  }
}

export function rememberSlotBet(bet: SlotBetRecord) {
  const current = readWagerMirror().filter((row) => !sameSlotRoundId(row.roundId, bet.roundId));
  writeWagerMirror([bet, ...current]);
}

export function mergeSlotBets(serverRows: SlotBetRecord[]) {
  const mirror = readWagerMirror();
  const byKey = new Map<string, SlotBetRecord>();
  for (const bet of mirror) {
    byKey.set(`${bet.gameId}:${bet.roundId}`, bet);
  }
  for (const bet of serverRows) {
    byKey.set(`${bet.gameId}:${bet.roundId}`, bet);
  }
  const merged = [...byKey.values()].sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  writeWagerMirror(merged);
  return merged;
}

export async function createSlotBet(stake: number, roundId?: number, gameId = SLOT_GAME_ID) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before placing a bet.");

  const payload: Record<string, unknown> = {
    requested_session_token: sessionToken,
    requested_stake_points: Math.floor(stake),
    requested_game_id: gameId
  };
  // Server owns target round (current wait or next while live); client hint optional.
  if (roundId != null && Number.isFinite(roundId)) {
    payload.requested_round_id = Math.trunc(roundId);
  }

  const { data, error } = await supabase.rpc("create_slot_bet_with_login_session", payload);

  if (error) throw new Error(error.message || "Slot bet failed.");
  const row = firstRow<Record<string, unknown>>(
    data as Record<string, unknown> | Record<string, unknown>[] | null
  );
  if (!row) throw new Error("Slot bet failed.");

  const bet = mapBet(row);
  if (!Number.isFinite(bet.roundId) || bet.stake < 10) {
    throw new Error("Slot bet failed.");
  }
  rememberSlotBet(bet);

  return {
    bet,
    pointsBalance: Number(row.points_balance ?? 0)
  };
}

export async function listSlotBets(limit = 40, gameId = SLOT_GAME_ID) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) return mergeSlotBets([]);

  const { data, error } = await supabase.rpc("list_slot_bets_with_login_session", {
    requested_session_token: sessionToken,
    requested_limit: limit,
    requested_game_id: gameId
  });

  if (error) {
    // Keep mirrored open wagers so YOUR WAGER still appears if list briefly fails.
    const mirrored = readWagerMirror();
    if (mirrored.length) return mirrored;
    throw new Error(error.message || "Could not load slot bets.");
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return mergeSlotBets(rows.map((row) => mapBet(row as Record<string, unknown>)));
}

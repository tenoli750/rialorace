import { getLoginSessionToken, supabase } from "./supabase";

export interface RaceLottoSlot {
  slot: number;
  market_id: string;
  market_number?: number;
  label?: string;
  race_started_at: string;
  coin_ids: string[];
}

export interface RaceLottoRound {
  id: string;
  draw_key: string;
  round_date: string;
  draw_name: string;
  draw_starts_at: string;
  sales_open_at?: string | null;
  sales_close_at: string;
  base_jackpot_points: number;
  carried_points: number;
  entry_pool_points: number;
  current_jackpot_points: number;
  ticket_price_points: number;
  status: "open" | "locked" | "ready" | "settled" | "upcoming" | string;
  slots: RaceLottoSlot[];
  winning_picks?: Record<string, string> | null;
  winner_count?: number;
  jackpot_paid_points?: number;
  settled_at?: string | null;
}

export interface RaceLottoTicket {
  id: string;
  round_id: string;
  stake_points: number;
  picks: Record<string, string>;
  matched_count: number;
  payout_points: number;
  status: "placed" | "won" | "lost" | "refunded" | string;
  settled_at?: string | null;
  created_at: string;
  round_draw_key?: string | null;
  round_draw_name?: string | null;
  round_draw_starts_at?: string | null;
  round_status?: string | null;
  round_slots?: RaceLottoSlot[] | null;
  round_winning_picks?: Record<string, string> | null;
  round_winner_count?: number | null;
}

export interface RaceLottoDashboard {
  rounds: RaceLottoRound[];
  tickets: RaceLottoTicket[];
  pointsBalance: number | null;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function normalizeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return new Error(message);
    }
  }
  return new Error(fallback);
}

export async function getRaceLottoDashboard() {
  const { data, error } = await supabase.rpc("get_race_lotto_dashboard", {
    requested_session_token: getLoginSessionToken()
  });

  if (error) throw toError(error, "Race-Lotto could not be loaded.");
  const row = firstRow<any>(data);
  return {
    rounds: normalizeArray<RaceLottoRound>(row?.rounds),
    tickets: normalizeArray<RaceLottoTicket>(row?.tickets),
    pointsBalance: Number.isFinite(Number(row?.account_points_balance)) ? Number(row.account_points_balance) : null
  } satisfies RaceLottoDashboard;
}

export async function createRaceLottoTicket(roundId: string, picks: Record<string, string>) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before entering Race-Lotto.");

  const { data, error } = await supabase.rpc("create_race_lotto_ticket_with_login_session", {
    requested_session_token: sessionToken,
    requested_round_id: roundId,
    requested_picks: picks
  });

  if (error) throw toError(error, "Race-Lotto ticket could not be saved.");
  return firstRow<{
    ticket_id: string;
    points_balance: number;
    entry_pool_points: number;
    current_jackpot_points: number;
  }>(data);
}

export async function settleRaceLottoRound(roundId: string) {
  const { data, error } = await supabase.rpc("settle_race_lotto_round", {
    requested_round_id: roundId
  });

  if (error) throw toError(error, "Race-Lotto results are not ready.");
  return firstRow<{
    round_id: string;
    status: string;
    winner_count: number;
    jackpot_points: number;
    payout_per_winner: number;
    carried_points_after: number;
  }>(data);
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gardmxgsrasrzdcfbihv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gz4Tbz5IrvoFV5XgPY9LQQ_VfDjxZBI";
const LOGIN_SESSION_STORAGE_KEY = "binance-ring-rally-login-session-v1";

export interface LoginSession {
  sessionToken: string;
  accountId: string;
  loginId: string;
  pointsBalance: number;
  expiresAt?: string;
}

export interface BetRow {
  bet_id: string;
  market_id: string;
  target_race_started_at: string | null;
  stake_points: number;
  first_pick: string | null;
  second_pick: string | null;
  third_pick: string | null;
  status: "placed" | "won" | "lost" | string;
  payout_points: number;
  matched_places: number;
  settled_at: string | null;
  created_at: string | null;
  race_finished_at: string | null;
  first_place: string | null;
  second_place: string | null;
  third_place: string | null;
  fourth_place: string | null;
}

export interface RankingRow {
  rank_number: number;
  login_id: string;
  points_balance: number;
}

export interface DailyCheckinRow {
  login_id?: string;
  checkin_date_kst?: string;
  already_claimed?: boolean;
  points_awarded?: number;
  current_points_balance?: number;
  next_reset_at?: string;
  claimed?: boolean;
}

export interface RatioSnapshotRow {
  market_id: string;
  target_race_started_at: string;
  ratio_snapshot: Record<string, Record<string, number>>;
  sample_count: number;
}

export interface ChatMessageRow {
  id: string;
  market_id: string;
  author_login_id: string;
  message: string;
  created_at: string;
}

export interface RaceResultRow {
  id: string;
  market_id: string;
  race_started_at: string;
  race_finished_at: string | null;
  first_place: string;
  second_place: string;
  third_place: string;
  fourth_place: string;
  created_at: string;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function getLoginSessionToken() {
  return localStorage.getItem(LOGIN_SESSION_STORAGE_KEY);
}

export function setLoginSessionToken(sessionToken: string | null | undefined) {
  if (!sessionToken) {
    localStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOGIN_SESSION_STORAGE_KEY, sessionToken);
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function mapLoginSession(row: any): LoginSession | null {
  if (!row?.account_id || !row?.session_token && !getLoginSessionToken()) {
    return null;
  }

  return {
    sessionToken: row.session_token ?? getLoginSessionToken() ?? "",
    accountId: row.account_id,
    loginId: row.login_id,
    pointsBalance: Number(row.points_balance ?? 0),
    expiresAt: row.expires_at
  };
}

export async function getLoginSession() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return { session: null as LoginSession | null, error: null };
  }

  const { data, error } = await supabase.rpc("get_login_session", {
    requested_session_token: sessionToken
  });

  const row = firstRow<any>(data);
  if (error || !row?.account_id) {
    setLoginSessionToken(null);
    return { session: null as LoginSession | null, error };
  }

  return {
    session: mapLoginSession({ ...row, session_token: sessionToken }),
    error: null
  };
}

export async function signInWithLoginId(loginId: string, password: string) {
  const { data, error } = await supabase.rpc("sign_in_with_login_id", {
    requested_login_id: normalizeLoginId(loginId),
    requested_password: password
  });

  if (error) throw error;
  const row = firstRow<any>(data);
  setLoginSessionToken(row?.session_token ?? null);
  return mapLoginSession(row);
}

export async function signUpWithLoginId(loginId: string, password: string) {
  const { data, error } = await supabase.rpc("sign_up_with_login_id", {
    requested_login_id: normalizeLoginId(loginId),
    requested_password: password
  });

  if (error) throw error;
  const row = firstRow<any>(data);
  setLoginSessionToken(row?.session_token ?? null);
  return mapLoginSession(row);
}

export async function signOutLoginSession() {
  const sessionToken = getLoginSessionToken();
  if (sessionToken) {
    await supabase.rpc("sign_out_login_session", {
      requested_session_token: sessionToken
    });
  }
  setLoginSessionToken(null);
}

export async function listBetsWithSession() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) return [] as BetRow[];

  const { data, error } = await supabase.rpc("list_bets_with_login_session", {
    requested_session_token: sessionToken
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as BetRow[];
}

export async function listCurrentRaceBets(marketId: string, targetRaceStartedAt: string) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) return [] as BetRow[];

  const { data, error } = await supabase.rpc("list_current_race_bets_with_login_session", {
    requested_session_token: sessionToken,
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as BetRow[];
}

export async function createBetRecord(params: {
  marketId: string;
  targetRaceStartedAt: string;
  stake: number;
  placements: { first?: string | null; second?: string | null; third?: string | null };
  ratios: Record<string, Record<string, number>>;
}) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required before placing a bet.");

  const { data, error } = await supabase.rpc("create_bet_with_login_session", {
    requested_session_token: sessionToken,
    requested_stake_points: params.stake,
    requested_first_pick: params.placements.first ?? null,
    requested_second_pick: params.placements.second ?? null,
    requested_third_pick: params.placements.third ?? null,
    requested_ratio_snapshot: params.ratios,
    requested_market_id: params.marketId,
    requested_target_race_started_at: params.targetRaceStartedAt
  });
  if (error) throw error;
  return firstRow<any>(data);
}

export async function getPublicRankings() {
  const { data, error } = await supabase.rpc("get_public_rankings");
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as RankingRow[];
}

export async function getDailyCheckinStatus() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) return null;

  const { data, error } = await supabase.rpc("get_daily_checkin_status", {
    requested_session_token: sessionToken
  });
  if (error) throw error;
  return firstRow<DailyCheckinRow>(data);
}

export async function claimDailyCheckin() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required.");

  const { data, error } = await supabase.rpc("claim_daily_checkin", {
    requested_session_token: sessionToken
  });
  if (error) throw error;
  return firstRow<DailyCheckinRow>(data);
}

const MIN_ODDS = 1.01;
const MAX_ODDS = 99;

export async function getOrCreateMarketRatioSnapshot(
  marketId: string,
  targetRaceStartedAt: string,
  marketSymbols: string[] = []
) {
  const savedSnapshot = await fetchMarketRatioSnapshot(marketId, targetRaceStartedAt);
  if (savedSnapshot) {
    return savedSnapshot;
  }

  const { data, error } = await supabase.rpc("get_or_create_market_ratio_snapshot", {
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt,
    requested_history_limit: 100
  });
  if (!error) {
    return firstRow<RatioSnapshotRow>(data);
  }

  return buildAndSaveMarketRatioSnapshot(marketId, targetRaceStartedAt, marketSymbols);
}

async function fetchMarketRatioSnapshot(marketId: string, targetRaceStartedAt: string) {
  const { data, error } = await supabase
    .from("market_ratio_snapshots")
    .select("market_id, target_race_started_at, ratio_snapshot, sample_count, source_label, updated_at")
    .eq("market_id", marketId)
    .eq("target_race_started_at", targetRaceStartedAt)
    .maybeSingle();

  if (error) return null;
  return data as RatioSnapshotRow | null;
}

async function buildAndSaveMarketRatioSnapshot(
  marketId: string,
  targetRaceStartedAt: string,
  marketSymbols: string[]
) {
  const { data, error } = await supabase
    .from("market_results_v2")
    .select("first_place, second_place, third_place, fourth_place, race_started_at")
    .eq("market_id", marketId)
    .order("race_started_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  const results = data ?? [];
  const ratioSnapshot = buildOddsFromRecentResults(results, marketSymbols);

  const { data: savedData, error: saveError } = await supabase.rpc("upsert_market_ratio_snapshot", {
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt,
    requested_ratio_snapshot: ratioSnapshot,
    requested_sample_count: results.length,
    requested_source_label: "frontend-8002"
  });

  if (!saveError) {
    const savedRow = firstRow<RatioSnapshotRow>(savedData);
    if (savedRow) return savedRow;
  }

  return {
    market_id: marketId,
    target_race_started_at: targetRaceStartedAt,
    ratio_snapshot: ratioSnapshot,
    sample_count: results.length
  } as RatioSnapshotRow;
}

function buildOddsFromRecentResults(
  results: Array<Record<string, string | null>>,
  marketSymbols: string[]
) {
  const ratioPlaces = {
    first: "first_place",
    second: "second_place",
    third: "third_place",
    fourth: "fourth_place"
  };
  const symbols = marketSymbols.length ? marketSymbols : inferMarketSymbols(results);
  const sampleCount = Math.max(1, results.length);

  return Object.fromEntries(
    Object.entries(ratioPlaces).map(([place, field]) => {
      const counts = new Map(symbols.map((symbol) => [symbol, 0]));
      for (const result of results) {
        const symbol = result[field];
        if (symbol && counts.has(symbol)) {
          counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
        }
      }

      return [
        place,
        Object.fromEntries(
          symbols.map((symbol) => {
            const count = counts.get(symbol) ?? 0;
            const odds = count > 0 ? sampleCount / count : MAX_ODDS;
            return [symbol, Number(clamp(odds, MIN_ODDS, MAX_ODDS).toFixed(2))];
          })
        )
      ];
    })
  ) as Record<string, Record<string, number>>;
}

function inferMarketSymbols(results: Array<Record<string, string | null>>) {
  return Array.from(
    new Set(
      results.flatMap((result) => [
        result.first_place,
        result.second_place,
        result.third_place,
        result.fourth_place
      ]).filter(Boolean) as string[]
    )
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function listChatMessages(marketId: string) {
  const { data, error } = await supabase
    .from("market_chat_messages")
    .select("id, market_id, author_login_id, message, created_at")
    .eq("market_id", marketId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ([...(data ?? [])].reverse()) as ChatMessageRow[];
}

export async function listRaceResults(marketId: string, limit = 10) {
  const { data, error } = await supabase
    .from("market_results_v2")
    .select("id, market_id, race_started_at, race_finished_at, first_place, second_place, third_place, fourth_place, created_at")
    .eq("market_id", marketId)
    .order("race_started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RaceResultRow[];
}

export async function createChatMessage(marketId: string, message: string) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required to chat.");

  const { data, error } = await supabase.rpc("create_market_chat_message", {
    requested_session_token: sessionToken,
    requested_market_id: marketId,
    requested_message: message
  });
  if (error) throw error;
  return firstRow<ChatMessageRow>(data);
}

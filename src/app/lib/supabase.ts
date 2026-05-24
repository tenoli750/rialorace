import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xafeoxmfhlbovzohjaam.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9HD-9e45AJgx5EIJXpiKsg__M75Ebad";
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
  bet_type?: "podium" | "finish_time" | string;
  first_pick: string | null;
  second_pick: string | null;
  third_pick: string | null;
  finish_threshold_seconds?: number | null;
  finish_time_pick?: "under" | "over" | string | null;
  finish_time_symbol?: string | null;
  status: "placed" | "won" | "lost" | string;
  payout_points: number;
  matched_places: number;
  settled_at: string | null;
  created_at: string | null;
  race_finished_at: string | null;
  finish_duration_seconds?: number | null;
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

export interface RialoStakingRow {
  login_id?: string;
  available_rialo: number;
  staked_rialo: number;
  earning_rate_points_per_rialo_per_day?: number;
  projected_daily_points?: number;
  pending_points?: number;
  last_claimed_at?: string;
  points_awarded?: number;
  total_points_earned?: number;
  current_points_balance?: number;
}

export interface RatioSnapshotRow {
  market_id: string;
  target_race_started_at: string;
  ratio_snapshot: Record<string, any>;
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
  betType?: "podium" | "finish_time";
  placements: { first?: string | null; second?: string | null; third?: string | null };
  finishTime?: { thresholdSeconds: number; pick: "under" | "over"; symbol?: string | null } | null;
  ratios: Record<string, any>;
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
    requested_target_race_started_at: params.targetRaceStartedAt,
    requested_bet_type: params.betType ?? "podium",
    requested_finish_threshold_seconds: params.finishTime?.thresholdSeconds ?? null,
    requested_finish_time_pick: params.finishTime?.pick ?? null,
    requested_finish_time_symbol: params.finishTime?.symbol ?? null
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

export async function getRialoStakingStatus() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) return null;

  const { data, error } = await supabase.rpc("get_rialo_staking_status", {
    requested_session_token: sessionToken
  });
  if (error) throw error;
  return firstRow<RialoStakingRow>(data);
}

export async function stakeRialo(amount: number) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required.");

  const { data, error } = await supabase.rpc("stake_rialo_with_login_session", {
    requested_session_token: sessionToken,
    requested_amount_rialo: amount
  });
  if (error) throw error;
  return firstRow<RialoStakingRow>(data);
}

export async function unstakeRialo(amount: number) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required.");

  const { data, error } = await supabase.rpc("unstake_rialo_with_login_session", {
    requested_session_token: sessionToken,
    requested_amount_rialo: amount
  });
  if (error) throw error;
  return firstRow<RialoStakingRow>(data);
}

export async function claimRialoStakingPoints() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) throw new Error("Login required.");

  const { data, error } = await supabase.rpc("claim_rialo_staking_points", {
    requested_session_token: sessionToken
  });
  if (error) throw error;
  return firstRow<RialoStakingRow>(data);
}

const MIN_ODDS = 1.01;
const MAX_ODDS = 10;
const FINISH_TIME_THRESHOLD_SECONDS = 58;

export async function getOrCreateMarketRatioSnapshot(
  marketId: string,
  targetRaceStartedAt: string,
  marketSymbols: string[] = []
) {
  const savedSnapshot = await fetchMarketRatioSnapshot(marketId, targetRaceStartedAt);
  if (savedSnapshot && hasFinishTimeRatios(savedSnapshot.ratio_snapshot, marketSymbols)) {
    return savedSnapshot;
  }

  const { data, error } = await supabase.rpc("get_or_create_market_ratio_snapshot", {
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt,
    requested_history_limit: 100
  });
  if (!error) {
    const rpcSnapshot = firstRow<RatioSnapshotRow>(data);
    if (rpcSnapshot && hasFinishTimeRatios(rpcSnapshot.ratio_snapshot, marketSymbols)) {
      return rpcSnapshot;
    }
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
    .select("first_place, second_place, third_place, fourth_place, race_started_at, race_finished_at, compared_finish_elapsed_ms")
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
  results: Array<Record<string, any>>,
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
  const smoothedSampleCount = sampleCount + Math.max(1, symbols.length);

  const placeOdds = Object.fromEntries(
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
            const odds = smoothedSampleCount / (count + 1);
            return [symbol, Number(clamp(odds, MIN_ODDS, MAX_ODDS).toFixed(2))];
          })
        )
      ];
    })
  ) as Record<string, Record<string, number>>;

  return {
    ...placeOdds,
    finishTime: buildFinishTimeOdds(results, symbols)
  };
}

function buildFinishTimeOdds(results: Array<Record<string, any>>, marketSymbols: string[]) {
  const thresholdKey = String(FINISH_TIME_THRESHOLD_SECONDS).replace(".", "_");
  const finishTimeOdds: Record<string, any> = {
    thresholdSeconds: FINISH_TIME_THRESHOLD_SECONDS
  };

  for (const symbol of marketSymbols) {
    const durations = results
      .map((result) => getTokenFinishDurationSeconds(result.compared_finish_elapsed_ms, symbol))
      .filter((duration): duration is number => Number.isFinite(duration));
    const sampleCount = Math.max(1, durations.length);
    const underCount = durations.filter((duration) => duration <= FINISH_TIME_THRESHOLD_SECONDS).length;
    const overCount = durations.length - underCount;
    const smoothedSampleCount = sampleCount + 2;
    const underOdds = Number(clamp(smoothedSampleCount / (underCount + 1), MIN_ODDS, MAX_ODDS).toFixed(2));
    const overOdds = Number(clamp(smoothedSampleCount / (overCount + 1), MIN_ODDS, MAX_ODDS).toFixed(2));

    finishTimeOdds[symbol] = {
      under: underOdds,
      over: overOdds,
      [`under${thresholdKey}`]: underOdds,
      [`over${thresholdKey}`]: overOdds,
      sampleCount: durations.length,
      underCount,
      overCount
    };
  }

  return finishTimeOdds;
}

function getTokenFinishDurationSeconds(comparedFinishElapsedMs: any, symbol: string) {
  const elapsedMs = Number(comparedFinishElapsedMs?.[symbol]);
  return elapsedMs > 0 ? elapsedMs / 1000 : Number.NaN;
}

function hasFinishTimeRatios(ratioSnapshot: Record<string, any> | null | undefined, marketSymbols: string[] = []) {
  const finishTime = ratioSnapshot?.finishTime;
  if (!finishTime) return false;
  if (!marketSymbols.length) {
    return Object.values(finishTime).some((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      Number.isFinite(Number((entry as Record<string, unknown>).under)) &&
      Number.isFinite(Number((entry as Record<string, unknown>).over))
    );
  }

  return marketSymbols.every((symbol) =>
    Number.isFinite(Number(finishTime[symbol]?.under)) &&
    Number.isFinite(Number(finishTime[symbol]?.over))
  );
}

function inferMarketSymbols(results: Array<Record<string, any>>) {
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

import { getLoginSessionToken, supabase } from "./supabaseClient.js";

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function fetchRaceLottoDashboard() {
  const { data, error } = await supabase.rpc("get_race_lotto_dashboard", {
    requested_session_token: getLoginSessionToken()
  });

  if (error) {
    return {
      ok: false,
      rounds: [],
      tickets: [],
      pointsBalance: null,
      message: error.message || "Race-Lotto could not be loaded."
    };
  }

  const row = firstRow(data);
  return {
    ok: true,
    rounds: normalizeArray(row?.rounds),
    tickets: normalizeArray(row?.tickets),
    pointsBalance: Number.isFinite(Number(row?.account_points_balance)) ? Number(row.account_points_balance) : null,
    message: "Race-Lotto loaded."
  };
}

export async function createRaceLottoTicket(roundId, picks) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return { ok: false, message: "Login required before entering Race-Lotto." };
  }

  const { data, error } = await supabase.rpc("create_race_lotto_ticket_with_login_session", {
    requested_session_token: sessionToken,
    requested_round_id: roundId,
    requested_picks: picks
  });

  if (error) {
    return { ok: false, message: error.message || "Race-Lotto ticket could not be saved." };
  }

  const row = firstRow(data);
  return {
    ok: true,
    ticketId: row?.ticket_id,
    pointsBalance: Number(row?.points_balance ?? 0),
    entryPoolPoints: Number(row?.entry_pool_points ?? 0),
    currentJackpotPoints: Number(row?.current_jackpot_points ?? 0),
    message: "Race-Lotto ticket saved."
  };
}

export async function settleRaceLottoRound(roundId) {
  const { data, error } = await supabase.rpc("settle_race_lotto_round", {
    requested_round_id: roundId
  });

  if (error) {
    return { ok: false, message: error.message || "Race-Lotto results are not ready." };
  }

  const row = firstRow(data);
  return {
    ok: true,
    roundId: row?.round_id,
    status: row?.status,
    winnerCount: Number(row?.winner_count ?? 0),
    jackpotPoints: Number(row?.jackpot_points ?? 0),
    payoutPerWinner: Number(row?.payout_per_winner ?? 0),
    carriedPointsAfter: Number(row?.carried_points_after ?? 0),
    message: "Race-Lotto results checked."
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
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

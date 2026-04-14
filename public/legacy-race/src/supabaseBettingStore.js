import { getLoginSession, getLoginSessionToken, supabase } from "./supabaseClient.js";

export async function initializeBettingProfile(defaultPointsBalance) {
  const { session, error } = await getLoginSession();
  if (error || !session) {
    return {
      ok: false,
      fallbackBalance: defaultPointsBalance,
      message: "Login required. Using local wallet only."
    };
  }

  return {
    ok: true,
    userId: session.accountId,
    balance: Number(session.pointsBalance ?? defaultPointsBalance),
    message: "Wallet loaded from account."
  };
}

export async function createBetRecord({ stake, placements, ratios, marketId = null, targetRaceStartedAt = null }) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return {
      ok: false,
      message: "Login required before placing a bet."
    };
  }

  const { data, error: insertError } = await supabase.rpc("create_bet_with_login_session", {
    requested_session_token: sessionToken,
    requested_stake_points: stake,
    requested_first_pick: placements.first,
    requested_second_pick: placements.second,
    requested_third_pick: placements.third,
    requested_ratio_snapshot: ratios,
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt
  });

  if (insertError) {
    return {
      ok: false,
      message: insertError.message || "Bet save failed."
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    betId: row?.bet_id,
    balance: Number(row?.points_balance),
    message: "Bet saved to Supabase."
  };
}

export async function fetchCurrentRaceBets({ marketId, targetRaceStartedAt }) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken || !marketId || !targetRaceStartedAt) {
    return {
      ok: true,
      bets: [],
      message: "No bets"
    };
  }

  const { data, error } = await supabase.rpc("list_current_race_bets_with_login_session", {
    requested_session_token: sessionToken,
    requested_market_id: marketId,
    requested_target_race_started_at: targetRaceStartedAt
  });

  if (error) {
    return {
      ok: false,
      bets: [],
      message: error.message || "Current race bets could not be loaded."
    };
  }

  return {
    ok: true,
    bets: Array.isArray(data) ? data : [],
    message: "Current race bets loaded."
  };
}

export async function fetchPastRaceBets({ marketId }) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken || !marketId) {
    return {
      ok: true,
      bets: [],
      message: "No bets"
    };
  }

  const { data, error } = await supabase.rpc("list_bets_with_login_session", {
    requested_session_token: sessionToken
  });

  if (error) {
    return {
      ok: false,
      bets: [],
      message: error.message || "Past race bets could not be loaded."
    };
  }

  const bets = (Array.isArray(data) ? data : []).filter((bet) => bet.market_id === marketId);

  return {
    ok: true,
    bets,
    message: "Past race bets loaded."
  };
}

export async function recordRaceResult({
  marketId,
  raceStartedAtWallMs,
  raceFinishedAtWallMs,
  finishOrder
}) {
  const { user, error } = await ensureSupabaseUser();
  if (error || !user) {
    return {
      ok: false,
      message: "Supabase session missing. Race result was kept only in page state."
    };
  }

  const [first, second, third, fourth] = finishOrder;
  if (!marketId || !raceStartedAtWallMs || !first || !second || !third || !fourth) {
    return {
      ok: false,
      message: "Race result payload was incomplete."
    };
  }

  const payload = {
    market_id: marketId,
    race_started_at: new Date(raceStartedAtWallMs).toISOString(),
    race_finished_at: raceFinishedAtWallMs ? new Date(raceFinishedAtWallMs).toISOString() : null,
    first_place: first,
    second_place: second,
    third_place: third,
    fourth_place: fourth,
    result_snapshot: {
      finishOrder,
      recordedBy: user.id
    }
  };

  const { data, error: upsertError } = await supabase
    .from("race_results")
    .upsert(payload, { onConflict: "market_id,race_started_at" })
    .select("id")
    .single();

  if (upsertError) {
    return {
      ok: false,
      message: "Supabase race result insert failed."
    };
  }

  return {
    ok: true,
    resultId: data.id,
    message: "Race result saved to Supabase."
  };
}

export async function resolveOfficialRaceResult({ marketId, raceStartedAtWallMs, intervalMs }) {
  const { data, error: rpcError } = await supabase.rpc("resolve_race_result", {
    requested_market_id: marketId,
    requested_race_started_at: new Date(raceStartedAtWallMs).toISOString(),
    requested_interval_ms: intervalMs
  });

  if (rpcError) {
    return {
      ok: false,
      message: "Supabase official race resolution failed."
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.first_place || !row?.second_place || !row?.third_place || !row?.fourth_place) {
    return {
      ok: false,
      message: "Supabase official race result was incomplete."
    };
  }

  return {
    ok: true,
    result: row,
    message: "Official podium resolved by Supabase."
  };
}

export async function fetchRaceResults(marketId, limit = 8) {
  const { data, error } = await supabase
    .from("race_results")
    .select(
      "id, market_id, race_started_at, race_finished_at, first_place, second_place, third_place, fourth_place, created_at"
    )
    .eq("market_id", marketId)
    .order("race_started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      results: [],
      message: "Race history could not be loaded from Supabase."
    };
  }

  return {
    ok: true,
    results: data ?? [],
    message: "Race history loaded."
  };
}

export async function recordRealtimeTestResult({
  marketId,
  raceStartedAtWallMs,
  raceFinishedAtWallMs,
  finishOrder,
  sourceLabel = "market03-live-editor",
  resultSnapshot = {}
}) {
  const [first, second, third, fourth] = finishOrder ?? [];
  if (!marketId || !raceStartedAtWallMs || !first || !second || !third || !fourth) {
    return {
      ok: false,
      message: "Realtime test result payload was incomplete."
    };
  }

  const { data, error } = await supabase
    .from("race_results_realtime_test")
    .upsert(
      {
        market_id: marketId,
        race_started_at: new Date(raceStartedAtWallMs).toISOString(),
        race_finished_at: raceFinishedAtWallMs ? new Date(raceFinishedAtWallMs).toISOString() : null,
        source_label: sourceLabel,
        first_place: first,
        second_place: second,
        third_place: third,
        fourth_place: fourth,
        result_snapshot: resultSnapshot
      },
      { onConflict: "market_id,race_started_at,source_label" }
    )
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      message: "Realtime comparison result insert failed."
    };
  }

  return {
    ok: true,
    resultId: data.id,
    message: "Realtime comparison result saved."
  };
}

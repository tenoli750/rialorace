import {
  getLoginSessionByToken,
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";

const HISTORY_LIMIT = 5000;

function sum(rows, field) {
  return (rows || []).reduce((total, row) => total + Number(row?.[field] ?? 0), 0);
}

function countBy(rows, field) {
  return (rows || []).reduce((counts, row) => {
    const key = String(row?.[field] || "unknown").toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function safeQuery(query) {
  const { data, error } = await query;
  if (error) return { data: [], error: error.message || "Query failed." };
  return { data: data || [], error: "" };
}

async function loadDailyRewardTotal(supabase, accountId) {
  const candidates = [
    "daily_checkins",
    "daily_checkin_claims",
    "daily_rewards",
    "daily_reward_claims"
  ];

  for (const tableName of candidates) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("account_id", accountId)
      .limit(HISTORY_LIMIT);

    if (error) continue;
    const points = (data || []).reduce((total, row) => {
      return total + Number(row.points_awarded ?? row.points ?? row.reward_points ?? 0);
    }, 0);
    return {
      tableName,
      points,
      count: (data || []).length
    };
  }

  return {
    tableName: null,
    points: 0,
    count: 0
  };
}

function buildDiagnosis(summary) {
  const messages = [];
  const inferred = summary.inferredOpeningOrAdjustment;
  const withoutBets = summary.rechargePoints + summary.rewardPoints + summary.dailyRewardPoints + summary.lottoNet;
  const currentMinusKnownWithoutBets = summary.currentBalance - withoutBets;

  if (Math.abs(currentMinusKnownWithoutBets - 10000) <= 1 && summary.betNet !== 0) {
    messages.push("Current balance matches a 10,000 opening/adjustment plus recharge and rewards, without applying bet PnL.");
  }

  if (Math.abs(inferred - 10000) <= 1) {
    messages.push("After all known activity, the remaining opening/adjustment is 10,000 pts.");
  } else if (inferred !== 0) {
    messages.push(`Known activity does not fully explain the balance. Remaining opening/adjustment is ${inferred.toLocaleString()} pts.`);
  }

  if (summary.unappliedWonPayout > 0) {
    messages.push(`${summary.unappliedWonPayout.toLocaleString()} pts of won bet payout is not marked as applied yet.`);
  }

  return messages.length ? messages : ["Known activity matches the current balance."];
}

export async function buildPointReconciliation(sessionToken) {
  const loginSession = await getLoginSessionByToken(sessionToken);
  const accountId = loginSession.account_id;
  const supabase = getSupabaseAdmin();

  const [
    accountResult,
    stripeResult,
    baseUsdcResult,
    stakingResult,
    betsResult,
    lottoResult,
    dailyResult
  ] = await Promise.all([
    supabase
      .from("login_accounts")
      .select("points_balance")
      .eq("id", accountId)
      .maybeSingle(),
    safeQuery(
      supabase
        .from("point_purchases")
        .select("points_awarded, status")
        .eq("account_id", accountId)
        .limit(HISTORY_LIMIT)
    ),
    safeQuery(
      supabase
        .from("base_usdc_point_orders")
        .select("points_awarded, status")
        .eq("account_id", accountId)
        .limit(HISTORY_LIMIT)
    ),
    safeQuery(
      supabase
        .from("rialo_staking_events")
        .select("event_type, points_awarded")
        .eq("account_id", accountId)
        .limit(HISTORY_LIMIT)
    ),
    safeQuery(
      supabase
        .from("bets")
        .select("stake_points, payout_points, status, balance_delta_applied_at")
        .or(`account_id.eq.${accountId},user_id.eq.${accountId}`)
        .limit(HISTORY_LIMIT)
    ),
    safeQuery(
      supabase
        .from("race_lotto_tickets")
        .select("stake_points, payout_points, status")
        .eq("account_id", accountId)
        .limit(HISTORY_LIMIT)
    ),
    loadDailyRewardTotal(supabase, accountId)
  ]);

  if (accountResult.error) throw accountResult.error;

  const stripePaidRows = stripeResult.data.filter((row) => String(row.status || "").toLowerCase() === "paid");
  const basePaidRows = baseUsdcResult.data.filter((row) => String(row.status || "").toLowerCase() === "paid");
  const stakingClaimRows = stakingResult.data.filter((row) => String(row.event_type || "").toLowerCase() === "claim");
  const rechargePoints = sum(stripePaidRows, "points_awarded") + sum(basePaidRows, "points_awarded");
  const rewardPoints = sum(stakingClaimRows, "points_awarded");
  const betStake = sum(betsResult.data, "stake_points");
  const betPayout = sum(betsResult.data, "payout_points");
  const betNet = betPayout - betStake;
  const lottoStake = sum(lottoResult.data, "stake_points");
  const lottoPayout = sum(lottoResult.data, "payout_points");
  const lottoNet = lottoPayout - lottoStake;
  const dailyRewardPoints = Number(dailyResult.points ?? 0);
  const currentBalance = Number(accountResult.data?.points_balance ?? loginSession.points_balance ?? 0);
  const knownActivityNet = rechargePoints + rewardPoints + dailyRewardPoints + betNet + lottoNet;
  const inferredOpeningOrAdjustment = currentBalance - knownActivityNet;
  const unappliedWonPayout = betsResult.data
    .filter((row) => String(row.status || "").toLowerCase() === "won" && !row.balance_delta_applied_at)
    .reduce((total, row) => total + Number(row.payout_points ?? 0), 0);

  const summary = {
    currentBalance,
    rechargePoints,
    rewardPoints,
    dailyRewardPoints,
    betStake,
    betPayout,
    betNet,
    lottoStake,
    lottoPayout,
    lottoNet,
    knownActivityNet,
    inferredOpeningOrAdjustment,
    unappliedWonPayout
  };

  return {
    accountId,
    audit: {
      summary,
      counts: {
        charges: {
          stripe: countBy(stripeResult.data, "status"),
          baseUsdc: countBy(baseUsdcResult.data, "status")
        },
        staking: countBy(stakingResult.data, "event_type"),
        bets: countBy(betsResult.data, "status"),
        lotto: countBy(lottoResult.data, "status"),
        daily: {
          tableName: dailyResult.tableName,
          count: dailyResult.count
        }
      },
      errors: {
        stripe: stripeResult.error,
        baseUsdc: baseUsdcResult.error,
        staking: stakingResult.error,
        bets: betsResult.error,
        lotto: lottoResult.error
      },
      diagnosis: buildDiagnosis(summary)
    }
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = await readJsonBody(req);
    const sessionToken = String(body.sessionToken || "");
    if (!sessionToken) {
      return res.status(401).json({ error: "Login required." });
    }

    const result = await buildPointReconciliation(sessionToken);
    return res.status(200).json(result.audit);
  } catch (error) {
    console.error("Point reconciliation failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not reconcile points."
    });
  }
}

import {
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";

function cleanPick(value) {
  const pick = String(value || "").trim().toUpperCase();
  return pick || null;
}

function normalizeFinishTime(value) {
  if (!value || typeof value !== "object") return null;

  const thresholdSeconds = Number(value.thresholdSeconds);
  const pick = String(value.pick || "").trim().toLowerCase();
  const symbol = cleanPick(value.symbol);

  return {
    thresholdSeconds: Number.isFinite(thresholdSeconds) ? Math.trunc(thresholdSeconds) : null,
    pick,
    symbol
  };
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Bet save failed.";
}

async function getAccountForSession(supabase, sessionToken) {
  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await supabase
    .from("login_sessions")
    .select("account_id, expires_at, signed_out_at")
    .eq("session_token", sessionToken)
    .is("signed_out_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session?.account_id) {
    throw new Error("Login required.");
  }

  const { data: account, error: accountError } = await supabase
    .from("login_accounts")
    .select("id, points_balance")
    .eq("id", session.account_id)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account?.id) {
    throw new Error("Login required.");
  }

  return account;
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
    const marketId = String(body.marketId || "").trim();
    const targetRaceStartedAt = String(body.targetRaceStartedAt || "").trim();
    const stake = Math.trunc(Number(body.stake));
    const betType = String(body.betType || "podium").trim() || "podium";
    const placements = body.placements && typeof body.placements === "object" ? body.placements : {};
    const finishTime = normalizeFinishTime(body.finishTime);

    if (!sessionToken) {
      return res.status(401).json({ error: "Login required before placing a bet." });
    }
    if (!marketId) {
      return res.status(400).json({ error: "Market is required." });
    }
    if (!targetRaceStartedAt) {
      return res.status(400).json({ error: "Race start time is required." });
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      return res.status(400).json({ error: "Stake must be greater than zero." });
    }
    if (!["podium", "finish_time"].includes(betType)) {
      return res.status(400).json({ error: "Unknown bet type." });
    }

    console.log(`[create-bet-record] ${marketId} ${betType} stake=${stake}`);

    const firstPick = cleanPick(placements.first);
    const secondPick = cleanPick(placements.second);
    const thirdPick = cleanPick(placements.third);

    if (betType === "podium" && !firstPick && !secondPick && !thirdPick) {
      return res.status(400).json({ error: "At least one pick is required." });
    }
    if (betType === "finish_time") {
      if (!finishTime?.thresholdSeconds || finishTime.thresholdSeconds <= 0) {
        return res.status(400).json({ error: "Finish time threshold is required." });
      }
      if (!["under", "over"].includes(finishTime.pick)) {
        return res.status(400).json({ error: "Finish time pick is required." });
      }
      if (!finishTime.symbol) {
        return res.status(400).json({ error: "Finish time symbol is required." });
      }
    }

    const supabase = getSupabaseAdmin();
    const account = await getAccountForSession(supabase, sessionToken);
    const currentBalance = Number(account.points_balance ?? 0);
    if (!Number.isFinite(currentBalance) || currentBalance < stake) {
      return res.status(400).json({ error: "Insufficient points." });
    }

    const nextBalance = currentBalance - stake;
    const { data: updatedAccount, error: updateError } = await supabase
      .from("login_accounts")
      .update({
        points_balance: nextBalance,
        updated_at: new Date().toISOString()
      })
      .eq("id", account.id)
      .eq("points_balance", currentBalance)
      .select("points_balance")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedAccount) {
      return res.status(409).json({ error: "Points balance changed. Try again." });
    }

    const { data: bet, error: insertError } = await supabase
      .from("bets")
      .insert({
        account_id: account.id,
        market_id: marketId,
        target_race_started_at: targetRaceStartedAt,
        stake_points: stake,
        first_pick: betType === "podium" ? firstPick : null,
        second_pick: betType === "podium" ? secondPick : null,
        third_pick: betType === "podium" ? thirdPick : null,
        ratio_snapshot: body.ratios && typeof body.ratios === "object" ? body.ratios : {},
        bet_type: betType,
        finish_threshold_seconds: betType === "finish_time" ? finishTime.thresholdSeconds : null,
        finish_time_pick: betType === "finish_time" ? finishTime.pick : null,
        finish_time_symbol: betType === "finish_time" ? finishTime.symbol : null
      })
      .select("id")
      .single();

    if (insertError) {
      await supabase
        .from("login_accounts")
        .update({
          points_balance: currentBalance,
          updated_at: new Date().toISOString()
        })
        .eq("id", account.id)
        .eq("points_balance", nextBalance);
      throw insertError;
    }

    return res.status(200).json({
      bet_id: bet.id,
      points_balance: Number(updatedAccount.points_balance)
    });
  } catch (error) {
    console.error("Create bet record failed", error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}

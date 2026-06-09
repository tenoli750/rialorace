import {
  getLoginSessionByToken,
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";

const HISTORY_LIMIT = 1000;

function mapStakingEvent(row) {
  return {
    id: row.id,
    type: "rialo_staking",
    label: "Staking Rewards",
    points: Number(row.points_awarded ?? 0),
    amountRialo: Number(row.amount_rialo ?? 0),
    status: "claimed",
    reference: row.id,
    createdAt: row.created_at
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

    const loginSession = await getLoginSessionByToken(sessionToken);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("rialo_staking_events")
      .select("id, event_type, amount_rialo, points_awarded, created_at")
      .eq("account_id", loginSession.account_id)
      .eq("event_type", "claim")
      .gt("points_awarded", 0)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;

    return res.status(200).json({
      rewards: (data || []).map(mapStakingEvent)
    });
  } catch (error) {
    console.error("List reward history failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not load reward history."
    });
  }
}

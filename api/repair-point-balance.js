import {
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";
import { buildPointReconciliation } from "./point-reconciliation.js";

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

    const { accountId, audit } = await buildPointReconciliation(sessionToken);
    const targetBalance = Math.trunc(Number(audit.summary.knownActivityNet ?? 0));
    if (!Number.isFinite(targetBalance) || targetBalance < 0) {
      return res.status(400).json({ error: "Calculated balance is invalid." });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("login_accounts")
      .update({
        points_balance: targetBalance,
        updated_at: new Date().toISOString()
      })
      .eq("id", accountId)
      .select("points_balance")
      .maybeSingle();

    if (error) throw error;

    const refreshed = await buildPointReconciliation(sessionToken);
    return res.status(200).json({
      previousBalance: audit.summary.currentBalance,
      pointsBalance: Number(data?.points_balance ?? targetBalance),
      delta: targetBalance - Number(audit.summary.currentBalance ?? 0),
      audit: refreshed.audit
    });
  } catch (error) {
    console.error("Repair point balance failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not repair point balance."
    });
  }
}

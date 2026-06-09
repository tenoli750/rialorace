import {
  formatUsdcUnits,
  getLoginSessionByToken,
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";

const BASE_USDC_ORDER_TTL_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 1000;

function formatUsdCents(amountTotal, currency) {
  const amount = Number(amountTotal ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase()
  }).format(amount);
}

function mapStripePurchase(row) {
  return {
    id: row.id,
    method: "stripe",
    label: "Stripe",
    packageId: row.package_id,
    amount: formatUsdCents(row.amount_total, row.currency),
    points: Number(row.points_awarded ?? 0),
    status: row.status || "paid",
    reference: row.stripe_checkout_session_id,
    createdAt: row.created_at,
    completedAt: row.created_at
  };
}

function mapBaseUsdcOrder(row) {
  return {
    id: row.id,
    method: "base_usdc",
    label: "Base USDC",
    packageId: row.package_id,
    amount: `${formatUsdcUnits(row.expected_amount_units)} USDC`,
    points: Number(row.points_awarded ?? 0),
    status: row.status || "pending",
    reference: row.tx_hash || row.id,
    createdAt: row.created_at,
    completedAt: row.paid_at
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
    const expiresBefore = new Date(Date.now() - BASE_USDC_ORDER_TTL_MS).toISOString();

    const { error: expireError } = await supabase
      .from("base_usdc_point_orders")
      .update({ status: "cancelled" })
      .eq("account_id", loginSession.account_id)
      .eq("status", "pending")
      .lt("created_at", expiresBefore);

    if (expireError) throw expireError;

    const [stripeResult, baseUsdcResult] = await Promise.all([
      supabase
        .from("point_purchases")
        .select("id, package_id, amount_total, currency, points_awarded, status, stripe_checkout_session_id, created_at")
        .eq("account_id", loginSession.account_id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from("base_usdc_point_orders")
        .select("id, package_id, expected_amount_units, points_awarded, status, tx_hash, created_at, paid_at")
        .eq("account_id", loginSession.account_id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT)
    ]);

    if (stripeResult.error) throw stripeResult.error;
    if (baseUsdcResult.error) throw baseUsdcResult.error;

    const charges = [
      ...(stripeResult.data || []).map(mapStripePurchase),
      ...(baseUsdcResult.data || []).map(mapBaseUsdcOrder)
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.status(200).json({ charges });
  } catch (error) {
    console.error("List point charge history failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not load charge history."
    });
  }
}

import {
  getSupabaseAdmin,
  readJsonBody
} from "./base-usdc-shared.js";

function cleanText(value) {
  return String(value || "").trim();
}

function pickBestSymbol(rows) {
  const counts = new Map();

  for (const row of rows) {
    const symbol = cleanText(row.first_pick).toUpperCase();
    if (!symbol) continue;

    const current = counts.get(symbol) || {
      symbol,
      count: 0,
      latestCreatedAt: ""
    };
    current.count += 1;
    if (String(row.created_at || "") > current.latestCreatedAt) {
      current.latestCreatedAt = String(row.created_at || "");
    }
    counts.set(symbol, current);
  }

  return [...counts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.latestCreatedAt !== a.latestCreatedAt) return b.latestCreatedAt.localeCompare(a.latestCreatedAt);
    return a.symbol.localeCompare(b.symbol);
  })[0]?.symbol ?? null;
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
    const marketId = cleanText(body.marketId);
    const targetRaceStartedAt = cleanText(body.targetRaceStartedAt);

    if (!marketId) {
      return res.status(400).json({ error: "Market is required." });
    }
    if (!targetRaceStartedAt) {
      return res.status(400).json({ error: "Race start time is required." });
    }

    const supabase = getSupabaseAdmin();
    const { data: bets, error: betsError } = await supabase
      .from("bets")
      .select("account_id, first_pick, created_at")
      .eq("market_id", marketId)
      .eq("target_race_started_at", targetRaceStartedAt)
      .eq("bet_type", "podium")
      .not("first_pick", "is", null);

    if (betsError) throw betsError;

    const accountIds = [...new Set((bets || []).map((row) => row.account_id).filter(Boolean))];
    if (!accountIds.length) {
      return res.status(200).json({ badges: {} });
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("login_accounts")
      .select("id, login_id")
      .in("id", accountIds);

    if (accountsError) throw accountsError;

    const loginIdByAccountId = new Map((accounts || []).map((account) => [account.id, account.login_id]));
    const rowsByLoginId = new Map();

    for (const bet of bets || []) {
      const loginId = loginIdByAccountId.get(bet.account_id);
      if (!loginId) continue;
      const rows = rowsByLoginId.get(loginId) || [];
      rows.push(bet);
      rowsByLoginId.set(loginId, rows);
    }

    const badges = {};
    for (const [loginId, rows] of rowsByLoginId.entries()) {
      const symbol = pickBestSymbol(rows);
      if (symbol) badges[loginId] = symbol;
    }

    return res.status(200).json({ badges });
  } catch (error) {
    console.error("List chat pick badges failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not load chat pick badges."
    });
  }
}

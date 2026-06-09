const LOGIN_SESSION_STORAGE_KEY = "binance-ring-rally-login-session-v1";

function getLoginSessionToken() {
  return localStorage.getItem(LOGIN_SESSION_STORAGE_KEY);
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    for (const key of ["message", "error"] as const) {
      const message = (data as Record<string, unknown>)[key];
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  }

  return fallback;
}

export async function createLocalBetRecord(params: {
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

  console.info("[5178-bet-api] POST /api/create-bet-record");
  const response = await fetch("/api/create-bet-record", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      sessionToken,
      stake: params.stake,
      placements: params.placements,
      ratios: params.ratios,
      marketId: params.marketId,
      targetRaceStartedAt: params.targetRaceStartedAt,
      betType: params.betType ?? "podium",
      finishTime: params.finishTime ?? null
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Bet save failed."));
  }
  return firstRow<any>(data);
}

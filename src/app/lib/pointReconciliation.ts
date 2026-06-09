import { getLoginSessionToken } from "./supabase";

export interface PointReconciliation {
  summary: {
    currentBalance: number;
    rechargePoints: number;
    rewardPoints: number;
    dailyRewardPoints: number;
    betStake: number;
    betPayout: number;
    betNet: number;
    lottoStake: number;
    lottoPayout: number;
    lottoNet: number;
    knownActivityNet: number;
    inferredOpeningOrAdjustment: number;
    unappliedWonPayout: number;
  };
  counts: Record<string, unknown>;
  errors: Record<string, string>;
  diagnosis: string[];
}

export async function getPointReconciliation() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return null;
  }

  const response = await fetch("/api/point-reconciliation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionToken
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not reconcile points.");
  }

  return payload as PointReconciliation;
}

export async function repairPointBalance() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    throw new Error("Login required.");
  }

  const response = await fetch("/api/repair-point-balance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionToken
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not repair point balance.");
  }

  return payload as {
    previousBalance: number;
    pointsBalance: number;
    delta: number;
    audit: PointReconciliation;
  };
}

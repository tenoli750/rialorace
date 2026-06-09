import { getLoginSessionToken } from "./supabase";

export interface RewardHistoryRow {
  id: string;
  type: "rialo_staking" | string;
  label: string;
  points: number;
  amountRialo: number;
  status: string;
  reference: string | null;
  createdAt: string;
}

export async function listRewardHistory() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return [] as RewardHistoryRow[];
  }

  const response = await fetch("/api/list-reward-history", {
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
    throw new Error(payload?.error || "Could not load reward history.");
  }

  return (Array.isArray(payload?.rewards) ? payload.rewards : []) as RewardHistoryRow[];
}

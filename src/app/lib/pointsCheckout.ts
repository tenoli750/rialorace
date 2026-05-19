import { getLoginSessionToken } from "./supabase";

export type PointPackageId = "starter" | "booster" | "vault";

export const POINT_PACKAGES: Array<{
  id: PointPackageId;
  name: string;
  points: number;
  price: string;
}> = [
  {
    id: "starter",
    name: "Starter",
    points: 1000,
    price: "$1"
  },
  {
    id: "booster",
    name: "Booster",
    points: 5500,
    price: "$5"
  },
  {
    id: "vault",
    name: "Vault",
    points: 12000,
    price: "$10"
  }
];

export async function startPointsCheckout(packageId: PointPackageId) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    throw new Error("Login required before buying points.");
  }

  const response = await fetch("/api/create-points-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      packageId,
      sessionToken
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Could not start checkout.");
  }

  if (!payload?.checkoutUrl) {
    throw new Error("Checkout URL missing.");
  }

  window.location.assign(payload.checkoutUrl);
}

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const DEFAULT_SUPABASE_URL = "https://xafeoxmfhlbovzohjaam.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9HD-9e45AJgx5EIJXpiKsg__M75Ebad";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34";
export const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export const BASE_SEPOLIA_EXPLORER_URL = "https://sepolia.basescan.org";
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const POINT_PACKAGES = {
  starter: {
    name: "Starter Points",
    points: 1000,
    usdcUnits: 1_000_000
  },
  booster: {
    name: "Booster Points",
    points: 5500,
    usdcUnits: 5_000_000
  },
  vault: {
    name: "Vault Points",
    points: 12000,
    usdcUnits: 10_000_000
  }
};

export function getSupabasePublic() {
  return createClient(
    process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.includes("replace_me")) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

export function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

export function isAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || ""));
}

export function isTxHash(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(hash || ""));
}

export function getTreasuryAddress() {
  const treasuryAddress = process.env.BASE_SEPOLIA_TREASURY_ADDRESS;
  if (!isAddress(treasuryAddress)) {
    throw new Error("Missing BASE_SEPOLIA_TREASURY_ADDRESS.");
  }
  return treasuryAddress;
}

export function buildExpectedUsdcUnits(packageId) {
  const pointPackage = POINT_PACKAGES[packageId];
  if (!pointPackage) {
    throw new Error("Unknown points package.");
  }

  // A tiny per-order suffix makes matching a transfer to an account-specific order practical.
  return pointPackage.usdcUnits + randomInt(1, 1000);
}

export function formatUsdcUnits(units) {
  const cleanUnits = BigInt(units);
  const whole = cleanUnits / 1_000_000n;
  const fractional = cleanUnits % 1_000_000n;
  return `${whole}.${fractional.toString().padStart(6, "0").replace(/0+$/, "") || "0"}`;
}

export async function getLoginSessionByToken(sessionToken) {
  const supabase = getSupabasePublic();
  const { data, error } = await supabase.rpc("get_login_session", {
    requested_session_token: sessionToken
  });
  const loginSession = firstRow(data);

  if (error || !loginSession?.account_id) {
    throw new Error("Login session expired.");
  }

  return loginSession;
}

export async function rpc(method, params) {
  const response = await fetch(process.env.BASE_SEPOLIA_RPC_URL || BASE_SEPOLIA_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    })
  });

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `Base Sepolia RPC error: ${method}`);
  }
  return payload.result;
}

export function decodeTransferLog(log) {
  if (!log?.topics || log.topics.length < 3) return null;
  if (normalizeAddress(log.address) !== normalizeAddress(BASE_SEPOLIA_USDC_ADDRESS)) return null;
  if (normalizeAddress(log.topics[0]) !== ERC20_TRANSFER_TOPIC) return null;

  return {
    from: `0x${String(log.topics[1]).slice(26)}`.toLowerCase(),
    to: `0x${String(log.topics[2]).slice(26)}`.toLowerCase(),
    value: BigInt(log.data || "0x0")
  };
}

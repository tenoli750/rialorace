import { getLoginSessionToken } from "./supabase";
import type { PointPackageId } from "./pointsCheckout";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
    };
  }
}

export interface BaseUsdcOrder {
  orderId: string;
  points: number;
  amountUnits: string;
  amountDisplay: string;
  chainIdHex: string;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  usdcAddress: string;
  treasuryAddress: string;
}

export interface BaseUsdcVerifyResult {
  status: "paid" | "pending";
  pointsBalance?: number;
  pointsAwarded?: number;
  message?: string;
}

const BASE_SEPOLIA_PARAMS = (order: BaseUsdcOrder) => ({
  chainId: order.chainIdHex,
  chainName: order.chainName,
  nativeCurrency: {
    name: "ETH",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: [order.rpcUrl],
  blockExplorerUrls: [order.explorerUrl]
});

function requireEthereum() {
  if (!window.ethereum) {
    throw new Error("Install MetaMask or another EVM wallet to pay with Base Sepolia USDC.");
  }
  return window.ethereum;
}

function stripHexPrefix(value: string) {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function encodeUint256(value: string) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function encodeTransfer(to: string, amountUnits: string) {
  const selector = "a9059cbb";
  const encodedTo = stripHexPrefix(to).padStart(64, "0");
  return `0x${selector}${encodedTo}${encodeUint256(amountUnits)}`;
}

async function readJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "Base Sepolia USDC request failed.");
  }
  return payload;
}

async function switchToBaseSepolia(order: BaseUsdcOrder) {
  const ethereum = requireEthereum();
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: order.chainIdHex }]
    });
  } catch (error) {
    const code = Number((error as { code?: unknown })?.code);
    if (code !== 4902) throw error;

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [BASE_SEPOLIA_PARAMS(order)]
    });
  }
}

export function buildBaseUsdcQrPayload(order: BaseUsdcOrder) {
  const chainId = Number.parseInt(order.chainIdHex, 16);
  const params = new URLSearchParams({
    address: order.treasuryAddress,
    uint256: order.amountUnits
  });

  return `ethereum:${order.usdcAddress}@${chainId}/transfer?${params.toString()}`;
}

export async function createBaseUsdcOrder(packageId: PointPackageId, walletAddress: string) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    throw new Error("Login required before buying points.");
  }

  const response = await fetch("/api/create-base-usdc-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      packageId,
      sessionToken,
      walletAddress
    })
  });

  return readJsonResponse(response) as Promise<BaseUsdcOrder>;
}

export async function verifyBaseUsdcPayment(orderId: string, txHash: string) {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    throw new Error("Login required before verifying payment.");
  }

  const response = await fetch("/api/verify-base-usdc-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sessionToken,
      orderId,
      txHash
    })
  });

  if (response.status === 202) {
    return (await response.json()) as BaseUsdcVerifyResult;
  }

  return readJsonResponse(response) as Promise<BaseUsdcVerifyResult>;
}

export async function waitForBaseUsdcPayment(orderId: string, txHash: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await verifyBaseUsdcPayment(orderId, txHash);
    if (result.status === "paid") return result;
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
  }

  throw new Error("Transaction is still pending. Check again in a moment.");
}

export async function connectBaseUsdcWallet() {
  const ethereum = requireEthereum();
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const walletAddress = String(accounts?.[0] || "");
  if (!walletAddress) {
    throw new Error("No wallet account selected.");
  }
  return walletAddress;
}

export async function sendBaseUsdcOrderFromWallet(order: BaseUsdcOrder, walletAddress: string) {
  const ethereum = requireEthereum();
  await switchToBaseSepolia(order);
  const txHash = await ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: order.usdcAddress,
        value: "0x0",
        data: encodeTransfer(order.treasuryAddress, order.amountUnits)
      }
    ]
  });
  return String(txHash);
}

export async function startBaseUsdcCheckout(
  packageId: PointPackageId,
  onStatus?: (message: string) => void
) {
  onStatus?.("Connecting wallet.");
  const walletAddress = await connectBaseUsdcWallet();

  onStatus?.("Creating Base Sepolia USDC order.");
  const order = await createBaseUsdcOrder(packageId, walletAddress);
  onStatus?.(`Switching to Base Sepolia. Send exactly ${order.amountDisplay} USDC.`);
  const txHash = await sendBaseUsdcOrderFromWallet(order, walletAddress);

  onStatus?.("Waiting for Base Sepolia confirmation.");
  return waitForBaseUsdcPayment(order.orderId, txHash);
}

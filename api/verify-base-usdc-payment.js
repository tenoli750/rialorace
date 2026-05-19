import {
  BASE_SEPOLIA_USDC_ADDRESS,
  decodeTransferLog,
  firstRow,
  formatUsdcUnits,
  getLoginSessionByToken,
  getSupabaseAdmin,
  getTreasuryAddress,
  isTxHash,
  normalizeAddress,
  readJsonBody,
  rpc
} from "./base-usdc-shared.js";

function getMatchingTransferValue(receipt, order, treasuryAddress) {
  const expectedFrom = normalizeAddress(order.wallet_address);
  const expectedTo = normalizeAddress(treasuryAddress);
  let matchingValue = 0n;

  for (const log of receipt.logs || []) {
    const transfer = decodeTransferLog(log);
    if (transfer && transfer.from === expectedFrom && transfer.to === expectedTo) {
      matchingValue += transfer.value;
    }
  }

  return matchingValue;
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = String(error.message || "");
    if (message) return message;
  }
  return "Could not verify Base USDC payment.";
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
    const orderId = String(body.orderId || "");
    const txHash = normalizeAddress(body.txHash);

    if (!sessionToken) {
      return res.status(401).json({ error: "Login required." });
    }

    if (!orderId) {
      return res.status(400).json({ error: "Order id required." });
    }

    if (!isTxHash(txHash)) {
      return res.status(400).json({ error: "Transaction hash required." });
    }

    const treasuryAddress = getTreasuryAddress();
    const loginSession = await getLoginSessionByToken(sessionToken);
    const supabase = getSupabaseAdmin();
    const { data: orderData, error: orderError } = await supabase
      .from("base_usdc_point_orders")
      .select("id, account_id, wallet_address, expected_amount_units, points_awarded, status, tx_hash")
      .eq("id", orderId)
      .eq("account_id", loginSession.account_id)
      .single();

    if (orderError || !orderData) {
      return res.status(404).json({ error: "Base USDC order not found." });
    }

    if (orderData.status === "paid") {
      return res.status(200).json({
        status: "paid",
        alreadyProcessed: true,
        pointsAwarded: Number(orderData.points_awarded)
      });
    }

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return res.status(202).json({ status: "pending", message: "Transaction is not confirmed yet." });
    }

    if (receipt.status !== "0x1") {
      return res.status(400).json({ error: "Transaction failed on Base Sepolia." });
    }

    if (normalizeAddress(receipt.to) !== normalizeAddress(BASE_SEPOLIA_USDC_ADDRESS)) {
      return res.status(400).json({ error: "Transaction did not call Base Sepolia USDC." });
    }

    const expectedValue = BigInt(orderData.expected_amount_units);
    const matchingValue = getMatchingTransferValue(receipt, orderData, treasuryAddress);
    if (matchingValue !== expectedValue) {
      const actualLabel = matchingValue > 0n ? `${formatUsdcUnits(matchingValue)} USDC` : "no matching USDC";
      return res.status(400).json({
        error: `USDC transfer does not match this order. Expected ${formatUsdcUnits(expectedValue)} USDC, received ${actualLabel}.`
      });
    }

    const { data, error } = await supabase.rpc("mark_base_usdc_point_order_paid", {
      requested_order_id: orderId,
      requested_account_id: loginSession.account_id,
      requested_tx_hash: txHash
    });

    if (error) throw error;
    const paidOrder = firstRow(data);

    return res.status(200).json({
      status: "paid",
      alreadyProcessed: Boolean(paidOrder?.already_processed),
      pointsBalance: Number(paidOrder?.points_balance ?? 0),
      pointsAwarded: Number(paidOrder?.points_awarded ?? orderData.points_awarded)
    });
  } catch (error) {
    console.error("Verify Base USDC payment failed", error);
    return res.status(500).json({
      error: getErrorMessage(error)
    });
  }
}

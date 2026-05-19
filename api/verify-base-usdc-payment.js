import {
  BASE_SEPOLIA_USDC_ADDRESS,
  decodeTransferLog,
  ERC20_TRANSFER_TOPIC,
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

const AUTO_VERIFY_BLOCK_LOOKBACK = 1999n;
const AUTO_VERIFY_ORDER_GRACE_SECONDS = 300;

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

function toQuantityHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function toAddressTopic(address) {
  return `0x${normalizeAddress(address).replace(/^0x/, "").padStart(64, "0")}`;
}

function getOrderCreatedAtSeconds(order) {
  const timestamp = new Date(order.created_at).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

async function getBlockTimestampSeconds(blockNumber) {
  const block = await rpc("eth_getBlockByNumber", [blockNumber, false]);
  if (!block?.timestamp) return 0;
  return Number(BigInt(block.timestamp));
}

async function isTxHashUsedByAnotherOrder(supabase, txHash, orderId) {
  const { data, error } = await supabase
    .from("base_usdc_point_orders")
    .select("id")
    .eq("tx_hash", normalizeAddress(txHash))
    .neq("id", orderId)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function verifyReceiptPayment(txHash, order, treasuryAddress) {
  const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    return { pending: true, message: "Transaction is not confirmed yet." };
  }

  if (receipt.status !== "0x1") {
    return { error: "Transaction failed on Base Sepolia." };
  }

  if (normalizeAddress(receipt.to) !== normalizeAddress(BASE_SEPOLIA_USDC_ADDRESS)) {
    return { error: "Transaction did not call Base Sepolia USDC." };
  }

  const expectedValue = BigInt(order.expected_amount_units);
  const matchingValue = getMatchingTransferValue(receipt, order, treasuryAddress);
  if (matchingValue !== expectedValue) {
    const actualLabel = matchingValue > 0n ? `${formatUsdcUnits(matchingValue)} USDC` : "no matching USDC";
    return {
      error: `USDC transfer does not match this order. Expected ${formatUsdcUnits(expectedValue)} USDC, received ${actualLabel}.`
    };
  }

  return { txHash: normalizeAddress(txHash), receipt };
}

async function findMatchingPaymentTx(supabase, order, treasuryAddress) {
  const currentBlock = BigInt(await rpc("eth_blockNumber", []));
  const fromBlock = currentBlock > AUTO_VERIFY_BLOCK_LOOKBACK ? currentBlock - AUTO_VERIFY_BLOCK_LOOKBACK : 0n;
  const expectedValue = BigInt(order.expected_amount_units);
  const orderCreatedAtSeconds = getOrderCreatedAtSeconds(order);
  const earliestAcceptedTimestamp = orderCreatedAtSeconds
    ? orderCreatedAtSeconds - AUTO_VERIFY_ORDER_GRACE_SECONDS
    : 0;

  const logs = await rpc("eth_getLogs", [
    {
      address: BASE_SEPOLIA_USDC_ADDRESS,
      fromBlock: toQuantityHex(fromBlock),
      toBlock: toQuantityHex(currentBlock),
      topics: [
        ERC20_TRANSFER_TOPIC,
        toAddressTopic(order.wallet_address),
        toAddressTopic(treasuryAddress)
      ]
    }
  ]);

  const seenTxHashes = new Set();
  for (const log of [...(logs || [])].reverse()) {
    const transfer = decodeTransferLog(log);
    if (!transfer || transfer.value !== expectedValue) continue;

    const candidateTxHash = normalizeAddress(log.transactionHash);
    if (!isTxHash(candidateTxHash) || seenTxHashes.has(candidateTxHash)) continue;
    seenTxHashes.add(candidateTxHash);

    if (await isTxHashUsedByAnotherOrder(supabase, candidateTxHash, order.id)) continue;

    const verifiedPayment = await verifyReceiptPayment(candidateTxHash, order, treasuryAddress);
    if (!verifiedPayment.txHash) continue;

    const blockTimestampSeconds = await getBlockTimestampSeconds(verifiedPayment.receipt.blockNumber);
    if (earliestAcceptedTimestamp && blockTimestampSeconds < earliestAcceptedTimestamp) continue;

    return verifiedPayment.txHash;
  }

  return null;
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

    if (txHash && !isTxHash(txHash)) {
      return res.status(400).json({ error: "Transaction hash required." });
    }

    const treasuryAddress = getTreasuryAddress();
    const loginSession = await getLoginSessionByToken(sessionToken);
    const supabase = getSupabaseAdmin();
    const { data: orderData, error: orderError } = await supabase
      .from("base_usdc_point_orders")
      .select("id, account_id, wallet_address, expected_amount_units, points_awarded, status, tx_hash, created_at")
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

    let verifiedTxHash = txHash;
    if (verifiedTxHash) {
      const verifiedPayment = await verifyReceiptPayment(verifiedTxHash, orderData, treasuryAddress);
      if (verifiedPayment.pending) {
        return res.status(202).json({ status: "pending", message: verifiedPayment.message });
      }
      if (verifiedPayment.error) {
        return res.status(400).json({ error: verifiedPayment.error });
      }
      verifiedTxHash = verifiedPayment.txHash;
    } else {
      verifiedTxHash = await findMatchingPaymentTx(supabase, orderData, treasuryAddress);
      if (!verifiedTxHash) {
        return res.status(202).json({
          status: "pending",
          message: "No matching Base Sepolia USDC transfer found yet."
        });
      }
    }

    const { data, error } = await supabase.rpc("mark_base_usdc_point_order_paid", {
      requested_order_id: orderId,
      requested_account_id: loginSession.account_id,
      requested_tx_hash: verifiedTxHash
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

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID_HEX,
  BASE_SEPOLIA_EXPLORER_URL,
  BASE_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_USDC_ADDRESS,
  POINT_PACKAGES,
  buildExpectedUsdcUnits,
  firstRow,
  formatUsdcUnits,
  getLoginSessionByToken,
  getSupabaseAdmin,
  getTreasuryAddress,
  isAddress,
  normalizeAddress,
  readJsonBody
} from "./base-usdc-shared.js";

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
    const packageId = String(body.packageId || "");
    const sessionToken = String(body.sessionToken || "");
    const walletAddress = normalizeAddress(body.walletAddress);
    const pointPackage = POINT_PACKAGES[packageId];

    if (!pointPackage) {
      return res.status(400).json({ error: "Unknown points package." });
    }

    if (!sessionToken) {
      return res.status(401).json({ error: "Login required." });
    }

    if (!isAddress(walletAddress)) {
      return res.status(400).json({ error: "Wallet address required." });
    }

    const treasuryAddress = getTreasuryAddress();
    if (normalizeAddress(treasuryAddress) === walletAddress) {
      return res.status(400).json({ error: "Use a separate treasury wallet for Base Sepolia USDC tests." });
    }

    const loginSession = await getLoginSessionByToken(sessionToken);
    const expectedAmountUnits = buildExpectedUsdcUnits(packageId);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("base_usdc_point_orders")
      .insert({
        account_id: loginSession.account_id,
        wallet_address: walletAddress,
        package_id: packageId,
        expected_amount_units: expectedAmountUnits,
        points_awarded: pointPackage.points
      })
      .select("id, expected_amount_units, points_awarded")
      .single();

    if (error) throw error;
    const order = firstRow(data);

    return res.status(200).json({
      orderId: order.id,
      packageId,
      points: Number(order.points_awarded),
      amountUnits: String(order.expected_amount_units),
      amountDisplay: formatUsdcUnits(order.expected_amount_units),
      chainId: BASE_SEPOLIA_CHAIN_ID,
      chainIdHex: BASE_SEPOLIA_CHAIN_ID_HEX,
      chainName: "Base Sepolia",
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || BASE_SEPOLIA_RPC_URL,
      explorerUrl: BASE_SEPOLIA_EXPLORER_URL,
      usdcAddress: BASE_SEPOLIA_USDC_ADDRESS,
      treasuryAddress
    });
  } catch (error) {
    console.error("Create Base USDC order failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not create Base USDC order."
    });
  }
}

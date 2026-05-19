import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { CreditCard, Gift, Lock, Timer, Wallet, X } from "lucide-react";
import QRCode from "qrcode";
import {
  buildBaseUsdcQrPayload,
  connectBaseUsdcWallet,
  createBaseUsdcOrder,
  sendBaseUsdcOrderFromWallet,
  waitForBaseUsdcPayment
} from "../lib/baseUsdcCheckout";
import type { BaseUsdcOrder, BaseUsdcVerifyResult } from "../lib/baseUsdcCheckout";
import { POINT_PACKAGES, startPointsCheckout } from "../lib/pointsCheckout";
import type { PointPackageId } from "../lib/pointsCheckout";
import {
  claimDailyCheckin,
  claimRialoStakingPoints,
  getDailyCheckinStatus,
  getRialoStakingStatus,
  stakeRialo,
  unstakeRialo
} from "../lib/supabase";

export function Rewards() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const [lastClaim, setLastClaim] = useState<string | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [message, setMessage] = useState("Loading daily check-in.");
  const [nextResetAt, setNextResetAt] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [rialoBalance, setRialoBalance] = useState(0);
  const [stakedRialo, setStakedRialo] = useState(0);
  const [totalStakingPoints, setTotalStakingPoints] = useState(0);
  const [stakingLastClaimedAt, setStakingLastClaimedAt] = useState<string | null>(null);
  const [stakingNow, setStakingNow] = useState(Date.now());
  const [stakingMessage, setStakingMessage] = useState("Login to load your $RIALO staking wallet.");
  const [isStakingAction, setIsStakingAction] = useState(false);
  const [stakeAmount, setStakeAmount] = useState("10");
  const [purchaseMessage, setPurchaseMessage] = useState("Choose a test package to buy points through Stripe.");
  const [activePurchasePackage, setActivePurchasePackage] = useState<PointPackageId | null>(null);
  const [baseUsdcMessage, setBaseUsdcMessage] = useState("Pay with Circle test USDC on Base Sepolia.");
  const [baseUsdcModalPackage, setBaseUsdcModalPackage] = useState<PointPackageId | null>(null);
  const [baseUsdcOrder, setBaseUsdcOrder] = useState<BaseUsdcOrder | null>(null);
  const [baseUsdcQrUrl, setBaseUsdcQrUrl] = useState("");
  const [baseUsdcWalletAddress, setBaseUsdcWalletAddress] = useState("");
  const [baseUsdcManualWalletAddress, setBaseUsdcManualWalletAddress] = useState("");
  const [baseUsdcTxHash, setBaseUsdcTxHash] = useState("");
  const [isBaseUsdcPreparing, setIsBaseUsdcPreparing] = useState(false);
  const [isBaseUsdcPaying, setIsBaseUsdcPaying] = useState(false);
  const earningRatePerRialoPerDay = 100;
  const projectedDailyReward = Math.floor(stakedRialo * earningRatePerRialoPerDay);
  const pendingStakingPoints = Math.max(
    0,
    ((stakingNow - (stakingLastClaimedAt ? new Date(stakingLastClaimedAt).getTime() : stakingNow)) / 86400000) *
      stakedRialo *
      earningRatePerRialoPerDay
  );
  const claimableStakingPoints = Math.floor(pendingStakingPoints);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error && "message" in error) {
      const message = String((error as { message?: unknown }).message ?? "");
      if (message) return message;
    }
    return fallback;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (!user) {
        setCanClaim(false);
        setMessage("Login to claim 100 pts once per KST day.");
        return;
      }

      try {
        const row = await getDailyCheckinStatus();
        if (cancelled) return;
        const alreadyClaimed = Boolean(row?.already_claimed);
        setCanClaim(!alreadyClaimed);
        setLastClaim(row?.checkin_date_kst ?? null);
        setNextResetAt(row?.next_reset_at ?? null);
        if (Number.isFinite(Number(row?.current_points_balance))) {
          setPointsBalance(Number(row?.current_points_balance));
        }
        setMessage(alreadyClaimed ? "Next claim opens at KST 00:00." : "Daily check-in is ready.");
      } catch (error) {
        if (!cancelled) {
          setCanClaim(false);
          setMessage(error instanceof Error ? error.message : "Could not load daily check-in.");
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [user, setPointsBalance]);

  useEffect(() => {
    let cancelled = false;

    async function loadStakingStatus() {
      if (!user) {
        setRialoBalance(0);
        setStakedRialo(0);
        setTotalStakingPoints(0);
        setStakingMessage("Login to load your $RIALO staking wallet.");
        return;
      }

      try {
        setStakingMessage("Loading $RIALO staking wallet.");
        const row = await getRialoStakingStatus();
        if (cancelled) return;
        applyStakingRow(row);
        setStakingMessage("Your $RIALO staking wallet is synced.");
      } catch (error) {
        if (!cancelled) {
          setStakingMessage(error instanceof Error ? error.message : "Could not load $RIALO staking wallet.");
        }
      }
    }

    void loadStakingStatus();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => setStakingNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderQrCode() {
      if (!baseUsdcOrder) {
        setBaseUsdcQrUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(buildBaseUsdcQrPayload(baseUsdcOrder), {
          width: 220,
          margin: 1,
          color: {
            dark: "#7c2d12",
            light: "#fff7ed"
          }
        });
        if (!cancelled) setBaseUsdcQrUrl(dataUrl);
      } catch (error) {
        if (!cancelled) {
          console.error("Base USDC QR generation failed", error);
          setBaseUsdcQrUrl("");
        }
      }
    }

    void renderQrCode();
    return () => {
      cancelled = true;
    };
  }, [baseUsdcOrder]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("points_checkout");
    if (!checkoutStatus) return;

    let refreshTimer: number | undefined;
    if (checkoutStatus === "success") {
      setPurchaseMessage("Payment completed. Syncing points from Stripe.");
      void refreshSession();
      refreshTimer = window.setTimeout(() => {
        void refreshSession();
      }, 2500);
    } else if (checkoutStatus === "cancelled") {
      setPurchaseMessage("Checkout cancelled. No points were added.");
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [refreshSession]);

  const handleClaim = async () => {
    if (!user) {
      alert("Please login to claim rewards");
      return;
    }
    if (!canClaim) {
      alert("You have already claimed today");
      return;
    }

    try {
      setIsClaiming(true);
      const row = await claimDailyCheckin();
      setCanClaim(false);
      setLastClaim(row?.checkin_date_kst ?? null);
      setNextResetAt(row?.next_reset_at ?? null);
      if (Number.isFinite(Number(row?.current_points_balance))) {
        setPointsBalance(Number(row?.current_points_balance));
      } else {
        await refreshSession();
      }
      setMessage(Boolean(row?.claimed) ? "Claimed 100 pts." : "Already claimed today.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not claim daily reward.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleBuyPoints = async (packageId: PointPackageId) => {
    if (!user) {
      alert("Please login to buy points.");
      return;
    }

    try {
      setActivePurchasePackage(packageId);
      setPurchaseMessage("Opening Stripe Checkout.");
      await startPointsCheckout(packageId);
    } catch (error) {
      console.error("Start points checkout failed", error);
      setPurchaseMessage(getErrorMessage(error, "Could not start Stripe Checkout."));
      setActivePurchasePackage(null);
    }
  };

  const resetBaseUsdcOrder = () => {
    setBaseUsdcOrder(null);
    setBaseUsdcQrUrl("");
    setBaseUsdcTxHash("");
  };

  const openBaseUsdcModal = (packageId: PointPackageId) => {
    if (!user) {
      alert("Please login to buy points.");
      return;
    }

    setBaseUsdcModalPackage(packageId);
    resetBaseUsdcOrder();
    setBaseUsdcMessage("Connect a wallet, or enter the wallet that will send Base Sepolia USDC.");
  };

  const closeBaseUsdcModal = () => {
    if (isBaseUsdcPreparing || isBaseUsdcPaying) return;
    setBaseUsdcModalPackage(null);
    resetBaseUsdcOrder();
  };

  const applyBaseUsdcPayment = async (result: BaseUsdcVerifyResult) => {
    if (Number.isFinite(Number(result.pointsBalance))) {
      setPointsBalance(Number(result.pointsBalance));
    } else {
      await refreshSession();
    }
    setBaseUsdcMessage(`Base Sepolia USDC payment confirmed. Added ${Number(result.pointsAwarded ?? 0).toLocaleString()} pts.`);
    setBaseUsdcModalPackage(null);
    resetBaseUsdcOrder();
  };

  const handleConnectBaseUsdcWallet = async () => {
    if (!baseUsdcModalPackage) return;

    try {
      setIsBaseUsdcPreparing(true);
      setBaseUsdcMessage("Connecting wallet.");
      const walletAddress = await connectBaseUsdcWallet();
      setBaseUsdcWalletAddress(walletAddress);
      setBaseUsdcManualWalletAddress(walletAddress);
      setBaseUsdcMessage("Creating Base Sepolia USDC order.");
      const order = await createBaseUsdcOrder(baseUsdcModalPackage, walletAddress);
      setBaseUsdcOrder(order);
      setBaseUsdcMessage(`Order ready. Send exactly ${order.amountDisplay} USDC on Base Sepolia.`);
    } catch (error) {
      console.error("Base Sepolia USDC wallet connect failed", error);
      setBaseUsdcMessage(getErrorMessage(error, "Could not connect wallet."));
    } finally {
      setIsBaseUsdcPreparing(false);
    }
  };

  const handleCreateManualBaseUsdcOrder = async () => {
    if (!baseUsdcModalPackage) return;

    try {
      setIsBaseUsdcPreparing(true);
      setBaseUsdcMessage("Creating QR payment order.");
      const order = await createBaseUsdcOrder(baseUsdcModalPackage, baseUsdcManualWalletAddress);
      setBaseUsdcOrder(order);
      setBaseUsdcMessage(`QR ready. Send exactly ${order.amountDisplay} USDC from the listed wallet.`);
    } catch (error) {
      console.error("Base Sepolia USDC QR order failed", error);
      setBaseUsdcMessage(getErrorMessage(error, "Could not create QR payment order."));
    } finally {
      setIsBaseUsdcPreparing(false);
    }
  };

  const handlePayBaseUsdcOrderWithWallet = async () => {
    if (!baseUsdcOrder) return;

    try {
      setIsBaseUsdcPaying(true);
      let walletAddress = baseUsdcWalletAddress;
      if (!walletAddress) {
        walletAddress = await connectBaseUsdcWallet();
        setBaseUsdcWalletAddress(walletAddress);
      }
      setBaseUsdcMessage("Confirm the USDC transfer in your wallet.");
      const txHash = await sendBaseUsdcOrderFromWallet(baseUsdcOrder, walletAddress);
      setBaseUsdcTxHash(txHash);
      setBaseUsdcMessage("Waiting for Base Sepolia confirmation.");
      const result = await waitForBaseUsdcPayment(baseUsdcOrder.orderId, txHash);
      await applyBaseUsdcPayment(result);
    } catch (error) {
      console.error("Base Sepolia USDC wallet payment failed", error);
      setBaseUsdcMessage(getErrorMessage(error, "Could not complete wallet payment."));
    } finally {
      setIsBaseUsdcPaying(false);
    }
  };

  const handleVerifyBaseUsdcTxHash = async () => {
    if (!baseUsdcOrder) return;

    try {
      setIsBaseUsdcPaying(true);
      setBaseUsdcMessage("Verifying Base Sepolia transaction.");
      const result = await waitForBaseUsdcPayment(baseUsdcOrder.orderId, baseUsdcTxHash);
      await applyBaseUsdcPayment(result);
    } catch (error) {
      console.error("Base Sepolia USDC tx verification failed", error);
      setBaseUsdcMessage(getErrorMessage(error, "Could not verify transaction."));
    } finally {
      setIsBaseUsdcPaying(false);
    }
  };

  const copyBaseUsdcValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setBaseUsdcMessage(`${label} copied.`);
  };

  const getNextReset = () => {
    if (nextResetAt) {
      return new Intl.DateTimeFormat("en-GB", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul"
      }).format(new Date(nextResetAt));
    }
    return "KST 00:00";
  };

  const getStakeValue = () => {
    const value = Number(stakeAmount);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.floor(value);
  };

  const applyStakingRow = (row: Awaited<ReturnType<typeof getRialoStakingStatus>>) => {
    if (!row) return;
    setRialoBalance(Number(row.available_rialo ?? 0));
    setStakedRialo(Number(row.staked_rialo ?? 0));
    if (Number.isFinite(Number(row.total_points_earned))) {
      setTotalStakingPoints(Number(row.total_points_earned));
    }
    setStakingLastClaimedAt(row.last_claimed_at ?? null);
    if (Number.isFinite(Number(row.current_points_balance))) {
      setPointsBalance(Number(row.current_points_balance));
    }
  };

  const applyStakingMutationRow = (row: Awaited<ReturnType<typeof stakeRialo>>) => {
    if (!row) return;
    setRialoBalance(Number(row.available_rialo ?? 0));
    setStakedRialo(Number(row.staked_rialo ?? 0));
    if (Number.isFinite(Number(row.total_points_earned))) {
      setTotalStakingPoints(Number(row.total_points_earned));
    }
    setStakingLastClaimedAt(row.last_claimed_at ?? null);
    if (Number.isFinite(Number(row.current_points_balance))) {
      setPointsBalance(Number(row.current_points_balance));
    }
  };

  const handleStake = async () => {
    if (!user) {
      alert("Please login to stake $RIALO.");
      return;
    }

    const value = getStakeValue();
    if (!value) {
      alert("Enter a $RIALO amount to stake.");
      return;
    }
    if (value > rialoBalance) {
      alert("Not enough available $RIALO.");
      return;
    }

    try {
      setIsStakingAction(true);
      const row = await stakeRialo(value);
      applyStakingMutationRow(row);
      setStakingMessage(`Staked ${value.toLocaleString()} $RIALO. Earning rate is now ${((stakedRialo + value) * earningRatePerRialoPerDay).toLocaleString()} pts/day.`);
    } catch (error) {
      console.error("Stake $RIALO failed", error);
      setStakingMessage(`Could not stake $RIALO: ${getErrorMessage(error, "Unknown staking error.")}`);
    } finally {
      setIsStakingAction(false);
    }
  };

  const handleClaimStakingRewards = async () => {
    if (!user) {
      alert("Please login to claim staking rewards.");
      return;
    }
    if (claimableStakingPoints <= 0) {
      alert("No staking rewards ready to claim yet.");
      return;
    }

    try {
      setIsStakingAction(true);
      const row = await claimRialoStakingPoints();
      applyStakingMutationRow(row);
      setStakingNow(Date.now());
      setStakingMessage(`Claimed ${Number(row?.points_awarded ?? 0).toLocaleString()} staking pts.`);
    } catch (error) {
      console.error("Claim staking rewards failed", error);
      setStakingMessage(`Could not claim staking rewards: ${getErrorMessage(error, "Unknown claim error.")}`);
    } finally {
      setIsStakingAction(false);
    }
  };

  const handleUnstake = async () => {
    if (!user) {
      alert("Please login to unstake $RIALO.");
      return;
    }

    const value = getStakeValue();
    if (!value) {
      alert("Enter a $RIALO amount to unstake.");
      return;
    }
    if (value > stakedRialo) {
      alert("You cannot unstake more than your staked $RIALO.");
      return;
    }

    try {
      setIsStakingAction(true);
      const row = await unstakeRialo(value);
      applyStakingMutationRow(row);
      setStakingMessage(`Unstaked ${value.toLocaleString()} $RIALO.`);
    } catch (error) {
      console.error("Unstake $RIALO failed", error);
      setStakingMessage(`Could not unstake $RIALO: ${getErrorMessage(error, "Unknown unstaking error.")}`);
    } finally {
      setIsStakingAction(false);
    }
  };

  const selectedBaseUsdcPackage = POINT_PACKAGES.find((pointPackage) => pointPackage.id === baseUsdcModalPackage);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Rewards</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">Rewards</h1>
          <p className="text-sm text-[#8a5a44]">Check in once per KST day for 100 pts.</p>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Points</span>
            <h2 className="text-lg text-[#9a3412] mt-1">Buy Test Points</h2>
          </div>
          <span className="px-3 py-1 bg-[#ffedd5] text-xs text-[#9a3412] rounded-md">
            Stripe Test
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {POINT_PACKAGES.map((pointPackage) => (
            <div key={pointPackage.id} className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
              <div className="flex items-center gap-2 text-xs text-[#8a5a44] mb-2">
                <CreditCard className="w-4 h-4" />
                {pointPackage.name}
              </div>
              <div className="text-xl text-[#9a3412] mb-1">{pointPackage.points.toLocaleString()} pts</div>
              <div className="text-xs text-[#8a5a44] mb-4">{pointPackage.price} test checkout</div>
              <button
                type="button"
                onClick={() => void handleBuyPoints(pointPackage.id)}
                disabled={!user || activePurchasePackage !== null}
                className="w-full px-4 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activePurchasePackage === pointPackage.id ? "Opening" : "Buy"}
              </button>
              <button
                type="button"
                onClick={() => openBaseUsdcModal(pointPackage.id)}
                disabled={!user || isBaseUsdcPreparing || isBaseUsdcPaying}
                className="mt-2 w-full px-4 py-3 bg-[#ffedd5] text-[#9a3412] rounded-lg border border-[#fed7aa] hover:border-[#9a3412] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                Base USDC
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-[#ffedd5] rounded text-xs text-[#8a5a44] text-center">
          {user ? purchaseMessage : "Login to buy points."}
        </div>
        <div className="mt-3 p-3 bg-[#fff7ed] rounded text-xs text-[#8a5a44] text-center border border-[#fed7aa]">
          {user ? baseUsdcMessage : "Login to pay with Base Sepolia USDC."}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Staking</span>
            <h2 className="text-lg text-[#9a3412] mt-1">$RIALO Staking</h2>
          </div>
          <span className="px-3 py-1 bg-[#ffedd5] text-xs text-[#9a3412] rounded-md">
            Backend Synced
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="flex items-center gap-2 text-xs text-[#8a5a44] mb-2">
              <Wallet className="w-4 h-4" />
              Available
            </div>
            <div className="text-xl text-[#9a3412] mb-1">{rialoBalance.toLocaleString()} $RIALO</div>
            <div className="text-xs text-[#8a5a44]">Each user starts with 100 $RIALO</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="flex items-center gap-2 text-xs text-[#8a5a44] mb-2">
              <Lock className="w-4 h-4" />
              Staked
            </div>
            <div className="text-xl text-[#9a3412] mb-1">{stakedRialo.toLocaleString()} $RIALO</div>
            <div className="text-xs text-[#8a5a44]">Stored in Supabase staking wallet</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="flex items-center gap-2 text-xs text-[#8a5a44] mb-2">
              <Timer className="w-4 h-4" />
              Earning Rate
            </div>
            <div className="text-xl text-[#9a3412] mb-1">100 pts/day</div>
            <div className="text-xs text-[#8a5a44]">
              Per 1 $RIALO staked
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Current Earning Rate</div>
            <div className="text-xl text-[#9a3412] mb-1">{projectedDailyReward.toLocaleString()} pts/day</div>
            <div className="text-xs text-[#8a5a44]">Based on your current staked $RIALO</div>
          </div>
          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Pending Rewards</div>
            <div className="text-xl text-[#9a3412] mb-1">{pendingStakingPoints.toLocaleString(undefined, { maximumFractionDigits: 4 })} pts</div>
            <div className="text-xs text-[#8a5a44]">
              Claimable now: {claimableStakingPoints.toLocaleString()} pts
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
          <label className="block">
            <span className="block text-xs text-[#8a5a44] mb-2">Amount</span>
            <input
              type="number"
              min="1"
              step="1"
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
              className="w-full rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-[#9a3412] outline-none focus:border-[#9a3412]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 lg:items-end">
            <button
              type="button"
              onClick={handleStake}
              disabled={!user || isStakingAction}
              className="px-6 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStakingAction ? "Syncing" : "Stake"}
            </button>
            <button
              type="button"
              onClick={handleUnstake}
              disabled={!user || isStakingAction}
              className="px-6 py-3 bg-[#ffedd5] text-[#9a3412] rounded-lg border border-[#fed7aa] hover:border-[#9a3412] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Unstake
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClaimStakingRewards}
          disabled={!user || isStakingAction || claimableStakingPoints <= 0}
          className="mt-4 w-full px-6 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Gift className="w-5 h-5" />
          Claim Staking Rewards
        </button>

        <div className="mt-4 p-3 bg-[#fff7ed] rounded text-xs text-[#8a5a44] text-center border border-[#fed7aa]">
          Earning rate: 1 $RIALO = 100 pts/day. Total claimed from staking: {totalStakingPoints.toLocaleString()} pts.
        </div>

        <div className="mt-4 p-3 bg-[#ffedd5] rounded text-xs text-[#8a5a44] text-center">
          {stakingMessage}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#fed7aa] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Claim</span>
            <h2 className="text-lg text-[#9a3412] mt-1">Daily Reward</h2>
          </div>
          <span className="px-3 py-1 bg-[#ffedd5] text-xs text-[#9a3412] rounded-md">
            {user ? "Logged In" : "Login Required"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Balance</div>
            <div className="text-xl text-[#9a3412] mb-1">{points.toLocaleString()} pts</div>
            <div className="text-xs text-[#8a5a44]">Your current points after claimed rewards</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Claim Window</div>
            <div className="text-xl text-[#9a3412] mb-1">KST Day</div>
            <div className="text-xs text-[#8a5a44]">One claim per user before the next KST reset</div>
          </div>
        </div>

        <button
          onClick={handleClaim}
          disabled={!user || !canClaim || isClaiming}
          className="w-full px-6 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Gift className="w-5 h-5" />
          {!user ? "Login Required" : isClaiming ? "Claiming" : canClaim ? "Claim 100 Points" : "Claimed Today"}
        </button>

        <div className="mt-4 p-3 bg-[#ffedd5] rounded text-xs text-[#8a5a44] text-center">
          {message}
        </div>

        {lastClaim && user && (
          <div className="mt-4 p-3 bg-[#ffedd5] rounded text-xs text-[#8a5a44] text-center">
            KST date: {lastClaim}
          </div>
        )}
      </section>

      {baseUsdcModalPackage && selectedBaseUsdcPackage && (
        <div className="fixed inset-0 z-50 bg-black/45 px-4 py-6 flex items-center justify-center">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-lg border border-[#fed7aa] shadow-xl">
            <div className="p-5 border-b border-[#fed7aa] flex items-start justify-between gap-4">
              <div>
                <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Base Sepolia USDC</span>
                <h2 className="text-xl text-[#9a3412] mt-1">
                  {selectedBaseUsdcPackage.points.toLocaleString()} pts for {selectedBaseUsdcPackage.price}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeBaseUsdcModal}
                disabled={isBaseUsdcPreparing || isBaseUsdcPaying}
                className="h-9 w-9 flex items-center justify-center rounded-md border border-[#fed7aa] text-[#9a3412] hover:border-[#9a3412] disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
              <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-4">
                <div className="aspect-square w-full bg-white border border-[#fed7aa] rounded-lg flex items-center justify-center overflow-hidden">
                  {baseUsdcQrUrl ? (
                    <img src={baseUsdcQrUrl} alt="Base Sepolia USDC payment QR" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-sm text-[#8a5a44] text-center px-4">
                      Create an order to show QR.
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs text-[#8a5a44] text-center">
                  QR contains chain, token, receiver, exact amount, and order id.
                </div>
              </div>

              <div className="space-y-4">
                {!baseUsdcOrder ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-4">
                      <div className="text-sm text-[#9a3412] mb-2">Browser Wallet</div>
                      <button
                        type="button"
                        onClick={() => void handleConnectBaseUsdcWallet()}
                        disabled={isBaseUsdcPreparing}
                        className="w-full px-4 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        {isBaseUsdcPreparing ? "Preparing" : "Connect Wallet & Create QR"}
                      </button>
                    </div>

                    <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-4">
                      <label className="block">
                        <span className="block text-sm text-[#9a3412] mb-2">Sender Wallet Address</span>
                        <input
                          type="text"
                          value={baseUsdcManualWalletAddress}
                          onChange={(event) => setBaseUsdcManualWalletAddress(event.target.value)}
                          placeholder="0x..."
                          className="w-full rounded-lg border border-[#fed7aa] bg-white px-3 py-3 text-sm text-[#9a3412] outline-none focus:border-[#9a3412]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleCreateManualBaseUsdcOrder()}
                        disabled={isBaseUsdcPreparing || !baseUsdcManualWalletAddress}
                        className="mt-3 w-full px-4 py-3 bg-[#ffedd5] text-[#9a3412] rounded-lg border border-[#fed7aa] hover:border-[#9a3412] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Create QR From Address
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-3">
                        <div className="text-xs text-[#8a5a44] mb-1">Amount</div>
                        <div className="text-lg text-[#9a3412]">{baseUsdcOrder.amountDisplay} USDC</div>
                        <button
                          type="button"
                          onClick={() => void copyBaseUsdcValue(baseUsdcOrder.amountDisplay, "Amount")}
                          className="mt-2 text-xs text-[#9a3412] underline"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-3">
                        <div className="text-xs text-[#8a5a44] mb-1">Network</div>
                        <div className="text-lg text-[#9a3412]">Base Sepolia</div>
                      </div>
                      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-3 md:col-span-2">
                        <div className="text-xs text-[#8a5a44] mb-1">Receiver</div>
                        <div className="text-sm text-[#9a3412] break-all">{baseUsdcOrder.treasuryAddress}</div>
                        <button
                          type="button"
                          onClick={() => void copyBaseUsdcValue(baseUsdcOrder.treasuryAddress, "Receiver")}
                          className="mt-2 text-xs text-[#9a3412] underline"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-3 md:col-span-2">
                        <div className="text-xs text-[#8a5a44] mb-1">Token Contract</div>
                        <div className="text-sm text-[#9a3412] break-all">{baseUsdcOrder.usdcAddress}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => void handlePayBaseUsdcOrderWithWallet()}
                        disabled={isBaseUsdcPaying}
                        className="px-4 py-3 bg-[#9a3412] text-white rounded-lg hover:bg-[#c2410c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        {isBaseUsdcPaying ? "Confirming" : "Connect Wallet & Pay"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyBaseUsdcValue(baseUsdcOrder.orderId, "Order id")}
                        className="px-4 py-3 bg-[#ffedd5] text-[#9a3412] rounded-lg border border-[#fed7aa] hover:border-[#9a3412] transition-colors"
                      >
                        Copy Order ID
                      </button>
                    </div>

                    <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-lg p-4">
                      <label className="block">
                        <span className="block text-sm text-[#9a3412] mb-2">Transaction Hash</span>
                        <input
                          type="text"
                          value={baseUsdcTxHash}
                          onChange={(event) => setBaseUsdcTxHash(event.target.value)}
                          placeholder="0x..."
                          className="w-full rounded-lg border border-[#fed7aa] bg-white px-3 py-3 text-sm text-[#9a3412] outline-none focus:border-[#9a3412]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleVerifyBaseUsdcTxHash()}
                        disabled={isBaseUsdcPaying || !baseUsdcTxHash}
                        className="mt-3 w-full px-4 py-3 bg-[#ffedd5] text-[#9a3412] rounded-lg border border-[#fed7aa] hover:border-[#9a3412] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Verify Transaction
                      </button>
                    </div>
                  </>
                )}

                <div className="p-3 bg-[#ffedd5] rounded text-xs text-[#8a5a44] text-center">
                  {baseUsdcMessage}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

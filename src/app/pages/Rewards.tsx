import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Gift, Lock, Timer, Wallet } from "lucide-react";
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
    </div>
  );
}

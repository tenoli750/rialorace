import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Gift } from "lucide-react";
import { claimDailyCheckin, getDailyCheckinStatus } from "../lib/supabase";

export function Rewards() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const [lastClaim, setLastClaim] = useState<string | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [message, setMessage] = useState("Loading daily check-in.");
  const [nextResetAt, setNextResetAt] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

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

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Rewards</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">Rewards</h1>
          <p className="text-sm text-[#8a5a44]">Check in once per KST day for 100 pts.</p>
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

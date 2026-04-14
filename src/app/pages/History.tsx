import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrendingUp, TrendingDown } from "lucide-react";
import { BetRow, listBetsWithSession } from "../lib/supabase";
import { getMarketById } from "../data/markets";

interface Bet {
  id: string;
  market: string;
  raceTime: string;
  picks: string;
  stake: number;
  status: "won" | "lost" | "pending";
  pnl: number;
  result: string;
}

export function History() {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [status, setStatus] = useState("Loading bets...");

  useEffect(() => {
    let cancelled = false;

    async function loadBets() {
      if (!user) {
        setBets([]);
        setStatus("Please login to view your bet history");
        return;
      }

      try {
        const rows = await listBetsWithSession();
        if (cancelled) return;
        const nextBets = rows.map(mapBetRow);
        setBets(nextBets);
        setStatus(nextBets.length ? "" : "No bets placed yet");
      } catch (error) {
        if (!cancelled) {
          setBets([]);
          setStatus(error instanceof Error ? error.message : "Could not load bets.");
        }
      }
    }

    void loadBets();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totalBets = bets.length;
  const won = bets.filter((b) => b.status === "won").length;
  const lost = bets.filter((b) => b.status === "lost").length;
  const totalPnL = bets.reduce((sum, b) => sum + b.pnl, 0);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Bet History</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">My Bets</h1>
          <p className="text-sm text-[#8a5a44]">
            All placed bets, match targets, results, and payout records.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Total Bets</div>
            <div className="text-2xl text-[#9a3412]">{totalBets}</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Won</div>
            <div className="text-2xl text-[#9a3412]">{won}</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Lost</div>
            <div className="text-2xl text-[#9a3412]">{lost}</div>
          </div>

          <div className="p-4 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">PnL</div>
            <div className={`text-2xl flex items-center gap-1 ${totalPnL >= 0 ? "text-[#9a3412]" : "text-[#c62828]"}`}>
              {totalPnL >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {totalPnL >= 0 ? "+" : ""}{totalPnL} pts
            </div>
          </div>
        </div>

        {/* Bet History Table */}
        {status ? (
          <div className="py-12 text-center text-[#8a5a44]">{status}</div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <div
                key={bet.id}
                className={`p-4 rounded-lg border ${
                  bet.status === "won"
                    ? "bg-[#ffedd5] border-[#9a3412]"
                    : bet.status === "lost"
                    ? "bg-[#ffebee] border-[#c62828]"
                    : "bg-[#fff7ed] border-[#fed7aa]"
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Market</div>
                    <div className="text-sm text-[#9a3412]">{bet.market}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Race Time</div>
                    <div className="text-sm text-[#9a3412]">{bet.raceTime}</div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="text-xs text-[#8a5a44] mb-1">Your Picks</div>
                    <div className="text-sm text-[#9a3412]">{bet.picks}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Result</div>
                    <div className="text-sm text-[#9a3412]">{bet.result}</div>
                  </div>

                  <div className="md:col-span-1">
                    <div className="text-xs text-[#8a5a44] mb-1">Stake</div>
                    <div className="text-sm text-[#9a3412]">{bet.stake} pts</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">PnL</div>
                    <div
                      className={`text-sm font-medium ${
                        bet.pnl >= 0 ? "text-[#9a3412]" : "text-[#c62828]"
                      }`}
                    >
                      {bet.pnl >= 0 ? "+" : ""}{bet.pnl} pts
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function mapBetRow(row: BetRow): Bet {
  const pnl = Number(row.payout_points ?? 0) - Number(row.stake_points ?? 0);
  const status = row.status === "won" || row.status === "lost" ? row.status : "pending";
  const market = getMarketById(row.market_id)?.name ?? row.market_id ?? "-";
  const picks = [
    row.first_pick ? `1st: ${row.first_pick}` : null,
    row.second_pick ? `2nd: ${row.second_pick}` : null,
    row.third_pick ? `3rd: ${row.third_pick}` : null
  ].filter(Boolean).join(", ");
  const result = row.first_place
    ? `1.${row.first_place} 2.${row.second_place} 3.${row.third_place} 4.${row.fourth_place}`
    : "Waiting for result";

  return {
    id: row.bet_id,
    market,
    raceTime: formatKstDate(row.target_race_started_at),
    picks: picks || "-",
    stake: Number(row.stake_points ?? 0),
    status,
    pnl,
    result
  };
}

function formatKstDate(timestamp: string | null) {
  if (!timestamp) return "-";
  return `${new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp))} KST`;
}

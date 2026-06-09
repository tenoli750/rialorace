import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TrendingUp, TrendingDown } from "lucide-react";
import { BetRow, getRialoStakingStatus, listBetsWithSession, listRaceResults } from "../lib/supabase";
import type { RaceResultRow } from "../lib/supabase";
import { getMarketById } from "../data/markets";
import { listPointChargeHistory } from "../lib/pointsCheckout";
import type { PointChargeHistoryRow, PointPackageId } from "../lib/pointsCheckout";
import { POINT_PACKAGES } from "../lib/pointsCheckout";
import { listRewardHistory } from "../lib/rewardHistory";
import type { RewardHistoryRow } from "../lib/rewardHistory";
import { getPointReconciliation } from "../lib/pointReconciliation";
import type { PointReconciliation } from "../lib/pointReconciliation";

interface Bet {
  id: string;
  market: string;
  raceTime: string;
  createdAt: string | null;
  picks: string;
  stake: number;
  status: "won" | "lost" | "pending";
  statusLabel: string;
  pnl: number;
  result: string;
  settlementNote: string;
}

type HistoryFilter = "all" | "recharge" | "rewards";

interface HistoryEntry {
  id: string;
  type: "bet" | "recharge" | "reward";
  typeLabel: string;
  title: string;
  detail: string;
  dateLabel: string;
  statusLabel: string;
  statusClass: string;
  amountLabel: string;
  pointsLabel: string;
  pointsClass: string;
  borderClass: string;
  note?: string;
  reference?: string | null;
  sortTime: number;
}

export function History() {
  const { user, points } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [status, setStatus] = useState("Loading bets...");
  const [charges, setCharges] = useState<PointChargeHistoryRow[]>([]);
  const [chargeStatus, setChargeStatus] = useState("Loading charge history...");
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryRow[]>([]);
  const [rewardHistoryStatus, setRewardHistoryStatus] = useState("Loading reward history...");
  const [rewardPoints, setRewardPoints] = useState(0);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");
  const [pointAudit, setPointAudit] = useState<PointReconciliation | null>(null);
  const [pointAuditStatus, setPointAuditStatus] = useState("Loading balance audit...");

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
        const rowsWithDisplayResults = await attachDisplayResults(rows);
        if (cancelled) return;
        const nextBets = rowsWithDisplayResults.map(mapBetRow);
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

  useEffect(() => {
    let cancelled = false;

    async function loadCharges() {
      if (!user) {
        setCharges([]);
        setChargeStatus("Please login to view your charge history");
        return;
      }

      try {
        const rows = await listPointChargeHistory();
        if (cancelled) return;
        setCharges(rows);
        setChargeStatus(rows.length ? "" : "No charges yet");
      } catch (error) {
        if (!cancelled) {
          setCharges([]);
          setChargeStatus(error instanceof Error ? error.message : "Could not load charge history.");
        }
      }
    }

    void loadCharges();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadRewards() {
      if (!user) {
        setRewardPoints(0);
        setRewardHistory([]);
        setRewardHistoryStatus("Please login to view your reward history");
        return;
      }

      try {
        const row = await getRialoStakingStatus();
        if (cancelled) return;
        setRewardPoints(Number(row?.total_points_earned ?? 0));
      } catch {
        if (!cancelled) setRewardPoints(0);
      }

      try {
        const rows = await listRewardHistory();
        if (cancelled) return;
        setRewardHistory(rows);
        setRewardHistoryStatus(rows.length ? "" : "No rewards yet");
      } catch (error) {
        if (!cancelled) {
          setRewardHistory([]);
          setRewardHistoryStatus(error instanceof Error ? error.message : "Could not load reward history.");
        }
      }
    }

    void loadRewards();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPointAudit() {
      if (!user) {
        setPointAudit(null);
        setPointAuditStatus("Please login to audit your points");
        return;
      }

      try {
        const audit = await getPointReconciliation();
        if (cancelled) return;
        setPointAudit(audit);
        setPointAuditStatus(audit ? "" : "No audit available");
      } catch (error) {
        if (!cancelled) {
          setPointAudit(null);
          setPointAuditStatus(error instanceof Error ? error.message : "Could not audit points.");
        }
      }
    }

    void loadPointAudit();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totalBets = bets.length;
  const won = bets.filter((b) => b.status === "won").length;
  const lost = bets.filter((b) => b.status === "lost").length;
  const totalPnL = bets.reduce((sum, b) => sum + b.pnl, 0);
  const rechargePoints = charges
    .filter((charge) => String(charge.status ?? "").toLowerCase() === "paid")
    .reduce((sum, charge) => sum + Number(charge.points ?? 0), 0);
  const usedPoints = bets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalBalance = user ? pointAudit?.summary.currentBalance ?? points : 0;
  const historyEntries = [
    ...bets.map(mapBetHistoryEntry),
    ...charges.map(mapChargeHistoryEntry),
    ...rewardHistory.map(mapRewardHistoryEntry)
  ].sort((a, b) => b.sortTime - a.sortTime);
  const visibleHistoryEntries = activeFilter === "all"
    ? historyEntries
    : historyEntries.filter((entry) => entry.type === (activeFilter === "recharge" ? "recharge" : "reward"));
  const historyMessage = getHistoryMessage({
    activeFilter,
    user: Boolean(user),
    visibleCount: visibleHistoryEntries.length,
    betStatus: status,
    chargeStatus,
    rewardHistoryStatus
  });
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">History</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">My History</h1>
          <p className="text-sm text-[#8a5a44]">
            All placed bets, match targets, results, charges, rewards, and payout records.
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <button
            type="button"
            aria-pressed={activeFilter === "recharge"}
            onClick={() => setActiveFilter(activeFilter === "recharge" ? "all" : "recharge")}
            className={`p-4 text-left rounded-lg border transition-colors ${
              activeFilter === "recharge"
                ? "bg-[#ffedd5] border-[#9a3412]"
                : "bg-white border-[#fed7aa] hover:border-[#9a3412]"
            }`}
          >
            <div className="text-xs text-[#8a5a44] mb-2">Recharge</div>
            <div className="text-2xl text-[#9a3412]">{rechargePoints.toLocaleString()} pts</div>
          </button>

          <button
            type="button"
            aria-pressed={activeFilter === "rewards"}
            onClick={() => setActiveFilter(activeFilter === "rewards" ? "all" : "rewards")}
            className={`p-4 text-left rounded-lg border transition-colors ${
              activeFilter === "rewards"
                ? "bg-[#ffedd5] border-[#9a3412]"
                : "bg-white border-[#fed7aa] hover:border-[#9a3412]"
            }`}
          >
            <div className="text-xs text-[#8a5a44] mb-2">Rewards</div>
            <div className="text-2xl text-[#9a3412]">{rewardPoints.toLocaleString()} pts</div>
          </button>

          <div className="p-4 bg-white rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Used</div>
            <div className="text-2xl text-[#c62828]">-{usedPoints.toLocaleString()} pts</div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-[#fed7aa]">
            <div className="text-xs text-[#8a5a44] mb-2">Total Balance</div>
            <div className="text-2xl text-[#9a3412]">{user ? totalBalance.toLocaleString() : "--"} pts</div>
          </div>
        </div>

        {pointAudit ? (
          <div className="mb-6 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4">
            <div className="mb-4">
              <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Balance Audit</span>
              <h2 className="text-lg text-[#9a3412] mt-1">Point Reconciliation</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Current Balance</div>
                <div className="text-sm text-[#9a3412]">{pointAudit.summary.currentBalance.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Known Activity Net</div>
                <div className="text-sm text-[#9a3412]">{formatSignedPoints(pointAudit.summary.knownActivityNet)}</div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Bet Net</div>
                <div className={`text-sm ${pointAudit.summary.betNet >= 0 ? "text-[#15803d]" : "text-[#c62828]"}`}>
                  {formatSignedPoints(pointAudit.summary.betNet)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Bet Stake</div>
                <div className="text-sm text-[#c62828]">-{pointAudit.summary.betStake.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Bet Payout</div>
                <div className="text-sm text-[#15803d]">+{pointAudit.summary.betPayout.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Recharge + Rewards</div>
                <div className="text-sm text-[#9a3412]">
                  +{(pointAudit.summary.rechargePoints + pointAudit.summary.rewardPoints).toLocaleString()} pts
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8a5a44] mb-1">Lotto Net</div>
                <div className={`text-sm ${pointAudit.summary.lottoNet >= 0 ? "text-[#15803d]" : "text-[#c62828]"}`}>
                  {formatSignedPoints(pointAudit.summary.lottoNet)}
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-[#8a5a44]">
              Known Activity Net = Recharge + Rewards + Bet Payout - Bet Stake + Lotto Net.
            </div>
          </div>
        ) : pointAuditStatus && user ? (
          <div className="mb-6 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#8a5a44]">
            {pointAuditStatus}
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs text-[#8a5a44] uppercase tracking-wide">History Records</span>
            <h2 className="text-xl text-[#9a3412] mt-1">
              {activeFilter === "recharge" ? "Recharge History" : activeFilter === "rewards" ? "Rewards History" : "All History"}
            </h2>
          </div>
          {activeFilter !== "all" && (
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="h-9 rounded-md border border-[#fed7aa] px-3 text-sm text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed]"
            >
              All History
            </button>
          )}
        </div>

        {historyMessage ? (
          <div className="py-12 text-center text-[#8a5a44]">{historyMessage}</div>
        ) : (
          <div className="space-y-3">
            {visibleHistoryEntries.map((entry) => (
              <div key={entry.id} className={`rounded-lg border p-4 ${entry.borderClass}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Type</div>
                    <div className="text-sm text-[#9a3412]">{entry.typeLabel}</div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="text-xs text-[#8a5a44] mb-1">Details</div>
                    <div className="text-sm text-[#9a3412]">{entry.title}</div>
                    <div className="mt-1 text-xs text-[#8a5a44]">{entry.detail}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Date</div>
                    <div className="text-sm text-[#9a3412]">{entry.dateLabel}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Status</div>
                    <div className={`text-sm font-medium ${entry.statusClass}`}>{entry.statusLabel}</div>
                  </div>

                  <div className="md:col-span-1">
                    <div className="text-xs text-[#8a5a44] mb-1">Amount</div>
                    <div className="text-sm text-[#9a3412]">{entry.amountLabel}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-[#8a5a44] mb-1">Points</div>
                    <div className={`text-sm font-medium ${entry.pointsClass}`}>{entry.pointsLabel}</div>
                  </div>
                </div>
                {(entry.note || entry.reference) && (
                  <div className="mt-3 truncate text-xs text-[#8a5a44]">
                    {entry.note || `Ref: ${entry.reference}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type BetRowWithDisplayResult = BetRow & {
  display_result?: RaceResultRow | null;
};

async function attachDisplayResults(rows: BetRow[]) {
  const rowsMissingDisplayResult = rows.filter((row) => !row.first_place && row.market_id && row.target_race_started_at);
  if (!rowsMissingDisplayResult.length) return rows as BetRowWithDisplayResult[];

  const marketIds = [...new Set(rowsMissingDisplayResult.map((row) => row.market_id))];
  const resultEntries = await Promise.all(
    marketIds.map(async (marketId) => {
      try {
        return [marketId, await listRaceResults(marketId, 50)] as const;
      } catch {
        return [marketId, []] as const;
      }
    })
  );
  const resultsByMarket = new Map(resultEntries);

  return rows.map((row) => {
    if (row.first_place || !row.market_id || !row.target_race_started_at) return row;
    return {
      ...row,
      display_result: findDisplayResult(row, resultsByMarket.get(row.market_id) ?? [])
    };
  });
}

function findDisplayResult(row: BetRow, results: RaceResultRow[]) {
  const targetTime = new Date(row.target_race_started_at ?? "").getTime();
  if (!Number.isFinite(targetTime)) return null;

  const exactResult = results.find((result) => result.race_started_at === row.target_race_started_at);
  if (exactResult) return exactResult;

  let nearestResult: RaceResultRow | null = null;
  let nearestDistanceMs = Number.POSITIVE_INFINITY;
  for (const result of results) {
    const resultTime = new Date(result.race_started_at).getTime();
    const distanceMs = Math.abs(resultTime - targetTime);
    if (distanceMs < nearestDistanceMs) {
      nearestResult = result;
      nearestDistanceMs = distanceMs;
    }
  }

  return nearestDistanceMs <= 30_000 ? nearestResult : null;
}

function mapBetRow(row: BetRowWithDisplayResult): Bet {
  const pnl = Number(row.payout_points ?? 0) - Number(row.stake_points ?? 0);
  const status = row.status === "won" || row.status === "lost" ? row.status : "pending";
  const market = getMarketById(row.market_id)?.name ?? row.market_id ?? "-";
  const isFinishTimeBet = row.bet_type === "finish_time";
  const finishThresholdSeconds = Number(row.finish_threshold_seconds ?? 57);
  const finishSymbol = row.finish_time_symbol ?? "Race";
  const displayResult = row.display_result;
  const firstPlace = row.first_place ?? displayResult?.first_place ?? null;
  const secondPlace = row.second_place ?? displayResult?.second_place ?? null;
  const thirdPlace = row.third_place ?? displayResult?.third_place ?? null;
  const fourthPlace = row.fourth_place ?? displayResult?.fourth_place ?? null;
  const finishDurationSeconds = getFinishDurationSeconds(row, displayResult);
  const picks = isFinishTimeBet
    ? `Finish: ${finishSymbol} ${row.finish_time_pick === "over" ? `over ${finishThresholdSeconds}s` : `${finishThresholdSeconds}s or less`}`
    : [
        row.first_pick ? `1st: ${row.first_pick}` : null,
        row.second_pick ? `2nd: ${row.second_pick}` : null,
        row.third_pick ? `3rd: ${row.third_pick}` : null
      ].filter(Boolean).join(", ");
  const result = isFinishTimeBet
    ? finishDurationSeconds != null
      ? `Finished in ${finishDurationSeconds.toFixed(1)}s`
      : getSettledResultLabel(row, picks)
    : firstPlace
      ? `1.${firstPlace} 2.${secondPlace} 3.${thirdPlace} 4.${fourthPlace}`
      : getSettledResultLabel(row, picks);

  return {
    id: row.bet_id,
    market,
    raceTime: formatKstDate(row.target_race_started_at),
    createdAt: row.created_at,
    picks: picks || "-",
    stake: Number(row.stake_points ?? 0),
    status,
    statusLabel: formatBetStatusLabel(row.status),
    pnl,
    result,
    settlementNote: getSettlementNote(row, displayResult)
  };
}

function mapBetHistoryEntry(bet: Bet): HistoryEntry {
  return {
    id: `bet-${bet.id}`,
    type: "bet",
    typeLabel: "Bet",
    title: bet.market,
    detail: `Race: ${bet.raceTime} / Picks: ${bet.picks} / Result: ${bet.result}`,
    dateLabel: formatKstDate(bet.createdAt),
    statusLabel: bet.statusLabel,
    statusClass: getBetStatusClass(bet.status),
    amountLabel: `${bet.stake.toLocaleString()} pts`,
    pointsLabel: `${bet.pnl >= 0 ? "+" : ""}${bet.pnl.toLocaleString()} pts`,
    pointsClass: bet.pnl >= 0 ? "text-[#9a3412]" : "text-[#c62828]",
    borderClass: bet.status === "won"
      ? "bg-[#ffedd5] border-[#9a3412]"
      : bet.status === "lost"
        ? "bg-[#ffebee] border-[#c62828]"
        : "bg-[#fff7ed] border-[#fed7aa]",
    note: bet.settlementNote,
    sortTime: getSortTime(bet.createdAt)
  };
}

function mapChargeHistoryEntry(charge: PointChargeHistoryRow): HistoryEntry {
  const normalizedStatus = String(charge.status ?? "").toLowerCase();
  const credited = normalizedStatus === "paid";

  return {
    id: `charge-${charge.method}-${charge.id}`,
    type: "recharge",
    typeLabel: "Recharge",
    title: charge.label,
    detail: `Package: ${getPointPackageName(charge.packageId)}`,
    dateLabel: formatKstDate(charge.completedAt || charge.createdAt),
    statusLabel: formatChargeStatus(charge.status),
    statusClass: getChargeStatusClass(charge.status),
    amountLabel: charge.amount,
    pointsLabel: `${credited ? "+" : ""}${Number(charge.points ?? 0).toLocaleString()} pts`,
    pointsClass: credited ? "text-[#15803d]" : "text-[#9a3412]",
    borderClass: credited ? "bg-[#f0fdf4] border-[#86efac]" : "bg-[#fff7ed] border-[#fed7aa]",
    reference: charge.reference,
    sortTime: getSortTime(charge.completedAt || charge.createdAt)
  };
}

function mapRewardHistoryEntry(reward: RewardHistoryRow): HistoryEntry {
  return {
    id: `reward-${reward.id}`,
    type: "reward",
    typeLabel: "Reward",
    title: reward.label,
    detail: "$RIALO staking claim",
    dateLabel: formatKstDate(reward.createdAt),
    statusLabel: formatRewardStatus(reward.status),
    statusClass: "text-[#15803d]",
    amountLabel: reward.amountRialo > 0 ? `${reward.amountRialo.toLocaleString()} RIALO` : "-",
    pointsLabel: `+${Number(reward.points ?? 0).toLocaleString()} pts`,
    pointsClass: "text-[#15803d]",
    borderClass: "bg-[#f0fdf4] border-[#86efac]",
    reference: reward.reference,
    sortTime: getSortTime(reward.createdAt)
  };
}

function getHistoryMessage(params: {
  activeFilter: HistoryFilter;
  user: boolean;
  visibleCount: number;
  betStatus: string;
  chargeStatus: string;
  rewardHistoryStatus: string;
}) {
  if (!params.user) return "Please login to view your history";
  if (params.visibleCount) return "";
  if (params.activeFilter === "recharge") return params.chargeStatus || "No recharge history yet";
  if (params.activeFilter === "rewards") return params.rewardHistoryStatus || "No rewards yet";
  if (params.betStatus.startsWith("Loading") || params.chargeStatus.startsWith("Loading") || params.rewardHistoryStatus.startsWith("Loading")) {
    return "Loading history...";
  }
  return "No history yet";
}

function getSettledResultLabel(row: BetRow, picks: string) {
  const rawStatus = String(row.status ?? "").toLowerCase();
  if (rawStatus === "won") {
    return picks && picks !== "-" ? `Won: ${picks}` : "Won";
  }
  if (rawStatus === "lost") {
    return picks && picks !== "-" ? `Lost: ${picks}` : "Lost";
  }
  return "Waiting for result";
}

function getFinishDurationSeconds(row: BetRow, displayResult: RaceResultRow | null | undefined) {
  if (row.finish_duration_seconds != null) return Number(row.finish_duration_seconds);

  const symbol = row.finish_time_symbol;
  const comparedElapsedMs = symbol ? Number(displayResult?.compared_finish_elapsed_ms?.[symbol]) : 0;
  if (comparedElapsedMs > 0) return comparedElapsedMs / 1000;

  const startedAt = displayResult?.race_started_at ? new Date(displayResult.race_started_at).getTime() : 0;
  const finishedAt = displayResult?.race_finished_at ? new Date(displayResult.race_finished_at).getTime() : 0;
  if (startedAt && finishedAt && finishedAt >= startedAt) return (finishedAt - startedAt) / 1000;

  return null;
}

function formatBetStatusLabel(status: string) {
  const normalizedStatus = String(status ?? "").toLowerCase();
  if (normalizedStatus === "won") return "Won";
  if (normalizedStatus === "lost") return "Lost";
  if (normalizedStatus === "placed") return "Pending";
  return normalizedStatus ? normalizedStatus.toUpperCase() : "Pending";
}

function getBetStatusClass(status: Bet["status"]) {
  if (status === "won") return "text-[#15803d]";
  if (status === "lost") return "text-[#c62828]";
  return "text-[#9a3412]";
}

function getSettlementNote(row: BetRowWithDisplayResult, displayResult: RaceResultRow | null | undefined) {
  const rawStatus = String(row.status ?? "").toLowerCase();
  if (rawStatus !== "placed") return "";
  if (row.first_place || row.race_finished_at || displayResult) return "";
  return "No matching race result has been found for this bet target yet.";
}

function getPointPackageName(packageId: PointPackageId | string | null) {
  return POINT_PACKAGES.find((pointPackage) => pointPackage.id === packageId)?.name ?? packageId ?? "-";
}

function formatChargeStatus(status: string) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "paid") return "Paid";
  if (normalizedStatus === "pending") return "Pending";
  if (normalizedStatus === "cancelled") return "Cancelled";
  return normalizedStatus ? normalizedStatus.toUpperCase() : "-";
}

function formatRewardStatus(status: string) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "claimed") return "Claimed";
  return normalizedStatus ? normalizedStatus.toUpperCase() : "Claimed";
}

function getChargeStatusClass(status: string) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "paid") return "text-[#15803d]";
  if (normalizedStatus === "pending") return "text-[#9a3412]";
  return "text-[#c62828]";
}

function getSortTime(timestamp: string | null | undefined) {
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function formatSignedPoints(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString()} pts`;
}

function formatKstDate(timestamp: string | null | undefined) {
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

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
import { listSlotBets, type SlotBetRecord } from "../lib/slotBets";

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
  kind?: "race" | "slot";
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
        const [raceRows, slotRows] = await Promise.all([
          listBetsWithSession(),
          listSlotBets(80).catch(() => [] as SlotBetRecord[])
        ]);
        const rowsWithDisplayResults = await attachDisplayResults(raceRows);
        if (cancelled) return;
        const nextBets = [
          ...rowsWithDisplayResults.map(mapBetRow),
          ...slotRows.map(mapSlotBetRow)
        ].sort((a, b) => getSortTime(b.createdAt) - getSortTime(a.createdAt));
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
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <span className="text-xs uppercase tracking-[0.08em] text-[#8f949b]">History</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-[0.04em] text-[#f2f3f4]">My History</h1>
        <p className="mt-1 text-sm text-[#8f949b]">
          Race bets, slot bets, charges, rewards, and payout records.
        </p>
      </div>

      <section className="mb-6 rounded-[14px] border border-white/10 bg-[linear-gradient(160deg,rgba(17,19,21,.72),rgba(8,9,10,.8))] p-6">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Total Bets</div>
            <div className="text-2xl text-[#f2f3f4]">{totalBets}</div>
          </div>
          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Won</div>
            <div className="text-2xl text-[#83c552]">{won}</div>
          </div>
          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Lost</div>
            <div className="text-2xl text-[#e65a46]">{lost}</div>
          </div>
          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">PnL</div>
            <div className={`flex items-center gap-1 text-2xl ${totalPnL >= 0 ? "text-[#83c552]" : "text-[#e65a46]"}`}>
              {totalPnL >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {totalPnL >= 0 ? "+" : ""}
              {totalPnL} pts
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <button
            type="button"
            aria-pressed={activeFilter === "recharge"}
            onClick={() => setActiveFilter(activeFilter === "recharge" ? "all" : "recharge")}
            className={`rounded-[11px] border p-4 text-left transition-colors ${
              activeFilter === "recharge"
                ? "border-[#ff7a00] bg-[rgba(255,122,0,.16)]"
                : "border-white/10 bg-[#111315] hover:border-[rgba(255,122,0,.55)]"
            }`}
          >
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Recharge</div>
            <div className="text-2xl text-[#ff7a00]">{rechargePoints.toLocaleString()} pts</div>
          </button>

          <button
            type="button"
            aria-pressed={activeFilter === "rewards"}
            onClick={() => setActiveFilter(activeFilter === "rewards" ? "all" : "rewards")}
            className={`rounded-[11px] border p-4 text-left transition-colors ${
              activeFilter === "rewards"
                ? "border-[#ff7a00] bg-[rgba(255,122,0,.16)]"
                : "border-white/10 bg-[#111315] hover:border-[rgba(255,122,0,.55)]"
            }`}
          >
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Rewards</div>
            <div className="text-2xl text-[#ff7a00]">{rewardPoints.toLocaleString()} pts</div>
          </button>

          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Used</div>
            <div className="text-2xl text-[#e65a46]">-{usedPoints.toLocaleString()} pts</div>
          </div>

          <div className="rounded-[11px] border border-white/10 bg-[#111315] p-4">
            <div className="mb-2 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Total Balance</div>
            <div className="text-2xl text-[#f2f3f4]">{user ? totalBalance.toLocaleString() : "--"} pts</div>
          </div>
        </div>

        {pointAudit ? (
          <div className="mb-6 rounded-[11px] border border-white/10 bg-[#0d0f11] p-4">
            <div className="mb-4">
              <span className="text-xs uppercase tracking-[0.08em] text-[#8f949b]">Balance Audit</span>
              <h2 className="mt-1 flex items-center gap-2 text-lg tracking-[0.04em] text-[#f2f3f4]">
                <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#ff7a00]" />
                Point Reconciliation
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Current Balance</div>
                <div className="text-sm text-[#f2f3f4]">{pointAudit.summary.currentBalance.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Known Activity Net</div>
                <div className="text-sm text-[#f2f3f4]">{formatSignedPoints(pointAudit.summary.knownActivityNet)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Bet Net</div>
                <div className={`text-sm ${pointAudit.summary.betNet >= 0 ? "text-[#83c552]" : "text-[#e65a46]"}`}>
                  {formatSignedPoints(pointAudit.summary.betNet)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Bet Stake</div>
                <div className="text-sm text-[#e65a46]">-{pointAudit.summary.betStake.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Bet Payout</div>
                <div className="text-sm text-[#83c552]">+{pointAudit.summary.betPayout.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Recharge + Rewards</div>
                <div className="text-sm text-[#ff7a00]">
                  +{(pointAudit.summary.rechargePoints + pointAudit.summary.rewardPoints).toLocaleString()} pts
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-[#8f949b]">Lotto Net</div>
                <div className={`text-sm ${pointAudit.summary.lottoNet >= 0 ? "text-[#83c552]" : "text-[#e65a46]"}`}>
                  {formatSignedPoints(pointAudit.summary.lottoNet)}
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-[#8f949b]">
              Known Activity Net = Recharge + Rewards + Bet Payout - Bet Stake + Lotto Net.
            </div>
          </div>
        ) : pointAuditStatus && user ? (
          <div className="mb-6 rounded-[11px] border border-white/10 bg-[#0d0f11] p-4 text-sm text-[#8f949b]">
            {pointAuditStatus}
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs uppercase tracking-[0.08em] text-[#8f949b]">History Records</span>
            <h2 className="mt-1 flex items-center gap-2 text-xl tracking-[0.04em] text-[#f2f3f4]">
              <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#ff7a00]" />
              {activeFilter === "recharge"
                ? "Recharge History"
                : activeFilter === "rewards"
                  ? "Rewards History"
                  : "All History"}
            </h2>
          </div>
          {activeFilter !== "all" && (
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className="h-9 rounded-[8px] border border-white/10 bg-[#111315] px-3 text-sm text-[#aeb1b5] transition-colors hover:border-[rgba(255,122,0,.55)] hover:text-[#f2f3f4]"
            >
              All History
            </button>
          )}
        </div>

        {historyMessage ? (
          <div className="py-12 text-center text-[#8f949b]">{historyMessage}</div>
        ) : (
          <div className="space-y-3">
            {visibleHistoryEntries.map((entry) => (
              <div key={entry.id} className={`rounded-[11px] border p-4 ${entry.borderClass}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Type</div>
                    <div className="text-sm text-[#f2f3f4]">{entry.typeLabel}</div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Details</div>
                    <div className="text-sm text-[#f2f3f4]">{entry.title}</div>
                    <div className="mt-1 text-xs text-[#8f949b]">{entry.detail}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Date</div>
                    <div className="text-sm text-[#f2f3f4]">{entry.dateLabel}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Status</div>
                    <div className={`text-sm font-medium ${entry.statusClass}`}>{entry.statusLabel}</div>
                  </div>

                  <div className="md:col-span-1">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Amount</div>
                    <div className="text-sm text-[#f2f3f4]">{entry.amountLabel}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8f949b]">Points</div>
                    <div className={`text-sm font-medium ${entry.pointsClass}`}>{entry.pointsLabel}</div>
                  </div>
                </div>
                {(entry.note || entry.reference) && (
                  <div className="mt-3 truncate text-xs text-[#8f949b]">
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
    settlementNote: getSettlementNote(row, displayResult),
    kind: "race"
  };
}

function mapSlotBetRow(row: SlotBetRecord): Bet {
  const status = row.status === "won" || row.status === "lost" ? row.status : "pending";
  const payout = Number(row.payout ?? 0);
  const stake = Number(row.stake ?? 0);
  const pnl = payout - stake;
  const roundLabel = formatSlotRoundLabel(row.roundId);

  return {
    id: `slot-${row.id || `${row.roundId}-${row.createdAt}`}`,
    market: "Rialo Slot",
    raceTime: roundLabel,
    createdAt: row.createdAt ?? row.settledAt,
    picks: "DOGE / XRP / ETH · 5 lines",
    stake,
    status,
    statusLabel: status === "pending" ? "Open" : formatBetStatusLabel(status),
    pnl,
    result:
      status === "won"
        ? `Paid ${payout.toLocaleString()} pts`
        : status === "lost"
          ? "Paid 0 pts"
          : "Waiting for VPS settle",
    settlementNote:
      status === "pending"
        ? `Open wager on slot round ${roundLabel}`
        : `Settled slot round ${roundLabel}`,
    kind: "slot"
  };
}

function mapBetHistoryEntry(bet: Bet): HistoryEntry {
  const isSlot = bet.kind === "slot";
  return {
    id: isSlot ? bet.id : `bet-${bet.id}`,
    type: "bet",
    typeLabel: isSlot ? "Slot" : "Bet",
    title: bet.market,
    detail: isSlot
      ? `Round: ${bet.raceTime} / ${bet.picks} / ${bet.result}`
      : `Race: ${bet.raceTime} / Picks: ${bet.picks} / Result: ${bet.result}`,
    dateLabel: formatKstDate(bet.createdAt),
    statusLabel: bet.statusLabel,
    statusClass: getBetStatusClass(bet.status),
    amountLabel: `${bet.stake.toLocaleString()} pts`,
    pointsLabel:
      bet.status === "pending"
        ? "Pending"
        : `${bet.pnl >= 0 ? "+" : ""}${bet.pnl.toLocaleString()} pts`,
    pointsClass:
      bet.status === "pending"
        ? "text-[#ff7a00]"
        : bet.pnl >= 0
          ? "text-[#83c552]"
          : "text-[#e65a46]",
    borderClass:
      bet.status === "won"
        ? "border-[rgba(131,197,82,.45)] bg-[rgba(131,197,82,.10)]"
        : bet.status === "lost"
          ? "border-[rgba(230,90,70,.45)] bg-[rgba(230,90,70,.10)]"
          : "border-white/10 bg-[#111315]",
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
    pointsClass: credited ? "text-[#ff7a00]" : "text-[#8f949b]",
    borderClass: credited
      ? "border-[rgba(255,122,0,.55)] bg-[rgba(255,122,0,.12)]"
      : "border-white/10 bg-[#111315]",
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
    statusClass: "text-[#83c552]",
    amountLabel: reward.amountRialo > 0 ? `${reward.amountRialo.toLocaleString()} RIALO` : "-",
    pointsLabel: `+${Number(reward.points ?? 0).toLocaleString()} pts`,
    pointsClass: "text-[#83c552]",
    borderClass: "border-[rgba(131,197,82,.45)] bg-[rgba(131,197,82,.10)]",
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
  if (status === "won") return "text-[#83c552]";
  if (status === "lost") return "text-[#e65a46]";
  return "text-[#ff7a00]";
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
  if (normalizedStatus === "paid") return "text-[#ff7a00]";
  if (normalizedStatus === "pending") return "text-[#8f949b]";
  return "text-[#e65a46]";
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

function formatSlotRoundLabel(roundId: number) {
  if (!Number.isFinite(roundId)) return "-";
  return `${new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(roundId))} KST`;
}

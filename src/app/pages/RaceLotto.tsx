import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { RefreshCcw, Ticket, Trophy } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getMarketById } from "../data/markets";
import { tokens } from "../data/tokens";
import {
  createRaceLottoTicket,
  getRaceLottoDashboard,
  settleRaceLottoRound
} from "../lib/raceLotto";
import type { RaceLottoRound, RaceLottoSlot, RaceLottoTicket } from "../lib/raceLotto";

const symbolMap = new Map(tokens.map((token) => [token.symbol, token]));
const DEFAULT_TICKET_PRICE_POINTS = 100;
type TicketSlotView = Pick<RaceLottoSlot, "slot"> & Partial<RaceLottoSlot>;

export function RaceLotto() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const [rounds, setRounds] = useState<RaceLottoRound[]>([]);
  const [tickets, setTickets] = useState<RaceLottoTicket[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading Race-Lotto...");
  const [isBusy, setIsBusy] = useState(false);

  const selectedRound = useMemo(() => {
    return rounds.find((round) => round.id === selectedRoundId) ?? rounds[0] ?? null;
  }, [rounds, selectedRoundId]);
  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.round_id === selectedRound?.id) ?? null;
  }, [tickets, selectedRound]);
  const displayRounds = useMemo(() => getDisplayRounds(rounds), [rounds]);
  const pickCount = selectedRound?.slots.filter((slot) => picks[String(slot.slot)]).length ?? 0;
  const isLocked = Boolean(selectedTicket) || selectedRound?.status !== "open";
  const canSubmit = Boolean(user && selectedRound && !selectedTicket && selectedRound.status === "open" && pickCount === 6 && !isBusy);

  useEffect(() => {
    void loadDashboard();
  }, [user]);

  async function loadDashboard(nextStatus = "") {
    try {
      setIsBusy(true);
      if (!nextStatus) setStatus("Loading Race-Lotto...");
      const dashboard = await getRaceLottoDashboard();
      setRounds(dashboard.rounds);
      setTickets(dashboard.tickets);
      if (Number.isFinite(Number(dashboard.pointsBalance))) {
        setPointsBalance(Number(dashboard.pointsBalance));
      }
      const nextRound =
        dashboard.rounds.find((round) => round.id === selectedRoundId) ??
        dashboard.rounds.find((round) => round.status === "open") ??
        dashboard.rounds.find((round) => round.status === "ready") ??
        dashboard.rounds[0] ??
        null;
      setSelectedRoundId(nextRound?.id ?? null);
      const nextTicket = dashboard.tickets.find((ticket) => ticket.round_id === nextRound?.id) ?? null;
      setPicks(nextTicket?.picks ? { ...nextTicket.picks } : {});
      setStatus(nextStatus || (dashboard.rounds.length ? "Race-Lotto synced." : "No Race-Lotto draw available."));
    } catch (error) {
      setRounds([]);
      setTickets([]);
      setStatus(error instanceof Error ? error.message : "Race-Lotto could not be loaded.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSubmitTicket() {
    if (!selectedRound) return;
    if (!user) {
      setStatus("Login required before entering Race-Lotto.");
      return;
    }
    if (pickCount !== 6) {
      setStatus("Pick all six entries.");
      return;
    }

    try {
      setIsBusy(true);
      const result = await createRaceLottoTicket(selectedRound.id, picks);
      if (Number.isFinite(Number(result?.points_balance))) {
        setPointsBalance(Number(result?.points_balance));
      }
      await refreshSession();
      await loadDashboard("Ticket saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ticket could not be saved.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSettleRound() {
    if (!selectedRound) return;

    try {
      setIsBusy(true);
      const result = await settleRaceLottoRound(selectedRound.id);
      await refreshSession();
      await loadDashboard(Number(result?.winner_count ?? 0) > 0 ? "Jackpot paid." : "No perfect ticket. Jackpot rolled forward.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Race-Lotto results are not ready.");
    } finally {
      setIsBusy(false);
    }
  }

  function selectPick(slot: number, symbol: string) {
    if (isLocked) return;
    setPicks((current) => ({
      ...current,
      [String(slot)]: symbol
    }));
  }

  function selectRound(roundId: string) {
    const nextRound = rounds.find((round) => round.id === roundId) ?? null;
    setSelectedRoundId(nextRound?.id ?? null);
    const nextTicket = tickets.find((ticket) => ticket.round_id === nextRound?.id) ?? null;
    setPicks(nextTicket?.picks ? { ...nextTicket.picks } : {});
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <section className="mb-6 overflow-hidden rounded-lg border border-[#fed7aa] bg-white">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-6 sm:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-md bg-[#ffedd5] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a3412]">
                Race-Lotto
              </span>
              <span className="rounded-md border border-[#fed7aa] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#8a5a44]">
                {selectedRound ? formatRoundStatus(selectedRound) : "Loading"}
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-[#9a3412] sm:text-4xl">Perfect 6 Jackpot</h1>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Jackpot" value={`${formatInteger(selectedRound?.current_jackpot_points)} pts`} />
              <Metric label="Ticket" value={`${formatInteger(selectedRound?.ticket_price_points ?? DEFAULT_TICKET_PRICE_POINTS)} pts`} />
              <Metric label="Result" value={selectedRound ? formatKstDate(selectedRound.draw_starts_at) : "--"} />
              <Metric label="Balance" value={user ? `${points.toLocaleString()} pts` : "--"} />
            </div>
          </div>
          <div className="relative min-h-[240px] bg-[#171310]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,19,16,0.2),rgba(23,19,16,0.72))]" />
            <div className="absolute bottom-6 left-6 right-6 grid grid-cols-3 gap-3 text-white">
              <MiniMetric label="Base" value={formatInteger(selectedRound?.base_jackpot_points)} />
              <MiniMetric label="Carry" value={formatInteger(selectedRound?.carried_points)} />
              <MiniMetric label="Pool" value={formatInteger(getBaseCarryPool(selectedRound))} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-[#fed7aa] bg-white p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Draw Board</span>
              <h2 className="mt-1 text-xl font-semibold text-[#9a3412]">
                {selectedRound ? selectedRound.draw_name || "Race-Lotto" : "Race-Lotto"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDashboard("Race-Lotto refreshed.")}
                disabled={isBusy}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#fed7aa] px-3 text-sm text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#fff7ed] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
              {selectedRound?.status === "ready" && (
                <button
                  type="button"
                  onClick={() => void handleSettleRound()}
                  disabled={isBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#9a3412] px-3 text-sm text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trophy className="h-4 w-4" />
                  Results
                </button>
              )}
            </div>
          </div>

          {displayRounds.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {displayRounds.map((round) => {
                const active = round.id === selectedRound?.id;
                return (
                  <button
                    type="button"
                    key={round.id}
                    onClick={() => selectRound(round.id)}
                    className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                      active
                        ? "border-[#9a3412] bg-[#9a3412] text-white"
                        : "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412] hover:border-[#9a3412]"
                    }`}
                  >
                    <span className="font-semibold">{formatKstTime(round.draw_starts_at)}</span>
                    <span className={active ? "text-white/75" : "text-[#8a5a44]"}>{formatRoundStatus(round)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Metric label="Sales Open" value={selectedRound ? formatKstTime(selectedRound.sales_open_at) : "--"} />
            <Metric label="Sales Close" value={selectedRound ? formatKstTime(selectedRound.sales_close_at) : "--"} />
            <Metric label="Your Picks" value={`${pickCount} / 6`} />
            <Metric label="Status" value={selectedRound ? formatRoundStatus(selectedRound) : "--"} />
          </div>

          {!selectedRound ? (
            <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-8 text-center text-sm text-[#8a5a44]">
              {status}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {selectedRound.slots.map((slot) => (
                <LottoSlotCard
                  key={slot.slot}
                  round={selectedRound}
                  slot={slot}
                  selectedSymbol={picks[String(slot.slot)]}
                  disabled={isLocked}
                  onSelect={selectPick}
                />
              ))}
            </div>
          )}

          {selectedRound && (
            <div className="mt-5 rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-[#9a3412]">
                    <Ticket className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-base font-semibold text-[#9a3412]">
                      {selectedTicket ? "Ticket placed" : `${pickCount} / 6 selected`}
                    </div>
                    <div className="text-sm text-[#8a5a44]">
                      {formatInteger(selectedRound.ticket_price_points ?? DEFAULT_TICKET_PRICE_POINTS)} pts entry
                    </div>
                  </div>
                </div>
                <span className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-[#9a3412]">
                  {selectedTicket ? formatTicketStatus(selectedTicket) : formatRoundStatus(selectedRound)}
                </span>
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={() => void handleSubmitTicket()}
                  disabled={!canSubmit}
                  className="h-12 w-full rounded-md bg-[#9a3412] px-4 text-base font-semibold text-white transition-colors hover:bg-[#7c2d12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedTicket
                    ? "Ticket Placed"
                    : selectedRound.status === "open"
                      ? "Enter Race-Lotto"
                      : "Round Closed"}
                </button>
              ) : (
                <Link
                  to="/login.html"
                  className="flex h-12 w-full items-center justify-center rounded-md bg-[#9a3412] px-4 text-base font-semibold text-white transition-colors hover:bg-[#7c2d12]"
                >
                  Login
                </Link>
              )}

              <div className="mt-4 rounded-lg border border-[#fed7aa] bg-white p-3 text-sm text-[#8a5a44]">
                {status}
              </div>
            </div>
          )}
        </section>

        <aside className="grid content-start gap-6">
          <TicketHistory tickets={tickets} rounds={rounds} />
        </aside>
      </div>
    </div>
  );
}

function LottoSlotCard({
  round,
  slot,
  selectedSymbol,
  disabled,
  onSelect
}: {
  round: RaceLottoRound;
  slot: RaceLottoRound["slots"][number];
  selectedSymbol: string | undefined;
  disabled: boolean;
  onSelect: (slot: number, symbol: string) => void;
}) {
  const market = getMarketById(slot.market_id);
  const winner = round.winning_picks?.[String(slot.slot)] ?? "";
  const tokenSymbols = slot.coin_ids?.length ? slot.coin_ids : [];

  return (
    <article className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-[#8a5a44]">
            {market ? `Market ${String(market.number).padStart(2, "0")}` : `Race ${slot.slot}`}
          </span>
          <h3 className="mt-1 text-base font-semibold text-[#9a3412]">{market?.name ?? slot.label ?? "Matchup"}</h3>
        </div>
        <span className="rounded-md border border-[#fed7aa] bg-white px-2 py-1 text-xs text-[#8a5a44]">
          {formatKstTime(slot.race_started_at)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tokenSymbols.map((symbol) => {
          const token = symbolMap.get(symbol);
          const selected = selectedSymbol === symbol;
          const isWinner = winner === symbol;
          const missed = winner && selected && !isWinner;

          return (
            <button
              type="button"
              key={symbol}
              onClick={() => onSelect(slot.slot, symbol)}
              disabled={disabled}
              className={`flex min-h-12 items-center gap-2 rounded-md border px-3 text-left transition-colors disabled:cursor-default ${
                isWinner
                  ? "border-[#15803d] bg-[#dcfce7]"
                  : missed
                    ? "border-[#c62828] bg-[#ffebee]"
                    : selected
                      ? "border-[#9a3412] bg-[#9a3412] text-white"
                      : "border-[#fed7aa] bg-white text-[#9a3412] hover:border-[#9a3412]"
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#fed7aa] bg-white">
                {token?.image && <img src={token.image} alt="" className="h-full w-full object-contain" />}
              </span>
              <span className="text-sm font-semibold">{symbol}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function TicketSummary({ round, ticket }: { round: RaceLottoRound | null; ticket: RaceLottoTicket }) {
  const ticketSlots = getTicketSlots(round, ticket);
  const winningPicks = getTicketWinningPicks(round, ticket);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Matched" value={`${Number(ticket.matched_count ?? 0)} / 6`} />
        <Metric label="Stake" value={`${formatInteger(ticket.stake_points)} pts`} />
        <Metric label="Payout" value={`${formatInteger(ticket.payout_points)} pts`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ticketSlots.map((slot) => {
          const pick = ticket.picks?.[String(slot.slot)] ?? "--";
          const winner = winningPicks?.[String(slot.slot)] ?? "";
          const matched = winner && winner === pick;
          const token = symbolMap.get(pick);
          const market = slot.market_id ? getMarketById(slot.market_id) : null;
          const label = market?.name ?? slot.label ?? `Race ${slot.slot}`;
          return (
            <div
              key={slot.slot}
              title={pick}
              aria-label={`Pick ${slot.slot}: ${pick}`}
              className={`grid aspect-square place-items-center rounded-lg border p-3 text-center ${
                matched
                  ? "border-[#86efac] bg-[#f0fdf4]"
                  : winner
                    ? "border-[#fecaca] bg-[#fff1f2]"
                    : "border-[#fed7aa] bg-[#fff7ed]"
              }`}
            >
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#fed7aa] bg-white sm:h-24 sm:w-24">
                {token?.image ? (
                  <img src={token.image} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-[#fed7aa]" />
                )}
              </span>
              <span className="text-xs font-semibold leading-tight text-[#9a3412]">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TicketHistory({ tickets, rounds }: { tickets: RaceLottoTicket[]; rounds: RaceLottoRound[] }) {
  return (
    <section className="rounded-lg border border-[#fed7aa] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <span className="text-xs uppercase tracking-wide text-[#8a5a44]">History</span>
          <h2 className="mt-1 text-xl font-semibold text-[#9a3412]">Entry History</h2>
        </div>
        <span className="rounded-md bg-[#fff7ed] px-3 py-1 text-xs font-semibold text-[#9a3412]">
          {tickets.length}
        </span>
      </div>

      {tickets.length ? (
        <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1">
          {tickets.map((ticket) => (
            <TicketHistoryCard key={ticket.id} ticket={ticket} round={getTicketRound(ticket, rounds)} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#8a5a44]">
          No Race-Lotto entries yet.
        </div>
      )}
    </section>
  );
}

function TicketHistoryCard({ ticket, round }: { ticket: RaceLottoTicket; round: RaceLottoRound | null }) {
  const winningPicks = getTicketWinningPicks(round, ticket);
  const ticketSlots = getTicketSlots(round, ticket);
  const isSettled = Boolean(winningPicks && Object.keys(winningPicks).length);
  const statusTone =
    ticket.status === "won"
      ? "border-[#16a34a] bg-[#f0fdf4] text-[#15803d]"
      : ticket.status === "lost"
        ? "border-[#dc2626] bg-[#fff1f2] text-[#c62828]"
        : "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]";

  return (
    <article className={`rounded-lg border p-3 ${statusTone}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#9a3412]">
            {round?.draw_name ?? ticket.round_draw_name ?? "Race-Lotto"}
          </h3>
          <div className="mt-1 text-xs text-[#8a5a44]">
            {formatKstDate(round?.draw_starts_at ?? ticket.round_draw_starts_at ?? ticket.created_at)}
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${statusTone}`}>
          {formatTicketHistoryStatus(ticket)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MiniHistoryMetric label="Matched" value={`${Number(ticket.matched_count ?? 0)} / 6`} />
        <MiniHistoryMetric label="Stake" value={`${formatInteger(ticket.stake_points)} pts`} />
        <MiniHistoryMetric label="Payout" value={`${formatInteger(ticket.payout_points)} pts`} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ticketSlots.map((slot) => {
          const pick = ticket.picks?.[String(slot.slot)] ?? "--";
          const winner = winningPicks?.[String(slot.slot)] ?? "";
          const matched = Boolean(winner && winner === pick);
          const missed = Boolean(winner && winner !== pick);
          const token = symbolMap.get(pick);
          const market = slot.market_id ? getMarketById(slot.market_id) : null;
          const label = market?.name ?? slot.label ?? `Race ${slot.slot}`;

          return (
            <div
              key={slot.slot}
              title={winner ? `Pick ${pick}, result ${winner}` : `Pick ${pick}`}
              aria-label={`History pick ${slot.slot}: ${pick}`}
              className={`grid min-h-28 place-items-center rounded-lg border p-2 text-center ${
                matched
                  ? "border-[#16a34a] bg-[#ecfdf3]"
                  : missed
                    ? "border-[#dc2626] bg-[#fff1f2]"
                    : "border-[#fed7aa] bg-[#fff7ed]"
              }`}
            >
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-[#fed7aa] bg-white">
                {token?.image ? (
                  <img src={token.image} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="h-3 w-3 rounded-full bg-[#fed7aa]" />
                )}
              </span>
              <span className="text-[11px] font-semibold leading-tight text-[#9a3412]">{label}</span>
              {isSettled && (
                <span className={`text-[10px] font-semibold ${matched ? "text-[#15803d]" : "text-[#c62828]"}`}>
                  {matched ? "Hit" : "Miss"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function MiniHistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#fed7aa] bg-white/70 p-2">
      <div className="text-[10px] text-[#8a5a44]">{label}</div>
      <div className="mt-1 text-xs font-semibold text-[#9a3412]">{value}</div>
    </div>
  );
}

function getTicketRound(ticket: RaceLottoTicket, rounds: RaceLottoRound[]) {
  const visibleRound = rounds.find((round) => round.id === ticket.round_id);
  if (visibleRound) return visibleRound;
  if (!ticket.round_draw_starts_at && !ticket.round_slots?.length) return null;

  return {
    id: ticket.round_id,
    draw_key: ticket.round_draw_key ?? ticket.round_id,
    round_date: "",
    draw_name: ticket.round_draw_name ?? "Race-Lotto",
    draw_starts_at: ticket.round_draw_starts_at ?? ticket.created_at,
    sales_close_at: "",
    base_jackpot_points: 0,
    carried_points: 0,
    entry_pool_points: 0,
    current_jackpot_points: 0,
    ticket_price_points: DEFAULT_TICKET_PRICE_POINTS,
    status: ticket.round_status ?? ticket.status,
    slots: ticket.round_slots ?? [],
    winning_picks: ticket.round_winning_picks ?? null,
    winner_count: ticket.round_winner_count ?? 0
  } satisfies RaceLottoRound;
}

function getTicketSlots(round: RaceLottoRound | null, ticket: RaceLottoTicket): TicketSlotView[] {
  if (round?.slots?.length) return round.slots;
  if (ticket.round_slots?.length) return ticket.round_slots;
  return Array.from({ length: 6 }, (_, index) => ({ slot: index + 1 }));
}

function getTicketWinningPicks(round: RaceLottoRound | null, ticket: RaceLottoTicket) {
  return round?.winning_picks ?? ticket.round_winning_picks ?? null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-3">
      <div className="mb-1 text-xs text-[#8a5a44]">{label}</div>
      <div className="text-sm font-semibold text-[#9a3412]">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function formatRoundStatus(round: RaceLottoRound) {
  return round.status === "open" ? "Open" : "Closed";
}

function formatTicketStatus(ticket: RaceLottoTicket) {
  if (ticket.status === "won") return "Winner";
  if (ticket.status === "lost") return "Settled";
  return "Placed";
}

function formatTicketHistoryStatus(ticket: RaceLottoTicket) {
  if (ticket.status === "won") return "Hit";
  if (ticket.status === "lost") return "Miss";
  if (ticket.status === "refunded") return "Refunded";
  return "Placed";
}

function getBaseCarryPool(round: RaceLottoRound | null) {
  return Number(round?.base_jackpot_points ?? 0) + Number(round?.carried_points ?? 0);
}

function formatInteger(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}

function getDisplayRounds(rounds: RaceLottoRound[]) {
  const byDrawTime = new Map<string, RaceLottoRound>();

  for (const round of rounds) {
    const drawTime = formatKstTime(round.draw_starts_at);
    const current = byDrawTime.get(drawTime);
    if (!current || getRoundDisplayPriority(round) < getRoundDisplayPriority(current)) {
      byDrawTime.set(drawTime, round);
    }
  }

  return Array.from(byDrawTime.values()).sort((first, second) => {
    return getKstSortMinutes(first.draw_starts_at) - getKstSortMinutes(second.draw_starts_at);
  });
}

function getRoundDisplayPriority(round: RaceLottoRound) {
  if (round.status === "open") return 0;
  if (round.status === "ready" || round.status === "locked") return 1;
  if (round.status === "settled") return 2;
  return 3;
}

function getKstSortMinutes(timestamp?: string | null) {
  const time = formatKstTime(timestamp);
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
}

function formatKstDate(timestamp?: string | null) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date);
}

function formatKstTime(timestamp?: string | null) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date);
}

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getBinanceMarketFeed,
  type PriceDirection
} from "../lib/paxgFeed";
import {
  boardFromReels,
  CELL_COUNT,
  evaluateClassicPaylines,
  getSymbol,
  LINE_COUNT,
  REEL_COUNT,
  REEL_DRIVERS,
  SLOT_SYMBOLS,
  symbolAt,
  TARGET_RTP,
  totalPayout,
  VISIBLE_ROWS,
  type PaylineWin,
  type SlotSymbolId
} from "../lib/slotRules";
import {
  getLatestSlotRoundTick,
  getSlotRound,
  listRecentSlotRounds,
  listSlotRoundTicksAfter,
  type SlotRoundRecord,
  type SlotRoundTickRecord
} from "../lib/slotOfficial";
import { createSlotBet, listSlotBets, sameSlotRoundId, type SlotBetRecord } from "../lib/slotBets";

const WAIT_MS = 30_000;
const GAME_MS = 120_000;
const CYCLE_MS = WAIT_MS + GAME_MS;
const SAMPLE_MS = 1_000;
const TOTAL_SAMPLES = GAME_MS / SAMPLE_MS;
const HELD_STORAGE_KEY = "xrp-classic-slot-held-v1";
const REEL_GAP_PX = 0;
const REEL_ANIM_MS = 380;

type Phase = "wait" | "game";
type CellState = SlotSymbolId | null | "SPIN";

interface RoundSnapshot {
  roundId: number;
  cells: SlotSymbolId[];
  winCount: number;
  /** Sum of winning linePays — same unit as paytable (e.g. orange = 31). */
  paytableMult: number;
  /** Points paid at 100 total stake preview. */
  payoutPreview: number;
  settled: boolean;
}

interface ReelQuote {
  trade: number | null;
  bid: number | null;
  ask: number | null;
}

interface ReelFrame {
  strips: SlotSymbolId[][];
  offsets: number[];
  prevOffsets: number[];
  moves: Array<PriceDirection | null>;
  tick: number;
  animate: boolean;
}

interface HeldSnapshot {
  sourceRoundId: number;
  cells: SlotSymbolId[];
  reelFrame: ReelFrame;
  wins: PaylineWin[];
  roundPayout: number;
  finalResult: {
    board: SlotSymbolId[];
    wins: PaylineWin[];
    payoutPreview: number;
  };
  endQuotes: ReelQuote[];
  lastMoves: Array<PriceDirection | null>;
  reelSteps: number[];
}

function alignRoundId(nowMs: number) {
  return Math.floor(nowMs / CYCLE_MS) * CYCLE_MS;
}

function loadHeld(): HeldSnapshot | null {
  try {
    const raw = sessionStorage.getItem(HELD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HeldSnapshot;
    if (!parsed?.cells?.length || !parsed?.reelFrame) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveHeld(snapshot: HeldSnapshot) {
  try {
    sessionStorage.setItem(HELD_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota
  }
}

function clearHeldStorage() {
  try {
    sessionStorage.removeItem(HELD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function emptyQuotes(): ReelQuote[] {
  return REEL_DRIVERS.map(() => ({ trade: null, bid: null, ask: null }));
}

function normalizeTrade(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeQuotes(raw: unknown): ReelQuote[] {
  if (!Array.isArray(raw) || raw.length < 3) return emptyQuotes();
  return REEL_DRIVERS.map((_, index) => {
    const row = raw[index];
    const trade =
      row && typeof row === "object" ? normalizeTrade((row as ReelQuote).trade) : null;
    return { trade, bid: null, ask: null };
  });
}

function quotesHaveTrades(quotes: ReelQuote[]): boolean {
  return quotes.some((quote) => quote.trade != null);
}

export function RwaSlot() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const initialHeld = useMemo(() => loadHeld(), []);
  const [endQuotes, setEndQuotes] = useState<ReelQuote[]>(
    () => normalizeQuotes(initialHeld?.endQuotes)
  );
  /** Live Binance fallback so headers never stick on "—" after a visual reset. */
  const [liveHeaderQuotes, setLiveHeaderQuotes] = useState<ReelQuote[]>(emptyQuotes);
  const [cells, setCells] = useState<CellState[]>(
    () => initialHeld?.cells ?? Array(CELL_COUNT).fill(null)
  );
  const [reelFrame, setReelFrame] = useState<ReelFrame | null>(() => initialHeld?.reelFrame ?? null);
  const [filledCount, setFilledCount] = useState(() => (initialHeld ? TOTAL_SAMPLES : 0));
  const [wins, setWins] = useState<PaylineWin[]>(() => initialHeld?.wins ?? []);
  const [roundPayout, setRoundPayout] = useState(() => initialHeld?.roundPayout ?? 0);
  const [bets, setBets] = useState<SlotBetRecord[]>([]);
  const [placingBet, setPlacingBet] = useState(false);
  const [stakeInput, setStakeInput] = useState("100");
  const [message, setMessage] = useState(
    initialHeld
      ? "Previous result held on screen until the next slot starts."
      : "Rialo Slot · wait bets this round · live bets next · VPS settles."
  );
  const [history, setHistory] = useState<RoundSnapshot[]>([]);
  const [historyStatus, setHistoryStatus] = useState("Loading official results…");
  const [lastMoves, setLastMoves] = useState<Array<PriceDirection | null>>(
    () => initialHeld?.lastMoves ?? [null, null, null]
  );
  const [reelSteps, setReelSteps] = useState(() => initialHeld?.reelSteps ?? [0, 0, 0]);
  const [roundFrozen, setRoundFrozen] = useState(() => Boolean(initialHeld));
  const [finalResult, setFinalResult] = useState<HeldSnapshot["finalResult"] | null>(
    () => initialHeld?.finalResult ?? null
  );

  const roundRef = useRef<{
    roundId: number;
    ticks: number;
    strips: SlotSymbolId[][] | null;
    offsets: number[];
    initialOffsets: number[];
    stepCounts: number[];
    settled: boolean;
    uiStarted: boolean;
    boardShown: boolean;
    holdAppliedForRound: number | null;
  } | null>(null);
  const betsRef = useRef(bets);
  const setPointsBalanceRef = useRef(setPointsBalance);
  const refreshSessionRef = useRef(refreshSession);
  /** Decorative WS prices for wait-phase headers only. Live game uses official tick quotes. */
  const liveQuotesRef = useRef<ReelQuote[]>(emptyQuotes());
  const heldRef = useRef<HeldSnapshot | null>(initialHeld);
  const officialSyncRef = useRef<{
    fetchPrevFor: number | null;
    fetchStartFor: number | null;
    fetchingTicks: boolean;
    lastPrevPollMs: number;
    fetchingPrev: boolean;
    lastStripRetryMs: number;
    lastTickPullMs: number;
  }>({
    fetchPrevFor: null,
    fetchStartFor: null,
    fetchingTicks: false,
    lastPrevPollMs: 0,
    fetchingPrev: false,
    lastStripRetryMs: 0,
    lastTickPullMs: 0
  });
  /** Official ticks keyed by tick number — follow backend tip, no wall-clock catch-up. */
  const tickCacheRef = useRef<Map<number, SlotRoundTickRecord>>(new Map());

  function clearTickCache() {
    tickCacheRef.current = new Map();
  }

  function rememberTicks(ticks: SlotRoundTickRecord[]) {
    for (const tick of ticks) {
      if (!tick || !Number.isFinite(tick.tick) || tick.tick < 1) continue;
      tickCacheRef.current.set(tick.tick, tick);
    }
  }

  betsRef.current = bets;
  setPointsBalanceRef.current = setPointsBalance;
  refreshSessionRef.current = refreshSession;

  const roundId = alignRoundId(nowMs);
  const waitEndMs = roundId + WAIT_MS;
  const phase: Phase = nowMs < waitEndMs ? "wait" : "game";
  const nextRoundId = roundId + CYCLE_MS;
  /**
   * Wait (e.g. 27:00→27:30): stake this cycle's game (roundId) — the one that goes live at wait end.
   * Live game: stake the next cycle only.
   */
  const bettingRoundId = phase === "wait" ? roundId : nextRoundId;
  const bettingClosesAt = bettingRoundId + WAIT_MS;
  const phaseEndsAt = phase === "wait" ? waitEndMs : roundId + CYCLE_MS;
  const remainingMs = Math.max(0, phaseEndsAt - nowMs);
  const bettingRemainingMs = Math.max(0, bettingClosesAt - nowMs);

  const openBetForTarget = useMemo(
    () => bets.find((bet) => sameSlotRoundId(bet.roundId, bettingRoundId) && bet.status === "open") ?? null,
    [bets, bettingRoundId]
  );
  /** Bet for the round currently on screen (wait or live) — drives YOUR WAGER. */
  const currentRoundBet = useMemo(
    () => bets.find((bet) => sameSlotRoundId(bet.roundId, roundId)) ?? null,
    [bets, roundId]
  );
  /** Open wagers (any future/current slot) — shown under Cherry as bet times. */
  const openBets = useMemo(
    () =>
      bets
        .filter((bet) => bet.status === "open")
        .sort((a, b) => Number(a.roundId) - Number(b.roundId)),
    [bets]
  );
  const winningIndexes = useMemo(() => new Set(wins.flatMap((win) => win.line)), [wins]);

  useEffect(() => {
    const unsubs = REEL_DRIVERS.map((driver, index) =>
      getBinanceMarketFeed(driver.symbol).subscribe((tick) => {
        // Keep live book in a ref only — UI shows 1s end samples, not ms flicker.
        const next = liveQuotesRef.current.slice();
        next[index] = {
          trade: tick.trade,
          bid: tick.bid,
          ask: tick.ask
        };
        liveQuotesRef.current = next;
      })
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  // Refresh header fallback from Binance once per second (decorative, not official).
  useEffect(() => {
    const pushLiveHeaders = () => {
      const next = REEL_DRIVERS.map((_, index) => {
        const trade = normalizeTrade(liveQuotesRef.current[index]?.trade);
        return { trade, bid: null, ask: null };
      });
      if (quotesHaveTrades(next)) setLiveHeaderQuotes(next);
    };
    pushLiveHeaders();
    const timer = window.setInterval(pushLiveHeaders, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  // Backend bets: poll open/settled wagers for this login session.
  useEffect(() => {
    let cancelled = false;

    async function refreshBets() {
      if (!user) {
        if (!cancelled) setBets([]);
        return;
      }
      try {
        const rows = await listSlotBets();
        if (!cancelled) setBets(rows);
      } catch {
        // keep last known bets
      }
    }

    void refreshBets();
    const timer = window.setInterval(() => void refreshBets(), 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  // When the next round becomes current, refresh bets so YOUR WAGER appears immediately.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void listSlotBets()
      .then((rows) => {
        if (!cancelled) setBets(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, roundId]);

  useEffect(() => {
    let cancelled = false;

    async function refreshOfficialHistory() {
      try {
        const rows = await listRecentSlotRounds(24);
        if (cancelled) return;
        const next = rows
          .filter((row) => row.status === "settled" && row.final_board)
          .map((row) => {
            const board = row.final_board as SlotSymbolId[];
            const wins = Array.isArray(row.payline_wins_at_100) && row.payline_wins_at_100.length
              ? (row.payline_wins_at_100 as PaylineWin[])
              : evaluateClassicPaylines(board, 100);
            return {
              roundId: row.round_id,
              cells: board,
              winCount: wins.length,
              paytableMult: paytableMultFromWins(wins),
              payoutPreview: Number(
                row.payout_preview_100 ?? totalPayout(evaluateClassicPaylines(board, 100))
              ),
              settled: true
            };
          });
        setHistory(next);
        setHistoryStatus(next.length ? "" : "No settled rounds yet.");
      } catch (error) {
        if (cancelled) return;
        setHistoryStatus(error instanceof Error ? error.message : "Could not load results.");
      }
    }

    void refreshOfficialHistory();
    const timer = window.setInterval(() => void refreshOfficialHistory(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // During wait: seed/repair header prices from Binance when official quotes are missing.
  useEffect(() => {
    if (phase !== "wait") return;
    if (quotesHaveTrades(endQuotes)) return;
    const lives = readLiveTrades();
    if (lives.every((live) => live != null)) publishEndQuotes(lives);
  }, [phase, nowMs, endQuotes]);

  function readLiveTrades(): Array<number | null> {
    return REEL_DRIVERS.map((_, index) => normalizeTrade(liveQuotesRef.current[index]?.trade));
  }

  function seedQuotesFromLive(): ReelQuote[] {
    return REEL_DRIVERS.map((_, index) => ({
      trade: normalizeTrade(liveQuotesRef.current[index]?.trade),
      bid: null,
      ask: null
    }));
  }

  function publishEndQuotes(trades: Array<number | null>) {
    setEndQuotes(
      trades.map((trade) => ({
        trade,
        bid: null,
        ask: null
      }))
    );
  }

  function applyHeldToDisplay(snapshot: HeldSnapshot) {
    setCells(snapshot.cells);
    setReelFrame({
      ...snapshot.reelFrame,
      prevOffsets: snapshot.reelFrame.prevOffsets ?? snapshot.reelFrame.offsets,
      animate: false,
      moves: [null, null, null]
    });
    setWins(snapshot.wins);
    setRoundPayout(snapshot.roundPayout);
    setFinalResult(snapshot.finalResult);
    setRoundFrozen(true);
    const heldQuotes = normalizeQuotes(snapshot.endQuotes);
    setEndQuotes(quotesHaveTrades(heldQuotes) ? heldQuotes : seedQuotesFromLive());
    setLastMoves(snapshot.lastMoves);
    setReelSteps(snapshot.reelSteps);
    setFilledCount(TOTAL_SAMPLES);
  }

  function captureHeld(snapshot: HeldSnapshot) {
    heldRef.current = snapshot;
    saveHeld(snapshot);
    applyHeldToDisplay(snapshot);
  }

  function clearHeld() {
    heldRef.current = null;
    clearHeldStorage();
  }

  function heldFromOfficial(row: SlotRoundRecord, previewStake = 100): HeldSnapshot | null {
    if (!row.final_board || !row.final_offsets || !row.strips) return null;
    const board = row.final_board;
    const wins = evaluateClassicPaylines(board, previewStake);
    const payout = totalPayout(wins);
    const payoutPreview =
      row.payout_preview_100 ?? totalPayout(evaluateClassicPaylines(board, 100));
    return {
      sourceRoundId: row.round_id,
      cells: board,
      reelFrame: {
        strips: row.strips,
        offsets: row.final_offsets.slice(),
        prevOffsets: row.final_offsets.slice(),
        moves: [null, null, null],
        tick: row.tick_count ?? TOTAL_SAMPLES,
        animate: false
      },
      wins,
      roundPayout: payout,
      finalResult: {
        board,
        wins: evaluateClassicPaylines(board, 100),
        payoutPreview
      },
      endQuotes: normalizeQuotes(row.end_quotes),
      lastMoves: [null, null, null],
      reelSteps: row.reel_steps?.slice() ?? [0, 0, 0]
    };
  }

  function quotesFromTick(tick: SlotRoundTickRecord): ReelQuote[] {
    return normalizeQuotes(tick.quotes);
  }

  function publishTickQuotes(tick: SlotRoundTickRecord) {
    const next = quotesFromTick(tick);
    if (quotesHaveTrades(next)) setEndQuotes(next);
  }

  function applyOfficialTick(tick: SlotRoundTickRecord, opts?: { animate?: boolean }) {
    const state = roundRef.current;
    if (!state || !sameSlotRoundId(state.roundId, tick.round_id) || state.settled) return;
    if (!state.strips) return;
    if (tick.tick <= state.ticks) return;

    const prevOffsets = state.offsets.slice();
    const steppedOne = tick.tick === state.ticks + 1;
    state.offsets = tick.offsets.slice();
    state.stepCounts = tick.step_counts.slice();
    state.ticks = tick.tick;
    state.boardShown = true;

    const moves = tick.moves;
    const board = tick.board;
    const reachedFinal = tick.tick >= TOTAL_SAMPLES;
    const stepped = moves.some((move) => move === "UP" || move === "DOWN");
    const shouldAnimate = opts?.animate ?? (steppedOne && stepped && !reachedFinal);

    publishTickQuotes(tick);
    setCells(board);
    setFilledCount(tick.tick);
    setReelSteps(tick.step_counts.slice());
    setLastMoves(moves);
    setReelFrame({
      strips: state.strips,
      offsets: tick.offsets.slice(),
      prevOffsets: steppedOne ? prevOffsets : tick.offsets.slice(),
      moves: reachedFinal || !shouldAnimate ? [null, null, null] : moves,
      tick: tick.tick,
      animate: shouldAnimate
    });
    setMessage(
      `Round ${formatRoundLabel(Number(state.roundId))} live · official ${tick.tick}/${TOTAL_SAMPLES}`
    );

    const previewStake =
      betsRef.current.find((bet) => sameSlotRoundId(bet.roundId, tick.round_id))?.stake ??
      100;
    const lineWins = evaluateClassicPaylines(board, previewStake);

    if (reachedFinal) {
      freezeOfficialBoard(
        Number(tick.round_id),
        board,
        state.strips,
        tick.offsets,
        tick.step_counts,
        quotesFromTick(tick),
        moves,
        previewStake
      );
    } else {
      setWins(lineWins);
      setRoundPayout(0);
    }
  }

  async function ensureRoundStrips(forRoundId: number) {
    const state = roundRef.current;
    if (!state || !sameSlotRoundId(state.roundId, forRoundId)) return null;
    if (state.strips) return state;
    const row = await getSlotRound(forRoundId);
    if (!row || !roundRef.current || !sameSlotRoundId(roundRef.current.roundId, forRoundId)) {
      return null;
    }
    roundRef.current.strips = row.strips;
    roundRef.current.offsets = row.initial_offsets.slice();
    roundRef.current.initialOffsets = row.initial_offsets.slice();
    if (row.status === "settled" && row.final_board) {
      applyOfficialSettled(row);
      return roundRef.current;
    }
    return roundRef.current;
  }

  async function pullOfficialTicks(forRoundId: number) {
    if (officialSyncRef.current.fetchingTicks) return;
    const live = roundRef.current;
    if (!live || !sameSlotRoundId(live.roundId, forRoundId) || live.settled) return;
    officialSyncRef.current.fetchingTicks = true;
    try {
      const state = await ensureRoundStrips(forRoundId);
      if (!state || state.settled) return;
      if (!state.strips) {
        setMessage(`Round ${formatRoundLabel(forRoundId)} live · loading official strips…`);
        return;
      }

      const latest = await getLatestSlotRoundTick(forRoundId);
      if (!roundRef.current || !sameSlotRoundId(roundRef.current.roundId, forRoundId)) return;
      if (latest) rememberTicks([latest]);

      // First paint: show backend tip immediately.
      if (state.ticks === 0) {
        if (latest && latest.tick >= 1) {
          applyOfficialTick(latest, { animate: false });
          if (latest.tick >= TOTAL_SAMPLES) {
            const round = await getSlotRound(forRoundId);
            if (round?.status === "settled" && round.final_board) applyOfficialSettled(round);
          }
          return;
        }
        if (!state.boardShown) {
          state.boardShown = true;
          const board = boardFromReels(state.strips, state.offsets);
          setCells(board);
          setFilledCount(0);
          setReelFrame({
            strips: state.strips,
            offsets: state.offsets.slice(),
            prevOffsets: state.offsets.slice(),
            moves: [null, null, null],
            tick: 0,
            animate: false
          });
          setMessage(`Round ${formatRoundLabel(forRoundId)} live · official board ready`);
        }
        return;
      }

      if (state.ticks > 0 && state.ticks < TOTAL_SAMPLES) {
        let next = tickCacheRef.current.get(state.ticks + 1);
        if (!next) {
          const more = await listSlotRoundTicksAfter(forRoundId, state.ticks, 8);
          if (!roundRef.current || !sameSlotRoundId(roundRef.current.roundId, forRoundId)) return;
          rememberTicks(more);
          next = tickCacheRef.current.get(state.ticks + 1);
        }
        if (!next && latest && latest.tick > state.ticks) next = latest;
        if (next) {
          const at = roundRef.current?.ticks ?? state.ticks;
          applyOfficialTick(next, { animate: next.tick === at + 1 });
        }
      }

      if (latest?.tick === TOTAL_SAMPLES || (roundRef.current?.ticks ?? 0) >= TOTAL_SAMPLES) {
        const round = await getSlotRound(forRoundId);
        if (round?.status === "settled" && round.final_board) applyOfficialSettled(round);
      }
    } catch (error) {
      console.warn("[slot] official tick poll failed", error);
      setMessage(`Round ${formatRoundLabel(forRoundId)} live · tick sync error · retrying`);
    } finally {
      officialSyncRef.current.fetchingTicks = false;
    }
  }

  function freezeOfficialBoard(
    settledRoundId: number,
    board: SlotSymbolId[],
    strips: SlotSymbolId[][],
    offsets: number[],
    reelSteps: number[],
    endQuotes: ReelQuote[],
    lastMoves: Array<PriceDirection | null>,
    previewStake: number
  ) {
    const state = roundRef.current;
    if (state && sameSlotRoundId(state.roundId, settledRoundId)) state.settled = true;
    const lineWins = evaluateClassicPaylines(board, previewStake);
    const payout = totalPayout(lineWins);
    const final = {
      board,
      wins: lineWins,
      payoutPreview: totalPayout(evaluateClassicPaylines(board, 100))
    };
    captureHeld({
      sourceRoundId: settledRoundId,
      cells: board,
      reelFrame: {
        strips,
        offsets: offsets.slice(),
        prevOffsets: offsets.slice(),
        moves: [null, null, null],
        tick: TOTAL_SAMPLES,
        animate: false
      },
      wins: lineWins,
      roundPayout: payout,
      finalResult: final,
      endQuotes,
      lastMoves,
      reelSteps: reelSteps.slice()
    });
    settleBetsForRound(settledRoundId, board);
    setHistory((prev) =>
      [
        {
          roundId: settledRoundId,
          cells: board,
          winCount: evaluateClassicPaylines(board, 100).length,
          paytableMult: paytableMultFromWins(final.wins),
          payoutPreview: final.payoutPreview,
          settled: true
        },
        ...prev.filter((entry) => entry.roundId !== settledRoundId)
      ].slice(0, 24)
    );
  }

  function applyOfficialSettled(row: SlotRoundRecord) {
    const held = heldFromOfficial(row);
    if (!held) return;
    const state = roundRef.current;
    if (state && state.roundId === row.round_id) {
      state.settled = true;
      state.strips = row.strips;
      state.offsets = row.final_offsets?.slice() ?? state.offsets;
      state.ticks = TOTAL_SAMPLES;
    }
    captureHeld(held);
    if (row.final_board) settleBetsForRound(row.round_id, row.final_board);
    setMessage(`Round ${formatRoundLabel(row.round_id)} FINAL · official VPS board`);
  }

  async function pullOfficialPrevResult(forRoundId: number, prevRoundId: number) {
    if (officialSyncRef.current.fetchingPrev) return;
    officialSyncRef.current.fetchingPrev = true;
    try {
      const row = await getSlotRound(prevRoundId);
      if (roundRef.current?.roundId !== forRoundId) return;

      if (row?.status === "settled" && row.final_board) {
        const held = heldFromOfficial(row);
        if (!held) return;
        captureHeld(held);
        if (roundRef.current) roundRef.current.holdAppliedForRound = forRoundId;
        setMessage(
          `Round ${formatRoundLabel(forRoundId)} waiting. Official result from ${formatRoundLabel(prevRoundId)} held.`
        );
        return;
      }

      // Finalize may lag a second — use tick 120 board if present.
      const latest = await getLatestSlotRoundTick(prevRoundId);
      if (roundRef.current?.roundId !== forRoundId) return;
      if (!latest || latest.tick < TOTAL_SAMPLES || !row?.strips) return;

      const previewStake =
        betsRef.current.find((bet) => sameSlotRoundId(bet.roundId, prevRoundId))?.stake ??
        100;
      freezeOfficialBoard(
        prevRoundId,
        latest.board,
        row.strips,
        latest.offsets,
        latest.step_counts,
        quotesFromTick(latest),
        latest.moves,
        previewStake
      );
      if (roundRef.current) roundRef.current.holdAppliedForRound = forRoundId;
      setMessage(
        `Round ${formatRoundLabel(forRoundId)} waiting. Official tick-120 from ${formatRoundLabel(prevRoundId)} held.`
      );
    } catch (error) {
      console.warn("[slot] official prev poll failed", error);
    } finally {
      officialSyncRef.current.fetchingPrev = false;
    }
  }

  useEffect(() => {
    const resetVisualForNewGame = () => {
      clearHeld();
      setCells(Array(CELL_COUNT).fill("SPIN"));
      setReelFrame(null);
      setFilledCount(0);
      setWins([]);
      setRoundPayout(0);
      setLastMoves([null, null, null]);
      setReelSteps([0, 0, 0]);
      setRoundFrozen(false);
      setFinalResult(null);
      // Keep last known / live prices — never blank headers to "—" on spin start.
      setEndQuotes((prev) => (quotesHaveTrades(prev) ? prev : seedQuotesFromLive()));
      clearTickCache();
    };

    if (!roundRef.current || !sameSlotRoundId(roundRef.current.roundId, roundId)) {
      roundRef.current = {
        roundId,
        ticks: 0,
        strips: null,
        offsets: [0, 0, 0],
        initialOffsets: [0, 0, 0],
        stepCounts: [0, 0, 0],
        settled: false,
        uiStarted: false,
        boardShown: false,
        holdAppliedForRound: null
      };
      officialSyncRef.current.fetchStartFor = null;
      clearTickCache();
      if (phase === "game") {
        resetVisualForNewGame();
        roundRef.current.uiStarted = true;
        setMessage(`Round ${formatRoundLabel(roundId)} live · waiting for official VPS ticks`);
        // Kick sync immediately so we don't sit on the waiting copy.
        void pullOfficialTicks(roundId);
      } else {
        setMessage(
          heldRef.current
            ? `Round ${formatRoundLabel(roundId)} waiting. Previous result held until this slot starts.`
            : `Round ${formatRoundLabel(roundId)} waiting. Stake this round now.`
        );
      }
    }

    const state = roundRef.current;
    if (!state) return;

    // Prefetch this round's official strips during wait (VPS writes early).
    if (!sameSlotRoundId(officialSyncRef.current.fetchStartFor, roundId)) {
      officialSyncRef.current.fetchStartFor = roundId;
      void getSlotRound(roundId)
        .then((row) => {
          if (!row || !roundRef.current || !sameSlotRoundId(roundRef.current.roundId, roundId)) {
            // Failed/empty — allow retry on next frame.
            if (sameSlotRoundId(officialSyncRef.current.fetchStartFor, roundId)) {
              officialSyncRef.current.fetchStartFor = null;
            }
            return;
          }
          roundRef.current.strips = row.strips;
          roundRef.current.offsets = row.initial_offsets.slice();
          roundRef.current.initialOffsets = row.initial_offsets.slice();
          if (row.status === "settled" && row.final_board) applyOfficialSettled(row);
        })
        .catch(() => {
          officialSyncRef.current.fetchStartFor = null;
        });
    }

    if (phase === "wait") {
      const prevRoundId = roundId - CYCLE_MS;
      const held = heldRef.current;
      const hasOfficialPrev = held?.sourceRoundId === prevRoundId;

      if (!hasOfficialPrev) {
        const now = Date.now();
        if (now - officialSyncRef.current.lastPrevPollMs >= 800) {
          officialSyncRef.current.lastPrevPollMs = now;
          void pullOfficialPrevResult(roundId, prevRoundId);
        }
      } else if (state.holdAppliedForRound !== roundId) {
        applyHeldToDisplay(held);
        state.holdAppliedForRound = roundId;
        setMessage(
          `Round ${formatRoundLabel(roundId)} waiting. Official result from ${formatRoundLabel(prevRoundId)} held.`
        );
      }
      return;
    }

    if (!state.uiStarted) {
      resetVisualForNewGame();
      state.uiStarted = true;
      state.ticks = 0;
      state.stepCounts = [0, 0, 0];
      state.settled = false;
      state.boardShown = false;
      state.holdAppliedForRound = null;
      setMessage(`Round ${formatRoundLabel(roundId)} live · official VPS · DOGE↑↓ · XRP↑↓ · ETH↑↓`);
    }

    if (state.settled) return;

    // If strips are missing during live play, keep retrying — never soft-lock on SPIN.
    if (!state.strips) {
      if (officialSyncRef.current.fetchStartFor === roundId) {
        const now = Date.now();
        if (now - (officialSyncRef.current.lastStripRetryMs ?? 0) >= 1000) {
          officialSyncRef.current.lastStripRetryMs = now;
          officialSyncRef.current.fetchStartFor = null;
        }
      }
      const nowPull = Date.now();
      if (nowPull - officialSyncRef.current.lastTickPullMs >= 500) {
        officialSyncRef.current.lastTickPullMs = nowPull;
        void pullOfficialTicks(roundId);
      }
      return;
    }

    // Follow backend tip only — poll ~2Hz, no wall-clock catch-up.
    const nowPull = Date.now();
    if (nowPull - officialSyncRef.current.lastTickPullMs >= 500) {
      officialSyncRef.current.lastTickPullMs = nowPull;
      void pullOfficialTicks(roundId);
    }
  }, [nowMs, phase, roundId, waitEndMs]);

  function settleBetsForRound(settledRoundId: number, board: SlotSymbolId[]) {
    const previewStake =
      betsRef.current.find((bet) => sameSlotRoundId(bet.roundId, settledRoundId))?.stake ?? 100;
    setWins(evaluateClassicPaylines(board, previewStake));
    setRoundPayout(totalPayout(evaluateClassicPaylines(board, previewStake)));
    setMessage(`Round ${formatRoundLabel(settledRoundId)} FINAL · waiting for official payout…`);
    void (async () => {
      try {
        const rows = await listSlotBets();
        setBets(rows);
        const mine = rows.find((bet) => sameSlotRoundId(bet.roundId, settledRoundId)) ?? null;
        if (mine) {
          setWins(evaluateClassicPaylines(board, mine.stake));
          setRoundPayout(mine.status === "open" ? 0 : mine.payout);
          setMessage(
            `Round ${formatRoundLabel(settledRoundId)} FINAL · your bet ${mine.status}` +
              (mine.payout > 0 ? ` · paid ${mine.payout}` : " · paid 0")
          );
        } else {
          setRoundPayout(totalPayout(evaluateClassicPaylines(board, 100)));
          setMessage(`Round ${formatRoundLabel(settledRoundId)} FINAL · no bet this round`);
        }
        await refreshSessionRef.current();
      } catch {
        setMessage(`Round ${formatRoundLabel(settledRoundId)} FINAL · official board locked`);
      }
    })();
  }

  const placeBet = () => {
    if (!user) {
      setMessage("Login required to place a slot bet.");
      return;
    }
    if (placingBet) return;
    if (openBetForTarget) {
      setMessage(
        phase === "wait"
          ? "You already have a bet on this round."
          : "You already have a bet on the next round."
      );
      return;
    }
    const stake = Math.floor(Number(stakeInput));
    if (!Number.isFinite(stake) || stake < 10) {
      setMessage("Minimum stake is 10 pts.");
      return;
    }
    if (stake % LINE_COUNT !== 0) {
      setMessage(`Stake must be a multiple of ${LINE_COUNT} (paylines).`);
      return;
    }
    if (stake > points) {
      setMessage("Not enough points.");
      return;
    }
    if (nowMs >= bettingClosesAt) {
      setMessage(
        phase === "wait"
          ? "Betting is closed — this round is live."
          : "Betting is closed for the next round."
      );
      return;
    }

    setPlacingBet(true);
    void (async () => {
      try {
        const result = await createSlotBet(stake, bettingRoundId);
        setBets((current) => {
          const without = current.filter(
            (bet) =>
              bet.id !== result.bet.id && !sameSlotRoundId(bet.roundId, result.bet.roundId)
          );
          return [result.bet, ...without];
        });
        if (Number.isFinite(result.pointsBalance)) {
          setPointsBalanceRef.current(result.pointsBalance);
        }
        try {
          const rows = await listSlotBets();
          setBets(rows);
        } catch {
          // mirrored bet already in state
        }
        const label = formatRoundLabel(result.bet.roundId);
        setMessage(
          phase === "wait"
            ? `Staked ${stake} pts on round ${label}. YOUR WAGER ${stake} · Line bet ${Math.floor(stake / LINE_COUNT)} pts × ${LINE_COUNT} lines.`
            : `Staked ${stake} pts on next round ${label}. YOUR WAGER shows when that wait starts · Line bet ${Math.floor(stake / LINE_COUNT)} pts × ${LINE_COUNT} lines.`
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Slot bet failed.");
      } finally {
        setPlacingBet(false);
      }
    })();
  };

  const showAnimatedReels = Boolean(reelFrame) && cells.every((cell) => cell && cell !== "SPIN");
  const stakeValue = Math.max(10, Math.floor(Number(stakeInput)) || 10);
  const lineBetPts = Math.max(1, Math.floor(stakeValue / LINE_COUNT));
  const activeWin =
    currentRoundBet && currentRoundBet.status === "won"
      ? currentRoundBet.payout
      : roundFrozen
        ? roundPayout
        : 0;
  /** Official board payout preview (100-pt). Personal win uses Your wager + bet payout. */
  const payoutPts =
    finalResult != null
      ? Math.max(0, Number(finalResult.payoutPreview ?? 0))
      : roundFrozen
        ? Math.max(0, Number(roundPayout ?? 0))
        : null;
  const yourWagerPts = currentRoundBet != null ? Number(currentRoundBet.stake) || 0 : null;
  const progressPct =
    phase === "wait"
      ? Math.round(((WAIT_MS - remainingMs) / WAIT_MS) * 100)
      : Math.round((filledCount / TOTAL_SAMPLES) * 100);
  const statusText = roundFrozen
    ? phase === "wait"
      ? "HELD RESULT"
      : "FINAL LOCKED"
    : phase === "game"
      ? `LIVE · ${filledCount}/${TOTAL_SAMPLES}`
      : `WAIT · ${formatDuration(remainingMs)}`;
  const statusColor = roundFrozen
    ? phase === "wait"
      ? "#94a3b8"
      : "#fbbf24"
    : phase === "game"
      ? "#4ade80"
      : "#f59e0b";
  const spinDisabled =
    !user || placingBet || Boolean(openBetForTarget) || bettingRemainingMs <= 0;

  const nudgeStake = (delta: number) => {
    setStakeInput(String(Math.max(10, stakeValue + delta)));
  };

  const setMaxStake = () => {
    const max = Math.max(10, Math.floor(points / 10) * 10);
    setStakeInput(String(Math.max(10, max)));
  };

  return (
    <div className="slot-page">
      <div className="slot-page-inner">
        <div className="slot-layout">
          <div className="slot-machine-col">
            <div className="slot-machine">
        <div className="chrome-rail-top" />

        <div className="machine-banner">
          <div>
            <div className="banner-title">RIALO SLOT</div>
            <div className="banner-sub">DOGE · XRP · ETH · OFFICIAL VPS</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <StatusChip
              label={phase === "game" ? "LIVE" : "WAIT"}
              variant={phase === "game" ? "live" : "wait"}
            />
            <StatusChip label={`${formatDuration(remainingMs)}`} variant="wait" />
            <StatusChip label={`RTP ~${Math.round(TARGET_RTP * 100)}%`} variant="neutral" />
          </div>
        </div>

        <div className="slot-main-stage">
          <div className="paytable-col">
            <div className="paytable-panel">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 10px",
                  background: "linear-gradient(180deg, #252536 0%, #1c1c30 100%)",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  flexShrink: 0
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 12,
                    borderRadius: 2,
                    background: "#f59e0b",
                    boxShadow: "0 0 8px rgba(245,158,11,0.7)"
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Black Ops One', cursive",
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    color: "#e5e7eb"
                  }}
                >
                  PAYTABLE
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "#64748b"
                  }}
                >
                  / LINE {lineBetPts}
                </span>
              </div>

              <div style={{ padding: "2px 0", overflow: "auto", flex: 1, minHeight: 0 }}>
                <div
                  className={`pay-row slot-payout-row ${
                    payoutPts == null ? "is-idle" : payoutPts > 0 ? "is-win" : "is-zero"
                  }`}
                  aria-live="polite"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span className="slot-payout-glyph">×</span>
                    <span className="slot-payout-name">PAYOUT</span>
                  </div>
                  <span className="slot-payout-mult">
                    {payoutPts == null ? "—" : payoutPts.toLocaleString()}
                  </span>
                </div>
                {yourWagerPts != null ? (
                  <div className="pay-row slot-wager-row" aria-live="polite">
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span className="slot-wager-glyph">◎</span>
                      <span className="slot-wager-name">YOUR WAGER</span>
                    </div>
                    <span className="slot-wager-mult">{yourWagerPts.toLocaleString()}</span>
                  </div>
                ) : null}
                {[...SLOT_SYMBOLS].reverse().map((symbol) => (
                  <PayRow key={symbol.id} symbol={symbol} lineBet={lineBetPts} />
                ))}
                <div className="pay-row slot-bet-slot-row" aria-live="polite">
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span className="slot-bet-slot-glyph">◷</span>
                    <span className="slot-bet-slot-name">BET SLOT</span>
                  </div>
                  <span className="slot-bet-slot-value">
                    {openBets.length
                      ? openBets
                          .map((bet) => `${formatRoundLabel(bet.roundId)} · ${bet.stake}`)
                          .join("  ·  ")
                      : "—"}
                  </span>
                </div>
                <div style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <p
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 9,
                      color: "#3a4050",
                      lineHeight: 1.35,
                      letterSpacing: "0.05em",
                      margin: 0
                    }}
                  >
                    WAIT BETS THIS ROUND · LIVE BETS NEXT · VPS SETTLES
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="reels-col">
            <div className="reels-stage">
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  marginBottom: 6,
                  flexShrink: 0,
                  background: roundFrozen
                    ? "linear-gradient(90deg, #f59e0b, #ffd700, #ff8c00, #ffd700, #f59e0b)"
                    : phase === "game"
                      ? "linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6)"
                      : "linear-gradient(90deg, #1e293b, #2d3748, #1e293b)",
                  boxShadow: roundFrozen ? "0 0 12px rgba(245,158,11,0.6)" : undefined
                }}
              />

              <div className="reel-board">
                <div className="reel-board-frame">
                  <div className="reel-coin-headers">
                    {REEL_DRIVERS.map((driver, reel) => (
                      <ReelCoinHeader
                        key={driver.symbol}
                        label={driver.label}
                        symbol={driver.symbol}
                        price={endQuotes[reel]?.trade ?? liveHeaderQuotes[reel]?.trade ?? null}
                        direction={lastMoves[reel]}
                      />
                    ))}
                  </div>

                  <div className="reel-chrome-wrap">
                    <div className="reel-chrome-outer">
                      <div className="reel-inner-shadow">
                        <div className="reel-face">
                          {showAnimatedReels && reelFrame
                            ? REEL_DRIVERS.map((driver, reel) => (
                                <AnimatedReelColumn
                                  key={driver.symbol}
                                  strip={reelFrame.strips[reel]}
                                  fromOffset={reelFrame.prevOffsets?.[reel] ?? reelFrame.offsets[reel]}
                                  toOffset={reelFrame.offsets[reel]}
                                  move={reelFrame.animate ? reelFrame.moves[reel] : null}
                                  tick={reelFrame.tick}
                                  winningRows={
                                    new Set(
                                      [...winningIndexes]
                                        .filter((index) => index % REEL_COUNT === reel)
                                        .map((index) => Math.floor(index / REEL_COUNT))
                                    )
                                  }
                                />
                              ))
                            : REEL_DRIVERS.map((driver, reel) => (
                                <div
                                  key={driver.symbol}
                                  className="static-reel-col"
                                  style={{ display: "flex", flexDirection: "column", gap: REEL_GAP_PX }}
                                >
                                  {[0, 1, 2].map((row) => {
                                    const index = row * REEL_COUNT + reel;
                                    return (
                                      <SlotCell
                                        key={index}
                                        value={cells[index]}
                                        highlight={winningIndexes.has(index)}
                                        activeColumn={
                                          lastMoves[reel] === "UP" || lastMoves[reel] === "DOWN"
                                        }
                                        index={index}
                                      />
                                    );
                                  })}
                                </div>
                              ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  marginTop: 6,
                  flexShrink: 0,
                  background: roundFrozen
                    ? "linear-gradient(90deg, #ff8c00, #ffd700, #f59e0b, #ffd700, #ff8c00)"
                    : "linear-gradient(90deg, #1e293b, #2d3748, #1e293b)",
                  boxShadow: roundFrozen ? "0 0 12px rgba(255,140,0,0.55)" : undefined
                }}
              />
            </div>

            <div className="slot-meta">
              <div className="progress-wrap">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 3
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color: "#3d4556"
                    }}
                  >
                    ROUND {progressPct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    background: "#0d0d1a",
                    borderRadius: 2,
                    boxShadow: "inset 0 1px 4px rgba(0,0,0,0.6)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPct}%`,
                      borderRadius: 2,
                      background: "linear-gradient(90deg, #f59e0b 0%, #ff7c00 100%)",
                      boxShadow: "0 0 8px rgba(245,158,11,0.45)",
                      transition: "width 0.3s ease"
                    }}
                  />
                </div>
              </div>
              <div className="status-pill">
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: statusColor,
                    boxShadow: `0 0 8px ${statusColor}`,
                    flexShrink: 0
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    color: statusColor,
                    whiteSpace: "nowrap"
                  }}
                >
                  {statusText}
                </span>
                {activeWin > 0 && (
                  <span
                    style={{
                      fontFamily: "'Black Ops One', cursive",
                      fontSize: 12,
                      color: "#fbbf24",
                      textShadow: "0 0 14px rgba(251,191,36,0.65)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    +{activeWin.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <p className="slot-message" title={message}>
              {message}
            </p>
          </div>
        </div>

        <div className="slot-console">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 12px",
              background: "#060808",
              borderRadius: 8,
              border: "2px solid #101814",
              boxShadow: "inset 0 3px 8px rgba(0,0,0,0.8)",
              minWidth: 118,
              flexShrink: 0
            }}
          >
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "#2d3540"
              }}
            >
              MY POINTS
            </span>
            <span
              style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 18,
                lineHeight: 1,
                color: "#c8f040",
                textShadow: "0 0 10px rgba(200,240,64,0.28)"
              }}
            >
              {user ? points.toLocaleString() : "—"}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              background: "#0c0c18",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.07)",
              overflow: "hidden",
              flexShrink: 0
            }}
          >
            <button
              type="button"
              onClick={() => nudgeStake(-10)}
              style={{
                width: 38,
                height: 44,
                background: "linear-gradient(180deg, #282838 0%, #1c1c2c 100%)",
                border: "none",
                borderRight: "1px solid rgba(255,255,255,0.05)",
                color: "#8a94a8",
                fontSize: 20,
                cursor: "pointer"
              }}
            >
              −
            </button>
            <div
              style={{
                padding: "4px 18px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                minWidth: 72
              }}
            >
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: "#2d3540"
                }}
              >
                STAKE
              </span>
              <span
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 17,
                  color: "#e5e7eb"
                }}
              >
                {stakeValue}
              </span>
            </div>
            <button
              type="button"
              onClick={() => nudgeStake(10)}
              style={{
                width: 38,
                height: 44,
                background: "linear-gradient(180deg, #282838 0%, #1c1c2c 100%)",
                border: "none",
                borderLeft: "1px solid rgba(255,255,255,0.05)",
                color: "#8a94a8",
                fontSize: 20,
                cursor: "pointer"
              }}
            >
              +
            </button>
          </div>

          <div
            className="lcd-panel"
            style={{
              flex: 1,
              minWidth: 180,
              padding: "6px 10px",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8
            }}
          >
            <LCDCell label="COINS" value={user ? points.toLocaleString() : "—"} />
            <LCDDivider />
            <LCDCell label="TOTAL BET" value={openBetForTarget?.stake ?? stakeValue} />
            <LCDDivider />
            <LCDCell label="LINE BET" value={lineBetPts} />
            <LCDDivider />
            <LCDCell
              label="WIN"
              value={
                currentRoundBet && currentRoundBet.status !== "open"
                  ? currentRoundBet.payout.toLocaleString()
                  : roundFrozen || activeWin > 0
                    ? activeWin.toLocaleString()
                    : "—"
              }
              accent={(currentRoundBet?.payout ?? activeWin) > 0}
            />
            <LCDDivider />
            <LCDCell
              label={phase === "wait" ? "CLOSES" : "NEXT IN"}
              value={formatDuration(bettingRemainingMs)}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>
            <button
              type="button"
              className="console-btn-secondary"
              onClick={() => setStakeInput("100")}
              style={{
                background: "linear-gradient(180deg, #ff9c22 0%, #d05800 100%)",
                boxShadow:
                  "0 4px 0 #7a2e00, 0 5px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22)"
              }}
            >
              SELECT 100
            </button>
            <button
              type="button"
              className="console-btn-secondary"
              onClick={setMaxStake}
              disabled={!user}
              style={{
                background: "linear-gradient(180deg, #ff6a00 0%, #b03e00 100%)",
                boxShadow:
                  "0 4px 0 #6a2000, 0 5px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)"
              }}
            >
              BET MAX
            </button>
          </div>

          <button
            type="button"
            className="spin-button"
            onClick={placeBet}
            disabled={spinDisabled}
            style={
              spinDisabled
                ? {
                    background: "linear-gradient(180deg, #3a3a4c 0%, #262632 100%)",
                    color: "#5a5a6c",
                    boxShadow: "0 2px 0 #14141a, 0 4px 10px rgba(0,0,0,0.45)",
                    cursor: "not-allowed",
                    textShadow: "none"
                  }
                : {
                    background:
                      "linear-gradient(180deg, #ffe066 0%, #ffb300 28%, #ff8800 62%, #e05000 100%)",
                    color: "#3d1800",
                    textShadow: "0 1px 0 rgba(255,220,80,0.5)",
                    boxShadow:
                      "0 7px 0 #9e2c00, 0 10px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.45)",
                    cursor: "pointer"
                  }
            }
          >
            {!user ? "LOGIN" : placingBet ? "…" : openBetForTarget ? "IN" : "SPIN"}
          </button>
        </div>

        <div className="chrome-rail-bottom" />
            </div>
          </div>

          <aside className="slot-history-panel" aria-label="Recent slot results">
            <div className="slot-history-head">
              <h2>RECENT RESULTS</h2>
              <span>Official VPS</span>
            </div>
            <div className="slot-history-scroll">
              {historyStatus ? (
                <div className="slot-history-empty">{historyStatus}</div>
              ) : (
                history.map((entry) => (
                  <article className="slot-history-card" key={entry.roundId}>
                    <div className="slot-history-meta">
                      <span>{formatRoundLabel(entry.roundId)}</span>
                      <span className={entry.payoutPreview > 0 ? "is-win" : "is-zero"}>
                        {fmtPayoutMult(entry.payoutPreview / 100)}
                      </span>
                    </div>
                    <div className="slot-history-board" aria-hidden>
                      {entry.cells.map((cell, index) => {
                        const symbol = getSymbol(cell);
                        const textGlyph =
                          symbol.id === "bar" ? "is-bar" : symbol.id === "seven" ? "is-seven" : "";
                        return (
                          <span
                            key={`${entry.roundId}-${index}`}
                            className={`slot-history-cell ${textGlyph}`.trim()}
                          >
                            {symbol.glyph}
                          </span>
                        );
                      })}
                    </div>
                    <div className="slot-history-foot">
                      {entry.winCount > 0 ? `${entry.winCount} line win` : "no line"}
                      {" · "}
                      {entry.payoutPreview.toLocaleString()} pts / 100
                      {entry.paytableMult > 0 ? ` · lines ${fmtPayoutMult(entry.paytableMult)}` : ""}
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  variant
}: {
  label: string;
  variant: "live" | "wait" | "neutral";
}) {
  const c =
    variant === "live"
      ? { bg: "#0e2410", border: "#1e4a22", text: "#4ade80", dot: "#22c55e" }
      : variant === "wait"
        ? { bg: "#291c06", border: "#5c4010", text: "#fbbf24", dot: "#f59e0b" }
        : { bg: "#161620", border: "#2c2c44", text: "#94a3b8", dot: "#475569" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 5,
        background: c.bg,
        border: `1px solid ${c.border}`
      }}
    >
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: c.dot,
          boxShadow: `0 0 7px ${c.dot}`,
          animation: variant === "live" ? "pulse-dot 1.4s ease-in-out infinite" : undefined
        }}
      />
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: c.text
        }}
      >
        {label}
      </span>
    </div>
  );
}

function PayRow({
  symbol,
  lineBet
}: {
  symbol: (typeof SLOT_SYMBOLS)[number];
  lineBet: number;
}) {
  const isTop = symbol.id === "diamond" || symbol.id === "seven";
  const isBar = symbol.id === "bar";
  const isSevenOrBar = isBar || symbol.id === "seven";
  const linePayout = Math.floor(Math.max(1, lineBet) * symbol.linePay);
  return (
    <div
      className="pay-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.04)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            fontSize: isBar ? 13 : 20,
            lineHeight: 1,
            fontWeight: isBar ? 900 : 400,
            fontFamily: isSevenOrBar ? "'Black Ops One', cursive" : undefined,
            /* Paytable sits on dark panel — light text, not cream-tile black */
            color: isSevenOrBar ? "#f2f3f4" : undefined,
            width: 26,
            textAlign: "center"
          }}
        >
          {symbol.glyph}
        </span>
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.07em",
            color: "#8a96a4"
          }}
        >
          {symbol.label.toUpperCase()}
        </span>
      </div>
      <span
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13,
          fontWeight: 700,
          color: isTop ? "#fbbf24" : "#d1d5db",
          textShadow: isTop ? "0 0 8px rgba(251,191,36,0.55)" : undefined
        }}
      >
        {linePayout.toLocaleString()}
      </span>
    </div>
  );
}

function ReelCoinHeader({
  label,
  symbol,
  price,
  direction
}: {
  label: string;
  symbol: string;
  price: number | null;
  direction: PriceDirection | null;
}) {
  const moveClass =
    direction === "UP" ? "is-up" : direction === "DOWN" ? "is-down" : direction === "FLAT" ? "is-flat" : "is-idle";
  const moveGlyph =
    direction === "UP" ? "▲" : direction === "DOWN" ? "▼" : direction === "FLAT" ? "−" : "·";
  return (
    <div className="reel-coin-header">
      <span className="coin-name">{label}</span>
      <div className="coin-row">
        <span className={`coin-move ${moveClass}`}>{moveGlyph}</span>
        <span className="coin-price">{fmtCoinPrice(symbol, price)}</span>
      </div>
    </div>
  );
}

function LCDCell({
  label,
  value,
  accent
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "#3d4050",
          textTransform: "uppercase"
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 14,
          lineHeight: 1,
          color: accent ? "#f5c842" : "#c8f040",
          textShadow: accent ? "0 0 10px rgba(245,200,66,0.5)" : "0 0 8px rgba(200,240,64,0.25)"
        }}
      >
        {value}
      </span>
    </div>
  );
}

function LCDDivider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.04)", margin: "4px 0" }} />;
}

const AnimatedReelColumn = memo(function AnimatedReelColumn({
  strip,
  fromOffset,
  toOffset,
  move,
  tick,
  winningRows
}: {
  strip: SlotSymbolId[];
  fromOffset: number;
  toOffset: number;
  move: PriceDirection | null;
  tick: number;
  winningRows: Set<number>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const [stripItems, setStripItems] = useState<SlotSymbolId[]>(() =>
    Array.from({ length: VISIBLE_ROWS }, (_, row) => symbolAt(strip, toOffset, row))
  );
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    animRef.current?.cancel();
    animRef.current = null;

    const endItems = Array.from({ length: VISIBLE_ROWS }, (_, row) => symbolAt(strip, toOffset, row));

    const hardSet = (pct: number) => {
      track.style.transition = "none";
      track.style.transform = `translateY(${pct}%)`;
    };

    if (move !== "UP" && move !== "DOWN") {
      setBusy(false);
      flushSync(() => setStripItems(endItems));
      hardSet(0);
      return;
    }

    const startItems = Array.from({ length: VISIBLE_ROWS }, (_, row) =>
      symbolAt(strip, fromOffset, row)
    );
    // UP: old 3 + new bottom. Move track up by exactly one cell (-25% of 4-cell track).
    // DOWN: new top + old 3. Start shifted up, ease down to 0.
    const sequence =
      move === "UP"
        ? [...startItems, symbolAt(strip, toOffset, VISIBLE_ROWS - 1)]
        : [symbolAt(strip, toOffset, 0), ...startItems];

    const fromPct = move === "UP" ? 0 : -25;
    const toPct = move === "UP" ? -25 : 0;

    setBusy(true);
    flushSync(() => setStripItems(sequence));
    hardSet(fromPct);

    const animation = track.animate(
      [{ transform: `translateY(${fromPct}%)` }, { transform: `translateY(${toPct}%)` }],
      { duration: REEL_ANIM_MS, easing: "ease-out", fill: "forwards" }
    );
    animRef.current = animation;

    let cancelled = false;
    animation.finished
      .then(() => {
        if (cancelled || animRef.current !== animation) return;
        try {
          animation.commitStyles();
        } catch {
          /* ignore */
        }
        animation.cancel();
        // Swap to final 3-cell board at 0% — same pixels as end of slide, no bounce.
        flushSync(() => setStripItems(endItems));
        hardSet(0);
        setBusy(false);
        animRef.current = null;
      })
      .catch(() => {
        /* cancelled */
      });

    return () => {
      cancelled = true;
      animation.cancel();
      animRef.current = null;
    };
  }, [strip, fromOffset, toOffset, move, tick]);

  const four = stripItems.length === 4;

  return (
    <div className="reel-column">
      <div className="reel-viewport">
        <div
          ref={trackRef}
          className={`reel-track ${four ? "is-four" : "is-three"}`}
        >
          {stripItems.map((id, index) => {
            const visibleRow = four && move === "DOWN" ? index - 1 : index;
            const highlight =
              !busy &&
              !four &&
              visibleRow >= 0 &&
              visibleRow < VISIBLE_ROWS &&
              winningRows.has(visibleRow);
            return (
              <div key={`slot-row-${index}`} className="reel-cell">
                <SymbolFace id={id} highlight={highlight} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function SymbolFace({
  id,
  size,
  highlight
}: {
  id: SlotSymbolId;
  size?: number;
  highlight?: boolean;
}) {
  const symbol = getSymbol(id);
  const isBar = symbol.id === "bar";
  const isSeven = symbol.id === "seven";
  const glyphSize = size
    ? isBar
      ? Math.round(size * 0.28)
      : Math.round(size * 0.58)
    : undefined;
  return (
    <div
      className={`symbol-tile ${highlight ? "is-win" : ""}`}
      style={{
        width: size ?? "100%",
        height: size ?? "100%",
        flex: size ? "0 0 auto" : "1 1 auto",
        boxSizing: "border-box",
        aspectRatio: size ? "auto" : undefined
      }}
    >
      <span
        className={isBar ? "is-bar" : isSeven ? "is-seven" : undefined}
        style={{
          fontSize: glyphSize ?? (isBar ? "clamp(18px, 28%, 36px)" : "clamp(28px, 55%, 64px)"),
          lineHeight: 1,
          fontWeight: isBar || isSeven ? 900 : 400,
          fontFamily: isBar || isSeven ? "'Black Ops One', cursive" : undefined,
          color: "#0a0a0a"
        }}
      >
        {symbol.glyph}
      </span>
    </div>
  );
}

function SlotCell({
  value,
  highlight,
  activeColumn,
  index
}: {
  value: CellState;
  highlight: boolean;
  activeColumn?: boolean;
  index: number;
}) {
  if (value === "SPIN") {
    return (
      <div className="symbol-tile" aria-label={`Cell ${index + 1}: spinning`}>
        <span style={{ fontSize: 42 }}>⟳</span>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="symbol-tile" aria-label={`Cell ${index + 1}: empty`}>
        <span style={{ fontSize: 36, color: "#a8a090" }}>·</span>
      </div>
    );
  }
  const symbol = getSymbol(value);
  const isBar = symbol.id === "bar";
  const isSeven = symbol.id === "seven";
  return (
    <div
      className={`symbol-tile ${highlight ? "is-win" : ""} ${activeColumn && !highlight ? "is-win" : ""}`}
      aria-label={`Cell ${index + 1}: ${symbol.label}`}
    >
      <span
        className={isBar ? "is-bar" : isSeven ? "is-seven" : undefined}
        style={{
          fontSize: isBar ? 28 : 48,
          lineHeight: 1,
          fontWeight: isBar || isSeven ? 900 : 400,
          fontFamily: isBar || isSeven ? "'Black Ops One', cursive" : undefined,
          color: "#0a0a0a"
        }}
      >
        {symbol.glyph}
      </span>
    </div>
  );
}


function formatRoundLabel(roundId: number) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(roundId));
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

function fmtShort(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "—";
  const n = value as number;
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtPayoutMult(mult: number) {
  if (!Number.isFinite(mult) || mult <= 0) return "0x";
  const rounded = Math.round(mult * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}x` : `${rounded.toFixed(1)}x`;
}

/** Sum winning linePays — same numbers shown on the paytable. */
function paytableMultFromWins(wins: Array<{ linePay?: number } | null | undefined>) {
  return wins.reduce((sum, win) => sum + Math.max(0, Number(win?.linePay ?? 0)), 0);
}

/** Per-coin decimals so 1s tick moves are visible in the header price. */
function fmtCoinPrice(symbol: string, value: number | null | undefined) {
  const n = normalizeTrade(value);
  if (n == null) return "—";
  const key = symbol.toLowerCase();
  if (key.includes("doge")) return n.toFixed(5);
  if (key.includes("xrp")) return n.toFixed(4);
  if (key.includes("eth")) return n.toFixed(2);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(5);
}

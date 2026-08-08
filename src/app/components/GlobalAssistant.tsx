import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import {
  askAssistant,
  buildBettingPreview,
  buildClarification,
  buildRandomLottoPicks,
  executeBatchBets,
  formatAssistantRoundLabel,
  formatLottoPicks,
  getSlotClock,
  isBettingCancel,
  isBettingConfirm,
  needsPlacementClarification,
  resolveClarificationReply,
  resolveSlotBettingRoundId,
  validateSlotStake,
  type BettingClarification,
  type BettingPreview,
  type LottoIntent,
  type SlotBetIntent
} from "../lib/bettingAssistant";
import { detectReplyLocale, msg, type ReplyLocale } from "../lib/bettingAssistantI18n";
import { createSlotBet, listSlotBets } from "../lib/slotBets";
import { createRaceLottoTicket, getRaceLottoDashboard, type RaceLottoRound } from "../lib/raceLotto";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

type PendingSlot = {
  intent: SlotBetIntent;
  roundId: number;
  roundLabel: string;
  closesLabel: string;
  locale: ReplyLocale;
};

type PendingLotto = {
  intent: LottoIntent;
  round: RaceLottoRound;
  picks: Record<string, string>;
  locale: ReplyLocale;
};

export function GlobalAssistant() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLocale, setChatLocale] = useState<ReplyLocale>("en");
  const [pendingPreview, setPendingPreview] = useState<BettingPreview | null>(null);
  const [pendingClarification, setPendingClarification] = useState<BettingClarification | null>(null);
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);
  const [pendingLotto, setPendingLotto] = useState<PendingLotto | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: msg("en", "welcome")
    }
  ]);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const list = chatListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [
    chatMessages.length,
    pendingPreview,
    pendingClarification,
    pendingSlot,
    pendingLotto,
    chatBusy,
    open
  ]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const pushMessage = (role: ChatRole, text: string) => {
    setChatMessages((messages) => [
      ...messages,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role, text }
    ]);
  };

  const clearMoneyPending = () => {
    setPendingPreview(null);
    setPendingClarification(null);
    setPendingSlot(null);
    setPendingLotto(null);
  };

  const showPreview = (preview: BettingPreview) => {
    const locale = preview.intent.locale || chatLocale || "en";
    setChatLocale(locale);
    clearMoneyPending();
    setPendingPreview(preview);
    pushMessage(
      "assistant",
      [preview.summary, ...preview.detailLines, msg(locale, "previewConfirmHint")].join("\n")
    );
  };

  const tryBuildPreview = (intent: Parameters<typeof buildBettingPreview>[0]) => {
    setChatLocale(intent.locale || "en");
    const previewResult = buildBettingPreview(intent, points);
    if (!previewResult.ok) {
      pushMessage("assistant", previewResult.message);
      return;
    }
    showPreview(previewResult.preview);
  };

  const showSlotPreview = (intent: SlotBetIntent, locale: ReplyLocale) => {
    const stakeError = validateSlotStake(intent.stake, locale);
    if (stakeError) {
      pushMessage("assistant", stakeError);
      return;
    }
    if (intent.stake > points) {
      pushMessage(
        "assistant",
        msg(locale, "insufficientBalance", { need: intent.stake, have: points })
      );
      return;
    }
    const roundId = resolveSlotBettingRoundId(intent.roundPreference);
    const clock = getSlotClock();
    const closesSec = Math.max(1, Math.ceil((clock.bettingClosesAt - Date.now()) / 1000));
    const roundLabel = formatAssistantRoundLabel(roundId);
    clearMoneyPending();
    setPendingSlot({
      intent,
      roundId,
      roundLabel,
      closesLabel: `${closesSec}s`,
      locale
    });
    pushMessage(
      "assistant",
      msg(locale, "slotPreviewHint", {
        stake: intent.stake,
        round: roundLabel,
        closes: `${closesSec}s`
      })
    );
  };

  const handleConfirmSlot = async (pending: PendingSlot) => {
    const locale = pending.locale;
    setChatBusy(true);
    setPendingSlot(null);
    const progressId = `${Date.now()}-slot`;
    setChatMessages((messages) => [
      ...messages,
      { id: progressId, role: "assistant", text: msg(locale, "slotPlacing") }
    ]);
    try {
      const result = await createSlotBet(pending.intent.stake, pending.roundId);
      if (Number.isFinite(result.pointsBalance)) {
        setPointsBalance(result.pointsBalance);
      } else {
        await refreshSession();
      }
      setChatMessages((messages) =>
        messages.map((entry) =>
          entry.id === progressId
            ? {
                ...entry,
                text: msg(locale, "slotPlaced", {
                  stake: result.bet.stake,
                  round: formatAssistantRoundLabel(result.bet.roundId),
                  points: Math.round(result.pointsBalance).toLocaleString()
                })
              }
            : entry
        )
      );
    } catch (error) {
      setChatMessages((messages) =>
        messages.map((entry) =>
          entry.id === progressId
            ? {
                ...entry,
                text: error instanceof Error ? error.message : msg(locale, "batchFailedGeneric")
              }
            : entry
        )
      );
    } finally {
      setChatBusy(false);
    }
  };

  const showLottoPreview = async (intent: LottoIntent, locale: ReplyLocale) => {
    try {
      const dash = await getRaceLottoDashboard();
      if (Number.isFinite(dash.pointsBalance)) {
        setPointsBalance(Number(dash.pointsBalance));
      }
      const openRound =
        dash.rounds.find((round) => round.status === "open") ||
        dash.rounds.find((round) => String(round.status).toLowerCase() === "open") ||
        null;
      if (!openRound) {
        pushMessage("assistant", msg(locale, "lottoNoRound"));
        return;
      }
      if (intent.mode === "status") {
        pushMessage(
          "assistant",
          locale === "ko"
            ? `로또 ${openRound.draw_name} · 상태 ${openRound.status} · 티켓 ${openRound.ticket_price_points} pts · 잭팟 ${(openRound.current_jackpot_points ?? 0).toLocaleString()} pts`
            : `Lotto ${openRound.draw_name} · ${openRound.status} · ticket ${openRound.ticket_price_points} pts · jackpot ${(openRound.current_jackpot_points ?? 0).toLocaleString()} pts`
        );
        return;
      }
      const picks = buildRandomLottoPicks(openRound);
      if (!picks) {
        pushMessage("assistant", msg(locale, "lottoNoRound"));
        return;
      }
      if (intent.mode === "help_picks") {
        pushMessage(
          "assistant",
          locale === "ko"
            ? `추천 랜덤픽: ${formatLottoPicks(picks)}\n원하면 "로또 티켓 사줘"라고 말해 주세요.`
            : `Suggested random picks: ${formatLottoPicks(picks)}\nSay "buy lotto ticket" to purchase.`
        );
        return;
      }
      const price = Number(openRound.ticket_price_points ?? 100);
      if (price > points) {
        pushMessage(
          "assistant",
          msg(locale, "insufficientBalance", { need: price, have: points })
        );
        return;
      }
      clearMoneyPending();
      setPendingLotto({ intent, round: openRound, picks, locale });
      pushMessage(
        "assistant",
        msg(locale, "lottoPreviewHint", {
          picks: formatLottoPicks(picks),
          price
        })
      );
    } catch (error) {
      pushMessage(
        "assistant",
        error instanceof Error ? error.message : msg(locale, "batchFailedGeneric")
      );
    }
  };

  const handleConfirmLotto = async (pending: PendingLotto) => {
    const locale = pending.locale;
    setChatBusy(true);
    setPendingLotto(null);
    const progressId = `${Date.now()}-lotto`;
    setChatMessages((messages) => [
      ...messages,
      { id: progressId, role: "assistant", text: msg(locale, "lottoPlacing") }
    ]);
    try {
      const result = await createRaceLottoTicket(pending.round.id, pending.picks);
      if (Number.isFinite(result?.points_balance)) {
        setPointsBalance(Number(result.points_balance));
      } else {
        await refreshSession();
      }
      setChatMessages((messages) =>
        messages.map((entry) =>
          entry.id === progressId
            ? {
                ...entry,
                text: msg(locale, "lottoPlaced", {
                  points: Math.round(Number(result?.points_balance ?? points)).toLocaleString()
                })
              }
            : entry
        )
      );
    } catch (error) {
      setChatMessages((messages) =>
        messages.map((entry) =>
          entry.id === progressId
            ? {
                ...entry,
                text: error instanceof Error ? error.message : msg(locale, "batchFailedGeneric")
              }
            : entry
        )
      );
    } finally {
      setChatBusy(false);
    }
  };

  const handleConfirmPreview = async (preview: BettingPreview) => {
    const locale = preview.intent.locale || chatLocale || "en";
    setChatBusy(true);
    setPendingPreview(null);
    const progressId = `${Date.now()}-progress`;
    setChatMessages((messages) => [
      ...messages,
      { id: progressId, role: "assistant", text: msg(locale, "placingBets") }
    ]);

    const updateProgress = (text: string) => {
      setChatMessages((messages) =>
        messages.map((entry) => (entry.id === progressId ? { ...entry, text } : entry))
      );
    };

    try {
      const result = await executeBatchBets(preview, updateProgress);
      if (result.pointsBalance != null) {
        setPointsBalance(result.pointsBalance);
      } else {
        await refreshSession();
      }

      const failureLines = result.failed
        .slice(0, 5)
        .map((entry) => `· ${entry.marketName}: ${entry.message}`)
        .join("\n");

      updateProgress([result.summary, failureLines || null].filter(Boolean).join("\n"));
    } catch (error) {
      updateProgress(error instanceof Error ? error.message : msg(locale, "batchFailedGeneric"));
    } finally {
      setChatBusy(false);
    }
  };

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;

    const locale = detectReplyLocale(message);
    setChatLocale(locale);
    setChatInput("");
    pushMessage("user", message);

    if (pendingClarification) {
      const resolved = resolveClarificationReply(message, pendingClarification);
      if (!resolved.ok) {
        if (resolved.cancelled) {
          setPendingClarification(null);
        }
        pushMessage("assistant", resolved.message);
        return;
      }
      if (!user) {
        pushMessage("assistant", msg(locale, "loginRequired"));
        return;
      }
      tryBuildPreview(resolved.intent);
      return;
    }

    if (pendingPreview || pendingSlot || pendingLotto) {
      if (isBettingCancel(message)) {
        clearMoneyPending();
        pushMessage("assistant", msg(locale, "cancelled"));
        return;
      }
      if (isBettingConfirm(message)) {
        if (pendingPreview) {
          await handleConfirmPreview(pendingPreview);
          return;
        }
        if (pendingSlot) {
          await handleConfirmSlot(pendingSlot);
          return;
        }
        if (pendingLotto) {
          await handleConfirmLotto(pendingLotto);
          return;
        }
      }
      pushMessage("assistant", msg(locale, "previewPendingHint"));
      return;
    }

    setChatBusy(true);
    const thinkingId = `${Date.now()}-thinking`;
    setChatMessages((messages) => [
      ...messages,
      { id: thinkingId, role: "assistant", text: msg(locale, "parsing") }
    ]);
    const replaceThinking = (text: string) => {
      setChatMessages((messages) =>
        messages.map((entry) => (entry.id === thinkingId ? { ...entry, text } : entry))
      );
    };
    try {
      let openSlotBets: Array<Record<string, unknown>> | undefined;
      let recentSlotBets: Array<Record<string, unknown>> | undefined;
      if (user) {
        try {
          const rows = await listSlotBets(20);
          recentSlotBets = rows.map((bet) => ({
            roundId: bet.roundId,
            stake: bet.stake,
            status: bet.status,
            payout: bet.payout
          }));
          openSlotBets = recentSlotBets.filter((bet) => bet.status === "open");
        } catch {
          // optional session enrichment
        }
      }

      const clock = getSlotClock();
      const result = await askAssistant(message, {
        pagePath: `${location.pathname}${location.search}`,
        loggedIn: Boolean(user),
        pointsBalance: points,
        openSlotBets,
        recentSlotBets,
        slotClock: {
          roundLabel: clock.roundLabel,
          phase: clock.phase,
          remainingMs: clock.remainingMs
        }
      });
      if (!result.ok) {
        replaceThinking(result.message);
        return;
      }

      if (result.kind === "chat" || result.kind === "query") {
        setChatLocale(result.locale);
        replaceThinking(result.kind === "query" ? result.reply : result.reply);
        return;
      }

      if (result.kind === "navigate") {
        setChatLocale(result.locale);
        replaceThinking(msg(result.locale, "navigating", { path: result.intent.path }));
        navigate(result.intent.path);
        return;
      }

      if (result.kind === "slot_bet") {
        setChatLocale(result.locale);
        if (!user) {
          replaceThinking(msg(result.locale, "loginRequired"));
          return;
        }
        setChatMessages((messages) => messages.filter((entry) => entry.id !== thinkingId));
        showSlotPreview(result.intent, result.locale);
        return;
      }

      if (result.kind === "lotto") {
        setChatLocale(result.locale);
        if (!user && result.intent.mode !== "status") {
          replaceThinking(msg(result.locale, "loginRequired"));
          return;
        }
        setChatMessages((messages) => messages.filter((entry) => entry.id !== thinkingId));
        await showLottoPreview(result.intent, result.locale);
        return;
      }

      // race bet
      if (!user) {
        replaceThinking(msg(result.intent.locale || locale, "loginRequired"));
        return;
      }

      setChatLocale(result.intent.locale || locale);

      if (needsPlacementClarification(result.intent)) {
        const clarification = buildClarification(result.intent);
        setPendingClarification(clarification);
        replaceThinking(clarification.question);
        return;
      }

      setChatMessages((messages) => messages.filter((entry) => entry.id !== thinkingId));
      tryBuildPreview(result.intent);
    } finally {
      setChatBusy(false);
    }
  };

  const hasPendingAction = Boolean(
    pendingClarification || pendingPreview || pendingSlot || pendingLotto
  );

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-3">
      {open && (
        <div className="pointer-events-auto flex h-[min(70vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f11] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#111315] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#8f949b]">Rialo Assistant</p>
              <h2 className="truncate text-sm font-semibold text-[#f2f3f4]">
                Ask · navigate · race/slot/lotto
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-md bg-[#111315] px-2 py-1 text-[11px] text-[#ff7a00]">
                {user ? `${points.toLocaleString()} pts` : "Guest"}
              </span>
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 bg-[#0d0f11] px-2 py-1 text-sm text-[#f2f3f4] hover:bg-[rgba(255,122,0,0.16)]"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={chatListRef} className="flex-1 space-y-3 overflow-y-auto bg-[#060708]/90 p-3">
            {chatMessages.map((entry) => (
              <div
                key={entry.id}
                className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  entry.role === "user"
                    ? "ml-auto bg-[#ff7a00] text-[#060708]"
                    : "border border-white/10 bg-[#111315] text-[#f2f3f4]"
                }`}
              >
                {entry.text}
              </div>
            ))}
          </div>

          {hasPendingAction && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 bg-[#0d0f11] px-3 py-2">
              {pendingClarification?.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={chatBusy}
                  onClick={() => {
                    const resolved = resolveClarificationReply(
                      option.id === "joint" ? "1" : "2",
                      pendingClarification
                    );
                    if (!resolved.ok) {
                      pushMessage("assistant", resolved.message);
                      return;
                    }
                    pushMessage("user", option.label);
                    if (!user) {
                      pushMessage("assistant", msg(chatLocale, "loginRequired"));
                      return;
                    }
                    tryBuildPreview(resolved.intent);
                  }}
                  className="rounded-md bg-[#ff7a00] px-3 py-1.5 text-xs font-semibold text-[#060708] disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
              {pendingPreview && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => void handleConfirmPreview(pendingPreview)}
                  className="rounded-md bg-[#ff7a00] px-3 py-1.5 text-xs font-semibold text-[#060708] disabled:opacity-50"
                >
                  {msg(chatLocale, "confirmAction")} · Place bets
                </button>
              )}
              {pendingSlot && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => void handleConfirmSlot(pendingSlot)}
                  className="rounded-md bg-[#ff7a00] px-3 py-1.5 text-xs font-semibold text-[#060708] disabled:opacity-50"
                >
                  {msg(chatLocale, "confirmAction")} · Slot
                </button>
              )}
              {pendingLotto && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => void handleConfirmLotto(pendingLotto)}
                  className="rounded-md bg-[#ff7a00] px-3 py-1.5 text-xs font-semibold text-[#060708] disabled:opacity-50"
                >
                  {msg(chatLocale, "confirmAction")} · Lotto
                </button>
              )}
              <button
                type="button"
                disabled={chatBusy}
                onClick={() => {
                  clearMoneyPending();
                  pushMessage("assistant", msg(chatLocale, "cancelled"));
                }}
                className="rounded-md border border-white/10 bg-[#111315] px-3 py-1.5 text-xs font-semibold text-[#f2f3f4] disabled:opacity-50"
              >
                {msg(chatLocale, "cancelAction")}
              </button>
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="flex gap-2 border-t border-white/10 bg-[#0d0f11] p-3">
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              disabled={chatBusy}
              placeholder='Ask… "슬롯 100점" / "open lotto" / "ETH 1st"'
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#111315] px-3 py-2 text-sm text-[#f2f3f4] outline-none focus:border-[#ff7a00] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="rounded-md bg-[#ff7a00] px-3 py-2 text-sm font-semibold text-[#060708] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-[#ff7a00] text-[#060708] shadow-[0_12px_30px_rgba(255,122,0,0.35)] transition hover:scale-105 hover:bg-[#e56f00]"
      >
        {open ? (
          <span className="text-lg leading-none">✕</span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5M21 12a8.5 8.5 0 01-1.4 4.7L21 21l-4.6-1.2A8.5 8.5 0 1112 3.5 8.5 8.5 0 0121 12z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

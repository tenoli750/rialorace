import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import {
  askAssistant,
  buildBettingPreview,
  buildClarification,
  executeBatchBets,
  isBettingCancel,
  isBettingConfirm,
  needsPlacementClarification,
  resolveClarificationReply,
  type BettingClarification,
  type BettingPreview
} from "../lib/bettingAssistant";
import { detectReplyLocale, msg, type ReplyLocale } from "../lib/bettingAssistantI18n";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

export function GlobalAssistant() {
  const { user, points, setPointsBalance, refreshSession } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLocale, setChatLocale] = useState<ReplyLocale>("en");
  const [pendingPreview, setPendingPreview] = useState<BettingPreview | null>(null);
  const [pendingClarification, setPendingClarification] = useState<BettingClarification | null>(null);
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
  }, [chatMessages.length, pendingPreview, pendingClarification, chatBusy, open]);

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

  const showPreview = (preview: BettingPreview) => {
    const locale = preview.intent.locale || chatLocale || "en";
    setChatLocale(locale);
    setPendingClarification(null);
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

    if (pendingPreview) {
      if (isBettingCancel(message)) {
        setPendingPreview(null);
        pushMessage("assistant", msg(locale, "cancelled"));
        return;
      }
      if (isBettingConfirm(message)) {
        await handleConfirmPreview(pendingPreview);
        return;
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
      const result = await askAssistant(message, {
        pagePath: `${location.pathname}${location.search}`,
        loggedIn: Boolean(user),
        pointsBalance: points
      });
      if (!result.ok) {
        replaceThinking(result.message);
        return;
      }

      if (result.kind === "chat") {
        setChatLocale(result.locale);
        replaceThinking(result.reply);
        return;
      }

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

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-3">
      {open && (
        <div className="pointer-events-auto flex h-[min(70vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-[#fed7aa] bg-white shadow-[0_18px_50px_rgba(154,52,18,0.22)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#8a5a44]">Rialo Assistant</p>
              <h2 className="truncate text-sm font-semibold text-[#9a3412]">Ask anything · place bets</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-md bg-[#ffedd5] px-2 py-1 text-[11px] text-[#9a3412]">
                {user ? `${points.toLocaleString()} pts` : "Guest"}
              </span>
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[#fed7aa] bg-white px-2 py-1 text-sm text-[#9a3412] hover:bg-[#ffedd5]"
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={chatListRef} className="flex-1 space-y-3 overflow-y-auto bg-[#fff7ed]/90] p-3">
            {chatMessages.map((entry) => (
              <div
                key={entry.id}
                className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  entry.role === "user"
                    ? "ml-auto bg-[#9a3412] text-white"
                    : "border border-[#fed7aa] bg-white text-[#9a3412]"
                }`}
              >
                {entry.text}
              </div>
            ))}
          </div>

          {(pendingClarification || pendingPreview) && (
            <div className="flex flex-wrap gap-2 border-t border-[#fed7aa] bg-white px-3 py-2">
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
                  className="rounded-md bg-[#9a3412] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
              {pendingPreview && (
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => void handleConfirmPreview(pendingPreview)}
                  className="rounded-md bg-[#9a3412] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Confirm · Place bets
                </button>
              )}
              <button
                type="button"
                disabled={chatBusy}
                onClick={() => {
                  setPendingClarification(null);
                  setPendingPreview(null);
                  pushMessage("assistant", msg(chatLocale, "cancelled"));
                }}
                className="rounded-md border border-[#fed7aa] bg-white px-3 py-1.5 text-xs font-semibold text-[#9a3412] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="flex gap-2 border-t border-[#fed7aa] bg-white p-3">
            <input
              ref={inputRef}
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              disabled={chatBusy}
              placeholder="Ask or bet… e.g. ETH 1st on all markets"
              className="min-w-0 flex-1 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a3412] outline-none focus:border-[#9a3412] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="rounded-md bg-[#9a3412] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#fed7aa] bg-[#9a3412] text-white shadow-[0_12px_30px_rgba(154,52,18,0.35)] transition hover:scale-105 hover:bg-[#7c2d12]"
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

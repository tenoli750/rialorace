import type { ReplyLocale } from "./bettingAssistantI18n";
import { msg } from "./bettingAssistantI18n";
import type { SlotBetRecord } from "./slotBets";
import type { RaceLottoRound, RaceLottoSlot } from "./raceLotto";

export const ASSISTANT_WAIT_MS = 30_000;
export const ASSISTANT_GAME_MS = 120_000;
export const ASSISTANT_CYCLE_MS = ASSISTANT_WAIT_MS + ASSISTANT_GAME_MS;

export type AssistantNavigatePath =
  | "/home"
  | "/slot"
  | "/race-lotto"
  | "/my-bets.html"
  | "/live-markets.html"
  | "/shop"
  | "/rewards.html"
  | "/points.html"
  | "/community.html"
  | "/profile.html"
  | "/login.html";

export type SlotRoundPreference = "current_wait" | "next";

export type LottoAssistantMode = "buy_random" | "help_picks" | "status";

export type QueryTopic = "slot_bets" | "points" | "pnl" | "slot_clock" | "lotto" | "rules";

export interface SlotClockInfo {
  roundId: number;
  nextRoundId: number;
  roundLabel: string;
  phase: "wait" | "game";
  remainingMs: number;
  bettingRoundId: number;
  bettingClosesAt: number;
  bettingRemainingMs: number;
}

export interface SlotBetIntent {
  stake: number;
  roundPreference: SlotRoundPreference;
  explanation?: string | null;
}

export interface LottoIntent {
  mode: LottoAssistantMode;
  roundId?: string | null;
  explanation?: string | null;
}

export interface NavigateIntent {
  path: AssistantNavigatePath;
  explanation?: string | null;
}

export interface QueryIntent {
  topic: QueryTopic;
  reply?: string | null;
}

const NAV_MAP: Array<{ re: RegExp; path: AssistantNavigatePath }> = [
  { re: /(?:홈|home|메인\s*홈)/i, path: "/home" },
  { re: /(?:슬롯|rialo\s*slot|\bslot\b)/i, path: "/slot" },
  { re: /(?:로또|lotto|잭팟)/i, path: "/race-lotto" },
  { re: /(?:히스토리|history|my\s*bets?|베팅\s*내역)/i, path: "/my-bets.html" },
  { re: /(?:샵|shop|상점)/i, path: "/shop" },
  { re: /(?:리워드|reward)/i, path: "/rewards.html" },
  { re: /(?:포인트|points?)/i, path: "/points.html" },
  { re: /(?:랭킹|rankings?|community|커뮤니티)/i, path: "/community.html" },
  { re: /(?:프로필|profile)/i, path: "/profile.html" },
  { re: /(?:로그인|login)/i, path: "/login.html" },
  { re: /(?:메인\s*메뉴|main\s*menu|라이브\s*마켓|live\s*markets?)/i, path: "/live-markets.html" }
];

const GO_VERB =
  /(?:열어|열어줘|열어\s*줘|가줘|가\s*줘|보여줘|보여\s*줘|이동|가자|open|go\s*to|show|take\s*me|navigate)/i;

export function alignAssistantRoundId(nowMs: number) {
  return Math.floor(nowMs / ASSISTANT_CYCLE_MS) * ASSISTANT_CYCLE_MS;
}

export function formatAssistantRoundLabel(roundId: number) {
  if (!Number.isFinite(roundId)) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(roundId));
}

export function getSlotClock(nowMs = Date.now()): SlotClockInfo {
  const roundId = alignAssistantRoundId(nowMs);
  const waitEndMs = roundId + ASSISTANT_WAIT_MS;
  const phase: "wait" | "game" = nowMs < waitEndMs ? "wait" : "game";
  const nextRoundId = roundId + ASSISTANT_CYCLE_MS;
  const phaseEndsAt = phase === "wait" ? waitEndMs : roundId + ASSISTANT_CYCLE_MS;
  const bettingRoundId = phase === "wait" ? roundId : nextRoundId;
  const bettingClosesAt = bettingRoundId + ASSISTANT_WAIT_MS;
  return {
    roundId,
    nextRoundId,
    roundLabel: formatAssistantRoundLabel(roundId),
    phase,
    remainingMs: Math.max(0, phaseEndsAt - nowMs),
    bettingRoundId,
    bettingClosesAt,
    bettingRemainingMs: Math.max(0, bettingClosesAt - nowMs)
  };
}

export function normalizeAssistantNavigatePath(path: unknown): AssistantNavigatePath | null {
  const raw = String(path || "").trim();
  if (!raw) return null;
  const cleaned = (raw.startsWith("/") ? raw : `/${raw}`).toLowerCase();
  const aliases: Record<string, AssistantNavigatePath> = {
    "/slot": "/slot",
    "/rwa-slot": "/slot",
    "/paxg-slot": "/slot",
    "/race-lotto": "/race-lotto",
    "/lotto": "/race-lotto",
    "/my-bets.html": "/my-bets.html",
    "/history": "/my-bets.html",
    "/home": "/home",
    "/home.html": "/home",
    "/main-menu.html": "/live-markets.html",
    "/live-markets.html": "/live-markets.html",
    "/shop": "/shop",
    "/shop.html": "/shop",
    "/rewards.html": "/rewards.html",
    "/rewards": "/rewards.html",
    "/points.html": "/points.html",
    "/points": "/points.html",
    "/community.html": "/community.html",
    "/rankings": "/community.html",
    "/profile.html": "/profile.html",
    "/profile": "/profile.html",
    "/login.html": "/login.html",
    "/login": "/login.html"
  };
  return aliases[cleaned] ?? null;
}

function extractStake(command: string, fallback = 100) {
  const match =
    command.match(/(\d{1,7})\s*(?:pts?|points?|점|포인트)?/i) ||
    command.match(/(?:stake|베팅|걸어|와저)\s*(\d{1,7})/i);
  if (!match) return fallback;
  const value = Math.floor(Number(match[1]));
  if (!Number.isFinite(value) || value < 10) return fallback;
  return value;
}

export function parseLocalNavigate(command: string): NavigateIntent | null {
  if (!GO_VERB.test(command) && !/^(?:슬롯|로또|히스토리|샵|리워드|메인|slot|lotto|history|shop)\b/i.test(command.trim())) {
    // bare destination words still OK if short
    if (!/^(?:슬롯|로또|히스토리|history|shop|샵|slot|lotto|rewards?|points?|profile|login|main)[\s!.?]*$/i.test(command.trim())) {
      if (!GO_VERB.test(command)) return null;
    }
  }
  for (const entry of NAV_MAP) {
    if (entry.re.test(command)) {
      // Prefer navigate when go-verb present OR command is mostly destination
      if (GO_VERB.test(command) || command.trim().length < 28) {
        // Avoid treating "슬롯 100점 걸어" as navigate
        if (/(?:걸어|베팅|와저|stake|spin|\d+\s*(?:pts?|점|포인트))/i.test(command) && /슬롯|slot/i.test(command)) {
          return null;
        }
        if (/(?:사|구매|티켓|ticket|buy)/i.test(command) && /로또|lotto/i.test(command)) {
          return null;
        }
        return { path: entry.path };
      }
    }
  }
  return null;
}

export function parseLocalSlotBet(command: string): SlotBetIntent | null {
  const mentionsSlot = /(?:슬롯|rialo\s*slot|\bslot\b)/i.test(command);
  const stakeVerb = /(?:걸어|걸|베팅|와저|stake|spin|배팅)/i.test(command);
  const hasStakeNum = /\d{1,7}/.test(command);
  if (!mentionsSlot) return null;
  if (!stakeVerb && !hasStakeNum) return null;
  // "내 슬롯 베팅" / "my slot bets" are list queries unless a stake amount is present
  if (parseLocalSlotBetsQuery(command) && !hasStakeNum) return null;
  // Pure navigation like "슬롯 열어줘"
  if (GO_VERB.test(command) && !stakeVerb && !/(?:\d{1,7}\s*(?:pts?|점|포인트)|stake)/i.test(command)) {
    return null;
  }
  const stake = extractStake(command, 100);
  const roundPreference: SlotRoundPreference = /(?:다음|next)\s*(?:라운드|round)?/i.test(command)
    ? "next"
    : "current_wait";
  return { stake, roundPreference };
}

export function parseLocalLotto(command: string): LottoIntent | null {
  if (!/(?:로또|lotto|잭팟)/i.test(command)) return null;
  if (GO_VERB.test(command) && !/(?:사|구매|티켓|ticket|buy|랜덤|random)/i.test(command)) {
    return null;
  }
  if (/(?:상태|status|현황)/i.test(command)) return { mode: "status" };
  if (/(?:도와|픽|pick|고르)/i.test(command) && !/(?:사|구매|buy|티켓)/i.test(command)) {
    return { mode: "help_picks" };
  }
  if (/(?:사|구매|티켓|ticket|buy|랜덤|random|응모)/i.test(command) || /로또|lotto/i.test(command)) {
    return { mode: "buy_random" };
  }
  return null;
}

export function parseLocalRulesQuery(command: string): QueryIntent | null {
  if (/(?:페이라인|pay\s*lines?|rtp|어떻게\s*돌아|how\s*(?:does|do)\s+(?:the\s+)?slot|슬롯\s*룰|slot\s*rules?)/i.test(command)) {
    return { topic: "rules" };
  }
  return null;
}

export function parseLocalSlotClockQuery(command: string): QueryIntent | null {
  if (
    /(?:지금\s*(?:몇|몇\s*분|라운드)|현재\s*라운드|slot\s*clock|what\s*round|how\s*(?:long|much).*(?:wait|left)|남은\s*시간)/i.test(
      command
    )
  ) {
    return { topic: "slot_clock" };
  }
  return null;
}

export function parseLocalSlotBetsQuery(command: string): QueryIntent | null {
  if (/(?:내\s*슬롯|슬롯\s*베팅|my\s*slot|open\s*slot\s*bet|슬롯\s*와저)/i.test(command)) {
    return { topic: "slot_bets" };
  }
  return null;
}

export function answerRulesTip(locale: ReplyLocale): string {
  if (locale === "ko") {
    return [
      "Rialo Slot 요약:",
      "· 릴: DOGE / XRP / ETH (초당 ↑↓로 회전)",
      "· 페이라인 5개: 가로 3줄 + 대각선 2줄",
      "· 루프: 대기 30초 → 게임 120초 (공식 VPS 틱)",
      "· 베팅: WAIT 중엔 이번 라운드, LIVE 중엔 다음 라운드",
      "· 목표 RTP ~96% · 예측은 안 해요, 규칙만 안내해요."
    ].join("\n");
  }
  return [
    "Rialo Slot quick rules:",
    "· Reels: DOGE / XRP / ETH (1s up/down steps)",
    "· 5 paylines: 3 rows + 2 diagonals",
    "· Loop: 30s wait → 120s game (official VPS ticks)",
    "· Betting: WAIT = this round, LIVE = next round",
    "· Target RTP ~96%. I explain rules only — no predictions."
  ].join("\n");
}

export function answerSlotClock(locale: ReplyLocale, clock = getSlotClock()): string {
  const remainSec = Math.ceil(clock.remainingMs / 1000);
  const betRemainSec = Math.ceil(clock.bettingRemainingMs / 1000);
  const betLabel = formatAssistantRoundLabel(clock.bettingRoundId);
  if (locale === "ko") {
    return `지금 슬롯 라운드 ${clock.roundLabel} · ${clock.phase === "wait" ? "WAIT" : "LIVE"} (남은 ${remainSec}s). 베팅 대상 ${betLabel} · 마감까지 ${betRemainSec}s.`;
  }
  return `Slot round ${clock.roundLabel} · ${clock.phase.toUpperCase()} (${remainSec}s left). Betting target ${betLabel} · closes in ${betRemainSec}s.`;
}

export function answerSlotBetsList(locale: ReplyLocale, bets: SlotBetRecord[]): string {
  if (!bets.length) {
    return locale === "ko" ? "열린/최근 슬롯 베팅이 없어요." : "No recent slot bets.";
  }
  const lines = bets.slice(0, 8).map((bet) => {
    const round = formatAssistantRoundLabel(bet.roundId);
    const status = bet.status;
    const payout = bet.status === "open" ? "-" : String(bet.payout);
    return `· ${round} · ${bet.stake} pts · ${status}${payout !== "-" ? ` · paid ${payout}` : ""}`;
  });
  return (locale === "ko" ? "슬롯 베팅:\n" : "Slot bets:\n") + lines.join("\n");
}

export function buildRandomLottoPicks(round: RaceLottoRound): Record<string, string> | null {
  const slots = Array.isArray(round.slots) ? round.slots : [];
  if (slots.length < 6) return null;
  const picks: Record<string, string> = {};
  for (const slot of slots.slice(0, 6) as RaceLottoSlot[]) {
    const coins = Array.isArray(slot.coin_ids) ? slot.coin_ids.filter(Boolean) : [];
    if (!coins.length) return null;
    const pick = coins[Math.floor(Math.random() * coins.length)];
    picks[String(slot.slot)] = String(pick).toUpperCase();
  }
  return picks;
}

export function formatLottoPicks(picks: Record<string, string>) {
  return Object.entries(picks)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([slot, symbol]) => `${slot}:${symbol}`)
    .join(" · ");
}

export function resolveSlotBettingRoundId(preference: SlotRoundPreference, nowMs = Date.now()) {
  const clock = getSlotClock(nowMs);
  if (preference === "next") return clock.nextRoundId;
  return clock.bettingRoundId;
}

export function validateSlotStake(stake: number, locale: ReplyLocale): string | null {
  if (!Number.isFinite(stake) || stake < 10) return msg(locale, "stakeTooLow");
  if (stake % 5 !== 0) {
    return locale === "ko"
      ? "슬롯 스테이크는 5의 배수여야 해요 (페이라인 5개)."
      : "Slot stake must be a multiple of 5 (5 paylines).";
  }
  return null;
}

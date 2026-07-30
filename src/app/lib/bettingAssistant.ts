import { getMarketsByCategory, type Market } from "../data/markets";
import {
  getTokenByLetter,
  getTokensByCategory,
  tokens,
  type MarketCategory,
  type Token
} from "../data/tokens";
import {
  detectReplyLocale,
  msg,
  withHelp,
  type ReplyLocale
} from "./bettingAssistantI18n";

const RACE_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_STAKE = 100;
const PLACE_ORDER: BetPlace[] = ["first", "second", "third"];

export type BetPlace = "first" | "second" | "third";
export type { ReplyLocale };

export interface TokenPlacePick {
  symbol: string;
  place: BetPlace;
}

export interface ConflictDemoteRule {
  /** When this symbol shares a market with another preferred-first pick, demote it. */
  symbol: string;
  demoteTo: BetPlace;
}

export type PlacementMode = "joint" | "independent";

export interface BettingIntent {
  category: MarketCategory;
  stake: number;
  scope: "all";
  /** Preferred placements before market filters / conflict resolution. */
  picks: TokenPlacePick[];
  /** Markets must also include these symbols (e.g. "BTC랑 같이 있는"). */
  requireAlso: string[];
  /** Markets must NOT include these symbols (e.g. "BTC 없는 마켓"). */
  excludeAlso: string[];
  /** Optional market name/id queries, e.g. "Nightfall Chase". */
  marketQueries: string[];
  /** Overlap demote rules (e.g. "겹치면 DOGE를 2등"). */
  demoteOnOverlap: ConflictDemoteRule[];
  /**
   * joint: only markets containing every pick token (one ticket with all places).
   * independent: each pick applies on any market that has that token.
   * null: ambiguous — ask the user before previewing.
   */
  placementMode: PlacementMode | null;
  clarificationQuestion?: string;
  /** Reply language inferred from the user's command. Default English UI uses en. */
  locale: ReplyLocale;
  raw: string;
}

export interface BettingClarification {
  intent: BettingIntent;
  question: string;
  options: Array<{ id: PlacementMode; label: string }>;
}

export interface MarketBetPlan {
  market: Market;
  placements: { first: string | null; second: string | null; third: string | null };
  label: string;
}

export interface BettingPreview {
  intent: BettingIntent;
  plans: MarketBetPlan[];
  skippedCount: number;
  totalStake: number;
  targetRaceStartedAt: string;
  summary: string;
  detailLines: string[];
}

export interface BatchBetResult {
  placed: Array<{ marketId: string; marketName: string }>;
  failed: Array<{ marketId: string; marketName: string; message: string }>;
  pointsBalance: number | null;
  summary: string;
}

const SYMBOL_ALIASES: Record<string, string> = {
  COIN: "COINBASE",
  COINBASE: "COINBASE",
  GOOG: "GOOGLE",
  GOOGLE: "GOOGLE",
  GOOGL: "GOOGLE"
};

const PLACE_WORD: Record<BetPlace, RegExp> = {
  first: /(?:\b1st\b|\bfirst\b|1\s*등|일등|우승)/i,
  second: /(?:\b2nd\b|\bsecond\b|2\s*등|이등)/i,
  third: /(?:\b3rd\b|\bthird\b|3\s*등|삼등)/i
};

export async function askAssistant(
  rawInput: string,
  options: {
    pagePath?: string;
    loggedIn?: boolean;
    pointsBalance?: number | null;
  } = {}
): Promise<
  | { ok: true; kind: "chat"; reply: string; locale: ReplyLocale }
  | { ok: true; kind: "bet"; intent: BettingIntent }
  | { ok: false; message: string }
> {
  const command = rawInput.trim();
  const locale = detectReplyLocale(command);
  if (!command) {
    return { ok: false, message: withHelp(locale, "emptyCommand") };
  }

  const balanceReply = answerBalanceQuestion(command, locale, {
    loggedIn: Boolean(options.loggedIn),
    pointsBalance: options.pointsBalance ?? null
  });
  if (balanceReply) {
    return { ok: true, kind: "chat", reply: balanceReply, locale };
  }

  if (isPnlQuestion(command)) {
    if (!options.loggedIn) {
      return { ok: true, kind: "chat", reply: msg(locale, "loginRequired"), locale };
    }
    try {
      const pnlReply = await answerPnlQuestion(locale);
      return { ok: true, kind: "chat", reply: pnlReply, locale };
    } catch {
      return { ok: true, kind: "chat", reply: msg(locale, "pnlLoadFailed"), locale };
    }
  }

  const catalog = {
    cryptoSymbols: getTokensByCategory("crypto").map((token) => ({
      symbol: token.symbol,
      shortSymbol: token.shortSymbol ?? null,
      name: token.name
    })),
    stockSymbols: getTokensByCategory("stocks").map((token) => ({
      symbol: token.symbol,
      shortSymbol: token.shortSymbol ?? null,
      name: token.name
    })),
    cryptoMarkets: getMarketsByCategory("crypto").map((market) => ({
      id: market.id,
      name: market.name,
      symbols: market.tokenLetters
        .map((letter) => getTokenByLetter(letter, "crypto")?.symbol)
        .filter(Boolean)
    })),
    stockMarkets: getMarketsByCategory("stocks").map((market) => ({
      id: market.id,
      name: market.name,
      symbols: market.tokenLetters
        .map((letter) => getTokenByLetter(letter, "stocks")?.symbol)
        .filter(Boolean)
    })),
    notes: [
      "Prefer exact catalog symbols and market names.",
      "COIN/Coinbase => COINBASE, GOOG/Google => GOOGLE.",
      "Commands like 'DOGE 1st Nightfall Chase' are bets on that named market.",
      "Commands like 'DOGE 1st on markets without BTC' use excludeAlso: ['BTC']."
    ]
  };

  try {
    const response = await fetch("/api/assistant-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command,
        catalog,
        replyLanguage: locale,
        pagePath: options.pagePath || null,
        session: {
          loggedIn: Boolean(options.loggedIn),
          pointsBalance:
            options.pointsBalance != null && Number.isFinite(Number(options.pointsBalance))
              ? Number(options.pointsBalance)
              : null
        }
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        (payload && typeof payload.error === "string" && payload.error) ||
        msg(locale, "parseFailed");
      // Betting-shaped fallback for resilience
      const fallback = parseBettingIntent(command);
      if (fallback.ok) return { ok: true, kind: "bet", intent: fallback.intent };
      return { ok: false, message };
    }

    if (payload?.kind === "chat" && typeof payload.reply === "string") {
      const fallback = parseBettingIntent(command);
      if (fallback.ok) {
        return { ok: true, kind: "bet", intent: fallback.intent };
      }
      return { ok: true, kind: "chat", reply: payload.reply.trim(), locale };
    }

    const intentPayload = payload?.intent ?? payload;
    const normalized = normalizeLlmIntent(intentPayload, command, locale);
    if (!normalized.ok) {
      const fallback = parseBettingIntent(command);
      if (fallback.ok) return { ok: true, kind: "bet", intent: fallback.intent };
      // Soft-fail into chat-style message when available
      if (typeof intentPayload?.message === "string") {
        return { ok: true, kind: "chat", reply: intentPayload.message, locale };
      }
      return normalized;
    }
    return { ok: true, kind: "bet", intent: normalized.intent };
  } catch (error) {
    const fallback = parseBettingIntent(command);
    if (fallback.ok) return { ok: true, kind: "bet", intent: fallback.intent };
    return {
      ok: false,
      message: error instanceof Error ? error.message : msg(locale, "parseFailed")
    };
  }
}

function answerBalanceQuestion(
  command: string,
  locale: ReplyLocale,
  session: { loggedIn: boolean; pointsBalance: number | null }
): string | null {
  const asksBalance =
    /(how many points|points?(?:\s+do\s+i\s+have)?|my\s+balance|current\s+balance|잔액|포인트\s*(?:얼마|몇|잔고)?|얼마\s*(?:있어|남|야)|몇\s*포인트)/i.test(
      command
    ) &&
    !/(buy|purchase|충전|사|구매|checkout|lose|lost|win|won|profit|pnl|손익|잃|벌|수익)/i.test(command);
  if (!asksBalance) return null;

  if (!session.loggedIn) {
    return msg(locale, "loginRequired");
  }

  const points = Number(session.pointsBalance);
  if (!Number.isFinite(points)) {
    return msg(locale, "balanceUnknown");
  }

  return msg(locale, "balanceAnswer", { points: Math.round(points).toLocaleString() });
}

function isPnlQuestion(command: string): boolean {
  return /(how much.*(lose|lost|win|won|profit|make)|am i (winning|losing)|net\s*(pnl|profit|loss)|betting\s*(pnl|profit|loss|record)|win\s*rate|손익|수익|얼마\s*(잃|벌|이가)|지고\s*있|이기고\s*있|손실|얼마\s*손해|얼마\s*이득|승패)/i.test(
    command
  );
}

async function answerPnlQuestion(locale: ReplyLocale): Promise<string> {
  const { listBetsWithSession } = await import("./supabase");
  const rows = await listBetsWithSession();
  let won = 0;
  let lost = 0;
  let pending = 0;
  let pendingStake = 0;
  let staked = 0;
  let payout = 0;
  let net = 0;

  for (const row of rows) {
    const stake = Number(row.stake_points ?? 0);
    const paid = Number(row.payout_points ?? 0);
    const status = String(row.status || "").toLowerCase();
    if (status === "won" || status === "lost") {
      staked += Number.isFinite(stake) ? stake : 0;
      payout += Number.isFinite(paid) ? paid : 0;
      net += (Number.isFinite(paid) ? paid : 0) - (Number.isFinite(stake) ? stake : 0);
      if (status === "won") won += 1;
      else lost += 1;
    } else {
      pending += 1;
      pendingStake += Number.isFinite(stake) ? stake : 0;
    }
  }

  const pendingNote =
    pending > 0
      ? locale === "ko"
        ? ` 미정산 ${pending}건(${Math.round(pendingStake).toLocaleString()} pts) 있어요.`
        : locale === "ja"
          ? ` 未精算 ${pending}件（${Math.round(pendingStake).toLocaleString()} pts）あり。`
          : locale === "zh"
            ? ` 另有未结算 ${pending} 笔（${Math.round(pendingStake).toLocaleString()} pts）。`
            : locale === "es"
              ? ` Además hay ${pending} pendientes (${Math.round(pendingStake).toLocaleString()} pts).`
              : ` Also ${pending} pending bet(s) totaling ${Math.round(pendingStake).toLocaleString()} pts.`
      : "";

  if (won + lost === 0) {
    return msg(locale, "pnlNoSettled", { pending: pendingNote });
  }

  const roundedNet = Math.round(net);
  const vars = {
    pnl: `${roundedNet > 0 ? "+" : ""}${roundedNet.toLocaleString()}`,
    won,
    lost,
    staked: Math.round(staked).toLocaleString(),
    payout: Math.round(payout).toLocaleString(),
    pending: pendingNote
  };

  if (roundedNet > 0) return msg(locale, "pnlWinning", vars);
  if (roundedNet < 0) return msg(locale, "pnlLosing", vars);
  return msg(locale, "pnlEven", vars);
}

export async function parseBettingIntentWithLlm(
  rawInput: string
): Promise<{ ok: true; intent: BettingIntent } | { ok: false; message: string }> {
  const result = await askAssistant(rawInput);
  if (!result.ok) return result;
  if (result.kind === "bet") return { ok: true, intent: result.intent };
  return { ok: false, message: result.reply };
}

function normalizeLlmIntent(
  raw: any,
  command: string,
  locale: ReplyLocale
): { ok: true; intent: BettingIntent } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: withHelp(locale, "emptyAi") };
  }
  if (raw.error === "not_a_bet") {
    return {
      ok: false,
      message: String(raw.message || withHelp(locale, "notABet"))
    };
  }

  const category: MarketCategory = raw.category === "stocks" ? "stocks" : "crypto";
  const allowed = new Set(getTokensByCategory(category).map((token) => token.symbol));
  const stake = Math.round(Number(raw.stake ?? DEFAULT_STAKE));
  if (!Number.isFinite(stake) || stake < 10) {
    return { ok: false, message: msg(locale, "stakeTooLow") };
  }

  const picks = (Array.isArray(raw.picks) ? raw.picks : [])
    .map((pick: any) => {
      const symbol = canonicalizeSymbol(pick?.symbol);
      const place = canonicalizePlace(pick?.place);
      if (!symbol || !place || !allowed.has(symbol)) return null;
      return { symbol, place } as TokenPlacePick;
    })
    .filter(Boolean) as TokenPlacePick[];

  if (!picks.length) {
    return { ok: false, message: withHelp(locale, "unknownToken") };
  }

  const requireAlso = (Array.isArray(raw.requireAlso) ? raw.requireAlso : [])
    .map((symbol: unknown) => canonicalizeSymbol(symbol))
    .filter((symbol: string | null): symbol is string => Boolean(symbol && allowed.has(symbol)));

  const excludeAlso = (Array.isArray(raw.excludeAlso) ? raw.excludeAlso : [])
    .map((symbol: unknown) => canonicalizeSymbol(symbol))
    .filter((symbol: string | null): symbol is string => Boolean(symbol && allowed.has(symbol)));

  const marketQueries = (Array.isArray(raw.marketNames) ? raw.marketNames : Array.isArray(raw.marketQueries) ? raw.marketQueries : [])
    .map((value: unknown) => String(value || "").trim())
    .filter(Boolean);

  const demoteOnOverlap = (Array.isArray(raw.demoteOnOverlap) ? raw.demoteOnOverlap : [])
    .map((rule: any) => {
      const symbol = canonicalizeSymbol(rule?.symbol);
      const demoteTo = canonicalizePlace(rule?.demoteTo);
      if (!symbol || !demoteTo || demoteTo === "first" || !allowed.has(symbol)) return null;
      return { symbol, demoteTo } as ConflictDemoteRule;
    })
    .filter(Boolean) as ConflictDemoteRule[];

  const placementMode = canonicalizePlacementMode(raw.placementMode);
  const intent: BettingIntent = {
    category,
    stake,
    scope: "all",
    picks,
    requireAlso: [...new Set(requireAlso)].filter((symbol) => !excludeAlso.includes(symbol)),
    excludeAlso: [...new Set(excludeAlso)],
    marketQueries: [...new Set(marketQueries)],
    demoteOnOverlap,
    placementMode,
    clarificationQuestion:
      typeof raw.clarificationQuestion === "string" ? raw.clarificationQuestion.trim() : undefined,
    locale,
    raw: command
  };

  // Never trust a guessed independent/joint for short multi-pick commands without cues.
  if (shouldForceClarification(intent, command)) {
    intent.placementMode = null;
  } else if (!intent.placementMode) {
    intent.placementMode = inferPlacementModeFromText(command, intent);
  }

  return { ok: true, intent };
}

function canonicalizeSymbol(value: unknown): string | null {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return null;
  return SYMBOL_ALIASES[raw] ?? raw;
}

function canonicalizePlace(value: unknown): BetPlace | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (["first", "1", "1st", "1등", "일등"].includes(raw)) return "first";
  if (["second", "2", "2nd", "2등", "이등"].includes(raw)) return "second";
  if (["third", "3", "3rd", "3등", "삼등"].includes(raw)) return "third";
  return null;
}

function canonicalizePlacementMode(value: unknown): PlacementMode | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "joint" || raw === "together" || raw === "same") return "joint";
  if (raw === "independent" || raw === "separate" || raw === "each") return "independent";
  return null;
}

function hasExplicitPlacementModeCue(text: string): PlacementMode | null {
  if (
    /(둘\s*다\s*있는|같이\s*있는\s*마켓|같은\s*마켓|한\s*장|동시에|조인트|joint|together|같은\s*레이스)/i.test(
      text
    )
  ) {
    return "joint";
  }
  if (/(각각|따로|있는\s*(?:곳|시장|마켓)마다|독립|independent|separate|each\s+market)/i.test(text)) {
    return "independent";
  }
  return null;
}

function inferPlacementModeFromText(
  text: string,
  intent: Pick<BettingIntent, "picks" | "demoteOnOverlap">
): PlacementMode | null {
  const explicit = hasExplicitPlacementModeCue(text);
  if (explicit) return explicit;
  if (intent.demoteOnOverlap.length > 0) return "independent";
  if (intent.picks.length <= 1) return "joint";
  return null;
}

function shouldForceClarification(intent: BettingIntent, text: string): boolean {
  if (intent.picks.length < 2) return false;
  if (intent.demoteOnOverlap.length > 0) return false;
  if (hasExplicitPlacementModeCue(text)) return false;
  // Multi-pick tickets without an explicit joint/independent cue must ask.
  return true;
}

function parseClarificationChoice(text: string): PlacementMode | null {
  const normalized = text.trim().toLowerCase();
  if (
    /^(1|①|같이|둘\s*다|조인트|joint|together|추천|一緒|一起|juntos)[!?.]*$/i.test(normalized)
  ) {
    return "joint";
  }
  if (
    /^(2|②|각각|따로|independent|separate|別々|分开|separado)[!?.]*$/i.test(normalized)
  ) {
    return "independent";
  }
  if (
    /(같이|둘\s*다\s*있는|한\s*장|together|joint|一緒|一起|juntos)/i.test(normalized) &&
    !/(각각|따로|separate|independent|別々|分开|separado)/i.test(normalized)
  ) {
    return "joint";
  }
  if (/(각각|따로|separate|independent|別々|分开|separado)/i.test(normalized)) {
    return "independent";
  }
  return null;
}

export function parseBettingIntent(rawInput: string): { ok: true; intent: BettingIntent } | { ok: false; message: string } {
  const input = rawInput.trim();
  const locale = detectReplyLocale(input);
  if (!input) {
    return { ok: false, message: withHelp(locale, "emptyCommand") };
  }

  const normalized = input.replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  const looksLikeBet =
    /(걸|베팅|bet|place|걸어|걸어줘|넣어|all markets|모든\s*시장|전\s*시장|같이|겹치)/i.test(normalized) ||
    Object.values(PLACE_WORD).some((pattern) => pattern.test(normalized)) ||
    Boolean(findAllTokensInText(normalized).length);

  if (!looksLikeBet) {
    return { ok: false, message: withHelp(locale, "notABet") };
  }

  const preferredCategory: MarketCategory = /(stock|stocks|스톡|주식)/i.test(lower) ? "stocks" : "crypto";
  const mentioned = findAllTokensInText(normalized, preferredCategory);
  if (!mentioned.length) {
    return { ok: false, message: withHelp(locale, "unknownToken") };
  }

  const category: MarketCategory = mentioned.every((token) => token.category === "stocks")
    ? "stocks"
    : mentioned.some((token) => token.category === "crypto")
      ? "crypto"
      : preferredCategory;

  const stakeMatch =
    normalized.match(/(\d+)\s*(?:pts?|points?|포인트|점)/i) ??
    normalized.match(/(?:stake|스테이크)\s*[:=]?\s*(\d+)/i);
  const stake = stakeMatch ? Number(stakeMatch[1]) : DEFAULT_STAKE;
  if (!Number.isFinite(stake) || stake < 10) {
    return { ok: false, message: msg(locale, "stakeTooLow") };
  }

  // Filter-only tokens ("BTC랑 같이") are not stake picks unless they have their own place words.
  // Exclude-only tokens ("BTC 없는") are never picks.
  const picks = extractPicks(normalized, mentioned).filter((pick) => {
    const token = mentioned.find((entry) => entry.symbol === pick.symbol);
    if (!token) return true;
    if (extractExcludeAlso(normalized, [token]).includes(token.symbol)) return false;
    if (!isLikelyFilterOnly(normalized, token)) return true;
    return hasExplicitPlaceNearToken(normalized, token);
  });
  if (!picks.length) {
    return {
      ok: false,
      message: withHelp(locale, "needPlace")
    };
  }

  const pickSymbols = new Set(picks.map((pick) => pick.symbol));
  const requireAlso = extractRequireAlso(normalized, mentioned, pickSymbols).filter(
    (symbol) => !pickSymbols.has(symbol) || isLikelyFilterOnly(normalized, mentioned.find((token) => token.symbol === symbol)!)
  );
  const requireAlsoUnique = [...new Set(requireAlso)];
  const excludeAlso = extractExcludeAlso(normalized, mentioned).filter(
    (symbol) => !requireAlsoUnique.includes(symbol)
  );
  const marketQueries = extractMarketQueries(normalized, category);
  const demoteOnOverlap = extractDemoteRules(normalized, mentioned);

  const intent: BettingIntent = {
    category,
    stake: Math.round(stake),
    scope: "all",
    picks,
    requireAlso: requireAlsoUnique,
    excludeAlso,
    marketQueries,
    demoteOnOverlap,
    placementMode: inferPlacementModeFromText(normalized, {
      picks,
      demoteOnOverlap
    } as BettingIntent),
    locale,
    raw: normalized
  };

  if (shouldForceClarification(intent, normalized)) {
    intent.placementMode = null;
  }

  return { ok: true, intent };
}

export function needsPlacementClarification(intent: BettingIntent): boolean {
  if (intent.picks.length < 2) return false;
  if (intent.placementMode) return false;
  // Overlap demote rules already describe independent multi-first handling.
  if (intent.demoteOnOverlap.length > 0) return false;
  return true;
}

export function buildClarification(intent: BettingIntent): BettingClarification {
  const locale = intent.locale || "en";
  const pickSummary = intent.picks
    .map((pick) => `${pick.symbol} ${formatPlaceLabel(pick.place, locale)}`)
    .join(" + ");
  const question =
    intent.clarificationQuestion?.trim() ||
    [
      msg(locale, "clarifyDefault", { picks: pickSummary }),
      "",
      msg(locale, "clarifyPrompt", { picks: pickSummary })
    ].join("\n");

  return {
    intent,
    question,
    options: [
      { id: "joint", label: msg(locale, "optionJoint") },
      { id: "independent", label: msg(locale, "optionIndependent") }
    ]
  };
}

export function resolveClarificationReply(
  reply: string,
  clarification: BettingClarification
):
  | { ok: true; intent: BettingIntent }
  | { ok: false; cancelled: true; message: string }
  | { ok: false; cancelled: false; message: string } {
  const text = reply.trim();
  const locale = clarification.intent.locale || detectReplyLocale(text) || "en";
  if (isBettingCancel(text)) {
    return { ok: false, cancelled: true, message: msg(locale, "cancelled") };
  }

  const mode = parseClarificationChoice(text);
  if (!mode) {
    return {
      ok: false,
      cancelled: false,
      message: msg(locale, "clarifyStillAmbiguous")
    };
  }

  return {
    ok: true,
    intent: { ...clarification.intent, placementMode: mode }
  };
}

export function buildBettingPreview(
  intent: BettingIntent,
  pointsBalance: number
): { ok: true; preview: BettingPreview } | { ok: false; message: string } {
  if (needsPlacementClarification(intent)) {
    return {
      ok: false,
      message: buildClarification(intent).question
    };
  }

  const placementMode: PlacementMode =
    intent.placementMode ?? (intent.demoteOnOverlap.length > 0 ? "independent" : "joint");

  const allMarkets = getMarketsByCategory(intent.category);
  const tokenBySymbol = new Map(
    getTokensByCategory(intent.category).map((token) => [token.symbol, token])
  );

  for (const pick of intent.picks) {
    if (!tokenBySymbol.has(pick.symbol)) {
      return {
        ok: false,
        message: msg(intent.locale || "en", "tokenMissing", {
          symbol: pick.symbol,
          category: intent.category
        })
      };
    }
  }
  for (const symbol of intent.requireAlso) {
    if (!tokenBySymbol.has(symbol)) {
      return {
        ok: false,
        message: msg(intent.locale || "en", "tokenMissing", {
          symbol,
          category: intent.category
        })
      };
    }
  }
  for (const symbol of intent.excludeAlso) {
    if (!tokenBySymbol.has(symbol)) {
      return {
        ok: false,
        message: msg(intent.locale || "en", "tokenMissing", {
          symbol,
          category: intent.category
        })
      };
    }
  }

  const namedMarkets = resolveMarketsByQueries(intent.marketQueries, intent.category);
  if (intent.marketQueries.length > 0 && namedMarkets.length === 0) {
    return {
      ok: false,
      message: msg(intent.locale || "en", "noMarkets")
    };
  }
  const namedMarketIds = namedMarkets.length > 0 ? new Set(namedMarkets.map((market) => market.id)) : null;

  const plans: MarketBetPlan[] = [];
  for (const market of allMarkets) {
    if (namedMarketIds && !namedMarketIds.has(market.id)) {
      continue;
    }

    const marketSymbols = new Set(
      market.tokenLetters
        .map((letter) => getTokenByLetter(letter, intent.category)?.symbol)
        .filter(Boolean) as string[]
    );

    if (intent.requireAlso.some((symbol) => !marketSymbols.has(symbol))) {
      continue;
    }
    if (intent.excludeAlso.some((symbol) => marketSymbols.has(symbol))) {
      continue;
    }

    if (placementMode === "joint") {
      if (intent.picks.some((pick) => !marketSymbols.has(pick.symbol))) {
        continue;
      }
    }

    const relevantPicks =
      placementMode === "joint"
        ? intent.picks
        : intent.picks.filter((pick) => marketSymbols.has(pick.symbol));
    if (!relevantPicks.length) {
      continue;
    }

    const placements = resolvePlacements(relevantPicks, intent.demoteOnOverlap);
    if (!placements.first && !placements.second && !placements.third) {
      continue;
    }

    plans.push({
      market,
      placements,
      label: formatPlacementLabel(placements)
    });
  }

  if (!plans.length) {
    return {
      ok: false,
      message: msg(intent.locale || "en", "noMarkets")
    };
  }

  const totalStake = plans.length * intent.stake;
  if (pointsBalance < totalStake) {
    return {
      ok: false,
      message: msg(intent.locale || "en", "insufficientBalance", {
        need: totalStake.toLocaleString(),
        have: pointsBalance.toLocaleString()
      })
    };
  }

  const locale = intent.locale || "en";
  const targetRaceStartedAt = new Date(getNextRaceBoundary(Date.now())).toISOString();
  const skippedCount = allMarkets.length - plans.length;
  const pickSummary = intent.picks
    .map((pick) => `${pick.symbol} ${formatPlaceLabel(pick.place, locale)}`)
    .join(" + ");
  const filterSummary = intent.requireAlso.length
    ? msg(locale, "filterOnly", { symbols: intent.requireAlso.join(", ") })
    : null;
  const excludeSummary = intent.excludeAlso.length
    ? msg(locale, "filterExclude", { symbols: intent.excludeAlso.join(", ") })
    : null;
  const marketSummary =
    namedMarkets.length > 0
      ? msg(locale, "filterMarkets", {
          markets: namedMarkets.map((market) => market.name).join(", ")
        })
      : null;
  const demoteSummary = intent.demoteOnOverlap.length
    ? `${msg(locale, "demotePrefix")} ${intent.demoteOnOverlap
        .map((rule) => `${rule.symbol}→${formatPlaceLabel(rule.demoteTo, locale)}`)
        .join(", ")}`
    : null;

  const detailLines = summarizePlanGroups(plans);
  const modeSummary =
    intent.picks.length >= 2
      ? msg(locale, placementMode === "joint" ? "modeJoint" : "modeIndependent")
      : null;
  const summary = [
    pickSummary,
    modeSummary,
    msg(locale, "marketsStake", {
      count: plans.length,
      stake: intent.stake.toLocaleString(),
      total: totalStake.toLocaleString()
    }),
    marketSummary,
    filterSummary,
    excludeSummary,
    demoteSummary,
    skippedCount > 0 ? msg(locale, "skipped", { count: skippedCount }) : null,
    msg(locale, "nextRace", { time: formatKstTime(targetRaceStartedAt) })
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ok: true,
    preview: {
      intent,
      plans,
      skippedCount,
      totalStake,
      targetRaceStartedAt,
      summary,
      detailLines
    }
  };
}

export async function executeBatchBets(
  preview: BettingPreview,
  onProgress?: (message: string) => void
): Promise<BatchBetResult> {
  const { getOrCreateMarketRatioSnapshot, getLoginSessionToken, supabase } = await import("./supabase");

  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    throw new Error("Login required before placing a bet.");
  }

  const { intent, plans, targetRaceStartedAt } = preview;
  const locale = intent.locale || "en";
  const placed: BatchBetResult["placed"] = [];
  const failed: BatchBetResult["failed"] = [];
  let pointsBalance: number | null = null;

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    onProgress?.(
      msg(locale, "placing", {
        index: index + 1,
        total: plans.length,
        market: plan.market.name,
        label: plan.label
      })
    );

    const marketTokens = plan.market.tokenLetters
      .map((letter) => getTokenByLetter(letter, intent.category))
      .filter(Boolean) as Token[];
    const symbols = marketTokens.map((entry) => entry.symbol);

    try {
      const ratios = await loadRatiosSafe(getOrCreateMarketRatioSnapshot, plan.market.id, targetRaceStartedAt, symbols);
      const { data, error } = await supabase.rpc("create_bet_with_login_session", {
        requested_session_token: sessionToken,
        requested_stake_points: intent.stake,
        requested_first_pick: plan.placements.first,
        requested_second_pick: plan.placements.second,
        requested_third_pick: plan.placements.third,
        requested_ratio_snapshot: ratios,
        requested_market_id: plan.market.id,
        requested_target_race_started_at: targetRaceStartedAt
      });

      if (error) {
        throw new Error(error.message || "Bet save failed.");
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (Number.isFinite(Number(row?.points_balance))) {
        pointsBalance = Number(row.points_balance);
      }

      placed.push({ marketId: plan.market.id, marketName: plan.market.name });
    } catch (error) {
      failed.push({
        marketId: plan.market.id,
        marketName: plan.market.name,
        message: error instanceof Error ? error.message : "Bet save failed."
      });
    }
  }

  const summary = [
    msg(locale, "batchSuccess", { count: placed.length }),
    failed.length ? msg(locale, "batchFailed", { count: failed.length }) : null,
    pointsBalance != null ? msg(locale, "balance", { points: pointsBalance.toLocaleString() }) : null
  ]
    .filter(Boolean)
    .join(" · ");

  return { placed, failed, pointsBalance, summary };
}

function extractPicks(text: string, mentioned: Token[]): TokenPlacePick[] {
  const picks: TokenPlacePick[] = [];
  const seen = new Set<string>();

  // Patterns like "SOL 1등", "1등 SOL", "SOL을 1등으로"
  for (const token of mentioned) {
    const aliases = tokenAliases(token);
    for (const alias of aliases) {
      const escaped = escapeRegExp(alias);
      const patterns = [
        new RegExp(`${escaped}\\s*(?:을|를|은|는)?\\s*(1\\s*등|2\\s*등|3\\s*등|일등|이등|삼등|1st|2nd|3rd|first|second|third)`, "i"),
        new RegExp(`(1\\s*등|2\\s*등|3\\s*등|일등|이등|삼등|1st|2nd|3rd|first|second|third)\\s*(?:에|으로|로)?\\s*${escaped}`, "i")
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const place = parsePlaceWord(match[1] ?? match[0]);
        if (!place || seen.has(token.symbol)) continue;
        picks.push({ symbol: token.symbol, place });
        seen.add(token.symbol);
      }
    }
  }

  // "SOL이랑 DOGE 1등" / "SOL, DOGE 1등" — shared place for remaining tokens
  if (!picks.length || picks.length < mentioned.length) {
    const sharedPlace =
      PLACE_ORDER.map((place) => (PLACE_WORD[place].test(text) ? place : null)).find(Boolean) ??
      (/(걸|베팅|걸어)/i.test(text) ? "first" : null);

    if (sharedPlace) {
      for (const token of mentioned) {
        if (seen.has(token.symbol)) continue;
        // Skip tokens that look like filter-only ("BTC랑 같이") without being a pick subject
        if (isLikelyFilterOnly(text, token) && picks.length > 0) continue;
        picks.push({ symbol: token.symbol, place: sharedPlace });
        seen.add(token.symbol);
      }
    }
  }

  // If still empty but tokens + bet verb exist, default first
  if (!picks.length && /(걸|베팅|걸어|bet)/i.test(text)) {
    for (const token of mentioned) {
      if (isLikelyFilterOnly(text, token)) continue;
      picks.push({ symbol: token.symbol, place: "first" });
    }
  }

  return picks;
}

function extractRequireAlso(text: string, mentioned: Token[], pickSymbols: Set<string>): string[] {
  const required: string[] = [];
  const lower = text.toLowerCase();

  for (const token of mentioned) {
    if (pickSymbols.has(token.symbol) && !isLikelyFilterOnly(text, token)) {
      // Can still be both pick and filter; only treat as requireAlso when filter phrasing hits
    }
    const aliases = tokenAliases(token);
    const isFilter = aliases.some((alias) => {
      const escaped = escapeRegExp(alias);
      return new RegExp(
        `(?:${escaped}\\s*(?:랑|이랑|와|과|있는|포함|같이)|(?:같이|있는|포함|with|and).{0,12}${escaped}|${escaped}\\s*마켓)`,
        "i"
      ).test(text);
    });

    if (!isFilter) continue;

    // "BTC랑 같이 있는" / "BTC 마켓이랑 같이" — BTC is co-token filter
    // If token also has an explicit place pick in text near it, it's a pick not only filter
    const hasOwnPlace = aliases.some((alias) => {
      const escaped = escapeRegExp(alias);
      return new RegExp(
        `${escaped}\\s*(?:을|를|은|는)?\\s*(1\\s*등|2\\s*등|3\\s*등|1st|2nd|3rd|first|second|third)|(1\\s*등|2\\s*등|3\\s*등|first|second|third)\\s*${escaped}`,
        "i"
      ).test(text);
    });

    if (hasOwnPlace && !/(같이|있는\s*거|있는\s*마켓|함께|with)/i.test(lower)) {
      continue;
    }

    // Exclusion phrasing should not also count as requireAlso
    if (aliases.some((alias) => isExcludePhraseForAlias(text, alias))) {
      continue;
    }

    if (!required.includes(token.symbol)) {
      required.push(token.symbol);
    }
  }

  return required;
}

function extractExcludeAlso(text: string, mentioned: Token[]): string[] {
  const excluded: string[] = [];
  for (const token of mentioned) {
    const hit = tokenAliases(token).some((alias) => isExcludePhraseForAlias(text, alias));
    if (hit && !excluded.includes(token.symbol)) {
      excluded.push(token.symbol);
    }
  }
  return excluded;
}

function isExcludePhraseForAlias(text: string, alias: string): boolean {
  const escaped = escapeRegExp(alias);
  return new RegExp(
    `(?:${escaped}\\s*(?:가|이|은|는)?\\s*(?:없는|제외|빼고|없이)|(?:without|except|excluding|no)\\s+${escaped})`,
    "i"
  ).test(text);
}

function extractMarketQueries(text: string, category: MarketCategory): string[] {
  const markets = getMarketsByCategory(category);
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const market of markets) {
    const name = market.name;
    if (name.length < 4) continue;
    if (lower.includes(name.toLowerCase())) {
      found.push(name);
      continue;
    }
    // Loose match without spaces/punctuation: "nightfall chase" / "NightfallChase"
    const compactName = normalizeMarketKey(name);
    const compactText = normalizeMarketKey(text);
    if (compactName.length >= 6 && compactText.includes(compactName)) {
      found.push(name);
    }
  }

  return [...new Set(found)];
}

function resolveMarketsByQueries(queries: string[], category: MarketCategory): Market[] {
  if (!queries.length) return [];
  const markets = getMarketsByCategory(category);
  const matched = new Map<string, Market>();

  for (const query of queries) {
    const key = normalizeMarketKey(query);
    if (!key) continue;
    for (const market of markets) {
      const nameKey = normalizeMarketKey(market.name);
      const idKey = normalizeMarketKey(market.id);
      if (
        nameKey === key ||
        idKey === key ||
        nameKey.includes(key) ||
        key.includes(nameKey) ||
        idKey.includes(key)
      ) {
        matched.set(market.id, market);
      }
    }
  }

  return [...matched.values()];
}

function normalizeMarketKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "");
}

function extractDemoteRules(text: string, mentioned: Token[]): ConflictDemoteRule[] {
  const rules: ConflictDemoteRule[] = [];
  if (!/(겹치|충돌|같이\s*있는\s*레이스|같은\s*시장|오버랩|overlap)/i.test(text)) {
    // Also allow "있으면 doge를 2등" without 겹치 if demote phrasing is clear
    if (!/(있으면|경우).{0,20}(2\s*등|3\s*등|이등|삼등|second|third)/i.test(text)) {
      return rules;
    }
  }

  for (const token of mentioned) {
    const aliases = tokenAliases(token);
    for (const alias of aliases) {
      const escaped = escapeRegExp(alias);
      const match = text.match(
        new RegExp(
          `${escaped}\\s*(?:을|를|은|는)?\\s*(2\\s*등|3\\s*등|이등|삼등|2nd|3rd|second|third)|(2\\s*등|3\\s*등|이등|삼등|2nd|3rd|second|third)\\s*(?:으로|로)?\\s*${escaped}`,
          "i"
        )
      );
      if (!match) continue;
      const placeWord = match[1] || match[2] || match[0];
      const demoteTo = parsePlaceWord(placeWord);
      if (!demoteTo || demoteTo === "first") continue;
      if (!rules.some((rule) => rule.symbol === token.symbol)) {
        rules.push({ symbol: token.symbol, demoteTo });
      }
    }
  }

  return rules;
}

function resolvePlacements(
  picks: TokenPlacePick[],
  demoteRules: ConflictDemoteRule[]
): { first: string | null; second: string | null; third: string | null } {
  const placements: { first: string | null; second: string | null; third: string | null } = {
    first: null,
    second: null,
    third: null
  };

  const working = picks.map((pick) => ({ ...pick }));

  // Apply demote when multiple first-place prefs collide
  const firstPrefs = working.filter((pick) => pick.place === "first");
  if (firstPrefs.length > 1) {
    for (const pick of working) {
      const rule = demoteRules.find((entry) => entry.symbol === pick.symbol);
      if (rule && pick.place === "first") {
        pick.place = rule.demoteTo;
      }
    }
  }

  // Assign by place priority; if occupied, shift down
  const ordered = [...working].sort(
    (left, right) => PLACE_ORDER.indexOf(left.place) - PLACE_ORDER.indexOf(right.place)
  );

  for (const pick of ordered) {
    let place = pick.place;
    while (place && placements[place]) {
      const nextIndex = PLACE_ORDER.indexOf(place) + 1;
      place = PLACE_ORDER[nextIndex] ?? null;
    }
    if (!place) continue;
    placements[place] = pick.symbol;
  }

  return placements;
}

function summarizePlanGroups(plans: MarketBetPlan[]): string[] {
  const groups = new Map<string, string[]>();
  for (const plan of plans) {
    const rows = groups.get(plan.label) ?? [];
    rows.push(plan.market.name);
    groups.set(plan.label, rows);
  }

  return [...groups.entries()].map(([label, names]) => {
    const shown = names.slice(0, 6).join(", ");
    const more = names.length > 6 ? ` 외 ${names.length - 6}곳` : "";
    return `${label}: ${names.length}곳 (${shown}${more})`;
  });
}

function hasExplicitPlaceNearToken(text: string, token: Token): boolean {
  return tokenAliases(token).some((alias) => {
    const escaped = escapeRegExp(alias);
    return new RegExp(
      `${escaped}\\s*(?:을|를|은|는)?\\s*(1\\s*등|2\\s*등|3\\s*등|일등|이등|삼등|1st|2nd|3rd|first|second|third)|(1\\s*등|2\\s*등|3\\s*등|일등|이등|삼등|1st|2nd|3rd|first|second|third)\\s*(?:에|으로|로)?\\s*${escaped}`,
      "i"
    ).test(text);
  });
}

function isLikelyFilterOnly(text: string, token: Token): boolean {
  const aliases = tokenAliases(token);
  if (aliases.some((alias) => isExcludePhraseForAlias(text, alias))) {
    return true;
  }
  return aliases.some((alias) => {
    const escaped = escapeRegExp(alias);
    return new RegExp(
      `${escaped}\\s*마켓|${escaped}\\s*(?:랑|이랑|와|과)?\\s*(?:같이|있는|포함)|(?:같이|있는|with).{0,16}${escaped}|${escaped}\\s*마켓(?:이랑|랑|와|과)?\\s*같이`,
      "i"
    ).test(text);
  });
}

function findAllTokensInText(text: string, preferredCategory?: MarketCategory): Token[] {
  const lower = text.toLowerCase();
  const candidates = preferredCategory
    ? [...getTokensByCategory(preferredCategory), ...tokens.filter((token) => token.category !== preferredCategory)]
    : tokens;

  const found: Token[] = [];
  for (const token of candidates) {
    const aliases = tokenAliases(token);
    const hit = aliases.some((alias) => {
      // ASCII short tickers need word boundaries ("sol" vs noise).
      // Korean / longer names should use substring match ("도지", "솔라나").
      if (/^[a-z0-9]+$/i.test(alias) && alias.length <= 3) {
        return new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(text);
      }
      return lower.includes(alias);
    });
    if (hit && !found.some((entry) => entry.symbol === token.symbol && entry.category === token.category)) {
      found.push(token);
    }
  }

  // Prefer longer alias matches first by sorting mentioned order in text
  found.sort((left, right) => {
    const leftIndex = earliestAliasIndex(lower, left);
    const rightIndex = earliestAliasIndex(lower, right);
    return leftIndex - rightIndex;
  });

  return found;
}

function earliestAliasIndex(lower: string, token: Token) {
  let best = Number.POSITIVE_INFINITY;
  for (const alias of tokenAliases(token)) {
    const index = lower.indexOf(alias);
    if (index >= 0 && index < best) best = index;
  }
  return best;
}

const KOREAN_TOKEN_ALIASES: Record<string, string[]> = {
  BTC: ["비트코인", "비트"],
  ETH: ["이더리움", "이더"],
  SOL: ["솔라나", "솔"],
  DOGE: ["도지", "도지코인"],
  XRP: ["리플"],
  TRX: ["트론"],
  BNB: ["바이낸스"],
  ADA: ["에이다", "카르다노"],
  SUI: ["수이"],
  LTC: ["라이트코인", "라이트"],
  COINBASE: ["코인베이스"],
  GOOGLE: ["구글"],
  TSLA: ["테슬라"],
  NVDA: ["엔비디아"],
  META: ["메타", "페이스북"],
  MSFT: ["마이크로소프트"],
  AAPL: ["애플"],
  IBM: ["아이비엠"],
  PLTR: ["팔란티어"],
  CRCL: ["서클"]
};

function tokenAliases(token: Token): string[] {
  const korean = KOREAN_TOKEN_ALIASES[token.symbol] ?? [];
  return [token.symbol, token.shortSymbol, token.name, token.id, ...korean]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .sort((left, right) => right.length - left.length);
}

function parsePlaceWord(value: string): BetPlace | null {
  const text = value.toLowerCase();
  if (/(1\s*등|일등|1st|first|우승)/i.test(text)) return "first";
  if (/(2\s*등|이등|2nd|second)/i.test(text)) return "second";
  if (/(3\s*등|삼등|3rd|third)/i.test(text)) return "third";
  return null;
}

function formatPlacementLabel(placements: MarketBetPlan["placements"]) {
  return [
    placements.first ? `1:${placements.first}` : null,
    placements.second ? `2:${placements.second}` : null,
    placements.third ? `3:${placements.third}` : null
  ]
    .filter(Boolean)
    .join(" ");
}

function formatPlaceLabel(place: BetPlace, locale: ReplyLocale = "en") {
  if (place === "first") return msg(locale, "placeFirst");
  if (place === "second") return msg(locale, "placeSecond");
  return msg(locale, "placeThird");
}

async function loadRatiosSafe(
  loader: (
    marketId: string,
    targetRaceStartedAt: string,
    marketSymbols: string[]
  ) => Promise<{ ratio_snapshot?: Record<string, any> } | null>,
  marketId: string,
  targetRaceStartedAt: string,
  symbols: string[]
) {
  try {
    const ratioRow = await Promise.race([
      loader(marketId, targetRaceStartedAt, symbols),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000))
    ]);
    return ratioRow?.ratio_snapshot ?? {};
  } catch {
    return {};
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNextRaceBoundary(timestampMs: number) {
  return Math.ceil(timestampMs / RACE_INTERVAL_MS) * RACE_INTERVAL_MS;
}

function formatKstTime(timestamp: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp))} KST`;
}

export function isBettingConfirm(text: string) {
  return /^(y|yes|ok|okay|confirm|확인|응|네|ㄱㄱ|실행|걸어|진행|確認|确认|confirmar)[!?.]*$/i.test(
    text.trim()
  );
}

export function isBettingCancel(text: string) {
  return /^(n|no|cancel|취소|아니|ㄴㄴ|그만|キャンセル|取消|cancelar)[!?.]*$/i.test(text.trim());
}

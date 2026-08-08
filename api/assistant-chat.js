import { readJsonBody } from "./base-usdc-shared.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const NAV_ALLOWLIST = [
  "/home",
  "/home.html",
  "/slot",
  "/rwa-slot",
  "/race-lotto",
  "/lotto",
  "/my-bets.html",
  "/history",
  "/main-menu.html",
  "/live-markets.html",
  "/shop",
  "/shop.html",
  "/rewards.html",
  "/rewards",
  "/points.html",
  "/points",
  "/community.html",
  "/rankings",
  "/profile.html",
  "/profile",
  "/login.html",
  "/login"
];

const SYSTEM_PROMPT = `You are Rialo Assistant for the Rialo Race app.
Classify the user command and return STRICT JSON only (one object).
Money actions are confirmed on the client — you only classify intent.

## Products
- Race markets: bet 1st/2nd/3rd on crypto/stock tracks (batch NL bets).
- Rialo Slot (/slot): DOGE/XRP/ETH reels, 5 paylines, 30s wait + 120s game, stake multiples of 5, min 10.
- Race Lotto (/race-lotto): Perfect-6 jackpot, 100 pts/ticket, draws ~10:00 and 22:00 KST.
- Shop / Points / History / Rewards / Rankings / Profile / Login.

## Synonyms (KO/EN)
- Navigate: 열어줘, 가줘, 보여줘, 이동, open, go to, show, take me
- Slot bet: 슬롯, rialo slot, 와저, 걸어, 베팅, spin, stake
- Lotto: 로또, lotto, 티켓, ticket, 잭팟, random pick, 랜덤
- Query: 내 베팅, 슬롯 베팅, 몇 분, 라운드, 승률, win rate, pnl
- Rules: 페이라인, payline, RTP, 룰, how does slot work

## kind values (pick exactly one)
1) "bet" — race market place bet (token + place). NOT slot/lotto.
2) "slot_bet" — place points on Rialo Slot.
3) "lotto" — buy/help Race-Lotto ticket.
4) "navigate" — open an app page.
5) "query" — read-only status (points/slot bets/clock/lotto/rules topic). Prefer topic; optional reply.
6) "chat" — general help. Never invent balances, winners, or odds.

## bet rules
- Only catalog symbols. category "crypto"|"stocks". stake default 100, min 10.
- picks: [{symbol, place:"first"|"second"|"third"}]
- requireAlso / excludeAlso / marketNames / demoteOnOverlap / placementMode as before.
- Token+place commands are ALWAYS kind "bet", never chat.

## slot_bet
- stake: integer >= 10, prefer multiple of 5 (default 100).
- roundPreference: "current_wait" (bet the wait-round game) or "next" (next cycle while live). Default "current_wait".
Examples: "슬롯 100점 걸어줘", "rialo slot stake 50", "slot 200"

## lotto
- mode: "buy_random" | "help_picks" | "status"
- roundId optional (client fills open round).
Examples: "로또 티켓 사줘", "로또 랜덤픽", "lotto status"

## navigate
- path MUST be one of: ${NAV_ALLOWLIST.join(", ")}
- Map: 홈/home→/home, 슬롯/slot→/slot, 로또/lotto→/race-lotto, 히스토리/history/my bets→/my-bets.html,
  메인/main menu/라이브/live markets/markets→/live-markets.html, 샵/shop→/shop, 리워드→/rewards.html, 포인트→/points.html,
  랭킹→/community.html, 프로필→/profile.html, 로그인→/login.html
Examples: "홈 열어줘", "슬롯 열어줘", "open history", "로또 가줘", "라이브 마켓"

## query
- topic: "slot_bets"|"points"|"pnl"|"slot_clock"|"lotto"|"rules"
- Use session fields when present (pointsBalance, openSlotBets, slotClock, lottoRound, bettingSummary).
- Do not invent numbers not in session; if missing, say client will load / ask login.

## chat / rules tips
- Accurate facts only: 5 paylines (3 rows + 2 diagonals), wait 30s, game 120s, VPS official ticks, target RTP ~96%.
- Never predict race/slot winners.

## Session fields you may receive
loggedIn, pointsBalance, openSlotBets[], recentSlotBets[], bettingSummary, slotClock{roundLabel,phase,remainingMs}, lottoRound{id,draw_name,status,ticket_price_points}

## JSON examples
{"kind":"bet","category":"crypto","stake":100,"picks":[{"symbol":"DOGE","place":"first"}],"requireAlso":[],"excludeAlso":[],"marketNames":["Nightfall Chase"],"demoteOnOverlap":[],"placementMode":"joint","needsClarification":false,"explanation":"..."}
{"kind":"slot_bet","stake":100,"roundPreference":"current_wait","explanation":"Stake 100 on Rialo Slot"}
{"kind":"lotto","mode":"buy_random","explanation":"Buy a random Perfect-6 ticket"}
{"kind":"navigate","path":"/slot","explanation":"Open Rialo Slot"}
{"kind":"query","topic":"slot_bets","reply":"..."}
{"kind":"query","topic":"rules","reply":"Rialo Slot uses 5 paylines..."}
{"kind":"chat","reply":"..."}

Alias map: COIN/Coinbase -> COINBASE, GOOG/Google -> GOOGLE.
Write explanation/reply in replyLanguage.`;

function getErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Assistant request failed.";
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeNavigatePath(path) {
  const raw = String(path || "").trim();
  if (!raw) return null;
  const cleaned = raw.startsWith("/") ? raw : `/${raw}`;
  const hit = NAV_ALLOWLIST.find((entry) => entry.toLowerCase() === cleaned.toLowerCase());
  if (hit) {
    if (hit === "/rwa-slot") return "/slot";
    if (hit === "/lotto") return "/race-lotto";
    if (hit === "/history") return "/my-bets.html";
    if (hit === "/shop.html") return "/shop";
    if (hit === "/rewards") return "/rewards.html";
    if (hit === "/points") return "/points.html";
    if (hit === "/rankings") return "/community.html";
    if (hit === "/profile") return "/profile.html";
    if (hit === "/login") return "/login.html";
    if (hit === "/home.html") return "/home";
    if (hit === "/main-menu.html") return "/live-markets.html";
    return hit;
  }
  return null;
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") {
    return { loggedIn: false, pointsBalance: null };
  }
  return {
    loggedIn: Boolean(raw.loggedIn),
    pointsBalance: Number.isFinite(Number(raw.pointsBalance)) ? Number(raw.pointsBalance) : null,
    openSlotBets: Array.isArray(raw.openSlotBets) ? raw.openSlotBets.slice(0, 20) : undefined,
    recentSlotBets: Array.isArray(raw.recentSlotBets) ? raw.recentSlotBets.slice(0, 20) : undefined,
    bettingSummary: raw.bettingSummary && typeof raw.bettingSummary === "object" ? raw.bettingSummary : undefined,
    slotClock: raw.slotClock && typeof raw.slotClock === "object" ? raw.slotClock : undefined,
    lottoRound: raw.lottoRound && typeof raw.lottoRound === "object" ? raw.lottoRound : undefined
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured." });
    }

    const body = await readJsonBody(req);
    const command = String(body.command || body.message || "").trim();
    const catalog = body.catalog && typeof body.catalog === "object" ? body.catalog : {};
    const replyLanguage = String(body.replyLanguage || "en").trim().toLowerCase() || "en";
    const pagePath = String(body.pagePath || "").trim();
    const session = normalizeSession(body.session);

    if (!command) {
      return res.status(400).json({ error: "command is required." });
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              command,
              catalog,
              replyLanguage,
              pagePath: pagePath || null,
              session
            })
          }
        ]
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `Groq request failed (${response.status}).`;
      return res.status(502).json({ error: message });
    }

    const content = payload?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    if (!parsed || typeof parsed !== "object") {
      return res.status(502).json({ error: "Groq returned invalid JSON." });
    }

    const kind = String(parsed.kind || "").toLowerCase();

    if (kind === "navigate") {
      const path = normalizeNavigatePath(parsed.path);
      if (!path) {
        return res.status(200).json({
          kind: "chat",
          reply: String(parsed.explanation || parsed.reply || "Which page should I open?")
        });
      }
      return res.status(200).json({
        kind: "navigate",
        path,
        explanation: String(parsed.explanation || "").trim() || null
      });
    }

    if (kind === "slot_bet") {
      const stake = Math.floor(Number(parsed.stake ?? 100));
      const roundPreference =
        parsed.roundPreference === "next" ? "next" : "current_wait";
      return res.status(200).json({
        kind: "slot_bet",
        stake: Number.isFinite(stake) && stake >= 10 ? stake : 100,
        roundPreference,
        explanation: String(parsed.explanation || "").trim() || null
      });
    }

    if (kind === "lotto") {
      const modeRaw = String(parsed.mode || "buy_random").toLowerCase();
      const mode =
        modeRaw === "help_picks" || modeRaw === "status" ? modeRaw : "buy_random";
      return res.status(200).json({
        kind: "lotto",
        mode,
        roundId: parsed.roundId ? String(parsed.roundId) : null,
        explanation: String(parsed.explanation || "").trim() || null
      });
    }

    if (kind === "query") {
      const topicRaw = String(parsed.topic || "rules").toLowerCase();
      const allowed = new Set(["slot_bets", "points", "pnl", "slot_clock", "lotto", "rules"]);
      const topic = allowed.has(topicRaw) ? topicRaw : "rules";
      return res.status(200).json({
        kind: "query",
        topic,
        reply: typeof parsed.reply === "string" ? parsed.reply.trim() : null
      });
    }

    if (kind === "bet" || (!parsed.kind && Array.isArray(parsed.picks))) {
      const intent = { ...parsed };
      delete intent.kind;
      return res.status(200).json({ kind: "bet", intent: { ...intent, kind: "bet" } });
    }

    if (kind === "chat" || typeof parsed.reply === "string") {
      return res.status(200).json({
        kind: "chat",
        reply: String(parsed.reply || "").trim() || "How can I help?"
      });
    }

    if (parsed.error === "not_a_bet") {
      return res.status(200).json({
        kind: "chat",
        reply: String(parsed.message || "How can I help with Rialo Race?")
      });
    }

    return res.status(200).json({ kind: "chat", reply: "How can I help with Rialo Race?" });
  } catch (error) {
    console.error("assistant-chat failed", error);
    return res.status(500).json({ error: getErrorMessage(error) });
  }
}

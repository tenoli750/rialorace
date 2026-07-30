import { readJsonBody } from "./base-usdc-shared.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Rialo Assistant for the Rialo Race app (crypto/stock race betting).
Decide if the user wants to PLACE BETS or just CHAT / get help. Return STRICT JSON only.

App facts you can use in chat replies:
- Races run on a fixed clock; users bet points on 1st/2nd/3rd place for tokens in markets.
- Main menu lists crypto/stock tracks. Shop buys points. History shows past bets. Race Lotto is a separate jackpot game.
- Useful paths: /main-menu.html, /shop.html, /my-bets.html, /race-lotto, /login.html, /profile.html, /rewards.html, /rankings or /community.html
- Batch betting understands natural language: all markets, named markets, with/without token filters, overlap demote rules.

If the user is placing bets (kind = "bet"):
- Only use symbols from the provided catalog.
- Prefer market names/ids from catalog.cryptoMarkets / catalog.stockMarkets when the user names a track.
- category must be "crypto" or "stocks".
- stake defaults to 100 if unspecified; minimum 10.
- picks: tokens to bet with place "first"|"second"|"third".
- requireAlso: markets MUST include these tokens (e.g. "markets with BTC" / "BTC랑 같이") — NOT bets.
- excludeAlso: markets must NOT include these tokens (e.g. "markets without BTC" / "BTC 없는 마켓" / "BTC 제외") — NOT bets.
- marketNames: specific tracks to bet on, e.g. "DOGE 1st Nightfall Chase" -> marketNames:["Nightfall Chase"]. Use catalog names; fuzzy OK.
- demoteOnOverlap: e.g. if overlap DOGE -> second.
- placementMode: "joint" | "independent" | null.
  - Single-pick bets (one token+place) are NOT ambiguous: set placementMode "joint" (or omit null).
  - Short multi-pick like "DOGE 1st SOL 2nd" without together/separate cue: placementMode null, needsClarification true.
- Write clarificationQuestion / explanation in the user's language (replyLanguage hint).
- IMPORTANT: Commands that include a token + place + optional market name/filter ARE bets. Do NOT return kind "chat" for them.
  Examples that MUST be kind "bet":
  - "doge 1st nightfall chase"
  - "DOGE 1st on Nightfall Chase"
  - "btc없는 마켓에 도지 1등으로 걸어줘"
  - "ETH 1st on all markets"

If the user is chatting / asking help (kind = "chat"):
- reply with a helpful concise answer in the user's language.
- Do not invent balances, odds, or live race winners.
- IMPORTANT: If session.pointsBalance is a number, that IS the user's current points. Answer directly.
- IMPORTANT: If session.bettingSummary is present, use it for win/loss/profit questions directly.
- If session.loggedIn is false and they ask about points or betting results, say they need to log in.

If unclear whether it's a bet, prefer kind "chat" and ask a short clarifying question — BUT only when there is no clear token+place.
Alias map: COIN/Coinbase -> COINBASE, GOOG/Google -> GOOGLE.

JSON shapes:
{"kind":"bet","category":"crypto","stake":100,"picks":[{"symbol":"DOGE","place":"first"}],"requireAlso":[],"excludeAlso":[],"marketNames":["Nightfall Chase"],"demoteOnOverlap":[],"placementMode":"joint","needsClarification":false,"explanation":"..."}
{"kind":"bet","category":"crypto","stake":100,"picks":[{"symbol":"DOGE","place":"first"}],"requireAlso":[],"excludeAlso":["BTC"],"marketNames":[],"demoteOnOverlap":[],"placementMode":"joint","needsClarification":false,"explanation":"..."}
{"kind":"chat","reply":"..."}`;

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
    const session =
      body.session && typeof body.session === "object"
        ? {
            loggedIn: Boolean(body.session.loggedIn),
            pointsBalance: Number.isFinite(Number(body.session.pointsBalance))
              ? Number(body.session.pointsBalance)
              : null
          }
        : { loggedIn: false, pointsBalance: null };

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
        temperature: 0.2,
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

    // Backward compatible: older clients expected { intent }
    if (parsed.kind === "bet" || (!parsed.kind && Array.isArray(parsed.picks))) {
      const intent = { ...parsed, kind: undefined };
      delete intent.kind;
      return res.status(200).json({ kind: "bet", intent: { ...intent, kind: "bet" } });
    }

    if (parsed.kind === "chat" || typeof parsed.reply === "string") {
      return res.status(200).json({
        kind: "chat",
        reply: String(parsed.reply || "").trim() || "How can I help?"
      });
    }

    // Legacy not_a_bet → chat
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

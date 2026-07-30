import { readJsonBody } from "./base-usdc-shared.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Rialo Assistant for the Rialo Race app (crypto/stock race betting).
Decide if the user wants to PLACE BETS or just CHAT / get help. Return STRICT JSON only.

App facts you can use in chat replies:
- Races run on a fixed clock; users bet points on 1st/2nd/3rd place for tokens in markets.
- Main menu lists crypto/stock tracks. Shop buys points. History shows past bets. Race Lotto is a separate jackpot game.
- Useful paths: /main-menu.html, /shop.html, /my-bets.html, /race-lotto, /login.html, /profile.html, /rewards.html, /rankings or /community.html
- Batch betting: user can say natural language like "ETH 1st on all markets" or Korean equivalents; ambiguous multi-pick tickets should ask together vs separate.

If the user is placing bets (kind = "bet"):
- Only use symbols from the provided catalog.
- category must be "crypto" or "stocks".
- stake defaults to 100 if unspecified; minimum 10.
- picks: tokens to bet with place "first"|"second"|"third".
- requireAlso: co-token filters (not bets) e.g. markets with BTC.
- demoteOnOverlap: e.g. if overlap DOGE -> second.
- placementMode: "joint" | "independent" | null. Short multi-pick like "DOGE 1st SOL 2nd" is AMBIGUOUS — placementMode null, needsClarification true.
- Write clarificationQuestion / explanation in the user's language (replyLanguage hint).

If the user is chatting / asking help (kind = "chat"):
- reply with a helpful concise answer in the user's language.
- Do not invent balances, odds, or live race winners.
- IMPORTANT: If session.pointsBalance is a number, that IS the user's current points. When they ask how many points they have / 잔액 / balance, answer with that number directly. Do NOT send them to another page.
- IMPORTANT: If session.bettingSummary is present, use it to answer win/loss/profit questions directly (you're up/down X pts). Do NOT redirect to /my-bets.html.
- If session.loggedIn is false and they ask about points or betting results, say they need to log in.
- You may suggest example bet commands.

If unclear whether it's a bet, prefer kind "chat" and ask a short clarifying question.
Alias map: COIN/Coinbase -> COINBASE, GOOG/Google -> GOOGLE.

JSON shapes:
{"kind":"bet","category":"crypto","stake":100,"picks":[{"symbol":"SOL","place":"first"}],"requireAlso":[],"demoteOnOverlap":[],"placementMode":null,"needsClarification":true,"clarificationQuestion":"...","explanation":"..."}
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

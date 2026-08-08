# AGENTS.md — Rialo Race Frontend Contract

This file is the **source of truth for AI / outsourced frontend builders**.
Goal: ship UI/UX changes **without breaking backend contracts** (Supabase RPCs, Vercel `/api/*`, VPS workers, money settlement).

Read this file **before** editing anything. Prefer the smallest UI-only change that preserves existing `src/app/lib/*` call shapes.

---

## 0) Who you are / what you own

| Layer | Own? | Notes |
|-------|------|--------|
| React UI (`src/app/pages/*`, `src/app/components/*`, styles) | **YES** | Layout, copy, visuals, a11y, i18n strings |
| Client facades (`src/app/lib/*.ts`) | **READ FIRST; change only with care** | These wrap backend. Do not invent parallel fetch/RPC paths |
| Catalog data (`src/app/data/markets.ts`, `tokens.ts`) | **Careful** | Market ids/names/token letters must stay aligned with live races |
| Vercel API (`api/*`) | **NO** (unless explicitly asked) | Server secrets, Stripe, admin Supabase |
| SQL / schema (`supabase/*`, `*.sql` at root) | **NO** | Owner-maintained |
| VPS workers (`scripts/vps-*.js|mjs`, price/slot workers) | **NO** | Official race/slot truth lives here |
| Secrets (`.env*`, service role, Stripe, Groq) | **NEVER** | Do not print, commit, or hardcode |

If a feature needs a **new** RPC, SQL column, or `/api` route: **stop and ask the owner**. Do not invent server behavior on the client.

---

## 1) Stack & entry points

- **App:** React + Vite + React Router 7 + Tailwind 4
- **Hosting:** Vercel project `rialoracev1` → https://rialoracev1.vercel.app
- **DB/Auth backend:** Self-hosted Supabase at `https://rialorace.duckdns.org` (anon/publishable key only on client)
- **SPA shell:** `src/app/routes.tsx`, `vercel.json` rewrites (almost all paths → `index.html`; `/api/*` stays serverless)
- **Legacy 3D race player:** `public/legacy-race/` (iframe/embed). Do not “migrate” it unless asked; keep asset URLs working

Local:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 8002
npm run build
```

---

## 2) Hard rules (break these = broken money / auth)

1. **Do not call Supabase tables for writes that have an RPC.** Use the existing RPC / `/api` wrapper in `src/app/lib/*`.
2. **Auth is custom login sessions**, not Supabase Auth email magic links.
   - Session token key: `binance-ring-rally-login-session-v1` (localStorage)
   - Always pass `requested_session_token` / `sessionToken` exactly as existing helpers do
3. **Never trust the client for settlement.** Race results, slot ticks, lotto draws, payouts are server/VPS-owned. UI only displays and places bets.
4. **Never invent balances, odds, winners, or payouts** in chat/assistant copy. Rules tips only.
5. **Do not remove or rename** stable market ids (`market-01` …), route aliases (`.html` paths), or `SLOT_GAME_ID`.
6. **Do not change** slot timing constants independently of VPS:
   - Wait **30s** → Game **120s** → Cycle **150s**
   - Betting: **WAIT** → current round; **LIVE** → next round
7. **Points are integers.** Slot stake ≥ 10 and **multiple of 5** (5 paylines). Race stake ≥ 10.
8. Money actions in Assistant / batch UX must **confirm first**, then call existing create helpers.
9. Keep `/api/*` request bodies field names stable (`sessionToken`, `marketId`, `stake`, …). Snake_case is for RPC args; camelCase for most Vercel JSON APIs — follow the existing file.
10. Do not commit `.env`, service role keys, webhook secrets, or private logs.

---

## 3) Auth & points (must use these APIs)

Facade: `src/app/lib/supabase.ts` + `src/app/contexts/AuthContext.tsx`

| Action | Function / RPC |
|--------|----------------|
| Sign in | `signInWithLoginId` → `sign_in_with_login_id` |
| Sign up | `signUpWithLoginId` → `sign_up_with_login_id` |
| Restore | `getLoginSession` → `get_login_session` |
| Sign out | `signOutLoginSession` → `sign_out_login_session` |
| UI points | `useAuth().points`, `setPointsBalance`, `refreshSession` |

After any successful bet / ticket / shop / check-in / charge: refresh points from the **server return value** or `refreshSession()`. Do not invent a new points store.

Login id normalization: lowercase, `[a-z0-9._-]` only (`normalizeLoginId`).

---

## 4) Client library map (prefer these over raw `fetch`/`rpc`)

| Domain | File | Use for |
|--------|------|---------|
| Auth, race bets list, rankings, check-in, staking, chat, ratio snapshots | `src/app/lib/supabase.ts` | Primary race backend |
| Place race bet (HTTP) | `createBetRecord` in `supabase.ts` → `POST /api/create-bet-record` | Preferred race bet write path |
| Batch race bets (assistant) | `src/app/lib/bettingAssistant.ts` | NL + `executeBatchBets` |
| Slot bets | `src/app/lib/slotBets.ts` | `createSlotBet`, `listSlotBets` |
| Slot official ticks | `src/app/lib/slotOfficial.ts` | Round/tick reads only |
| Slot rules / paylines | `src/app/lib/slotRules.ts` | Display math; do not change payouts casually |
| Race Lotto | `src/app/lib/raceLotto.ts` | Dashboard + tickets |
| Shop | `src/app/lib/shop.ts` | Buy/equip racers |
| Stripe points | `src/app/lib/pointsCheckout.ts` | Checkout + history |
| Base USDC | `src/app/lib/baseUsdcCheckout.ts` | Order + verify |
| Rewards history | `src/app/lib/rewardHistory.ts` | `GET`/`POST` list API |
| Point repair | `src/app/lib/pointReconciliation.ts` | Owner tools; do not expose casually |
| Assistant NL | `bettingAssistant.ts`, `assistantIntents.ts`, `GlobalAssistant.tsx` | Chat intents |
| Markets / tokens | `src/app/data/markets.ts`, `tokens.ts` | Catalog |

**Rule:** If you need a backend call, find the helper in the table above. Copy its pattern. Do not add a second competing client.

---

## 5) Supabase RPCs the frontend may call

(Do not add new RPC names from the client without owner approval.)

**Auth / account**
- `sign_in_with_login_id`, `sign_up_with_login_id`, `get_login_session`, `sign_out_login_session`

**Race betting**
- `list_bets_with_login_session`, `list_current_race_bets_with_login_session`
- `create_bet_with_login_session` (used inside assistant batch path)
- Prefer HTTP `POST /api/create-bet-record` for normal UI place-bet

**Odds / results / chat (read + limited write)**
- `get_or_create_market_ratio_snapshot`, `upsert_market_ratio_snapshot`
- Tables (read): `market_ratio_snapshots`, `market_results_v2`, `market_chat_messages`
- `create_market_chat_message`

**Rewards / rankings / staking**
- `get_public_rankings`
- `get_daily_checkin_status`, `claim_daily_checkin`
- `get_rialo_staking_status`, `stake_rialo_with_login_session`, `unstake_rialo_with_login_session`, `claim_rialo_staking_points`

**Shop**
- `get_racer_shop_state`, `buy_racer_shop_item`, `equip_racer_shop_item`

**Slot**
- `create_slot_bet_with_login_session`, `list_slot_bets_with_login_session`
- `get_slot_round`, `get_latest_slot_round_tick`, `list_slot_round_ticks_after`, `list_recent_slot_rounds`
- Game id constant: `SLOT_GAME_ID = "doge-xrp-eth-classic-v1"` (`slotOfficial.ts`)

**Lotto**
- `get_race_lotto_dashboard`, `create_race_lotto_ticket_with_login_session`
- Do not call `settle_race_lotto_round` from normal user UI unless the product already does and owner confirms

RPC args are typically `requested_*`. Session token parameter name is `requested_session_token`.

---

## 6) Vercel `/api` routes (client-callable)

Only call these with the same JSON shapes as existing lib wrappers:

| Route | Used by | Notes |
|-------|---------|--------|
| `POST /api/create-bet-record` | Race bet place | Body: `sessionToken`, `marketId`, `targetRaceStartedAt`, `stake`, `placements`, `ratios`, optional `betType` / `finishTime` |
| `POST /api/assistant-chat` | Assistant | Classifier only; no money side effects |
| `POST /api/create-points-checkout` | Stripe points | Needs logged-in session |
| `POST /api/list-point-charge-history` | Points history | |
| `POST /api/create-base-usdc-order` | USDC pay | |
| `POST /api/verify-base-usdc-payment` | USDC verify | |
| `POST /api/list-reward-history` | Rewards | |
| `POST /api/list-chat-pick-badges` | Chat badges | |
| `POST /api/point-reconciliation` | Admin-ish | Do not wire into casual UI |
| `POST /api/repair-point-balance` | Admin-ish | Do not wire into casual UI |
| `POST /api/stripe-webhook` | Stripe → server | **Never call from browser** |

Do not add new `/api` files in a frontend-only engagement.

---

## 7) Routes (keep aliases)

Defined in `src/app/routes.tsx` + `vercel.json`.

Canonical user paths (keep both pretty + `.html` where listed):

| Product | Paths |
|---------|--------|
| Landing | `/`, `/landing`, `/landing.html` |
| Main menu / live markets | `/main-menu.html` |
| Live race | `/market`, `/market/:marketId`, `/markets/:marketId`, `/betting.html`, `market01-betting.html`, … |
| Replay | `/replay`, `/replay-menu.html`, `/replay/:marketId` |
| Race Lotto | `/race-lotto`, `/lotto` |
| Rialo Slot | `/slot`, `/rwa-slot`, `/paxg-slot` (all same page) |
| Shop | `/shop`, `/shop.html` |
| Rankings | `/rankings`, `/community.html` |
| Rewards | `/rewards`, `/rewards.html` |
| Points | `/points`, `/points.html` |
| History | `/history`, `/my-bets.html` |
| Login / Profile | `/login.html`, `/profile.html` |

If you add a **new page**, also add:
1. Route in `routes.tsx`
2. Rewrite in `vercel.json` (unless covered by the catch-all)
3. Header / Main Menu links if user-facing
4. Assistant navigate allowlist (`assistantIntents.ts` + `api/assistant-chat.js`) — **ask owner** before changing API allowlist

---

## 8) Domain rules AI must not “simplify”

### Race markets
- 20 crypto markets: ids `market-01` … `market-20`, names in `markets.ts`
- Each market has **4 tokens** via `tokenLetters` → resolve with `tokens.ts`
- Race clock is aligned to **5-minute** windows in several clients; do not invent a new race interval for betting targets
- Odds come from ratio snapshots / recent results helpers — do not hardcode fake odds

### Rialo Slot
- Reels driven by **DOGE / XRP / ETH** directions (official VPS ticks)
- **5 paylines:** 3 rows + 2 diagonals (no vertical columns) — `SLOT_PAYLINES` in `slotRules.ts`
- UI must wait for official ticks; do not “simulate final” as authoritative settlement
- Bet placement: `createSlotBet(stake, roundId?)` — **server owns** final target round; client may hint

### Race Lotto
- Perfect-6 style picks per slot; ticket price from round (`ticket_price_points`, often 100)
- Buy via `createRaceLottoTicket(roundId, picks)` where `picks` is `{ "1": "ETH", ... }` style map
- Draws / settlement are backend-owned

### Assistant (`GlobalAssistant`)
Kinds: `bet` | `slot_bet` | `lotto` | `navigate` | `query` | `chat`  
Navigate allowlist only (see `assistantIntents.ts`). Money intents confirm in UI before execute.

---

## 9) Allowed frontend work vs forbidden

### Allowed (typical outsourcing)
- Visual redesign of pages under `src/app/pages/*` and shared components
- Responsive layout, typography, motion, empty/loading/error states
- Copy / i18n string updates in `bettingAssistantI18n.ts` and page text
- Wiring **existing** lib functions into new components
- Accessibility, performance polish that does not change contracts
- Keeping Header/nav labels consistent (`Slot`, Lotto, History, …)

### Forbidden without explicit owner request
- Editing `api/*`, SQL, workers, Stripe webhook, Groq keys
- New payment rails or changing stake/payout formulas
- Replacing custom login with Supabase Auth / OAuth
- Deleting `.html` route aliases or market ids
- Client-side “auto settle” of bets/slots/lotto
- Broad refactors that rewrite `supabase.ts` / bet create paths “for cleanliness”
- Committing large binary dumps, secrets, or unrelated `image*.png` spam

---

## 10) Change checklist (AI must run mentally before PR)

1. Did I only touch UI + existing lib call sites?
2. Do login / logout / points still use `AuthContext` + session token key?
3. Do race/slot/lotto writes still go through the same helpers?
4. Are route aliases and `vercel.json` still valid?
5. Did I avoid inventing odds, balances, or winners?
6. `npm run build` succeeds?
7. Manual smoke (logged in):
   - Login / points visible in header
   - Open `/main-menu.html`, `/slot`, `/race-lotto`, `/my-bets.html`
   - Place or cancel a preview (do not drain prod points on owner account without asking)
   - Assistant: `"슬롯 열어줘"` navigates; `"페이라인 설명해줘"` returns rules

---

## 11) File ownership quick map

```text
src/app/pages/*          → UI pages (primary work surface)
src/app/components/*     → Shared UI (Header, GlobalAssistant, layout)
src/app/lib/*            → Backend contracts (read before change)
src/app/data/*           → Market/token catalog (ids are sticky)
src/app/contexts/*       → Auth state
api/*                    → Owner / backend (do not edit)
supabase/ + *.sql        → Owner / backend (do not edit)
scripts/*                → Workers / ops (do not edit)
public/legacy-race/*     → Embedded race player (asset-sensitive)
vercel.json              → SPA routing (update only when adding routes)
```

---

## 12) Communication with the owner

When blocked by backend:

> “Need new RPC/API for X. Current client only has Y in `src/app/lib/….ts`. Propose contract: request fields / response fields / auth.”

Do not ship a fake local-only money path as production.

---

## 13) Product names (keep consistent)

- App: **Rialo Race**
- Slot product: **Rialo Slot** (nav label: **Slot**)
- Lotto: **Race Lotto** / 로또
- Assistant: **Rialo Assistant**

Do not rebrand in copy without asking.

---

*Last intent: frontend outsourcing safety contract. Backend schema and workers remain owner-controlled.*

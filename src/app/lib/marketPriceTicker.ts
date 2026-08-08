import { cryptoTokens, stockTokens, type Token } from "../data/tokens";

export type TickFlash = "up" | "down" | "flat";

export type LiveTickerQuote = {
  pair: string;
  price: number;
  changePct: number;
  atMs: number;
  tickDir: TickFlash;
};

export type LiveTickerQuotes = Record<string, LiveTickerQuote>;

type QuoteListener = (quotes: LiveTickerQuotes, changedPairs: string[]) => void;

function pairForToken(token: Token) {
  if (token.sourceSymbol) return token.sourceSymbol.toUpperCase();
  return `${token.symbol.toUpperCase()}USDT`;
}

function withPair(token: Token) {
  return { ...token, pair: pairForToken(token) };
}

function byMarketCap(a: Token, b: Token) {
  return (a.marketCapRank ?? 99) - (b.marketCapRank ?? 99) || a.symbol.localeCompare(b.symbol);
}

export const CRYPTO_FEED_TOKENS = [...cryptoTokens].sort(byMarketCap).map(withPair);
export const STOCK_FEED_TOKENS = [...stockTokens].sort(byMarketCap).map(withPair);
export const MARKET_FEED_TOKENS = [...CRYPTO_FEED_TOKENS, ...STOCK_FEED_TOKENS];

const MARKET_FEED_PAIRS = MARKET_FEED_TOKENS.map((token) => token.pair);

function resolveChangePct(
  changeRaw: unknown,
  openRaw: unknown,
  price: number,
  previousChangePct: number | null | undefined
) {
  const direct = Number(changeRaw);
  if (Number.isFinite(direct)) return direct;

  const open = Number(openRaw);
  if (Number.isFinite(open) && open > 0 && Number.isFinite(price)) {
    return ((price - open) / open) * 100;
  }

  if (previousChangePct != null && Number.isFinite(previousChangePct)) return previousChangePct;
  return 0;
}

function parseQuote(
  pair: string,
  priceRaw: unknown,
  changeRaw: unknown,
  openRaw: unknown,
  previous: LiveTickerQuote | null | undefined,
  atMs = Date.now()
): LiveTickerQuote | null {
  const price = Number(priceRaw);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = resolveChangePct(changeRaw, openRaw, price, previous?.changePct);
  let tickDir: TickFlash = "flat";
  const previousPrice = previous?.price;
  if (previousPrice != null && Number.isFinite(previousPrice)) {
    if (price > previousPrice) tickDir = "up";
    else if (price < previousPrice) tickDir = "down";
  }
  return {
    pair,
    price,
    changePct,
    atMs,
    tickDir
  };
}

async function seedQuotesFromRest(previous: LiveTickerQuotes): Promise<LiveTickerQuotes> {
  const symbols = encodeURIComponent(JSON.stringify(MARKET_FEED_PAIRS));
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`);
  if (!res.ok) throw new Error(`Binance 24hr seed failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    symbol?: string;
    lastPrice?: string;
    priceChangePercent?: string;
    openPrice?: string;
  }>;
  const next: LiveTickerQuotes = {};
  for (const row of rows) {
    const pair = String(row.symbol ?? "").toUpperCase();
    const quote = parseQuote(
      pair,
      row.lastPrice,
      row.priceChangePercent,
      row.openPrice,
      previous[pair] ?? null
    );
    if (quote) next[pair] = quote;
  }
  return next;
}

class LiveMarketFeedBus {
  private listeners = new Set<QuoteListener>();
  private quotes: LiveTickerQuotes = {};
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private seedTimer: number | null = null;
  private started = false;

  subscribe(listener: QuoteListener) {
    this.listeners.add(listener);
    if (Object.keys(this.quotes).length) listener(this.quotes, Object.keys(this.quotes));
    this.ensureStarted();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.stop();
    };
  }

  getSnapshot() {
    return this.quotes;
  }

  private emit(changedPairs: string[]) {
    for (const listener of this.listeners) listener(this.quotes, changedPairs);
  }

  private applyPatch(patch: LiveTickerQuotes) {
    const changedPairs = Object.keys(patch);
    if (!changedPairs.length) return;
    this.quotes = { ...this.quotes, ...patch };
    this.emit(changedPairs);
  }

  private ensureStarted() {
    if (this.started) return;
    this.started = true;
    void this.seed();
    this.connect();
    this.seedTimer = window.setInterval(() => {
      void this.seed();
    }, 30_000);
  }

  private stop() {
    this.started = false;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    if (this.seedTimer != null) window.clearInterval(this.seedTimer);
    this.reconnectTimer = null;
    this.seedTimer = null;
    this.ws?.close();
    this.ws = null;
  }

  private async seed() {
    try {
      const seeded = await seedQuotesFromRest(this.quotes);
      this.applyPatch(seeded);
    } catch {
      /* WS may still fill gaps */
    }
  }

  private connect() {
    if (!this.started) return;
    // Full 24hr ticker includes P (daily %); miniTicker does not.
    const streams = MARKET_FEED_PAIRS.map((pair) => `${pair.toLowerCase()}@ticker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          data?: { s?: string; c?: string; P?: string; o?: string };
        };
        const payload = message.data;
        const pair = String(payload?.s ?? "").toUpperCase();
        const quote = parseQuote(
          pair,
          payload?.c,
          payload?.P,
          payload?.o,
          this.quotes[pair] ?? null
        );
        if (quote) this.applyPatch({ [pair]: quote });
      } catch {
        /* ignore malformed frames */
      }
    };

    this.ws.onclose = () => {
      if (!this.started) return;
      this.reconnectTimer = window.setTimeout(() => {
        void this.seed();
        this.connect();
      }, 1600);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }
}

const feedBus = new LiveMarketFeedBus();

/** Imperative subscribe — does not force React re-renders. */
export function subscribeLiveMarketFeedQuotes(listener: QuoteListener) {
  return feedBus.subscribe(listener);
}

export function formatTickerPrice(price: number | null | undefined) {
  if (price == null || !Number.isFinite(price)) return "—";
  if (price >= 1000) {
    return price.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  }
  return price.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 4 });
}

export function formatTickerChange(changePct: number | null | undefined) {
  if (changePct == null || !Number.isFinite(changePct)) return "0.00%";
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}

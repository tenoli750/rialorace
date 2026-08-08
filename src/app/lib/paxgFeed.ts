export type PriceDirection = "UP" | "DOWN" | "FLAT";
export type PriceMode = "mid" | "trade";

export interface MarketTick {
  symbol: string;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  trade: number | null;
  atMs: number;
}

type Listener = (tick: MarketTick) => void;

const DEFAULT_SYMBOL = "xrpusdt";

let sharedBySymbol = new Map<string, BinanceMarketFeed>();

export function getBinanceMarketFeed(symbol = DEFAULT_SYMBOL) {
  const key = symbol.toLowerCase();
  let feed = sharedBySymbol.get(key);
  if (!feed) {
    feed = new BinanceMarketFeed(key);
    sharedBySymbol.set(key, feed);
  }
  return feed;
}

/** @deprecated use getBinanceMarketFeed */
export function getPaxgFeed() {
  return getBinanceMarketFeed("xrpusdt");
}

export class BinanceMarketFeed {
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private seedTimer: number | null = null;
  private started = false;
  private readonly symbol: string;
  private readonly restSymbol: string;
  private tick: MarketTick;

  constructor(symbol: string) {
    this.symbol = symbol.toLowerCase();
    this.restSymbol = this.symbol.toUpperCase();
    this.tick = {
      symbol: this.restSymbol,
      bid: null,
      ask: null,
      mid: null,
      trade: null,
      atMs: Date.now()
    };
  }

  get latest() {
    return this.tick;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.tick);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private emit() {
    for (const listener of this.listeners) listener(this.tick);
  }

  private start() {
    if (this.started) return;
    this.started = true;
    void this.seedFromRest("startup");
    this.connect();
    this.seedTimer = window.setInterval(() => {
      void this.seedFromRest("interval");
    }, 5_000);
  }

  private stop() {
    this.started = false;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.seedTimer != null) {
      window.clearInterval(this.seedTimer);
      this.seedTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private connect() {
    if (!this.started) return;
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${this.symbol}@bookTicker/${this.symbol}@trade`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      void this.seedFromRest("reconnect");
    };
    this.ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const stream = String(message.stream || "").toLowerCase();
      const payload = message.data ?? message;

      if (stream.includes("bookticker") || (payload?.b != null && payload?.a != null && payload?.e !== "trade")) {
        const bid = Number(payload.b);
        const ask = Number(payload.a);
        if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
        this.tick = {
          ...this.tick,
          bid,
          ask,
          mid: (bid + ask) / 2,
          atMs: Date.now()
        };
        this.emit();
        return;
      }

      if (stream.includes("trade") || payload?.e === "trade") {
        const price = Number(payload.p);
        if (!Number.isFinite(price) || price <= 0) return;
        this.tick = {
          ...this.tick,
          trade: price,
          atMs: Date.now()
        };
        this.emit();
      }
    };
    this.ws.onclose = () => {
      if (!this.started) return;
      this.reconnectTimer = window.setTimeout(() => this.connect(), 1_500);
    };
  }

  private async seedFromRest(reason: "startup" | "reconnect" | "interval") {
    try {
      const bookUrl = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${this.restSymbol}`;
      const priceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${this.restSymbol}`;
      const [bookRes, priceRes] = await Promise.all([fetch(bookUrl), fetch(priceUrl)]);
      if (!bookRes.ok || !priceRes.ok) return;
      const book = await bookRes.json();
      const price = await priceRes.json();
      const bid = Number(book?.bidPrice);
      const ask = Number(book?.askPrice);
      const last = Number(price?.price);
      let next = { ...this.tick, atMs: Date.now() };

      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        const shouldSeedBook =
          !Number.isFinite(next.mid) || reason === "startup" || reason === "reconnect";
        if (shouldSeedBook) {
          next = { ...next, bid, ask, mid: (bid + ask) / 2 };
        }
      }
      if (Number.isFinite(last) && last > 0) {
        const shouldSeedTrade =
          !Number.isFinite(next.trade) || reason === "startup" || reason === "reconnect";
        if (shouldSeedTrade) {
          next = { ...next, trade: last };
        }
      }
      this.tick = next;
      this.emit();
    } catch {
      // Public feed best-effort.
    }
  }
}

export function compareDirection(previous: number, current: number): PriceDirection {
  if (current > previous) return "UP";
  if (current < previous) return "DOWN";
  return "FLAT";
}

export function priceFromTick(tick: MarketTick, mode: PriceMode = "trade") {
  return mode === "mid" ? tick.mid : tick.trade;
}

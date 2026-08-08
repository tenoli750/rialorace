import { useEffect, useRef } from "react";
import {
  CRYPTO_FEED_TOKENS,
  STOCK_FEED_TOKENS,
  formatTickerChange,
  formatTickerPrice,
  subscribeLiveMarketFeedQuotes,
  type LiveTickerQuote
} from "../lib/marketPriceTicker";

type FeedToken = (typeof CRYPTO_FEED_TOKENS)[number];

function FeedLane({
  label,
  tokens,
  speedPxPerSec
}: {
  label: string;
  tokens: FeedToken[];
  speedPxPerSec: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const lastTsRef = useRef(0);
  const nodesRef = useRef<Map<string, HTMLElement[]>>(new Map());

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const map = new Map<string, HTMLElement[]>();
    track.querySelectorAll<HTMLElement>("[data-pair]").forEach((node) => {
      const pair = node.dataset.pair;
      if (!pair) return;
      const list = map.get(pair) ?? [];
      list.push(node);
      map.set(pair, list);
    });
    nodesRef.current = map;

    const applyQuote = (quote: LiveTickerQuote) => {
      const nodes = nodesRef.current.get(quote.pair);
      if (!nodes?.length) return;
      const priceText = formatTickerPrice(quote.price);
      const changeText = formatTickerChange(quote.changePct);
      const dayDir = quote.changePct > 0 ? "up" : quote.changePct < 0 ? "down" : "flat";

      for (const node of nodes) {
        const priceEl = node.querySelector<HTMLElement>("[data-price]");
        const changeEl = node.querySelector<HTMLElement>("[data-change]");
        if (priceEl && priceEl.textContent !== priceText) {
          priceEl.textContent = priceText;
          if (quote.tickDir === "up" || quote.tickDir === "down") {
            const flashClass = quote.tickDir === "up" ? "is-flash-up" : "is-flash-down";
            priceEl.classList.remove("is-flash-up", "is-flash-down");
            window.requestAnimationFrame(() => {
              priceEl.classList.add(flashClass);
            });
          }
        }
        if (changeEl) changeEl.textContent = changeText;
        node.classList.remove("is-up", "is-down", "is-flat");
        node.classList.add(`is-${dayDir}`);
      }
    };

    const unsubscribe = subscribeLiveMarketFeedQuotes((quotes, changedPairs) => {
      for (const pair of changedPairs) {
        const quote = quotes[pair];
        if (quote) applyQuote(quote);
      }
    });

    let raf = 0;
    let halfWidth = track.scrollWidth / 2;
    const measure = () => {
      halfWidth = track.scrollWidth / 2;
    };
    measure();
    window.addEventListener("resize", measure);

    const loop = (now: number) => {
      const last = lastTsRef.current || now;
      const dt = Math.min(0.048, (now - last) / 1000);
      lastTsRef.current = now;

      if (halfWidth > 0) {
        offsetRef.current += speedPxPerSec * dt;
        if (offsetRef.current >= halfWidth) offsetRef.current -= halfWidth;
        track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", measure);
      window.cancelAnimationFrame(raf);
    };
  }, [speedPxPerSec]);

  return (
    <div className="market-feed__lane">
      <span className="market-feed__lane-label">{label}</span>
      <div className="market-feed__viewport">
        <div className="market-feed__track" ref={trackRef}>
          {[0, 1].map((copy) => (
            <div className="market-feed__group" key={`${label}-copy-${copy}`} aria-hidden={copy === 1}>
              {tokens.map((token) => (
                <span className="market-feed__item is-flat" data-pair={token.pair} key={`${copy}-${token.pair}`}>
                  <b>{token.shortSymbol ?? token.symbol}</b>
                  <em data-price>—</em>
                  <i data-change>0.00%</i>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LiveMarketFeed() {
  const clockRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const syncClock = () => {
      if (clockRef.current) {
        clockRef.current.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
      }
    };
    syncClock();
    const timer = window.setInterval(syncClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <footer className="market-feed">
      <div className="market-feed__head">
        <strong>
          <span /> LIVE MARKET FEED
        </strong>
        <span className="market-feed__sys">
          SYS: <b ref={clockRef}>--:--:--</b>
        </span>
      </div>
      <div className="market-feed__lanes" aria-label="Live market prices">
        <FeedLane label="CRYPTO" tokens={CRYPTO_FEED_TOKENS} speedPxPerSec={42} />
        <FeedLane label="STOCKS" tokens={STOCK_FEED_TOKENS} speedPxPerSec={36} />
      </div>
    </footer>
  );
}

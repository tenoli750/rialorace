import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MoveRight } from "lucide-react";
import { LiveMarketFeed } from "../components/LiveMarketFeed";
import { getMarketsByCategory } from "../data/markets";
import {
  getTokenByLetter,
  getTokenBySymbol,
  getTokensByMarketCap,
  type MarketCategory
} from "../data/tokens";
import { listRecentFirstPlaceResults } from "../lib/supabase";

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export function Home() {
  const [racerCategory, setRacerCategory] = useState<Exclude<MarketCategory, "rwa">>("crypto");
  const [winCounts, setWinCounts] = useState<Record<string, number>>({});
  const [racerStatus, setRacerStatus] = useState("Loading 24h wins...");
  const featuredTracks = useMemo(() => {
    const pool = [...getMarketsByCategory(racerCategory)];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 4);
  }, [racerCategory]);

  useEffect(() => {
    let cancelled = false;

    async function loadTopRacerWins() {
      setRacerStatus("Loading 24h wins...");
      try {
        const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
        const rows = await listRecentFirstPlaceResults(sinceIso);
        if (cancelled) return;

        const next: Record<string, number> = {};
        for (const row of rows) {
          const symbol = String(row.first_place ?? "").trim().toUpperCase();
          if (!symbol) continue;
          const token = getTokenBySymbol(symbol);
          if (!token) continue;
          const marketCategory = row.market_id.startsWith("stock-")
            ? "stocks"
            : row.market_id.startsWith("market-")
              ? "crypto"
              : token.category ?? "crypto";
          if (token.category && token.category !== marketCategory) continue;
          const key = `${marketCategory}:${token.symbol}`;
          next[key] = (next[key] ?? 0) + 1;
        }
        setWinCounts(next);
        setRacerStatus("");
      } catch (error) {
        if (!cancelled) {
          setWinCounts({});
          setRacerStatus(error instanceof Error ? error.message : "Could not load racer wins.");
        }
      }
    }

    void loadTopRacerWins();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rank by 24h first-place wins (leader first). Market-cap rank is only a stable tiebreaker.
  const topRacers = useMemo(() => {
    return getTokensByMarketCap(racerCategory)
      .map((token) => ({
        token,
        wins: winCounts[`${racerCategory}:${token.symbol}`] ?? 0
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          (a.token.marketCapRank ?? 99) - (b.token.marketCapRank ?? 99) ||
          a.token.symbol.localeCompare(b.token.symbol)
      )
      .slice(0, 5);
  }, [racerCategory, winCounts]);

  const maxWins = Math.max(1, ...topRacers.map((row) => row.wins));
  const racersHref = `/live-markets.html?category=${racerCategory}#racers`;
  const tracksHref = `/live-markets.html?category=${racerCategory}#tracks`;

  return (
    <>
      <main>
        <section className="landing-hero">
          <img className="landing-hero__ambient" src="/assets/images/track.png" alt="" aria-hidden="true" />
          <img className="landing-hero__art" src="/assets/images/track.png" alt="" aria-hidden="true" />
          <div className="landing-hero__content">
            <h1>
              <span>MARKET MOVES.</span>
              <span>RACE BEGINS.</span>
            </h1>
            <p>
              Rialo Race turns live crypto market movement
              <br />
              into thrilling races you can watch, play, and win.
            </p>
            <Link className="primary-cta landing-hero__button" to="/live-markets.html">
              VIEW LIVE MARKETS <MoveRight size={18} />
            </Link>
          </div>
        </section>

        <section className="landing-panel top-racers">
          <div className="section-head">
            <h2>
              <span />
              TOP RACERS
              <em className="section-head__note">WINS · LAST 24H</em>
            </h2>
            <div className="section-head__actions">
              <div className="category-toggle" role="group" aria-label="Racer category">
                {(["crypto", "stocks"] as const).map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={racerCategory === category ? "active" : undefined}
                    aria-pressed={racerCategory === category}
                    onClick={() => setRacerCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <Link to={racersHref}>
                VIEW ALL RACERS <MoveRight size={16} />
              </Link>
            </div>
          </div>

          {racerStatus ? (
            <div className="top-racers__status">{racerStatus}</div>
          ) : (
            <div className="racer-grid">
              {topRacers.map(({ token, wins }, index) => (
                <Link
                  className="racer-card"
                  key={`${racerCategory}-rank-${index}-${token.id}`}
                  to={`/live-markets.html?category=${racerCategory}#racer-${token.id}`}
                >
                  <span className="racer-rank" aria-label={`Rank ${index + 1}`}>
                    #{index + 1}
                  </span>
                  <span className="portrait">
                    <img
                      src={token.image}
                      onError={(e) => {
                        e.currentTarget.src = `/assets/coin-logos/${token.id}.svg`;
                      }}
                      alt=""
                    />
                  </span>
                  <span className="racer-copy">
                    <strong>{token.shortSymbol ?? token.symbol}</strong>
                    <small>
                      {wins.toLocaleString()} WIN{wins === 1 ? "" : "S"}
                    </small>
                    <i>
                      <b style={{ width: `${Math.max(8, Math.round((wins / maxWins) * 100))}%` }} />
                    </i>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="landing-panel featured-tracks">
          <div className="section-head">
            <h2>
              <span />
              FEATURED TRACKS
            </h2>
            <Link to={tracksHref}>
              VIEW ALL TRACKS <MoveRight size={16} />
            </Link>
          </div>
          <div className="track-grid">
            {featuredTracks.map((market) => (
              <Link className="track-card featured-track-card" key={market.id} to={`/market.html?id=${market.id}`}>
                <div className="track-title">
                  <span>{String(market.number).padStart(2, "0")}</span>
                </div>
                <div className="featured-track__badge" aria-hidden="true">
                  <div className="featured-track__badge-pill">
                    <span className="featured-track__badge-label">TRACK</span>
                    <span className="featured-track__badge-sub">LIVE</span>
                  </div>
                  <div className="featured-track__badge-bars">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <h3>{market.name}</h3>
                <div className="entrants">
                  {market.tokenLetters.map((letter) => {
                    const token = getTokenByLetter(letter, racerCategory);
                    return (
                      <span key={letter}>
                        <img
                          src={token?.image}
                          onError={(e) => {
                            if (token) e.currentTarget.src = `/assets/coin-logos/${token.id}.svg`;
                          }}
                          alt=""
                        />
                        {token?.shortSymbol ?? token?.symbol}
                      </span>
                    );
                  })}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <LiveMarketFeed />
    </>
  );
}

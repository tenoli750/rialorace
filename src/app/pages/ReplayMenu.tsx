import { Link, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
import { getMarketsByCategory } from "../data/markets";
import { getTokenByLetter, getTokensByCategory, type MarketCategory } from "../data/tokens";

function getCategory(value: string | null): MarketCategory {
  return value === "stocks" || value === "rwa" ? value : "crypto";
}

export function ReplayMenu() {
  const [searchParams] = useSearchParams();
  const activeCategory = getCategory(searchParams.get("category"));
  const activeTokens = useMemo(() => getTokensByCategory(activeCategory), [activeCategory]);
  const activeMarkets = useMemo(() => getMarketsByCategory(activeCategory), [activeCategory]);
  const [selectedRacers, setSelectedRacers] = useState<string[]>([]);
  const selectedRacerSet = useMemo(() => new Set(selectedRacers), [selectedRacers]);
  const visibleMarkets = useMemo(() => {
    if (!selectedRacers.length) return activeMarkets;
    return activeMarkets.filter((market) => selectedRacers.every((letter) => market.tokenLetters.includes(letter)));
  }, [activeMarkets, selectedRacers]);

  const toggleRacer = (letter: string) => {
    setSelectedRacers((current) =>
      current.includes(letter) ? current.filter((value) => value !== letter) : [...current, letter]
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-[0.04em] text-[#f2f3f4]">Replay</h1>
        <p className="mt-1 text-sm text-[#8f949b]">Filter tracks and rewatch finished races.</p>
      </div>

      <section className="mb-6 rounded-[14px] border border-white/10 bg-[linear-gradient(160deg,rgba(17,19,21,.72),rgba(8,9,10,.8))] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg tracking-[0.05em] text-[#f2f3f4]">
            <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#ff7a00]" />
            Racers
          </h2>
          <div className="flex gap-2">
            {(["crypto", "stocks", "rwa"] as MarketCategory[]).map((category) => (
              <Link
                key={category}
                to={`/replay-menu.html?category=${category}`}
                className={`rounded-[8px] border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] ${
                  activeCategory === category
                    ? "border-[#ff7a00] bg-[#ff7a00] text-[#060708]"
                    : "border-white/10 bg-[#111315] text-[#aeb1b5] hover:border-[rgba(255,122,0,.55)] hover:text-[#f2f3f4]"
                }`}
              >
                {category}
              </Link>
            ))}
          </div>
          {selectedRacers.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedRacers([])}
              className="rounded-[8px] border border-white/10 bg-[#111315] px-3 py-1.5 text-xs font-semibold text-[#aeb1b5] hover:border-[rgba(255,122,0,.55)] hover:text-[#f2f3f4]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {activeCategory === "rwa" ? (
            <div className="col-span-full rounded-[11px] border border-dashed border-[rgba(255,122,0,.35)] bg-[#0d0f11] px-6 py-10 text-center">
              <p className="text-xl font-semibold tracking-[0.04em] text-[#f2f3f4]">Coming Soon</p>
              <p className="mt-2 text-sm text-[#8f949b]">RWA racers are not available yet.</p>
            </div>
          ) : (
            activeTokens.map((token) => {
            const selected = selectedRacerSet.has(token.letter);
            return (
              <button
                type="button"
                key={token.id}
                onClick={() => toggleRacer(token.letter)}
                aria-pressed={selected}
                className={`flex cursor-pointer items-center gap-3 rounded-[11px] border p-3 text-left transition-all hover:-translate-y-0.5 ${
                  selected
                    ? "border-[#ff7a00] bg-[rgba(255,122,0,.16)] text-[#f2f3f4]"
                    : "border-white/10 bg-[#111315] text-[#f2f3f4] hover:border-[rgba(255,122,0,.55)]"
                }`}
              >
                <span className="h-12 w-12 overflow-hidden rounded-full border border-white/10 bg-[#090a0b]">
                  <img
                    src={token.image}
                    onError={(e) => {
                      e.currentTarget.src = `/assets/coin-logos/${token.id}.svg`;
                    }}
                    alt={`${token.symbol} animal`}
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm uppercase">{token.symbol}</strong>
                  <small className="block truncate text-xs text-[#8f949b]">{token.name}</small>
                </span>
              </button>
            );
          })
          )}
        </div>
      </section>

      <section className="rounded-[14px] border border-white/10 bg-[linear-gradient(160deg,rgba(17,19,21,.72),rgba(8,9,10,.8))] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg tracking-[0.05em] text-[#f2f3f4]">
            <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#ff7a00]" />
            Tracks
          </h2>
          <span className="rounded-[8px] border border-white/10 bg-[#111315] px-3 py-1 font-mono text-xs text-[#ff7a00]">
            {visibleMarkets.length} Tracks
          </span>
        </div>

        {activeCategory === "rwa" ? (
          <div className="rounded-[11px] border border-dashed border-[rgba(255,122,0,.35)] bg-[#111315] px-6 py-16 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#ff7a00]">RWA</p>
            <p className="mt-3 text-2xl font-semibold tracking-[0.04em] text-[#f2f3f4]">Coming Soon</p>
            <p className="mt-2 text-sm text-[#8f949b]">RWA race tracks are not open yet.</p>
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className="rounded-[11px] border border-dashed border-white/15 bg-[#111315] p-6 text-sm text-[#8f949b]">
            No tracks match the current filter.
          </div>
        ) : (
          <div id="marketGrid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleMarkets.map((market) => (
              <Link
                key={market.id}
                to={`/market-replay.html?id=${market.id}`}
                className="grid min-h-[199px] content-start gap-3 rounded-[11px] border border-white/10 bg-[#111315] p-4 no-underline transition-all hover:-translate-y-0.5 hover:border-[rgba(255,122,0,.55)]"
              >
                <span className="font-mono text-xs text-[#ff7a00]">{String(market.number).padStart(2, "0")}</span>
                <strong className="text-base font-medium text-[#f2f3f4]">{market.name}</strong>
                <div className="grid grid-cols-2 gap-3">
                  {market.tokenLetters.map((letter) => {
                    const token = getTokenByLetter(letter, activeCategory);
                    return (
                      <span
                        key={letter}
                        className="flex min-h-11 items-center gap-2 rounded-[7px] border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm font-semibold text-[#f2f3f4]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#090a0b]">
                          <img
                            src={token?.image}
                            onError={(e) => {
                              if (token) e.currentTarget.src = `/assets/coin-logos/${token.id}.svg`;
                            }}
                            alt={`${token?.symbol} animal`}
                            className="h-full w-full object-contain"
                          />
                        </span>
                        <span>{token?.symbol}</span>
                      </span>
                    );
                  })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

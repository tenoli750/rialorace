import { Link } from "react-router";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { getMarketsByCategory } from "../data/markets";
import { getTokenByLetter, getTokensByCategory, type MarketCategory } from "../data/tokens";

function getMarketHref(marketId: string) {
  if (marketId.startsWith("stock-market-")) return `/market.html?id=${marketId}`;
  if (marketId === "market-01") return "/market01-betting.html?id=market-01";
  if (marketId === "market-02") return "/market02-betting.html?id=market-02";
  return `/market.html?id=${marketId}`;
}

function getCategory(value: string | null): MarketCategory {
  return value === "stocks" || value === "rwa" ? value : "crypto";
}

export function MainMenu() {
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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6 mb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg text-[#9a3412]">Racers</h2>
          <div className="flex gap-2">
            <Link
              to="/main-menu.html?category=crypto"
              className={`rounded-md border border-[#fed7aa] px-3 py-1.5 text-xs font-semibold ${
                activeCategory === "crypto" ? "bg-[#9a3412] text-white" : "bg-[#fff7ed] text-[#9a3412]"
              }`}
            >
              Crypto
            </Link>
            <Link
              to="/main-menu.html?category=stocks"
              className={`rounded-md border border-[#fed7aa] px-3 py-1.5 text-xs font-semibold ${
                activeCategory === "stocks" ? "bg-[#9a3412] text-white" : "bg-[#fff7ed] text-[#9a3412]"
              }`}
            >
              Stocks
            </Link>
            <Link
              to="/main-menu.html?category=rwa"
              className={`rounded-md border border-[#fed7aa] px-3 py-1.5 text-xs font-semibold ${
                activeCategory === "rwa" ? "bg-[#9a3412] text-white" : "bg-[#fff7ed] text-[#9a3412]"
              }`}
            >
              RWA
            </Link>
          </div>
          {selectedRacers.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedRacers([])}
              className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-1.5 text-xs font-semibold text-[#9a3412] transition-colors hover:border-[#9a3412] hover:bg-[#ffedd5]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {activeTokens.map((token) => (
            <button
              type="button"
              key={token.id}
              onClick={() => toggleRacer(token.letter)}
              aria-pressed={selectedRacerSet.has(token.letter)}
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#9a3412] hover:shadow-sm ${
                selectedRacerSet.has(token.letter)
                  ? "border-[#9a3412] bg-[#9a3412] text-white shadow-sm"
                  : "border-[#fed7aa] bg-[#fff7ed]"
              }`}
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white border border-[#fed7aa] flex items-center justify-center overflow-hidden">
                <img src={token.image} alt={`${token.symbol} animal`} className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={
                    selectedRacerSet.has(token.letter)
                      ? "text-sm text-white truncate"
                      : "text-sm text-[#9a3412] truncate"
                  }
                >
                  {token.symbol}
                </div>
                <div
                  className={
                    selectedRacerSet.has(token.letter)
                      ? "text-xs text-white/75 truncate"
                      : "text-xs text-[#8a5a44] truncate"
                  }
                >
                  {token.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-[#fed7aa] bg-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <span className="text-xs uppercase tracking-wide text-[#8a5a44]">Race-Lotto</span>
            <h2 className="mt-1 text-xl font-semibold text-[#9a3412]">Perfect 6 Jackpot</h2>
            <p className="mt-2 text-sm text-[#8a5a44]">
              Twice-daily 10:00 and 22:00 KST draws across six token matchups.
            </p>
          </div>
          <Link
            to="/race-lotto"
            className="flex h-12 w-full items-center justify-center rounded-md bg-[#9a3412] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7c2d12] lg:w-[260px]"
          >
            Open Lotto
          </Link>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-[#fed7aa] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg text-[#9a3412]">Tracks</h2>
          </div>
          <span className="px-3 py-1 bg-[#ffedd5] text-xs text-[#9a3412] rounded-md">
            {visibleMarkets.length} Tracks
          </span>
        </div>

        <div id="marketGrid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visibleMarkets.map((market) => (
            <Link
              key={market.id}
              to={getMarketHref(market.id)}
              className="grid min-h-[199px] content-start gap-3 rounded-lg border border-[#fdba74] bg-[#fff7ed] p-4 text-left no-underline transition-all hover:-translate-y-0.5 hover:border-[#9a3412] hover:shadow-sm"
            >
              <span className="text-base font-semibold text-[#9a3412]">{market.name}</span>
              <div className="grid grid-cols-2 gap-3">
                {market.tokenLetters.map((letter) => {
                  const token = getTokenByLetter(letter, activeCategory);
                  return (
                    <span
                      key={letter}
                      className="flex min-h-11 items-center gap-2 rounded-md border border-[#fed7aa] bg-white px-3 py-2 text-sm font-semibold text-[#9a3412]"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#fed7aa] bg-white">
                        <img
                          src={token?.image}
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
      </section>
    </div>
  );
}

import { useParams, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { getMarketById } from "../data/markets";
import { getTokenByLetter, tokens } from "../data/tokens";
import { listRaceResults, RaceResultRow } from "../lib/supabase";

interface ReplayRecord {
  id: string;
  startedAt: string;
  rankings: string[];
}

function getLegacyReplayUrl(marketId: string, raceStartedAt?: string) {
  const params = new URLSearchParams({
    id: marketId,
    embed: "viewport"
  });
  if (raceStartedAt) {
    params.set("race_started_at", raceStartedAt);
  }
  return `/legacy-race/market-replay.html?${params.toString()}`;
}

export function ReplayMarket() {
  const { marketId } = useParams();
  const [searchParams] = useSearchParams();
  const market = getMarketById(marketId ?? searchParams.get("id") ?? "market-02");

  const [selectedReplay, setSelectedReplay] = useState<number>(0);
  const [replayRecords, setReplayRecords] = useState<ReplayRecord[]>([]);
  const [status, setStatus] = useState("Loading replay history...");
  const selectedRecord = replayRecords[selectedReplay];

  useEffect(() => {
    if (!market) return;
    let cancelled = false;

    listRaceResults(market.id, 10)
      .then((rows) => {
        if (cancelled) return;
        const records = rows.map(mapReplayRecord);
        setReplayRecords(records);
        setSelectedReplay(0);
        setStatus(records.length ? "" : "No replay history yet.");
      })
      .catch(() => {
        if (!cancelled) setStatus("Replay history could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, [market]);

  if (!market) {
    return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">Market not found</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      {/* Main Grid - Replay Viewport + History Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Replay Viewport */}
        <section className="lg:col-span-3 bg-white rounded-lg border border-[#fed7aa] overflow-hidden">
          <div className="aspect-video bg-[#ffedd5] relative">
            <iframe
              title={`${market.name} replay Three.js race`}
              src={getLegacyReplayUrl(market.id, selectedRecord?.startedAt)}
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        </section>

        {/* Replay History Sidebar */}
        <aside className="bg-white rounded-lg border border-[#fed7aa] overflow-hidden">
          <div className="p-4 border-b border-[#fed7aa]">
            <h2 className="text-sm text-[#9a3412] mb-3">Replay History</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-[#9a3412] text-white text-xs rounded hover:bg-[#c2410c]">
                Replay Selected
              </button>
            </div>
          </div>

          {/* Replay List */}
          <div className="h-[500px] overflow-y-auto">
            {status ? (
              <div className="p-4 text-xs text-[#8a5a44]">{status}</div>
            ) : replayRecords.map((record, index) => (
              <button
                key={record.id}
                onClick={() => setSelectedReplay(index)}
                className={`w-full p-3 text-left border-b border-[#fed7aa] hover:bg-[#fff7ed] transition-colors ${
                  selectedReplay === index ? "bg-[#ffedd5]" : ""
                }`}
              >
                <div className="text-xs text-[#8a5a44] mb-1">
                  Game #{10 - index}
                </div>
                <div className="text-xs text-[#9a3412] mb-2">
                  {formatKstDate(record.startedAt)}
                </div>
                <div className="text-xs text-[#8a5a44]">
                  {record.rankings.map((symbol, i) => {
                    const token = getTokenBySymbol(symbol);
                    return (
                      <span key={`${record.id}-${symbol}-${i}`} className="inline-flex items-center gap-1 mr-2">
                        <img src={token?.image} alt="" className="w-4 h-4 rounded-full object-contain bg-white" />
                        {i + 1}.{token?.symbol}
                      </span>
                    );
                  })}
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function mapReplayRecord(row: RaceResultRow): ReplayRecord {
  return {
    id: row.id,
    startedAt: row.race_started_at,
    rankings: [row.first_place, row.second_place, row.third_place, row.fourth_place].filter(Boolean)
  };
}

function getTokenBySymbol(symbol: string) {
  return tokens.find((token) => token.symbol === symbol) ?? getTokenByLetter(symbol);
}

function formatKstDate(timestamp: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp))} KST`;
}

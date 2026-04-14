import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { getPublicRankings } from "../lib/supabase";

interface Player {
  rank: number;
  username: string;
  points: number;
}

export function Rankings() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [status, setStatus] = useState("Loading rankings...");

  useEffect(() => {
    let cancelled = false;

    getPublicRankings()
      .then((rows) => {
        if (cancelled) return;
        const nextPlayers = rows.map((row) => ({
          rank: Number(row.rank_number),
          username: row.login_id ?? "Unknown",
          points: Number(row.points_balance ?? 0)
        }));
        setPlayers(nextPlayers);
        setStatus(nextPlayers.length ? "" : "No players yet.");
      })
      .catch(() => {
        if (!cancelled) setStatus("Rankings could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Rankings</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">Rankings</h1>
          <p className="text-sm text-[#8a5a44]">Every player ranked by current points balance.</p>
        </div>

        {status ? (
          <div className="py-12 text-center text-[#8a5a44]">{status}</div>
        ) : (
          <>
            {/* Top 3 Highlight */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {players.slice(0, 3).map((player) => {
            const icons = [
              { icon: Trophy, color: "#ffd700", bg: "#fff9e6" },
              { icon: Medal, color: "#c0c0c0", bg: "#f5f5f5" },
              { icon: Medal, color: "#cd7f32", bg: "#fff3e6" },
            ];
            const { icon: Icon, color, bg } = icons[player.rank - 1];

            return (
              <div
                key={player.rank}
                className="p-4 rounded-lg border-2"
                style={{ borderColor: color, backgroundColor: bg }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="w-6 h-6" style={{ color }} />
                  <div className="text-2xl" style={{ color }}>
                    #{player.rank}
                  </div>
                </div>
                <div className="text-lg text-[#9a3412] mb-1">{player.username}</div>
                <div className="text-sm text-[#8a5a44]">{player.points.toLocaleString()} pts</div>
              </div>
            );
              })}
            </div>

            {/* All Rankings */}
            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-[#8a5a44] uppercase tracking-wide border-b border-[#fed7aa]">
                <div className="col-span-2">Rank</div>
                <div className="col-span-7">Player</div>
                <div className="col-span-3 text-right">Points</div>
              </div>

              {players.map((player) => (
                <div
                  key={player.rank}
                  className={`grid grid-cols-12 gap-4 px-4 py-3 rounded hover:bg-[#fff7ed] transition-colors ${
                    player.rank <= 3 ? "bg-[#fff7ed]" : ""
                  }`}
                >
                  <div className="col-span-2 text-sm text-[#9a3412]">#{player.rank}</div>
                  <div className="col-span-7 text-sm text-[#9a3412]">{player.username}</div>
                  <div className="col-span-3 text-sm text-[#9a3412] text-right">
                    {player.points.toLocaleString()}
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
      </section>
    </div>
  );
}

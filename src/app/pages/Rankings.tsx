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
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="mb-6">
        <span className="text-xs uppercase tracking-[0.08em] text-[#8f949b]">Rankings</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-[0.04em] text-[#f2f3f4]">Rankings</h1>
        <p className="mt-1 text-sm text-[#8f949b]">Every player ranked by current points balance.</p>
      </div>

      <section className="rounded-[14px] border border-white/10 bg-[linear-gradient(160deg,rgba(17,19,21,.72),rgba(8,9,10,.8))] p-6">
        {status ? (
          <div className="py-12 text-center text-[#8f949b]">{status}</div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              {players.slice(0, 3).map((player) => {
                const icons = [
                  { icon: Trophy, color: "#ffd700", ring: "rgba(255,215,0,.45)", bg: "rgba(255,215,0,.10)" },
                  { icon: Medal, color: "#c0c0c0", ring: "rgba(192,192,192,.40)", bg: "rgba(192,192,192,.08)" },
                  { icon: Medal, color: "#cd7f32", ring: "rgba(205,127,50,.45)", bg: "rgba(205,127,50,.10)" },
                ];
                const { icon: Icon, color, ring, bg } = icons[player.rank - 1];

                return (
                  <div
                    key={player.rank}
                    className="rounded-[11px] border p-4"
                    style={{ borderColor: ring, backgroundColor: bg }}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <Icon className="h-6 w-6" style={{ color }} />
                      <div className="text-2xl font-semibold tracking-[0.04em]" style={{ color }}>
                        #{player.rank}
                      </div>
                    </div>
                    <div className="mb-1 text-lg text-[#f2f3f4]">{player.username}</div>
                    <div className="text-sm text-[#8f949b]">{player.points.toLocaleString()} pts</div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1">
              <div className="grid grid-cols-12 gap-4 border-b border-white/10 px-4 py-2 text-xs uppercase tracking-[0.08em] text-[#8f949b]">
                <div className="col-span-2">Rank</div>
                <div className="col-span-7">Player</div>
                <div className="col-span-3 text-right">Points</div>
              </div>

              {players.map((player) => (
                <div
                  key={player.rank}
                  className={`grid grid-cols-12 gap-4 rounded-[8px] px-4 py-3 transition-colors hover:bg-[rgba(255,122,0,.08)] ${
                    player.rank <= 3 ? "bg-[rgba(255,122,0,.06)]" : ""
                  }`}
                >
                  <div
                    className={`col-span-2 text-sm ${
                      player.rank === 1
                        ? "text-[#ffd700]"
                        : player.rank === 2
                          ? "text-[#c0c0c0]"
                          : player.rank === 3
                            ? "text-[#cd7f32]"
                            : "text-[#ff7a00]"
                    }`}
                  >
                    #{player.rank}
                  </div>
                  <div className="col-span-7 text-sm text-[#f2f3f4]">{player.username}</div>
                  <div className="col-span-3 text-right text-sm text-[#f2f3f4]">
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

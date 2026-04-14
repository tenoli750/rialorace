import { COINS } from "./config.js";
import { supabase } from "./supabaseClient.js";

const HISTORY_POLL_MS = 5000;

export class SupabasePriceFeed {
  constructor(
    engine,
    coins = COINS,
    {
      playbackDelayMs = 0,
      getNowMs = () => Date.now(),
      useRaceStateSnapshots = false,
      useRaceSimulationIntervals = false,
      marketId = null,
      getRaceStartAtMs = () => null,
      getVisibleRaceStartAtMs = () => null
    } = {}
  ) {
    this.engine = engine;
    this.coins = coins;
    this.playbackDelayMs = Math.max(0, playbackDelayMs);
    this.getNowMs = getNowMs;
    this.useRaceStateSnapshots = useRaceStateSnapshots;
    this.useRaceSimulationIntervals = useRaceSimulationIntervals;
    this.marketId = marketId;
    this.getRaceStartAtMs = getRaceStartAtMs;
    this.getVisibleRaceStartAtMs = getVisibleRaceStartAtMs;
    this.historyTimer = null;
    this.lastBucketByCoinId = new Map();
    this.lastSnapshotKey = null;
  }

  connect() {
    this.engine.setConnectionStatus("connecting", "Supabase Feed");
    this.engine.addNote("Connecting to official 5-second Supabase price feed.");
    this.pollHistoryBuckets();
    this.historyTimer = window.setInterval(() => this.pollHistoryBuckets(), HISTORY_POLL_MS);
  }

  disconnect() {
    if (this.historyTimer) {
      window.clearInterval(this.historyTimer);
      this.historyTimer = null;
    }
  }

  resetReplayState() {
    this.lastBucketByCoinId = new Map();
    this.lastSnapshotKey = null;
  }

  primeLastBuckets(latestBucketByCoinId) {
    this.lastBucketByCoinId = new Map(latestBucketByCoinId);
  }

  async pollHistoryBuckets() {
    if (this.useRaceSimulationIntervals && this.marketId) {
      await this.pollRaceSimulationIntervals();
      return;
    }

    if (this.useRaceStateSnapshots && this.marketId) {
      await this.pollRaceStateSnapshots();
      return;
    }

    const cutoffMs = this.getNowMs() - this.playbackDelayMs;
    const coinIds = this.coins.map((coin) => coin.id);
    const { data, error } = await supabase
      .from("price_history_5s")
      .select("symbol, price, bucket_at, source_updated_at")
      .in("symbol", coinIds)
      .order("bucket_at", { ascending: false })
      .limit(32);

    if (error) {
      this.engine.setConnectionStatus("error", "Supabase Error");
      return;
    }

    const rowsBySymbol = new Map();
    for (const row of data ?? []) {
      const rows = rowsBySymbol.get(row.symbol) ?? [];
      rows.push(row);
      rowsBySymbol.set(row.symbol, rows);
    }

    for (const coin of this.coins) {
      const rows = (rowsBySymbol.get(coin.id) ?? []).filter(
        (row) => new Date(row.bucket_at).getTime() <= cutoffMs
      );
      if (rows.length < 2) {
        continue;
      }

      const [currentRow, previousRow] = rows;
      const bucketKey = currentRow.bucket_at;
      if (this.lastBucketByCoinId.get(coin.id) === bucketKey) {
        continue;
      }

      this.lastBucketByCoinId.set(coin.id, bucketKey);
      this.engine.updatePrice(coin.symbol, currentRow.price);
      this.engine.applyClosedCandle(coin.symbol, {
        i: "5s",
        o: String(previousRow.price),
        c: String(currentRow.price),
        T: new Date(currentRow.bucket_at).getTime(),
        x: true
      });
    }

    this.engine.setConnectionStatus("live", "Supabase Official");
  }

  async pollRaceSimulationIntervals() {
    const backendRaceStartedAtMs = this.getRaceStartAtMs?.();
    const visibleRaceStartedAtMs =
      this.getVisibleRaceStartAtMs?.() ?? (backendRaceStartedAtMs ? backendRaceStartedAtMs + 5000 : null);

    if (!backendRaceStartedAtMs || !visibleRaceStartedAtMs) {
      return;
    }

    const cutoffMs = this.getNowMs() - this.playbackDelayMs;
    const coinIds = this.coins.map((coin) => coin.id);
    const { data, error } = await supabase
      .from("race_simulation_intervals")
      .select(
        "symbol, source_bucket_at, interval_started_at, frontend_visible_at, price, change_percent, speed_factor, cumulative_distance_meters, time_progressed_ms, finish_place, finished_at, rank"
      )
      .eq("market_id", this.marketId)
      .eq("race_started_at", new Date(backendRaceStartedAtMs).toISOString())
      .in("symbol", coinIds)
      .lte("frontend_visible_at", new Date(cutoffMs).toISOString())
      .order("interval_started_at", { ascending: false })
      .limit(128);

    if (error) {
      this.engine.setConnectionStatus("error", "Supabase Error");
      return;
    }

    const rowsByInterval = new Map();
    for (const row of data ?? []) {
      const rows = rowsByInterval.get(row.interval_started_at) ?? [];
      rows.push(row);
      rowsByInterval.set(row.interval_started_at, rows);
    }

    const sortedIntervalKeys = [...rowsByInterval.keys()].sort(
      (left, right) => new Date(right) - new Date(left)
    );
    const intervalKey = sortedIntervalKeys.find((key) => {
      const symbols = new Set((rowsByInterval.get(key) ?? []).map((row) => row.symbol));
      return coinIds.every((coinId) => symbols.has(coinId));
    });

    if (!intervalKey || this.lastSnapshotKey === intervalKey) {
      return;
    }

    const rows = rowsByInterval.get(intervalKey) ?? [];
    this.lastSnapshotKey = intervalKey;
    const snapshotVisibleAtMs = Math.max(...rows.map((row) => new Date(row.frontend_visible_at).getTime()));

    this.engine.applyOfficialSnapshotState({
      prepStartedAtWallMs: visibleRaceStartedAtMs - this.engine.state.prepDurationMs,
      raceStartedAtWallMs: visibleRaceStartedAtMs,
      snapshotAtWallMs: snapshotVisibleAtMs,
      racers: rows.map((row) => ({
        id: row.symbol,
        price: Number(row.price),
        changePercent: Number(row.change_percent ?? 0),
        speedFactor: Number(row.speed_factor ?? 1),
        targetSpeedFactor: Number(row.speed_factor ?? 1),
        lastSpeedEffectPercent: 0,
        distanceMeters: Number(row.cumulative_distance_meters ?? 0),
        finishPlace: row.finish_place ? Number(row.finish_place) : null,
        finishedAtWallMs: row.finished_at ? new Date(row.finished_at).getTime() + 5000 : 0,
        snapshotAtWallMs: snapshotVisibleAtMs
      }))
    });

    this.engine.setConnectionStatus("live", "Supabase Replay");
  }

  async pollRaceStateSnapshots() {
    const raceStartedAtMs = this.getRaceStartAtMs?.();
    if (!raceStartedAtMs) {
      return;
    }

    const cutoffMs = this.getNowMs() - this.playbackDelayMs;
    const coinIds = this.coins.map((coin) => coin.id);
    const { data, error } = await supabase
      .from("race_state_snapshots")
      .select(
        "symbol, price, bucket_at, speed_factor, target_speed_factor, distance_meters, change_percent, speed_effect_percent, finish_place, finished_at"
      )
      .eq("market_id", this.marketId)
      .eq("race_started_at", new Date(raceStartedAtMs).toISOString())
      .in("symbol", coinIds)
      .lte("bucket_at", new Date(cutoffMs).toISOString())
      .order("bucket_at", { ascending: false })
      .limit(128);

    if (error) {
      this.engine.setConnectionStatus("error", "Supabase Error");
      return;
    }

    const rowsByBucket = new Map();
    for (const row of data ?? []) {
      const rows = rowsByBucket.get(row.bucket_at) ?? [];
      rows.push(row);
      rowsByBucket.set(row.bucket_at, rows);
    }

    const sortedBucketKeys = [...rowsByBucket.keys()].sort((left, right) => new Date(right) - new Date(left));
    const snapshotKey = sortedBucketKeys.find((bucketAt) => {
      const symbols = new Set((rowsByBucket.get(bucketAt) ?? []).map((row) => row.symbol));
      return coinIds.every((coinId) => symbols.has(coinId));
    });

    if (!snapshotKey || this.lastSnapshotKey === snapshotKey) {
      return;
    }

    const rows = rowsByBucket.get(snapshotKey) ?? [];
    this.lastSnapshotKey = snapshotKey;

    this.engine.applyOfficialSnapshotState({
      prepStartedAtWallMs: raceStartedAtMs - this.engine.state.prepDurationMs,
      raceStartedAtWallMs: raceStartedAtMs,
      snapshotAtWallMs: new Date(snapshotKey).getTime(),
      racers: rows.map((row) => ({
        id: row.symbol,
        price: Number(row.price),
        changePercent: Number(row.change_percent ?? 0),
        speedFactor: Number(row.speed_factor ?? 1),
        targetSpeedFactor: Number(row.target_speed_factor ?? row.speed_factor ?? 1),
        lastSpeedEffectPercent: Number(row.speed_effect_percent ?? 0),
        distanceMeters: Number(row.distance_meters ?? 0),
        finishPlace: row.finish_place ? Number(row.finish_place) : null,
        finishedAtWallMs: row.finished_at ? new Date(row.finished_at).getTime() : 0,
        snapshotAtWallMs: new Date(snapshotKey).getTime()
      }))
    });

    this.engine.setConnectionStatus("live", "Supabase Official");
  }
}

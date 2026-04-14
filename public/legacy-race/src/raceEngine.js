import {
  BASE_METERS_PER_SECOND,
  COINS,
  MAX_SPEED_FACTOR,
  MIN_SPEED_FACTOR,
  SPEED_MULTIPLIER,
  SPEED_SMOOTHING,
  STALE_CANDLE_MS,
  TARGET_DISTANCE_METERS,
  TRACK_LOOP_METERS
} from "./config.js";

const PREP_DURATION_MS = 10_000;
const CAMERA_INTRO_DURATION_MS = 5_000;
const FINAL_COUNTDOWN_DURATION_MS = 3_000;
const POST_FINISH_RUNOUT_METERS = TRACK_LOOP_METERS;
const VIRTUAL_FINISH_DISTANCE_METERS = TARGET_DISTANCE_METERS + POST_FINISH_RUNOUT_METERS;
const POST_FINISH_CRUISE_FACTOR = 1;
const WINNER_REVEAL_DELAY_MS = 3_000;

export class RaceEngine {
  constructor({ autoRestart = true, coins = COINS } = {}) {
    this.autoRestart = autoRestart;
    this.coins = coins;
    this.state = {
      racers: this.coins.map((coin) => createRacer(coin)),
      selectedRacerId: this.coins[0].id,
      connectionStatus: "connecting",
      connectionMessage: "Connecting",
      prepStarted: false,
      prepStartedAtWallMs: 0,
      raceStarted: false,
      raceFinished: false,
      visualRaceComplete: false,
      winnerId: null,
      winnerFinishedAtWallMs: 0,
      raceStartedAtWallMs: 0,
      raceFinishedAtWallMs: 0,
      finishOrder: [],
      prepDurationMs: PREP_DURATION_MS,
      cameraIntroDurationMs: CAMERA_INTRO_DURATION_MS,
      finalCountdownDurationMs: FINAL_COUNTDOWN_DURATION_MS,
      autoResetRequested: false,
      externalSnapshotMode: false,
      notes: []
    };
  }

  reset() {
    this.state.prepStarted = false;
    this.state.prepStartedAtWallMs = 0;
    this.state.raceStarted = false;
    this.state.raceFinished = false;
    this.state.visualRaceComplete = false;
    this.state.winnerId = null;
    this.state.winnerFinishedAtWallMs = 0;
    this.state.raceStartedAtWallMs = 0;
    this.state.raceFinishedAtWallMs = 0;
    this.state.finishOrder = [];
    this.state.autoResetRequested = false;
    this.state.externalSnapshotMode = false;
    this.state.notes = [];

    for (const racer of this.state.racers) {
      racer.changePercent = 0;
      racer.racePercent = 0;
      racer.startPrice = null;
      racer.speedFactor = 1;
      racer.targetSpeedFactor = 1;
      racer.postFinishSpeedFactor = 1;
      racer.lastSpeedEffectPercent = 0;
      racer.distanceMeters = 0;
      racer.finishPlace = null;
      racer.finishedAtWallMs = 0;
      racer.lastCandleAt = 0;
      racer.speedWindowStartPrice = null;
      racer.speedWindowStartAt = 0;
      racer.samples = [];
      racer.sampleKeys = new Set();
    }

    this.addNote("Racers lined up and ready. Set your camera, then press Start Race.");
  }

  startRace() {
    this.startPrepAt(Date.now());
  }

  startPrepAt(prepStartedAtWallMs) {
    if (this.state.prepStarted || this.state.raceStarted || this.state.raceFinished) {
      return;
    }

    this.state.prepStarted = true;
    this.state.prepStartedAtWallMs = prepStartedAtWallMs;
    this.addNote(
      `10-second prep started. Camera animates for 5 seconds, then holds while the 3, 2, 1 countdown appears at the end.`
    );
  }

  restoreOfficialRace({ prepStartedAtWallMs, raceStartedAtWallMs, replayedAtWallMs, bucketsBySymbol }) {
    this.reset();
    this.state.externalSnapshotMode = false;
    this.state.notes = [];
    this.state.prepStarted = true;
    this.state.prepStartedAtWallMs = prepStartedAtWallMs;
    this.state.raceStarted = true;
    this.state.raceStartedAtWallMs = raceStartedAtWallMs;

    const eventMap = new Map();

    for (const racer of this.state.racers) {
      const rows = (bucketsBySymbol.get(racer.id) ?? []).slice().sort((left, right) => left.timeMs - right.timeMs);
      const startRow = rows[0];
      if (!startRow) {
        continue;
      }

      racer.price = startRow.price;
      racer.startPrice = startRow.price;
      racer.racePercent = 0;
      racer.changePercent = 0;
      racer.speedFactor = 1;
      racer.targetSpeedFactor = 1;
      racer.distanceMeters = 0;
      racer.finishPlace = null;
      racer.finishedAtWallMs = 0;
      racer.lastCandleAt = raceStartedAtWallMs;
      racer.speedWindowStartPrice = startRow.price;
      racer.speedWindowStartAt = raceStartedAtWallMs;
      racer.samples = [];
      racer.sampleKeys = new Set();

      for (let index = 1; index < rows.length; index += 1) {
        const row = rows[index];
        const previousRow = rows[index - 1];
        const entries = eventMap.get(row.timeMs) ?? [];
        entries.push({
          symbol: racer.symbol,
          open: previousRow.price,
          close: row.price,
          timeMs: row.timeMs
        });
        eventMap.set(row.timeMs, entries);
      }
    }

    let lastSimulatedMs = raceStartedAtWallMs;
    const sortedEventTimes = [...eventMap.keys()].sort((left, right) => left - right);

    for (const eventTimeMs of sortedEventTimes) {
      const deltaSeconds = Math.max(0, (eventTimeMs - lastSimulatedMs) / 1000);
      if (deltaSeconds > 0) {
        this.step(deltaSeconds, eventTimeMs);
      }

      for (const entry of eventMap.get(eventTimeMs) ?? []) {
        this.applyClosedCandle(entry.symbol, {
          o: String(entry.open),
          c: String(entry.close),
          T: entry.timeMs,
          x: true
        });
      }

      lastSimulatedMs = eventTimeMs;
    }

    const remainingDeltaSeconds = Math.max(0, (replayedAtWallMs - lastSimulatedMs) / 1000);
    if (remainingDeltaSeconds > 0) {
      this.step(remainingDeltaSeconds, replayedAtWallMs);
    }

    this.addNote("Race state restored from official Supabase history.");
  }

  applyOfficialSnapshotState({ prepStartedAtWallMs, raceStartedAtWallMs, snapshotAtWallMs, racers }) {
    if (!Array.isArray(racers) || racers.length === 0) {
      return;
    }

    if (this.state.raceStartedAtWallMs !== raceStartedAtWallMs || !this.state.externalSnapshotMode) {
      this.reset();
      this.state.notes = [];
      this.addNote("Race state synchronized from backend snapshots.");
    }

    this.state.externalSnapshotMode = true;
    this.state.prepStarted = true;
    this.state.prepStartedAtWallMs = prepStartedAtWallMs;
    this.state.raceStarted = true;
    this.state.raceStartedAtWallMs = raceStartedAtWallMs;

    const racerMap = new Map(racers.map((entry) => [entry.id, entry]));

    for (const racer of this.state.racers) {
      const snapshot = racerMap.get(racer.id);
      if (!snapshot) {
        continue;
      }

      const snapshotDistance = snapshot.distanceMeters ?? 0;
      let displayDistance = snapshotDistance;
      if (snapshot.finishPlace && snapshot.finishedAtWallMs && snapshotAtWallMs >= snapshot.finishedAtWallMs) {
        const postFinishSeconds = Math.max(0, (snapshotAtWallMs - snapshot.finishedAtWallMs) / 1000);
        const runoutDistance =
          TARGET_DISTANCE_METERS +
          BASE_METERS_PER_SECOND * Math.max(snapshot.speedFactor ?? 1, 1) * postFinishSeconds;
        displayDistance = Math.min(
          Math.max(snapshotDistance, runoutDistance),
          VIRTUAL_FINISH_DISTANCE_METERS
        );
      }

      racer.price = snapshot.price;
      racer.changePercent = snapshot.changePercent ?? 0;
      racer.speedFactor = snapshot.speedFactor ?? 1;
      racer.targetSpeedFactor = snapshot.targetSpeedFactor ?? racer.speedFactor;
      racer.postFinishSpeedFactor = snapshot.postFinishSpeedFactor ?? racer.postFinishSpeedFactor ?? racer.speedFactor;
      racer.lastSpeedEffectPercent = snapshot.lastSpeedEffectPercent ?? racer.lastSpeedEffectPercent;
      racer.distanceMeters = displayDistance;
      racer.finishPlace = snapshot.finishPlace ?? null;
      racer.finishedAtWallMs = snapshot.finishedAtWallMs ?? 0;
      racer.lastCandleAt = snapshot.snapshotAtWallMs ?? snapshotAtWallMs;
    }

    this.state.finishOrder = [...this.state.racers]
      .filter((racer) => Number.isInteger(racer.finishPlace))
      .sort((left, right) => left.finishPlace - right.finishPlace)
      .map((racer) => racer.id);

    if (this.state.finishOrder.length === this.state.racers.length) {
      this.state.raceFinished = true;
      this.state.raceFinishedAtWallMs = Math.max(
        ...this.state.racers.map((racer) => racer.finishedAtWallMs || snapshotAtWallMs)
      );
      this.state.winnerId = this.state.finishOrder[0] ?? null;
      this.state.winnerFinishedAtWallMs = this.state.raceFinishedAtWallMs;
    } else {
      this.state.raceFinished = false;
      this.state.raceFinishedAtWallMs = 0;
      this.state.winnerId = null;
      this.state.winnerFinishedAtWallMs = 0;
    }

    this.state.visualRaceComplete = this.state.racers.every(
      (racer) => racer.distanceMeters >= TARGET_DISTANCE_METERS - 0.0001
    );
  }

  step(deltaSeconds, nowWallMs = Date.now()) {
    const now = nowWallMs;

    if (
      this.autoRestart &&
      this.state.raceFinished &&
      !this.state.autoResetRequested &&
      now - this.state.raceFinishedAtWallMs >= WINNER_REVEAL_DELAY_MS + 3_000
    ) {
      this.state.autoResetRequested = true;
      this.addNote("Winner reveal finished. Restarting the next race automatically.");
      return;
    }

    if (this.state.prepStarted && !this.state.raceStarted) {
      if (now - this.state.prepStartedAtWallMs >= this.state.prepDurationMs) {
        this.beginRace(now);
      }
      return;
    }

    if (this.state.externalSnapshotMode) {
      return;
    }

    if (this.state.visualRaceComplete || !this.state.raceStarted) {
      return;
    }

    for (const racer of this.state.racers) {
      if (!racer.finishPlace) {
        racer.speedFactor = easeToward(
          racer.speedFactor,
          racer.targetSpeedFactor,
          getFrameSmoothingFactor(deltaSeconds)
        );
      }

      const speedFactor = racer.finishPlace
        ? racer.postFinishSpeedFactor || POST_FINISH_CRUISE_FACTOR
        : this.getEffectiveSpeedFactor(racer);
      racer.distanceMeters = Math.min(
        racer.distanceMeters + BASE_METERS_PER_SECOND * speedFactor * deltaSeconds,
        VIRTUAL_FINISH_DISTANCE_METERS
      );
      if (!racer.finishPlace && racer.distanceMeters >= TARGET_DISTANCE_METERS) {
        this.lockFinishPlace(racer, now);
      }
    }

    if (!this.state.raceFinished && this.state.finishOrder.length === this.state.racers.length) {
      this.finishRace(now);
    }

    if (
      !this.state.visualRaceComplete &&
      this.state.racers.every((racer) => racer.distanceMeters >= VIRTUAL_FINISH_DISTANCE_METERS - 0.0001)
    ) {
      this.state.visualRaceComplete = true;
      this.addNote("All four racers cleared the virtual finish runout.");
    }
  }

  beginRace(startedAtWallMs) {
    this.state.raceStarted = true;
    this.state.raceStartedAtWallMs = startedAtWallMs;
    for (const racer of this.state.racers) {
      racer.startPrice = Number.isFinite(racer.price) && racer.price > 0 ? racer.price : null;
      racer.racePercent = 0;
      racer.speedFactor = 1;
      racer.targetSpeedFactor = 1;
      racer.postFinishSpeedFactor = 1;
      racer.lastSpeedEffectPercent = 0;
    }
    this.addNote(
      `3D race started. Base speed is 1x, and each closed 5-second price move sets the next speed target.`
    );
  }

  lockFinishPlace(racer, finishedAtWallMs) {
    if (racer.finishPlace) {
      return;
    }

    racer.finishPlace = this.state.finishOrder.length + 1;
    racer.finishedAtWallMs = finishedAtWallMs;
    racer.postFinishSpeedFactor = Math.max(racer.speedFactor || 1, racer.targetSpeedFactor || 1, 1);
    this.state.finishOrder.push(racer.id);

    this.addNote(`${formatPlace(racer.finishPlace)} ${racer.id} locked its place at ${TARGET_DISTANCE_METERS}m.`);
  }

  finishRace(finishedAtWallMs) {
    this.state.winnerId = this.state.finishOrder[0] ?? null;
    this.state.winnerFinishedAtWallMs = finishedAtWallMs;
    this.state.raceFinished = true;
    this.state.raceFinishedAtWallMs = finishedAtWallMs;
    this.addNote(
      `Final order locked: ${this.state.finishOrder
        .map((id, index) => `${index + 1}.${id}`)
        .join(" · ")}. Winner close-up in 3 seconds.`
    );
  }

  applyClosedCandle(symbol, payload) {
    const racer = this.state.racers.find((entry) => entry.symbol === symbol);
    if (!racer) {
      return;
    }

    const open = Number(payload.o);
    const close = Number(payload.c);
    if (!Number.isFinite(open) || open === 0 || !Number.isFinite(close)) {
      return;
    }

    racer.price = close;

    const previousClose = racer.samples.at(-1)?.end ?? open;
    this.refreshRacerRaceState(racer, close, Number(payload.T));

    if (this.state.raceFinished || !this.state.raceStarted) {
      return;
    }

    this.recordSample(racer, {
      closeTime: Number(payload.T),
      start: previousClose,
      end: close,
      changePercent: racer.changePercent,
      racePercent: racer.racePercent,
      speedFactor: racer.targetSpeedFactor
    });
  }

  updatePrice(symbol, price) {
    const racer = this.state.racers.find((entry) => entry.symbol === symbol);
    const nextPrice = Number(price);
    if (racer && Number.isFinite(nextPrice)) {
      racer.price = nextPrice;
    }
  }

  recordSample(racer, sample) {
    if (racer.sampleKeys.has(sample.closeTime)) {
      return;
    }

    racer.sampleKeys.add(sample.closeTime);
    racer.samples.push(sample);
    racer.samples.sort((left, right) => left.closeTime - right.closeTime);
  }

  selectRacer(id) {
    this.state.selectedRacerId = id;
  }

  setConnectionStatus(status, message) {
    this.state.connectionStatus = status;
    this.state.connectionMessage = message;
  }

  applyOfficialFinishOrder(finishOrder, raceFinishedAtWallMs = Date.now()) {
    if (!Array.isArray(finishOrder) || finishOrder.length !== this.state.racers.length) {
      return;
    }

    this.state.finishOrder = [...finishOrder];
    this.state.winnerId = finishOrder[0] ?? null;
    this.state.raceFinished = true;
    this.state.raceFinishedAtWallMs = raceFinishedAtWallMs;
    if (!this.state.winnerFinishedAtWallMs) {
      this.state.winnerFinishedAtWallMs = raceFinishedAtWallMs;
    }

    for (const racer of this.state.racers) {
      const finishIndex = finishOrder.indexOf(racer.id);
      racer.finishPlace = finishIndex >= 0 ? finishIndex + 1 : null;
      if (racer.finishPlace && !racer.finishedAtWallMs) {
        racer.finishedAtWallMs = raceFinishedAtWallMs;
      }
    }
  }

  addNote(message) {
    const stamp = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());

    this.state.notes.unshift({ message, stamp });
    this.state.notes = this.state.notes.slice(0, 8);
  }

  getLeader() {
    return this.getRanking()[0] ?? this.state.racers[0];
  }

  getRanking() {
    return [...this.state.racers].sort((left, right) => {
      const leftFinished = Number.isInteger(left.finishPlace);
      const rightFinished = Number.isInteger(right.finishPlace);

      if (leftFinished && rightFinished) {
        return left.finishPlace - right.finishPlace || right.distanceMeters - left.distanceMeters;
      }

      if (leftFinished) {
        return -1;
      }

      if (rightFinished) {
        return 1;
      }

      return right.distanceMeters - left.distanceMeters;
    });
  }

  getSelectedRacer() {
    return this.state.racers.find((racer) => racer.id === this.state.selectedRacerId) ?? this.state.racers[0];
  }

  getEffectiveSpeedFactor(racer) {
    if (racer.finishPlace) {
      return racer.postFinishSpeedFactor || racer.speedFactor;
    }

    if (!racer.lastCandleAt) {
      return racer.speedFactor;
    }

    if (Date.now() - racer.lastCandleAt > STALE_CANDLE_MS) {
      return racer.speedFactor;
    }

    return racer.speedFactor;
  }

  refreshRacerRaceState(racer, price, updatedAtWallMs) {
    if (!Number.isFinite(price) || price <= 0) {
      return;
    }
    const activeRace = this.state.raceStarted && !this.state.raceFinished;

    if (!Number.isFinite(racer.startPrice) || racer.startPrice <= 0) {
      racer.startPrice = price;
      racer.racePercent = 0;
      racer.changePercent = 0;
      racer.speedFactor = 1;
      racer.targetSpeedFactor = 1;
      racer.lastSpeedEffectPercent = 0;
      racer.speedWindowStartPrice = price;
      racer.speedWindowStartAt = updatedAtWallMs;
      racer.lastCandleAt = updatedAtWallMs;
      return;
    }

    if (activeRace) {
      racer.racePercent = ((price - racer.startPrice) / racer.startPrice) * 100;
    }
    if (!Number.isFinite(racer.speedWindowStartPrice) || racer.speedWindowStartPrice <= 0) {
      racer.speedWindowStartPrice = price;
      racer.speedWindowStartAt = updatedAtWallMs;
      racer.changePercent = 0;
      racer.lastCandleAt = updatedAtWallMs;
      return;
    }

    if (updatedAtWallMs - racer.speedWindowStartAt >= 5_000) {
      racer.changePercent = ((price - racer.speedWindowStartPrice) / racer.speedWindowStartPrice) * 100;
      const projectedSpeedEffectPercent = racer.changePercent * SPEED_MULTIPLIER * 100;
      if (activeRace) {
        const previousTargetSpeedFactor = racer.targetSpeedFactor;
        const nextTargetSpeedFactor = clamp(
          previousTargetSpeedFactor * (1 + racer.changePercent * SPEED_MULTIPLIER),
          MIN_SPEED_FACTOR,
          MAX_SPEED_FACTOR
        );
        racer.targetSpeedFactor = nextTargetSpeedFactor;
        racer.lastSpeedEffectPercent =
          previousTargetSpeedFactor > 0
            ? ((nextTargetSpeedFactor - previousTargetSpeedFactor) / previousTargetSpeedFactor) * 100
            : 0;
      } else {
        racer.lastSpeedEffectPercent = projectedSpeedEffectPercent;
      }
      racer.speedWindowStartPrice = price;
      racer.speedWindowStartAt = updatedAtWallMs;
    }

    racer.lastCandleAt = updatedAtWallMs;
  }

  getElapsedRaceMs() {
    if (!this.state.raceStarted) {
      return 0;
    }

    const finishTime = this.state.raceFinished ? this.state.raceFinishedAtWallMs : Date.now();
    return Math.max(0, finishTime - this.state.raceStartedAtWallMs);
  }

  getRemainingPrepMs(nowWallMs = Date.now()) {
    if (!this.state.prepStarted || this.state.raceStarted) {
      return 0;
    }

    return Math.max(0, this.state.prepDurationMs - (nowWallMs - this.state.prepStartedAtWallMs));
  }

  consumeAutoReset() {
    if (!this.state.autoResetRequested) {
      return false;
    }

    this.state.autoResetRequested = false;
    return true;
  }

  releaseSnapshotMode() {
    this.state.externalSnapshotMode = false;
    this.state.prepStarted = false;
    this.state.prepStartedAtWallMs = 0;
  }

}

function createRacer(coin) {
  return {
    ...coin,
    price: null,
    changePercent: 0,
    racePercent: 0,
    startPrice: null,
    speedFactor: 1,
    targetSpeedFactor: 1,
    postFinishSpeedFactor: 1,
    lastSpeedEffectPercent: 0,
    distanceMeters: 0,
    finishPlace: null,
    finishedAtWallMs: 0,
    lastCandleAt: 0,
    speedWindowStartPrice: null,
    speedWindowStartAt: 0,
    samples: [],
    sampleKeys: new Set()
  };
}

function formatPlace(place) {
  if (place === 1) {
    return "1st";
  }
  if (place === 2) {
    return "2nd";
  }
  if (place === 3) {
    return "3rd";
  }
  return `${place}th`;
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeToward(current, target, factor) {
  return current + (target - current) * factor;
}

function getFrameSmoothingFactor(deltaSeconds) {
  const clampedDelta = Math.max(0, Math.min(deltaSeconds, 0.25));
  return 1 - Math.pow(1 - SPEED_SMOOTHING, clampedDelta * 60);
}

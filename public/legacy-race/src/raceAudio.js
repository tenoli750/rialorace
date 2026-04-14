const GALLOP_URL = new URL("../assets/race-gallop.mp3", import.meta.url).href;
const CROWD_URL = new URL("../assets/race-crowd.mp3", import.meta.url).href;
const WINNER_APPLAUSE_URL = new URL("../assets/winner-applause.mp3", import.meta.url).href;
const WINNER_REVEAL_DELAY_MS = 3000;

export class RaceAudioController {
  constructor() {
    this.unlocked = false;
    this.raceLoopPlaying = false;
    this.winnerApplausePlaying = false;
    this.context = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.activeSources = [];
    this.unlockHandler = this.unlock.bind(this);

    window.addEventListener("pointerdown", this.unlockHandler, { passive: true });
    window.addEventListener("keydown", this.unlockHandler, { passive: true });
  }

  async ensureContext() {
    if (this.context) {
      return this.context;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    this.context = new AudioContextCtor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  async unlock() {
    this.unlocked = true;
    window.removeEventListener("pointerdown", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);

    const context = await this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {}
    }
  }

  async loadBuffer(url) {
    if (this.buffers.has(url)) {
      return this.buffers.get(url);
    }

    const context = await this.ensureContext();
    if (!context) {
      return null;
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(arrayBuffer);
    this.buffers.set(url, buffer);
    return buffer;
  }

  async playLoop(url, volume) {
    const context = await this.ensureContext();
    if (!context) {
      return null;
    }

    const buffer = await this.loadBuffer(url);
    if (!buffer) {
      return null;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const trimStartSec = Math.min(1, Math.max(0, buffer.duration - 0.05));
    const trimEndSec = Math.max(trimStartSec + 0.05, buffer.duration - 1);

    source.buffer = buffer;
    source.loop = true;
    source.loopStart = trimStartSec;
    source.loopEnd = trimEndSec;
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(0, trimStartSec);

    const track = { source, gain };
    this.activeSources.push(track);
    return track;
  }

  async playRaceLoop() {
    if (!this.unlocked || this.raceLoopPlaying) {
      return;
    }

    this.raceLoopPlaying = true;

    try {
      await Promise.all([
        this.playLoop(GALLOP_URL, 1),
        this.playLoop(CROWD_URL, 0.5)
      ]);
    } catch {
      this.raceLoopPlaying = false;
    }
  }

  async playWinnerApplause() {
    if (!this.unlocked || this.winnerApplausePlaying) {
      return;
    }

    this.winnerApplausePlaying = true;

    try {
      await this.playLoop(WINNER_APPLAUSE_URL, 1);
    } catch {
      this.winnerApplausePlaying = false;
    }
  }

  stopRaceLoop() {
    this.raceLoopPlaying = false;
    this.winnerApplausePlaying = false;

    for (const track of this.activeSources) {
      try {
        track.source.stop();
      } catch {}
      try {
        track.source.disconnect();
      } catch {}
      try {
        track.gain.disconnect();
      } catch {}
    }

    this.activeSources = [];
  }

  sync(state) {
    const now = Date.now();
    const winnerRevealActive =
      state.raceFinished &&
      state.raceFinishedAtWallMs > 0 &&
      now - state.raceFinishedAtWallMs >= WINNER_REVEAL_DELAY_MS;
    const raceLoopActive =
      state.raceStarted &&
      (!state.raceFinished ||
        (state.raceFinishedAtWallMs > 0 && now - state.raceFinishedAtWallMs < WINNER_REVEAL_DELAY_MS));

    if (winnerRevealActive) {
      void this.playRaceLoop();
      void this.playWinnerApplause();
      return;
    }

    if (raceLoopActive) {
      void this.playRaceLoop();
      return;
    }

    this.stopRaceLoop();
  }

  dispose() {
    this.stopRaceLoop();
    window.removeEventListener("pointerdown", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);
    if (this.context) {
      try {
        void this.context.close();
      } catch {}
    }
  }
}

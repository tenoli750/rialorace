import { MAX_SPEED_FACTOR, MIN_SPEED_FACTOR, TARGET_DISTANCE_METERS, TRACK_LOOP_METERS } from "./config.js";

const COUNTDOWN_BEEP_URL = new URL("../assets/countdown-beep.mp3", import.meta.url).href;
const ANIMAL_ICON_BASE_URL = new URL("../assets/icons/", import.meta.url);

export class RaceUI {
  constructor({ root, coins, onSelectRacer, onPlayCamera, onStart, onRestart, onToggleCamera, onCycleCameraFocus, onToggleLogos }) {
    this.root = root;
    this.coins = coins;
    this.onSelectRacer = onSelectRacer;
    this.dom = {
      connectionBadge: root.querySelector("#connectionBadge"),
      statusValue: root.querySelector("#statusValue"),
      finishValue: root.querySelector("#finishValue"),
      leaderValue: root.querySelector("#leaderValue"),
      hubLabel: root.querySelector("#hubLabel"),
      hubTitle: root.querySelector("#hubTitle"),
      hubCopy: root.querySelector("#hubCopy"),
      standings: root.querySelector("#standings"),
      notes: root.querySelector("#notes"),
      countdown: root.querySelector("#raceCountdown"),
      postRaceOverlay: root.querySelector("#postRaceOverlay"),
      cameraFocusButton: root.querySelector("#cameraFocusButton"),
      coinGrid: root.querySelector("#coinGrid"),
      detailHeading: root.querySelector("#detailHeading"),
      detailSubtitle: root.querySelector("#detailSubtitle"),
      detailCountBadge: root.querySelector("#detailCountBadge"),
      detailStats: root.querySelector("#detailStats"),
      detailSampleList: root.querySelector("#detailSampleList"),
      playCameraButton: root.querySelector("#playCameraButton"),
      startButton: root.querySelector("#startButton"),
      restartButton: root.querySelector("#restartButton"),
      cameraButton: root.querySelector("#cameraButton"),
      logoToggleButton: root.querySelector("#logoToggleButton")
    };

    this.dom.playCameraButton?.addEventListener("click", onPlayCamera);
    this.dom.startButton?.addEventListener("click", onStart);
    this.dom.restartButton?.addEventListener("click", onRestart);
    this.dom.cameraButton?.addEventListener("click", onToggleCamera);
    this.dom.cameraFocusButton?.addEventListener("click", onCycleCameraFocus);
    this.dom.logoToggleButton?.addEventListener("click", onToggleLogos);
    this.coinCardMap = new Map();
    this.lastCountdownValue = null;
    this.countdownBeepAudio = this.createCountdownBeepAudio();
    this.buildCoinCards();
  }

  createCountdownBeepAudio() {
    try {
      const audio = new Audio(COUNTDOWN_BEEP_URL);
      audio.preload = "auto";
      return audio;
    } catch {
      return null;
    }
  }

  maybePlayCountdownBeep(value) {
    if (value !== "3" || this.lastCountdownValue === "3" || !this.countdownBeepAudio) {
      return;
    }

    try {
      this.countdownBeepAudio.currentTime = 0;
      void this.countdownBeepAudio.play();
    } catch {}
  }

  setCameraMode(mode) {
    if (!this.dom.cameraButton) {
      return;
    }

    const label =
      mode === "behind"
        ? "Camera: Behind Pack"
        : mode === "manual"
          ? "Camera: Manual"
          : "Camera: Overview";
    this.dom.cameraButton.textContent = label;
    this.dom.cameraButton.classList.toggle("is-active", mode !== "overview");
  }

  setCameraFocusPreset(preset) {
    if (!this.dom.cameraFocusButton) {
      return;
    }

    if (preset === "auto") {
      this.dom.cameraFocusButton.textContent = "Focus: Auto";
      return;
    }

    if (preset === "overview") {
      this.dom.cameraFocusButton.textContent = "Focus: Overview";
      return;
    }

    const coin = this.coins.find((entry) => entry.id === preset);
    this.dom.cameraFocusButton.textContent = coin ? `Focus: ${coin.id}` : "Focus: Auto";
  }

  setLogoVisibility(visible) {
    if (!this.dom.logoToggleButton) {
      return;
    }

    this.dom.logoToggleButton.textContent = visible ? "Logos: On" : "Logos: Off";
    this.dom.logoToggleButton.classList.toggle("is-active", visible);
  }

  buildCoinCards() {
    this.dom.coinGrid.innerHTML = "";

    this.coins.forEach((coin) => {
      const card = document.createElement("article");
      card.className = "coin-card";
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="coin-top">
          <div>
            <div class="coin-symbol">${coin.id}</div>
            <div class="coin-label">${coin.symbol}</div>
          </div>
          <span
            class="coin-badge coin-lap-badge"
            data-role="coin-badge"
            style="background-color:${coin.css};"
            aria-label="0 laps completed"
          >0</span>
        </div>
        <div class="coin-price" data-role="price">Waiting...</div>
        <div class="coin-gridline">
          <div>
            <div class="coin-label">5s Move</div>
            <div class="coin-value neutral" data-role="change">0.000%</div>
          </div>
          <div>
            <div class="coin-label">Speed</div>
            <div class="coin-value" data-role="speed">1.000x</div>
          </div>
          <div>
            <div class="coin-label">Distance</div>
            <div class="coin-value" data-role="distance">0.0m</div>
          </div>
          <div>
            <div class="coin-label">Samples</div>
            <div class="coin-value" data-role="samples">0</div>
          </div>
        </div>
        <div class="coin-post-race-cover" data-role="post-race-cover" aria-hidden="true">
          <div class="coin-post-race-label" data-role="post-race-label">1. BTC</div>
          <span class="coin-post-race-logo" data-role="post-race-logo"></span>
        </div>
      `;

      card.addEventListener("click", () => this.onSelectRacer(coin.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.onSelectRacer(coin.id);
        }
      });

      this.coinCardMap.set(coin.id, {
        card,
        topEl: card.querySelector(".coin-top"),
        priceEl: card.querySelector('[data-role="price"]'),
        gridlineEl: card.querySelector(".coin-gridline"),
        changeEl: card.querySelector('[data-role="change"]'),
        speedEl: card.querySelector('[data-role="speed"]'),
        distanceEl: card.querySelector('[data-role="distance"]'),
        samplesEl: card.querySelector('[data-role="samples"]'),
        badgeEl: card.querySelector('[data-role="coin-badge"]'),
        postRaceCoverEl: card.querySelector('[data-role="post-race-cover"]'),
        postRaceLabelEl: card.querySelector('[data-role="post-race-label"]'),
        postRaceLogoEl: card.querySelector('[data-role="post-race-logo"]')
      });

      this.dom.coinGrid.appendChild(card);
    });

    if (!this.dom.postRaceRankGrid) {
      const rankGrid = document.createElement("section");
      rankGrid.className = "coin-post-race-grid";
      rankGrid.hidden = true;
      const viewportShell = this.root.querySelector(".viewport-shell");
      if (viewportShell) {
        viewportShell.appendChild(rankGrid);
      } else {
        this.dom.coinGrid.insertAdjacentElement("afterend", rankGrid);
      }
      this.dom.postRaceRankGrid = rankGrid;
    }
  }

  setPostRacePreview(engine, enabled) {
    const ranking = engine.getRanking();
    this.renderPostRaceRankGrid(ranking, enabled);
    engine.state.racers.forEach((racer) => {
      const card = this.coinCardMap.get(racer.id);
      const rank = ranking.findIndex((entry) => entry.id === racer.id) + 1;
      card.card.classList.toggle("is-post-race", enabled);
      card.card.classList.toggle("force-post-race-cover", enabled);
      card.postRaceCoverEl.hidden = !enabled;
      if (enabled) {
        card.postRaceLabelEl.textContent = `${rank}. ${racer.id}`;
        card.postRaceLogoEl.style.backgroundImage = `url("${getAnimalIconUrl(racer.id)}")`;
        card.topEl.style.display = "none";
        card.priceEl.style.display = "none";
        card.gridlineEl.style.display = "none";
      } else {
        card.postRaceLogoEl.style.backgroundImage = "";
        card.topEl.style.display = "";
        card.priceEl.style.display = "";
        card.gridlineEl.style.display = "";
      }
    });
  }

  render(engine) {
    const state = engine.state;
    const leader = engine.getLeader();
    const ranking = engine.getRanking();
    const selected = engine.getSelectedRacer();

    this.dom.connectionBadge.className = `pill ${state.connectionStatus}`;
    this.dom.connectionBadge.textContent = state.connectionMessage;
    this.dom.statusValue.textContent = state.raceFinished
      ? "Finished"
      : state.raceStarted
        ? "Racing"
        : state.prepStarted
          ? "Preparing"
          : "Ready";
    this.dom.finishValue.textContent = `${TARGET_DISTANCE_METERS}m`;
    this.dom.leaderValue.textContent =
      state.raceStarted && leader ? `${leader.id} ${formatMeters(leader.distanceMeters)}` : "Waiting";
    if (this.dom.startButton) {
      this.dom.startButton.disabled = state.prepStarted || (state.raceStarted && !state.raceFinished);
    }
    if (this.dom.playCameraButton) {
      this.dom.playCameraButton.disabled = state.prepStarted || (state.raceStarted && !state.raceFinished);
    }

    const remainingPrepMs = engine.getRemainingPrepMs();
    const showCountdown =
      state.prepStarted &&
      !state.raceStarted &&
      remainingPrepMs > 0 &&
      remainingPrepMs <= state.finalCountdownDurationMs;
    if (this.dom.countdown) {
      this.dom.countdown.hidden = !showCountdown;
      const countdownValue = String(Math.max(1, Math.ceil(remainingPrepMs / 1000)));
      this.dom.countdown.textContent = countdownValue;
      if (showCountdown) {
        this.maybePlayCountdownBeep(countdownValue);
        this.lastCountdownValue = countdownValue;
      } else {
        this.lastCountdownValue = null;
      }
    }

    if (state.raceFinished) {
      this.dom.hubLabel.textContent = "Race Finished";
      this.dom.hubTitle.textContent = `${state.winnerId} wins the 3D dash`;
      this.dom.hubCopy.textContent =
        `Final time ${formatDuration(engine.getElapsedRaceMs())}. All four places are locked, the winner camera reveal stays on screen, and the next race starts automatically.`;
    } else if (state.prepStarted && !state.raceStarted) {
      this.dom.hubLabel.textContent = "10s Pre-Race Prep";
      this.dom.hubTitle.textContent = "Camera move first, then hold the lineup";
      this.dom.hubCopy.textContent =
        "The first 5 seconds are the camera animation. The racers stay still for the full prep, and the last 3 seconds show 3, 2, 1 on screen.";
    } else if (!state.raceStarted) {
      this.dom.hubLabel.textContent = "Pre-Race Camera Setup";
      this.dom.hubTitle.textContent = "All four animals are lined up and ready";
      this.dom.hubCopy.textContent =
        "Press Start Race to begin a 10-second prep. It opens with a 5-second camera move, holds the lineup still, then shows 3, 2, 1 before the race starts.";
    } else {
      this.dom.hubLabel.textContent = "World Editor Live";
      this.dom.hubTitle.textContent = "Click one racer to edit its red path";
      this.dom.hubCopy.textContent =
        "Select one racer at a time, rotate its red lane path with the gizmo, then scroll to stretch it. Shift changes the major width, and Alt or Option changes the minor depth.";
    }

    this.dom.standings.innerHTML = ranking
      .map((racer, index) => {
        const speed = Number.isFinite(racer.displaySpeedFactor)
          ? racer.displaySpeedFactor
          : engine.getEffectiveSpeedFactor(racer);
        const priceLabel =
          racer.price === null
            ? "Waiting..."
            : `$${formatPrice(racer.price)} (${formatSignedPercent(racer.changePercent)})`;
        return `
          <div class="standing-slot">
            <div class="standing-slot-head">
              <div class="standing-rank">${index + 1}</div>
              <div class="standing-main">
                <div class="standing-symbol">${racer.id}</div>
                <div class="standing-price ${getPolarityClass(racer.changePercent)}">${priceLabel}</div>
                <div class="standing-time-block">
                  <span class="standing-time-label">Speed</span>
                  <span class="standing-time ${getPolarityClass(racer.lastSpeedEffectPercent)}">${formatSpeedWithPercent(speed, racer.lastSpeedEffectPercent)}</span>
                </div>
              </div>
            </div>
            <div class="standing-slot-metrics">
              <div class="standing-dot standing-lap-badge" style="background:${racer.css};" aria-label="${formatCompletedLaps(racer.distanceMeters)} laps completed">${formatCompletedLaps(racer.distanceMeters)}</div>
            </div>
          </div>
        `;
      })
      .join("");

    this.dom.notes.innerHTML = state.notes
      .map(
        (note) => `
          <div class="note-row">
            <div>${note.message}</div>
            <div class="note-time">${note.stamp}</div>
          </div>
        `
      )
      .join("");

    const showPostRaceRankingGlobal =
      document.body.classList.contains("is-next-race-soon") ||
      Boolean(this.dom.postRaceOverlay && !this.dom.postRaceOverlay.hidden);
    this.renderPostRaceRankGrid(ranking, showPostRaceRankingGlobal);

    state.racers.forEach((racer) => {
      const card = this.coinCardMap.get(racer.id);
      const rank = ranking.findIndex((entry) => entry.id === racer.id) + 1;
      const showPostRaceRanking =
        document.body.classList.contains("is-next-race-soon") ||
        Boolean(this.dom.postRaceOverlay && !this.dom.postRaceOverlay.hidden);
      card.card.classList.toggle("is-selected", racer.id === state.selectedRacerId);
      card.card.classList.toggle("is-post-race", showPostRaceRanking);
      card.card.classList.toggle("force-post-race-cover", showPostRaceRanking);
      card.card.dataset.postRaceLabel = `${rank}. ${racer.id}`;
      card.postRaceCoverEl.hidden = !showPostRaceRanking;
      if (showPostRaceRanking) {
        card.postRaceLabelEl.textContent = `${rank}. ${racer.id}`;
        card.topEl.style.display = "none";
        card.priceEl.style.display = "none";
        card.gridlineEl.style.display = "none";
        card.postRaceCoverEl.style.display = "grid";
        card.changeEl.textContent = "";
        card.speedEl.textContent = "";
        card.distanceEl.textContent = "";
        card.samplesEl.textContent = "";
        card.postRaceLogoEl.style.backgroundImage = `url("${getAnimalIconUrl(racer.id)}")`;
        return;
      }
      card.topEl.style.display = "";
      card.priceEl.style.display = "";
      card.gridlineEl.style.display = "";
      card.postRaceCoverEl.style.display = "";
      card.postRaceLogoEl.style.backgroundImage = "";
      card.priceEl.textContent = racer.price === null ? "Waiting..." : `$${formatPrice(racer.price)}`;
      card.badgeEl.textContent = formatCompletedLaps(racer.distanceMeters);
      card.badgeEl.setAttribute("aria-label", `${formatCompletedLaps(racer.distanceMeters)} laps completed`);
      card.changeEl.textContent = formatSignedPercent(racer.changePercent);
      card.changeEl.className = `coin-value ${getPolarityClass(racer.changePercent)}`;
      card.speedEl.textContent = formatSpeedWithPercent(
        Number.isFinite(racer.displaySpeedFactor)
          ? racer.displaySpeedFactor
          : engine.getEffectiveSpeedFactor(racer),
        racer.lastSpeedEffectPercent
      );
      card.speedEl.className = `coin-value ${getPolarityClass(racer.lastSpeedEffectPercent)}`;
      card.distanceEl.textContent = formatMeters(racer.distanceMeters);
      card.samplesEl.textContent = String(racer.samples.length);
    });

    this.dom.detailHeading.textContent = `${selected.id} Race Detail`;
    this.dom.detailSubtitle.textContent =
      `This Three.js race has captured ${selected.samples.length} backend price samples for ${selected.symbol}. Renderer and simulation are separated so you can move the engine later.`;
    this.dom.detailCountBadge.textContent = `${selected.samples.length} samples`;
    this.dom.detailStats.innerHTML = `
      <div class="detail-stat">
        <span class="coin-label">Race Net</span>
        <span class="detail-stat-value ${getPolarityClass(getNetPercent(selected.samples))}">${formatSignedPercent(getNetPercent(selected.samples))}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">Avg 5s Move</span>
        <span class="detail-stat-value ${getPolarityClass(getAveragePercent(selected.samples))}">${formatSignedPercent(getAveragePercent(selected.samples))}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">Compounded</span>
        <span class="detail-stat-value ${getPolarityClass(getCompoundedPercent(selected.samples))}">${formatSignedPercent(getCompoundedPercent(selected.samples))}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">Run Distance</span>
        <span class="detail-stat-value">${formatMeters(selected.distanceMeters)}</span>
      </div>
    `;

    if (!selected.samples.length) {
      this.dom.detailSampleList.innerHTML = `
        <div class="sample-empty">
          No backend race samples captured yet for ${selected.id}.
        </div>
      `;
      return;
    }

    this.dom.detailSampleList.innerHTML = selected.samples
      .map(
        (sample, index) => `
          <div class="sample-row">
            <div class="sample-index">#${String(index + 1).padStart(2, "0")}</div>
            <div class="sample-main">
              <div class="sample-time">${formatTime(sample.closeTime)}</div>
              <div class="sample-price">$${formatPrice(sample.start)} -> $${formatPrice(sample.end)}</div>
              <div class="sample-time">Remaining ${formatRemainingMeters(sample.remainingDistanceMeters)}</div>
            </div>
            <div class="sample-change ${getPolarityClass(sample.changePercent)}">
              ${formatSignedPercent(sample.changePercent)} · ${sample.speedFactor.toFixed(3)}x
            </div>
          </div>
        `
      )
      .join("");
  }

  renderPostRaceRankGrid(ranking, visible) {
    if (!this.dom.postRaceRankGrid) {
      return;
    }
    this.dom.postRaceRankGrid.hidden = !visible;
    if (!visible) {
      this.dom.postRaceRankGrid.innerHTML = "";
      return;
    }
    this.dom.postRaceRankGrid.innerHTML = ranking
      .map(
        (racer, index) => `
          <article class="coin-post-race-rank-card">
            <div class="coin-post-race-rank-label">${index + 1}. ${racer.id}</div>
            <span class="coin-post-race-rank-avatar" style="background-image:url('${getAnimalIconUrl(racer.id)}')"></span>
          </article>
        `
      )
      .join("");
  }
}

function getAnimalIconUrl(coinId) {
  const assetName =
    {
      BTC: "Bull.png",
      ETH: "Wolf.png",
      SOL: "Stag.png",
      DOGE: "Shib.png",
      XRP: "alpaca.png",
      TRX: "cow.png",
      BNB: "Deer.png",
      ADA: "Donkey.png",
      SUI: "Horse.png",
      LTC: "White Horse.png"
    }[coinId] ?? "Bull.png";
  return new URL(assetName, ANIMAL_ICON_BASE_URL).href;
}

function formatPrice(price) {
  if (price >= 1000) {
    return Number(price).toFixed(2);
  }

  if (price >= 1) {
    return Number(price).toFixed(4).replace(/\.?0+$/, "");
  }

  return Number(price).toFixed(6).replace(/\.?0+$/, "");
}

function formatSignedPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}%`;
}

function formatMeters(value) {
  return `${value.toFixed(1)}m`;
}

function formatRemainingMeters(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${Number(value).toFixed(1)}m`;
}

function formatCompletedLaps(distanceMeters) {
  const totalLaps = Math.ceil(TARGET_DISTANCE_METERS / TRACK_LOOP_METERS);
  const completedLaps = Math.floor(Math.max(0, distanceMeters) / TRACK_LOOP_METERS);
  return String(Math.min(totalLaps, completedLaps));
}

function formatSpeedWithPercent(speed, effectPercent = 0) {
  return `${speed.toFixed(3)}x (${formatSignedPercent(effectPercent)})`;
}


function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

function getPolarityClass(value) {
  if (value > 0) {
    return "positive";
  }
  if (value < 0) {
    return "negative";
  }
  return "neutral";
}

function getNetPercent(samples) {
  if (!samples.length) {
    return 0;
  }
  return ((samples.at(-1).end - samples[0].start) / samples[0].start) * 100;
}

function getAveragePercent(samples) {
  if (!samples.length) {
    return 0;
  }
  return samples.reduce((sum, sample) => sum + sample.changePercent, 0) / samples.length;
}

function getCompoundedPercent(samples) {
  if (!samples.length) {
    return 0;
  }
  const multiplier = samples.reduce(
    (product, sample) => product * (1 + sample.changePercent / 100),
    1
  );
  return (multiplier - 1) * 100;
}

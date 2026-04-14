import { TARGET_DISTANCE_METERS, TRACK_LOOP_METERS } from "./config.js";

const COUNTDOWN_BEEP_URL = new URL("../assets/countdown-beep.mp3", import.meta.url).href;
const ANIMAL_ICON_BASE_URL = new URL("../assets/icons/", import.meta.url);
const DEFAULT_POINTS_BALANCE = 1250;
const MAX_VISIBLE_HISTORY_NOTES = 4;
const PLACE_LABELS = {
  first: "First Place",
  second: "Second Place",
  third: "Third Place"
};

export class BettingUI {
  constructor({
    root,
    coins,
    onSelectRacer,
    onPlaceBet,
    onStart,
    onRestart,
    onToggleCamera,
    onCycleCameraFocus,
    onToggleLogos,
    onSendTestChat
  }) {
    this.root = root;
    this.coins = coins;
    this.onSelectRacer = onSelectRacer;
    this.onPlaceBet = onPlaceBet;
    this.onSendTestChat = onSendTestChat;
    this.pointsBalance = DEFAULT_POINTS_BALANCE;
    this.activeBet = null;
    this.betLocked = false;
    this.defaultSelections = buildDefaultSelections(this.coins);
    this.betSelections = { ...this.defaultSelections };
    this.betRatios = buildDefaultRatios(this.coins);
    this.currentRaceBets = [];
    this.postRaceRanking = null;
    this.betHistoryMode = "now";
    this.testChatMessages = [];
    this.placeButtonMap = new Map();
    this.scheduledRaceStartAtMs = null;
    this.dom = {
      connectionBadge: root.querySelector("#connectionBadge"),
      pointsBalance: root.querySelector("#pointsBalance"),
      betStatusValue: root.querySelector("#betStatusValue"),
      nextRaceValue: root.querySelector("#nextRaceValue"),
      selectionBadge: root.querySelector("#selectionBadge"),
      firstPlaceSummary: root.querySelector("#firstPlaceSummary"),
      secondPlaceSummary: root.querySelector("#secondPlaceSummary"),
      thirdPlaceSummary: root.querySelector("#thirdPlaceSummary"),
      firstPlaceButtons: root.querySelector("#firstPlaceButtons"),
      secondPlaceButtons: root.querySelector("#secondPlaceButtons"),
      thirdPlaceButtons: root.querySelector("#thirdPlaceButtons"),
      betAmountInput: root.querySelector("#betAmountInput"),
      betPreview: root.querySelector("#betPreview"),
      standings: root.querySelector("#standings"),
      notes: root.querySelector("#notes"),
      postRaceOverlay: root.querySelector("#postRaceOverlay"),
      detailHeading: root.querySelector("#detailHeading"),
      detailSubtitle: root.querySelector("#detailSubtitle"),
      detailCountBadge: root.querySelector("#detailCountBadge"),
      detailStats: root.querySelector("#detailStats"),
      detailSampleList: root.querySelector("#detailSampleList"),
      raceCountdown: root.querySelector("#raceCountdown"),
      coinGrid: root.querySelector("#coinGrid"),
      betForm: root.querySelector("#betForm"),
      placeBetButton: root.querySelector("#placeBetButton"),
      startButton: root.querySelector("#startButton"),
      restartButton: root.querySelector("#restartButton"),
      cameraButton: root.querySelector("#cameraButton"),
      cameraFocusButton: root.querySelector("#cameraFocusButton"),
      logoToggleButton: root.querySelector("#logoToggleButton")
    };

    this.dom.betForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.placeBet();
    });
    this.dom.betAmountInput.addEventListener("input", () => this.refreshBetPreview());
    this.dom.startButton.addEventListener("click", onStart);
    this.dom.restartButton.addEventListener("click", onRestart);
    this.dom.cameraButton.addEventListener("click", onToggleCamera);
    this.dom.cameraFocusButton.addEventListener("click", onCycleCameraFocus);
    this.dom.logoToggleButton?.addEventListener("click", onToggleLogos);

    this.coinCardMap = new Map();
    this.lastCountdownValue = null;
    this.countdownBeepAudio = this.createCountdownBeepAudio();
    this.buildCoinCards();
    this.buildPlaceButtons();
    this.refreshPlaceButtons();
    this.refreshBetPreview();
    this.renderBalance();
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

  buildCoinCards() {
    if (!this.dom.coinGrid || this.dom.coinGrid.hidden) {
      return;
    }

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
          <span class="coin-badge coin-lap-badge" data-role="lap" style="background:${coin.css};">0</span>
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
            <div class="coin-label">Betting</div>
            <div class="coin-value" data-role="bet">Available</div>
          </div>
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
        priceEl: card.querySelector('[data-role="price"]'),
        changeEl: card.querySelector('[data-role="change"]'),
        speedEl: card.querySelector('[data-role="speed"]'),
        lapEl: card.querySelector('[data-role="lap"]'),
        distanceEl: card.querySelector('[data-role="distance"]'),
        betEl: card.querySelector('[data-role="bet"]')
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

  buildPlaceButtons() {
    for (const place of ["first", "second", "third"]) {
      const container = this.dom[`${place}PlaceButtons`];
      container.innerHTML = "";
      const buttonMap = new Map();

      this.coins.forEach((coin) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bet-option-button";
        button.dataset.place = place;
        button.dataset.coinId = coin.id;
        button.innerHTML = `
          <span class="bet-option-symbol">${coin.id}</span>
          <span class="bet-option-ratio">${formatRatio(this.betRatios[place][coin.id])}</span>
        `;
        button.addEventListener("click", () => this.selectBetCoin(place, coin.id));
        container.appendChild(button);
        buttonMap.set(coin.id, button);
      });

      this.placeButtonMap.set(place, buttonMap);
    }
  }

  setCameraMode(mode) {
    const label =
      mode === "behind"
        ? "Camera: Behind Pack"
        : mode === "manual"
          ? "Camera: Manual"
          : "Camera: Overview";
    if (this.dom.cameraButton) {
      this.dom.cameraButton.textContent = label;
    }
  }

  setCameraFocusPreset(preset) {
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

  setSelectedCoin(id) {
    this.selectedCoinId = id;
  }

  getDefaultPointsBalance() {
    return DEFAULT_POINTS_BALANCE;
  }

  setPointsBalance(points) {
    this.pointsBalance = Number.isFinite(points) ? points : DEFAULT_POINTS_BALANCE;
    this.renderBalance();
  }

  setScheduledRaceStartAt(timestampMs) {
    this.scheduledRaceStartAtMs = timestampMs;
  }

  setCurrentRaceBets(entries) {
    this.currentRaceBets = Array.isArray(entries) ? entries : [];
  }

  setBetHistoryMode(mode) {
    this.betHistoryMode = mode;
  }

  setPostRaceRanking(ranking) {
    this.postRaceRanking = Array.isArray(ranking) ? ranking : null;
  }

  setBetRatios(ratios) {
    if (!ratios) {
      return;
    }

    this.betRatios = {
      ...this.betRatios,
      ...ratios
    };
    this.refreshPlaceButtons();
    this.refreshBetPreview();
  }

  selectBetCoin(place, coinId) {
    if (this.betLocked) {
      return;
    }

    this.betSelections[place] = this.betSelections[place] === coinId ? null : coinId;
    this.refreshPlaceButtons();
    this.refreshBetPreview();
  }

  refreshPlaceButtons() {
    this.dom.selectionBadge.textContent = `${countSelectedPlacements(this.betSelections)} picks`;

    for (const place of ["first", "second", "third"]) {
      const selectedCoinId = this.betSelections[place];
      const summary = this.dom[`${place}PlaceSummary`];
      summary.textContent = selectedCoinId
        ? `${selectedCoinId} (${formatRatio(this.betRatios[place][selectedCoinId])})`
        : "No selection";

      const buttonMap = this.placeButtonMap.get(place);
      for (const [coinId, button] of buttonMap.entries()) {
        const ratioEl = button.querySelector(".bet-option-ratio");
        if (ratioEl) {
          ratioEl.textContent = formatRatio(this.betRatios[place][coinId]);
        }
        button.classList.toggle("is-active", coinId === selectedCoinId);
        button.disabled = this.betLocked;
      }
    }
  }

  resetForNewRace(selectedId) {
    this.betLocked = false;
    this.activeBet = null;
    this.betSelections = { ...this.defaultSelections };
    this.setSelectedCoin(selectedId);
    this.setBetStatus("Open");
    this.refreshPlaceButtons();
    this.refreshBetPreview();
  }

  lockBetting() {
    this.betLocked = true;
    this.setBetStatus("Locked");
    this.refreshPlaceButtons();
    this.refreshBetPreview();
  }

  async placeBet() {
    if (this.betLocked) {
      this.refreshBetPreview("Betting is locked for the active race.");
      return;
    }

    const stake = Number(this.dom.betAmountInput.value);
    if (!Number.isFinite(stake) || stake <= 0) {
      this.refreshBetPreview("Enter a valid points amount.");
      return;
    }

    if (stake > this.pointsBalance) {
      this.refreshBetPreview("Stake exceeds the current points balance.");
      return;
    }

    const selectedPlaces = getSelectedPlaces(this.betSelections);
    if (!selectedPlaces.length) {
      this.refreshBetPreview("Choose at least one place to bet on.");
      return;
    }

    const payoutMultiplier = getPayoutMultiplier(this.betSelections, this.betRatios);

    this.activeBet = {
      placements: { ...this.betSelections },
      stake,
      payoutMultiplier
    };
    this.setBetStatus("Placed");
    this.refreshBetPreview(buildPotentialWinPreview(this.betSelections, this.betRatios, stake));

    if (!this.onPlaceBet) {
      return;
    }

    this.setBetStatus("Saving");
    const result = await this.onPlaceBet({
      stake,
      placements: { ...this.betSelections },
      ratios: this.betRatios
    });
    if (result.ok && Number.isFinite(result.balance)) {
      this.setPointsBalance(result.balance);
    }
    this.setBetStatus(result.ok ? "Saved" : "Local Only");
    this.refreshBetPreview(result.message);
  }

  settleBet(engine) {
    if (!this.activeBet) {
      this.setBetStatus("No Bet");
      return;
    }

    const finishOrder = engine.state.finishOrder;
    const selectedPlaces = getSelectedPlaces(this.activeBet.placements);
    const matchedPlaces = selectedPlaces.filter((place, index) => {
      const raceIndex = place === "first" ? 0 : place === "second" ? 1 : 2;
      return this.activeBet.placements[place] === finishOrder[raceIndex];
    }).length;
    const won = matchedPlaces === selectedPlaces.length;
    const delta = won ? this.activeBet.stake * this.activeBet.payoutMultiplier : -this.activeBet.stake;
    this.pointsBalance += delta;
    this.renderBalance();
    this.setBetStatus(won ? "Won" : "Lost");
    this.refreshBetPreview(
      won
        ? `All ${selectedPlaces.length} selected places hit. Add ${Math.round(this.activeBet.stake * this.activeBet.payoutMultiplier)} points in settlement.`
        : `${matchedPlaces} of ${selectedPlaces.length} selected places matched.`
    );
  }

  setBetStatus(label) {
    if (this.dom.betStatusValue) {
      this.dom.betStatusValue.textContent = label;
    }
  }

  renderBalance() {
    if (this.dom.pointsBalance) {
      this.dom.pointsBalance.textContent = `${formatInteger(this.pointsBalance)} pts`;
    }
  }

  refreshBetPreview(message) {
    if (message) {
      this.dom.betPreview.textContent = message;
      return;
    }

    const stake = Number(this.dom.betAmountInput.value) || 0;
    this.dom.betPreview.textContent = buildPotentialWinPreview(this.betSelections, this.betRatios, stake);
  }

  render(engine) {
    const state = engine.state;
    const ranking = engine.getRanking();
    const selected = engine.getSelectedRacer();

    if (this.dom.connectionBadge) {
      this.dom.connectionBadge.className = `pill ${state.connectionStatus}`;
      this.dom.connectionBadge.textContent = state.connectionMessage;
    }
    const remainingPrepMs = engine.getRemainingPrepMs();
    const showCountdown =
      state.prepStarted &&
      !state.raceStarted &&
      remainingPrepMs > 0 &&
      remainingPrepMs <= state.finalCountdownDurationMs;
    this.dom.raceCountdown.hidden = !showCountdown;
    const countdownValue = String(Math.max(1, Math.ceil(remainingPrepMs / 1000)));
    this.dom.raceCountdown.textContent = countdownValue;
    if (showCountdown) {
      this.maybePlayCountdownBeep(countdownValue);
      this.lastCountdownValue = countdownValue;
    } else {
      this.lastCountdownValue = null;
    }

    if (this.dom.nextRaceValue) {
      this.dom.nextRaceValue.textContent = formatRemainingMs(this.getTimeUntilNextRaceMs());
    }

    this.dom.standings.innerHTML = ranking
      .map(
        (racer, index) => `
          <div class="standing-slot">
            <div class="standing-slot-head">
              <div class="standing-rank">${index + 1}</div>
              <div class="standing-main">
                <div class="standing-symbol">${racer.id}</div>
                <div class="standing-price ${getPolarityClass(racer.changePercent)}">${racer.price === null ? "Waiting..." : `$${formatPrice(racer.price)} (${formatSignedPercent(racer.changePercent)})`}</div>
                <div class="standing-time-block">
                  <span class="standing-time-label">Speed</span>
                  <span class="standing-time ${getPolarityClass(racer.lastSpeedEffectPercent)}">${formatSpeedWithPercent(engine.getEffectiveSpeedFactor(racer), racer.lastSpeedEffectPercent)}</span>
                </div>
              </div>
            </div>
            <div class="standing-slot-metrics">
              <div class="standing-dot standing-lap-badge" style="background:${racer.css};" aria-label="${formatCompletedLaps(racer.distanceMeters)} laps completed">${formatCompletedLaps(racer.distanceMeters)}</div>
            </div>
          </div>
        `
      )
      .join("");

    if (this.betHistoryMode === "test") {
      if (!this.dom.notes.querySelector("#testChatList")) {
        this.renderTestChat(true);
      }
      this.bindTestChatForm();
    } else {
      this.dom.notes.innerHTML = buildBetHistory(this.currentRaceBets);
    }
    const showPostRaceRanking =
      document.body.classList.contains("is-next-race-soon") ||
      Boolean(this.dom.postRaceOverlay && !this.dom.postRaceOverlay.hidden);
    this.renderPostRaceRankGrid(this.postRaceRanking ?? ranking, showPostRaceRanking);

    state.racers.forEach((racer) => {
      const card = this.coinCardMap.get(racer.id);
      if (!card) {
        return;
      }
      const isSelected = racer.id === state.selectedRacerId;
      const betTags = getBetTags(this.betSelections, racer.id);
      card.card.classList.toggle("is-selected", isSelected);
      card.priceEl.textContent = racer.price === null ? "Waiting..." : `$${formatPrice(racer.price)}`;
      card.changeEl.textContent = formatSignedPercent(racer.changePercent);
      card.changeEl.className = `coin-value ${getPolarityClass(racer.changePercent)}`;
      card.speedEl.textContent = formatSpeedWithPercent(
        engine.getEffectiveSpeedFactor(racer),
        racer.lastSpeedEffectPercent
      );
      card.speedEl.className = `coin-value ${getPolarityClass(racer.lastSpeedEffectPercent)}`;
      card.lapEl.textContent = formatCompletedLaps(racer.distanceMeters);
      card.lapEl.setAttribute("aria-label", `${formatCompletedLaps(racer.distanceMeters)} laps completed`);
      card.distanceEl.textContent = formatMeters(racer.distanceMeters);
      card.betEl.textContent = betTags || "Available";
    });

    this.setSelectedCoin(selected.id);
    this.refreshPlaceButtons();
    this.dom.detailHeading.textContent = `${selected.id} Betting Detail`;
    this.dom.detailSubtitle.textContent =
      `${selected.samples.length} captured samples. Speed is driven by each closed 5-second move, and the visible finish order decides the result.`;
    this.dom.detailCountBadge.textContent = `${selected.samples.length} samples`;
    this.dom.detailStats.innerHTML = `
      <div class="detail-stat">
        <span class="coin-label">Wallet</span>
        <span class="detail-stat-value">${formatInteger(this.pointsBalance)} pts</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">5s Move</span>
        <span class="detail-stat-value ${getPolarityClass(selected.changePercent)}">${formatSignedPercent(selected.changePercent)}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">First Pick</span>
        <span class="detail-stat-value">${this.betSelections.first ?? "-"}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">Second Pick</span>
        <span class="detail-stat-value">${this.betSelections.second ?? "-"}</span>
      </div>
      <div class="detail-stat">
        <span class="coin-label">Third Pick</span>
        <span class="detail-stat-value">${this.betSelections.third ?? "-"}</span>
      </div>
    `;

    this.dom.detailSampleList.innerHTML = selected.samples.length
      ? selected.samples
          .slice(-8)
          .reverse()
          .map(
            (sample) => `
              <div class="sample-row">
                <div class="sample-index">${formatTime(sample.closeTime)}</div>
                <div class="sample-main">
                  <div class="sample-price">$${formatPrice(sample.start)} -> $${formatPrice(sample.end)}</div>
                </div>
                <div class="sample-change ${getPolarityClass(sample.changePercent)}">${formatSignedPercent(sample.changePercent)}</div>
              </div>
            `
          )
          .join("")
      : `<div class="sample-empty">No closed candle samples captured yet for ${selected.id}.</div>`;

    this.dom.placeBetButton.disabled = this.betLocked;
    this.dom.betAmountInput.disabled = this.betLocked;
    this.dom.startButton.disabled = true;
    this.dom.startButton.textContent = "Auto Scheduled";
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

  getTimeUntilNextRaceMs() {
    if (!this.scheduledRaceStartAtMs) {
      return 0;
    }

    return Math.max(0, this.scheduledRaceStartAtMs - Date.now());
  }

  bindTestChatForm() {
    const form = this.dom.notes.querySelector("#testChatForm");
    const input = this.dom.notes.querySelector("#testChatInput");
    if (!form || !input || form.dataset.bound === "true") {
      return;
    }

    form.dataset.bound = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) {
        return;
      }

      input.value = "";
      if (this.onSendTestChat) {
        void Promise.resolve(this.onSendTestChat(message)).catch(() => {
          this.addTestChatMessage({
            author: "System",
            message: "Message could not be sent.",
            timestamp: Date.now()
          });
        });
        return;
      }

      this.addTestChatMessage({
        author: "You",
        message,
        timestamp: Date.now()
      });
    });
  }

  setTestChatMessages(messages) {
    this.testChatMessages = normalizeTestChatMessages(messages).slice(-50);
    this.renderTestChat(true);
  }

  addTestChatMessage(message) {
    const normalized = normalizeTestChatMessage(message);
    if (!normalized) {
      return;
    }
    if (normalized.id && this.testChatMessages.some((entry) => entry.id === normalized.id)) {
      return;
    }
    this.testChatMessages = [...this.testChatMessages, normalized].slice(-50);
    this.appendTestChatMessage(normalized);
  }

  renderTestChat(scrollToBottom = false) {
    if (this.betHistoryMode !== "test" || !this.dom.notes) {
      return;
    }

    const activeInput = this.dom.notes.querySelector("#testChatInput");
    const draftMessage = activeInput?.value ?? "";
    const shouldRestoreFocus = document.activeElement === activeInput;
    this.dom.notes.innerHTML = buildTestChat(this.testChatMessages);
    this.bindTestChatForm();
    const restoredInput = this.dom.notes.querySelector("#testChatInput");
    if (restoredInput && draftMessage) {
      restoredInput.value = draftMessage;
    }
    if (restoredInput && shouldRestoreFocus) {
      restoredInput.focus();
      restoredInput.setSelectionRange(restoredInput.value.length, restoredInput.value.length);
    }
    if (scrollToBottom) {
      const list = this.dom.notes.querySelector("#testChatList");
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    }
  }

  appendTestChatMessage(message) {
    if (this.betHistoryMode !== "test" || !this.dom.notes) {
      return;
    }

    const list = this.dom.notes.querySelector("#testChatList");
    if (!list) {
      this.renderTestChat(true);
      return;
    }

    const emptyMessage = list.querySelector(".sample-empty");
    if (emptyMessage) {
      emptyMessage.remove();
    }
    list.insertAdjacentHTML("beforeend", buildTestChatMessage(message));
    while (list.children.length > 50) {
      list.firstElementChild?.remove();
    }
    list.scrollTop = list.scrollHeight;
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

function buildBetHistory(currentRaceBets) {
  if (!currentRaceBets.length) {
    return `<div class="sample-empty">No bets</div>`;
  }

  return currentRaceBets
    .map((bet) => {
      const picks = [
        bet.first_pick ? `1st ${bet.first_pick}` : null,
        bet.second_pick ? `2nd ${bet.second_pick}` : null,
        bet.third_pick ? `3rd ${bet.third_pick}` : null
      ]
        .filter(Boolean)
        .join(", ");

      return `
        <article class="bet-history-card">
          <div class="bet-history-row">
            <span>Match</span>
            <span>${bet.market_id ? `${escapeHtml(bet.market_id)} · ` : ""}${formatShortDate(bet.target_race_started_at)}</span>
          </div>
          <div class="bet-history-row">
            <strong>${picks || "-"}</strong>
            <span class="bet-status bet-status-${bet.status}">${String(bet.status ?? "placed").toUpperCase()}</span>
          </div>
          <div class="bet-history-row">
            <span>Stake</span>
            <span>${formatInteger(Number(bet.stake_points ?? 0))} pts</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function buildTestChat(messages) {
  const renderedMessages = messages.length
    ? messages
        .map((entry) => buildTestChatMessage(entry))
        .join("")
    : `<div class="sample-empty">No messages</div>`;

  return `
    <div class="live-chat-list" id="testChatList">
      ${renderedMessages}
    </div>
    <form class="live-chat-form" id="testChatForm">
      <input class="editor-input live-chat-input" id="testChatInput" type="text" maxlength="160" placeholder="Write a message" autocomplete="off" />
      <button class="ghost-button" type="submit">Send</button>
    </form>
  `;
}

function buildTestChatMessage(entry) {
  return `
    <article class="live-chat-message">
      <span class="live-chat-meta">${escapeHtml(entry.author)} · ${formatTime(entry.timestamp)}</span>
      <p>${escapeHtml(entry.message)}</p>
    </article>
  `;
}

function normalizeTestChatMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.map(normalizeTestChatMessage).filter(Boolean);
}

function normalizeTestChatMessage(entry) {
  if (!entry?.message) {
    return null;
  }
  return {
    id: entry.id ?? null,
    author: String(entry.author ?? entry.author_login_id ?? "Unknown"),
    message: String(entry.message),
    timestamp: entry.timestamp ?? entry.created_at ?? Date.now()
  };
}

function formatOrdinal(place) {
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

function getBetTags(selections, coinId) {
  const tags = [];
  if (selections.first === coinId) {
    tags.push("1st");
  }
  if (selections.second === coinId) {
    tags.push("2nd");
  }
  if (selections.third === coinId) {
    tags.push("3rd");
  }
  return tags.join(" / ");
}

function formatPlacementPreview(selections) {
  const parts = [];
  if (selections.first) {
    parts.push(`1st ${selections.first}`);
  }
  if (selections.second) {
    parts.push(`2nd ${selections.second}`);
  }
  if (selections.third) {
    parts.push(`3rd ${selections.third}`);
  }
  return parts.length ? parts.join(", ") : "no picks";
}

function buildDefaultSelections(coins) {
  return {
    first: null,
    second: null,
    third: null
  };
}

function getSelectedPlaces(selections) {
  return ["first", "second", "third"].filter((place) => Boolean(selections[place]));
}

function countSelectedPlacements(selections) {
  return getSelectedPlaces(selections).length;
}

function getBetTypeLabel(selections) {
  const selectedCount = countSelectedPlacements(selections);
  if (selectedCount === 1) {
    return "Single";
  }
  if (selectedCount === 2) {
    return "Double";
  }
  if (selectedCount === 3) {
    return "Triple";
  }
  return "No bet";
}

function buildPotentialWinPreview(selections, ratios, stake) {
  const selectedCount = countSelectedPlacements(selections);
  if (!selectedCount) {
    return "Choose a Single, Double, or Triple bet.";
  }

  const payoutMultiplier = getPayoutMultiplier(selections, ratios);
  const potentialWin = Math.round(stake * payoutMultiplier);
  return `${getBetTypeLabel(selections)} bet. Potential win ${formatInteger(potentialWin)} pts (${formatRatio(payoutMultiplier)}).`;
}

function getPayoutMultiplier(selections, ratios) {
  return getSelectedPlaces(selections).reduce((product, place) => {
    const coinId = selections[place];
    const ratio = ratios?.[place]?.[coinId] ?? 1;
    return product * ratio;
  }, 1);
}

function buildDefaultRatios(coins) {
  const ratioSets = {
    first: [1.17, 1.24, 1.31, 1.42],
    second: [1.08, 1.11, 1.16, 1.22],
    third: [1.05, 1.07, 1.1, 1.14]
  };

  return Object.fromEntries(
    Object.entries(ratioSets).map(([place, defaults]) => [
      place,
      Object.fromEntries(
        coins.map((coin, index) => [coin.id, defaults[index] ?? defaults.at(-1)])
      )
    ])
  );
}

function formatInteger(value) {
  return Math.round(value).toLocaleString();
}

function formatPrice(price) {
  if (price >= 1000) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (price >= 1) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatRatio(value) {
  return `${value.toFixed(2)}x`;
}

function formatSignedPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}%`;
}

function formatMeters(value) {
  return `${value.toFixed(1)}m`;
}

function formatCompletedLaps(distanceMeters) {
  const totalLaps = Math.ceil(TARGET_DISTANCE_METERS / TRACK_LOOP_METERS);
  const completedLaps = Math.floor(Math.max(0, distanceMeters) / TRACK_LOOP_METERS);
  return String(Math.min(totalLaps, completedLaps));
}

function formatSpeedWithPercent(speed, effectPercent = 0) {
  return `${speed.toFixed(3)}x (${formatSignedPercent(effectPercent)})`;
}


function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function formatShortDate(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRemainingMs(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatWallClock(timestampMs) {
  if (!timestampMs) {
    return "--:--:--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestampMs));
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

import { getLoginSession } from "./src/supabaseClient.js?v=8";
import { createRaceLottoTicket, fetchRaceLottoDashboard, settleRaceLottoRound } from "./src/raceLottoStore.js?v=1";
import { TOKEN_LEGEND, expandMarketTokens, getMarketById, formatMarketTitle, formatMarketSymbols } from "./src/markets.js";

const DEFAULT_TICKET_PRICE_POINTS = 100;

const SYMBOL_META = Object.values(TOKEN_LEGEND).reduce((map, token) => {
  map[token.symbol] = token;
  return map;
}, {});

const state = {
  rounds: [],
  tickets: [],
  selectedRoundId: null,
  picks: {},
  session: null,
  loading: false
};

const dom = {
  headerPoints: document.querySelector("#headerPoints"),
  accountLink: document.querySelector("#accountLink"),
  lottoStatusPill: document.querySelector("#lottoStatusPill"),
  jackpotValue: document.querySelector("#jackpotValue"),
  roundTitle: document.querySelector("#roundTitle"),
  roundStatus: document.querySelector("#roundStatus"),
  salesCloseValue: document.querySelector("#salesCloseValue"),
  poolBreakdown: document.querySelector("#poolBreakdown"),
  pickCountValue: document.querySelector("#pickCountValue"),
  lottoRaceGrid: document.querySelector("#lottoRaceGrid"),
  submitTicketButton: document.querySelector("#submitTicketButton"),
  refreshLottoButton: document.querySelector("#refreshLottoButton"),
  settleRoundButton: document.querySelector("#settleRoundButton"),
  lottoMessage: document.querySelector("#lottoMessage"),
  ticketStatus: document.querySelector("#ticketStatus"),
  ticketCard: document.querySelector("#ticketCard")
};

dom.refreshLottoButton?.addEventListener("click", () => loadDashboard("Race-Lotto refreshed."));
dom.submitTicketButton?.addEventListener("click", submitTicket);
dom.settleRoundButton?.addEventListener("click", checkResults);

void init();

async function init() {
  await updateAccountLink();
  await loadDashboard();
}

async function updateAccountLink() {
  const { session } = await getLoginSession();
  state.session = session;
  if (dom.accountLink) {
    dom.accountLink.href = session ? "./profile.html" : "./login.html";
    dom.accountLink.textContent = session ? "Profile" : "Login";
  }
  if (dom.headerPoints) {
    dom.headerPoints.textContent = session ? `Points ${formatInteger(session.pointsBalance ?? 0)}` : "Points --";
  }
}

async function loadDashboard(message = "") {
  state.loading = true;
  setMessage(message || "Loading the next Race-Lotto.");
  render();

  const result = await fetchRaceLottoDashboard();
  state.loading = false;

  if (!result.ok) {
    setMessage(result.message);
    state.rounds = [];
    state.tickets = [];
    render();
    return;
  }

  state.rounds = result.rounds;
  state.tickets = result.tickets;
  if (Number.isFinite(Number(result.pointsBalance)) && dom.headerPoints) {
    dom.headerPoints.textContent = `Points ${formatInteger(result.pointsBalance)}`;
  }

  state.selectedRoundId = state.rounds[0]?.id ?? null;

  syncPicksFromTicket();
  setMessage(message || result.message);
  render();
}

function syncPicksFromTicket() {
  const ticket = getSelectedTicket();
  state.picks = ticket?.picks ? { ...ticket.picks } : {};
}

function render() {
  const round = getSelectedRound();
  const ticket = getSelectedTicket();

  renderHeader(round);
  renderRaceGrid(round, ticket);
  renderTicket(round, ticket);
  renderActions(round, ticket);
}

function renderHeader(round) {
  const selectedStatus = round ? formatRoundStatus(round) : "No Round";
  dom.lottoStatusPill.textContent = state.loading ? "Loading" : selectedStatus;
  dom.roundStatus.textContent = selectedStatus;

  if (!round) {
    dom.jackpotValue.textContent = "--";
    dom.roundTitle.textContent = "Race-Lotto";
    dom.salesCloseValue.textContent = "--";
    dom.poolBreakdown.textContent = "--";
    dom.pickCountValue.textContent = "0 / 6";
    return;
  }

  dom.jackpotValue.textContent = `${formatInteger(round.current_jackpot_points)} pts`;
  dom.roundTitle.textContent = `Next Lotto · ${formatKstDate(round.draw_starts_at)}`;
  dom.salesCloseValue.textContent = formatKstTime(round.sales_close_at);
  dom.poolBreakdown.textContent = `${formatInteger(round.base_jackpot_points)} + ${formatInteger(round.carried_points)} + ${formatInteger(round.entry_pool_points)}`;
  dom.pickCountValue.textContent = `${getPickCount()} / 6`;
}

function renderRaceGrid(round, ticket) {
  if (!dom.lottoRaceGrid) return;
  if (!round) {
    dom.lottoRaceGrid.innerHTML = `<div class="sample-empty">The next Race-Lotto is not loaded.</div>`;
    return;
  }

  const locked = Boolean(ticket) || round.status !== "open";
  const winningPicks = round.winning_picks ?? {};

  dom.lottoRaceGrid.innerHTML = (round.slots ?? [])
    .map((slot) => {
      const market = getMarketById(slot.market_id);
      const tokens = market ? expandMarketTokens(market.letters) : (slot.coin_ids ?? []).map((symbol) => ({ symbol, name: symbol, image: SYMBOL_META[symbol]?.image }));
      const picked = state.picks[String(slot.slot)];
      const winner = winningPicks[String(slot.slot)];
      const matchupLabel = slot.label || (market ? formatMarketSymbols(market) : (slot.coin_ids ?? []).join(" / "));
      const marketLabel = market ? formatMarketTitle(market) : `Market ${String(slot.market_number ?? "").padStart(2, "0")}`;
      return `
        <article class="lotto-race-card">
          <div class="lotto-race-head">
            <div>
              <span class="eyebrow">${marketLabel}</span>
              <h3>${matchupLabel}</h3>
            </div>
            <span class="mini-pill">${formatKstTime(slot.race_started_at)}</span>
          </div>
          <div class="lotto-market-symbols">10:00 KST first-place pick</div>
          <div class="lotto-pick-grid">
            ${tokens
              .map((token) => {
                const selected = picked === token.symbol;
                const isWinner = winner === token.symbol;
                const missedWinner = winner && selected && !isWinner;
                return `
                  <button
                    class="lotto-pick-button ${selected ? "is-selected" : ""} ${isWinner ? "is-winner" : ""} ${missedWinner ? "is-missed" : ""}"
                    type="button"
                    data-slot="${slot.slot}"
                    data-symbol="${token.symbol}"
                    ${locked ? "disabled" : ""}
                  >
                    <span class="lotto-token-icon">${token.image ? `<img src="${token.image}" alt="" aria-hidden="true" loading="lazy" />` : ""}</span>
                    <span>${token.symbol}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");

  dom.lottoRaceGrid.querySelectorAll("[data-slot][data-symbol]").forEach((button) => {
    button.addEventListener("click", () => {
      state.picks[button.dataset.slot] = button.dataset.symbol;
      const slot = getSelectedRound()?.slots?.find((entry) => String(entry.slot) === button.dataset.slot);
      setMessage(`${button.dataset.symbol} selected for ${slot?.label ?? "this matchup"}.`);
      render();
    });
  });
}

function renderTicket(round, ticket) {
  if (!dom.ticketCard) return;
  dom.ticketStatus.textContent = ticket ? formatTicketStatus(ticket) : "No Ticket";
  const ticketPrice = round?.ticket_price_points ?? DEFAULT_TICKET_PRICE_POINTS;

  if (!round) {
    dom.ticketCard.innerHTML = `<div class="sample-empty">No Race-Lotto draw selected.</div>`;
    return;
  }

  if (!ticket) {
    dom.ticketCard.innerHTML = `
      <div class="lotto-ticket-empty">
        <strong>${getPickCount()} / 6 picked</strong>
        <span>Ticket price: ${formatInteger(ticketPrice)} pts</span>
      </div>
    `;
    return;
  }

  const pickRows = (round.slots ?? [])
    .map((slot) => {
      const pick = ticket.picks?.[String(slot.slot)] ?? "--";
      const winner = round.winning_picks?.[String(slot.slot)] ?? null;
      const matched = winner && winner === pick;
      return `
        <div class="lotto-ticket-row ${matched ? "is-match" : winner ? "is-miss" : ""}">
          <span>${slot.label ?? "Matchup"}</span>
          <strong>${pick}</strong>
          <small>${winner ? `Winner ${winner}` : formatKstTime(slot.race_started_at)}</small>
        </div>
      `;
    })
    .join("");

  dom.ticketCard.innerHTML = `
    <div class="lotto-ticket-summary">
      <div>
        <span class="coin-label">Status</span>
        <strong>${formatTicketStatus(ticket)}</strong>
      </div>
      <div>
        <span class="coin-label">Matched</span>
        <strong>${ticket.matched_count ?? 0} / 6</strong>
      </div>
      <div>
        <span class="coin-label">Payout</span>
        <strong>${formatInteger(ticket.payout_points ?? 0)} pts</strong>
      </div>
    </div>
    <div class="lotto-ticket-list">${pickRows}</div>
  `;
}

function renderActions(round, ticket) {
  if (!round) {
    dom.submitTicketButton.disabled = true;
    dom.submitTicketButton.textContent = "No Draw";
    dom.settleRoundButton.hidden = true;
    return;
  }

  if (!state.session) {
    dom.submitTicketButton.disabled = false;
    dom.submitTicketButton.textContent = "Login to Enter";
  } else if (ticket) {
    dom.submitTicketButton.disabled = true;
    dom.submitTicketButton.textContent = "Ticket Saved";
  } else if (round.status !== "open") {
    dom.submitTicketButton.disabled = true;
    dom.submitTicketButton.textContent = "Entries Closed";
  } else {
    dom.submitTicketButton.disabled = getPickCount() !== 6 || state.loading;
    dom.submitTicketButton.textContent = `Enter for ${formatInteger(round.ticket_price_points ?? DEFAULT_TICKET_PRICE_POINTS)} pts`;
  }

  dom.settleRoundButton.hidden = round.status === "open" || round.status === "settled";
  dom.settleRoundButton.disabled = state.loading;
}

async function submitTicket() {
  const round = getSelectedRound();
  if (!round) return;

  if (!state.session) {
    window.location.href = "./login.html";
    return;
  }

  if (getPickCount() !== 6) {
    setMessage("Pick all six Race-Lotto winners.");
    return;
  }

  state.loading = true;
  renderActions(round, getSelectedTicket());
  setMessage("Saving Race-Lotto ticket.");
  const result = await createRaceLottoTicket(round.id, state.picks);
  state.loading = false;

  if (!result.ok) {
    setMessage(result.message);
    renderActions(round, getSelectedTicket());
    return;
  }

  await updateAccountLink();
  await loadDashboard(result.message);
}

async function checkResults() {
  const round = getSelectedRound();
  if (!round) return;

  state.loading = true;
  setMessage("Checking Race-Lotto results.");
  renderActions(round, getSelectedTicket());
  const result = await settleRaceLottoRound(round.id);
  state.loading = false;

  if (!result.ok) {
    setMessage(result.message);
    renderActions(round, getSelectedTicket());
    return;
  }

  await updateAccountLink();
  await loadDashboard(result.winnerCount > 0 ? `Jackpot paid to ${result.winnerCount} winner(s).` : "No perfect ticket. Jackpot rolled over.");
}

function getSelectedRound() {
  return state.rounds.find((round) => round.id === state.selectedRoundId) ?? state.rounds[0] ?? null;
}

function getSelectedTicket() {
  return state.tickets.find((ticket) => ticket.round_id === state.selectedRoundId) ?? null;
}

function getPickCount() {
  return Object.values(state.picks).filter(Boolean).length;
}

function setMessage(message) {
  if (dom.lottoMessage) {
    dom.lottoMessage.textContent = message || "";
  }
}

function formatRoundStatus(round) {
  if (!round) return "--";
  return round.status === "open" ? "Open" : "Closed";
}

function formatTicketStatus(ticket) {
  if (!ticket) return "No Ticket";
  if (ticket.status === "won") return "Winner";
  if (ticket.status === "lost") return "Settled";
  return "Placed";
}

function formatInteger(value) {
  return Number(value ?? 0).toLocaleString();
}

function formatKstDate(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

function formatKstDrawDate(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

function formatKstTime(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

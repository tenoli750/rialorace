import { getLoginSession } from "./src/supabaseClient.js?v=5";
import { MARKET_DEFINITIONS, TOKEN_LEGEND, expandMarketTokens, formatMarketSymbols, formatMarketTitle } from "./src/markets.js";

const marketGrid = document.querySelector("#marketGrid");
const tokenLegend = document.querySelector("#tokenLegend");
const marketCount = document.querySelector("#marketCount");
const heroLiveCount = document.querySelector("#heroLiveCount");
const heroPlannedCount = document.querySelector("#heroPlannedCount");

let activeFilterLetter = null;

if (heroPlannedCount) {
  heroPlannedCount.textContent = `${Object.keys(TOKEN_LEGEND).length} Tokens`;
}

renderTokenLegend();
renderMarketGrid();
void updateAccountLink();

function renderTokenLegend() {
  if (!tokenLegend) {
    return;
  }

  tokenLegend.innerHTML = Object.entries(TOKEN_LEGEND)
    .map(
      ([letter, token]) => `
        <button
          class="legend-chip ${activeFilterLetter === letter ? "is-active" : ""}"
          type="button"
          data-letter="${letter}"
          aria-pressed="${activeFilterLetter === letter ? "true" : "false"}"
        >
          <div class="legend-copy">
            <span class="legend-letter-tag">${letter}</span>
            <span class="legend-token">${token.symbol}</span>
            <span class="legend-name">${token.name}</span>
          </div>
          <span class="legend-image">
            <img src="${token.image}" alt="${token.symbol} animal icon" loading="lazy" />
          </span>
        </button>
      `
    )
    .join("");

  tokenLegend.querySelectorAll(".legend-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const { letter } = chip.dataset;
      activeFilterLetter = activeFilterLetter === letter ? null : letter;
      renderTokenLegend();
      renderMarketGrid();
    });
  });
}

function renderMarketGrid() {
  const visibleMarkets = MARKET_DEFINITIONS.filter(
    (market) => !activeFilterLetter || market.letters.includes(activeFilterLetter)
  );

  if (marketCount) {
    marketCount.textContent = `${visibleMarkets.length} Markets`;
  }

  if (heroLiveCount) {
    heroLiveCount.textContent = `${visibleMarkets.length} Markets`;
  }

  if (!marketGrid) {
    return;
  }

  marketGrid.innerHTML = visibleMarkets
    .map((market) => {
      const tokens = expandMarketTokens(market.letters);
      const href =
        market.id === "market-01"
          ? "./market01-betting.html?id=market-01&pagev=99"
          : market.id === "market-02"
            ? "./market02-betting.html?id=market-02&pagev=99"
            : `./market.html?id=${market.id}&pagev=99`;
      return `
        <a class="main-menu-item is-link market-placeholder-card" href="${href}">
          <span class="main-menu-label">${formatMarketTitle(market)}</span>
          <span class="market-card-copy">${formatMarketSymbols(market)}</span>
          <div class="market-token-row">
            ${tokens
              .map(
                (token) => `
                  <span class="market-token-pill">
                    <span class="market-token-icon">
                      <img src="${token.image}" alt="${token.symbol} animal icon" loading="lazy" />
                    </span>
                    <span>${token.symbol}</span>
                  </span>
                `
              )
              .join("")}
          </div>
        </a>
      `;
    })
    .join("");
}

async function updateAccountLink() {
  const accountLink = document.querySelector("#accountLink");
  const pointsEl = document.querySelector("#headerPoints");
  if (!accountLink) {
    return;
  }

  const { session } = await getLoginSession();
  accountLink.href = session ? "./profile.html" : "./login.html";
  accountLink.textContent = session ? "Profile" : "Login";
  if (pointsEl) {
    pointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

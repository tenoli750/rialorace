import { getLoginSession } from "./src/supabaseClient.js?v=8";
import { MARKET_DEFINITIONS, expandMarketTokens, formatMarketSymbols, formatMarketTitle, getTokenLegendForCategory } from "./src/markets.js";

const marketGrid = document.querySelector("#marketGrid");
const tokenLegend = document.querySelector("#tokenLegend");
const marketCount = document.querySelector("#marketCount");
const heroReplayCount = document.querySelector("#heroReplayCount");
const params = new URLSearchParams(window.location.search);
const activeCategory = params.get("category") === "stocks" ? "stocks" : "crypto";
const activeTokenLegend = getTokenLegendForCategory(activeCategory);

let activeFilterLetter = null;

renderTokenLegend();
renderMarketGrid();
void updateAccountLink();

function renderTokenLegend() {
  if (!tokenLegend) return;

  tokenLegend.innerHTML = Object.entries(activeTokenLegend)
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
    (market) => market.category === activeCategory && (!activeFilterLetter || market.letters.includes(activeFilterLetter))
  );

  if (marketCount) {
    marketCount.textContent = `${visibleMarkets.length} Markets`;
  }

  if (heroReplayCount) {
    heroReplayCount.textContent = `${visibleMarkets.length} Markets`;
  }

  if (!marketGrid) return;

  marketGrid.innerHTML = visibleMarkets
    .map((market) => {
      const tokens = expandMarketTokens(market.letters, market.category);
      return `
        <a class="main-menu-item is-link market-placeholder-card" href="/legacy-race/market-replay.html?id=${market.id}">
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
  if (!accountLink) return;
  const { session } = await getLoginSession();
  accountLink.href = session ? "./profile.html" : "./login.html";
  accountLink.textContent = session ? "Profile" : "Login";
  if (pointsEl) {
    pointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

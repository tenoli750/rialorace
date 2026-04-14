import { getLoginSession, supabase } from "./src/supabaseClient.js?v=5";

const listEl = document.querySelector("#betsList");
const countEl = document.querySelector("#betsCount");
const wonEl = document.querySelector("#betsWon");
const lostEl = document.querySelector("#betsLost");
const pnlEl = document.querySelector("#betsPayout");
const headerPointsEl = document.querySelector("#headerPoints");
const accountLink = document.querySelector("#accountLink");

boot();

async function boot() {
  const { session } = await getLoginSession();
  if (!session) {
    window.location.href = "./login.html";
    return;
  }
  if (headerPointsEl) {
    headerPointsEl.textContent = `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}`;
  }
  if (accountLink) {
    accountLink.href = "./profile.html";
    accountLink.textContent = "Profile";
  }

  const { data, error } = await supabase.rpc("list_bets_with_login_session", {
    requested_session_token: session.sessionToken
  });

  if (error) {
    listEl.innerHTML = `<div class="sample-empty">Could not load bets.</div>`;
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  renderSummary(rows);
  renderRows(rows);
}

function renderSummary(rows) {
  const won = rows.filter((row) => row.status === "won").length;
  const lost = rows.filter((row) => row.status === "lost").length;
  const pnl = rows.reduce((sum, row) => sum + getBetPnl(row), 0);

  countEl.textContent = String(rows.length);
  wonEl.textContent = String(won);
  lostEl.textContent = String(lost);
  pnlEl.textContent = formatPoints(pnl);
}

function renderRows(rows) {
  if (!rows.length) {
    listEl.innerHTML = `<div class="sample-empty">No bets placed yet.</div>`;
    return;
  }

  listEl.innerHTML = rows
    .map((row) => {
      const pnl = getBetPnl(row);
      const picks = [
        row.first_pick ? `1st ${row.first_pick}` : null,
        row.second_pick ? `2nd ${row.second_pick}` : null,
        row.third_pick ? `3rd ${row.third_pick}` : null
      ]
        .filter(Boolean)
        .join(", ");

      const result = row.first_place
        ? `1st ${row.first_place}, 2nd ${row.second_place}, 3rd ${row.third_place}, 4th ${row.fourth_place}`
        : "Waiting for result";

      return `
        <article class="bet-history-card">
          <div class="bet-history-row">
            <strong>${row.market_id ?? "-"}</strong>
            <span>${formatShortDate(row.target_race_started_at)}</span>
          </div>
          <div class="bet-history-row">
            <span>Pick</span>
            <span>${picks || "-"}</span>
          </div>
          <div class="bet-history-row">
            <span>Stake</span>
            <span>${Number(row.stake_points ?? 0).toLocaleString()} pts</span>
          </div>
          <div class="bet-history-row">
            <span>Status</span>
            <span class="bet-status bet-status-${row.status}">${String(row.status ?? "placed").toUpperCase()}</span>
          </div>
          <div class="bet-history-row">
            <span>PnL</span>
            <span>${formatPoints(pnl)}</span>
          </div>
          <div class="bet-history-row">
            <span>Matched</span>
            <span>${Number(row.matched_places ?? 0)}</span>
          </div>
          <div class="bet-history-result">${result}</div>
        </article>
      `;
    })
    .join("");
}

function getBetPnl(row) {
  return Number(row.payout_points ?? 0) - Number(row.stake_points ?? 0);
}

function formatPoints(value) {
  const points = Number(value ?? 0);
  const prefix = points > 0 ? "+" : "";
  return `${prefix}${points.toLocaleString()} pts`;
}

function formatShortDate(timestamp) {
  if (!timestamp) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(timestamp));
}

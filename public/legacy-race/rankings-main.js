import { getLoginSession, supabase } from "./src/supabaseClient.js?v=5";

const rankingsList = document.querySelector("#rankingsList");
const accountLink = document.querySelector("#accountLink");
const headerPointsEl = document.querySelector("#headerPoints");

void boot();

async function boot() {
  await updateAccountLink();
  await loadRankings();
}

async function updateAccountLink() {
  if (!accountLink) {
    return;
  }

  const { session } = await getLoginSession();
  accountLink.href = session ? "./profile.html" : "./login.html";
  accountLink.textContent = session ? "Profile" : "Login";
  if (headerPointsEl) {
    headerPointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

async function loadRankings() {
  if (!rankingsList) {
    return;
  }

  const { data, error } = await supabase.rpc("get_public_rankings");
  if (error) {
    rankingsList.innerHTML = `<div class="sample-empty">Rankings could not be loaded.</div>`;
    return;
  }

  const rankings = Array.isArray(data) ? data : [];
  if (!rankings.length) {
    rankingsList.innerHTML = `<div class="sample-empty">No players yet.</div>`;
    return;
  }

  rankingsList.innerHTML = rankings.map(renderRankingRow).join("");
}

function renderRankingRow(entry) {
  const rank = Number(entry.rank_number ?? 0);
  const points = Number(entry.points_balance ?? 0);
  return `
    <article class="ranking-row">
      <span class="ranking-rank">${formatRank(rank)}</span>
      <span class="ranking-player">${escapeHtml(entry.login_id ?? "Unknown")}</span>
      <span class="ranking-points">${points.toLocaleString()} pts</span>
    </article>
  `;
}

function formatRank(rank) {
  return rank > 0 ? `#${rank}` : "#-";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

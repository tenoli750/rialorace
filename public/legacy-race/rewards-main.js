import { getLoginSession, supabase } from "./src/supabaseClient.js?v=5";

const headerPointsEl = document.querySelector("#headerPoints");
const accountLink = document.querySelector("#accountLink");
const statusEl = document.querySelector("#dailyCheckinStatus");
const dateEl = document.querySelector("#dailyCheckinDate");
const rewardEl = document.querySelector("#dailyCheckinReward");
const resetEl = document.querySelector("#dailyCheckinReset");
const loginEl = document.querySelector("#dailyCheckinLogin");
const balanceEl = document.querySelector("#dailyCheckinBalance");
const buttonEl = document.querySelector("#dailyCheckinButton");
const messageEl = document.querySelector("#dailyCheckinMessage");

let currentSession = null;
let isClaiming = false;

boot();

async function boot() {
  setButtonState("Loading", true);

  const { session } = await getLoginSession();
  currentSession = session;
  updateAccountChrome(session);

  if (!session) {
    renderLoggedOut();
    return;
  }

  await loadStatus();
  buttonEl?.addEventListener("click", claimDailyCheckin);
}

async function loadStatus() {
  setMessage("Loading daily check-in.");
  const { data, error } = await supabase.rpc("get_daily_checkin_status", {
    requested_session_token: currentSession.sessionToken
  });

  if (error) {
    renderError("Could not load daily check-in.");
    return;
  }

  renderStatus(normalizeRow(data), false);
}

async function claimDailyCheckin() {
  if (!currentSession || isClaiming) {
    return;
  }

  isClaiming = true;
  setButtonState("Claiming", true);
  setMessage("Claiming daily reward.");

  const { data, error } = await supabase.rpc("claim_daily_checkin", {
    requested_session_token: currentSession.sessionToken
  });

  isClaiming = false;

  if (error) {
    renderError(error.message || "Could not claim daily reward.");
    return;
  }

  const row = normalizeRow(data);
  currentSession = {
    ...currentSession,
    pointsBalance: Number(row.current_points_balance ?? currentSession.pointsBalance ?? 0)
  };
  updateAccountChrome(currentSession);
  renderStatus(row, Boolean(row.claimed));
}

function renderStatus(row, justClaimed) {
  const points = Number(row.points_awarded ?? 100);
  const balance = Number(row.current_points_balance ?? currentSession?.pointsBalance ?? 0);
  const claimed = Boolean(row.already_claimed);

  if (statusEl) {
    statusEl.textContent = claimed ? "Claimed" : "Ready";
  }
  if (dateEl) {
    dateEl.textContent = row.checkin_date_kst ? `KST ${row.checkin_date_kst}` : "Today in KST.";
  }
  if (rewardEl) {
    rewardEl.textContent = `${points.toLocaleString()} pts`;
  }
  if (resetEl) {
    resetEl.textContent = formatKstTime(row.next_reset_at);
  }
  if (loginEl) {
    loginEl.textContent = row.login_id || currentSession?.loginId || "Profile";
  }
  if (balanceEl) {
    balanceEl.textContent = `${balance.toLocaleString()} pts`;
  }

  setButtonState(claimed ? "Claimed Today" : `Claim ${points.toLocaleString()} pts`, claimed);
  setMessage(justClaimed ? `Claimed ${points.toLocaleString()} pts.` : claimed ? "Next claim opens at KST 00:00." : "Daily check-in is ready.");
}

function renderLoggedOut() {
  if (statusEl) {
    statusEl.textContent = "Login Required";
  }
  if (dateEl) {
    dateEl.textContent = "Login to claim your daily reward.";
  }
  if (loginEl) {
    loginEl.textContent = "Login";
  }
  if (balanceEl) {
    balanceEl.textContent = "-- pts";
  }
  setButtonState("Login Required", true);
  setMessage("Login to claim 100 pts once per KST day.");
}

function renderError(message) {
  setButtonState("Try Again", false);
  setMessage(message, true);
}

function updateAccountChrome(session) {
  if (accountLink) {
    accountLink.href = session ? "./profile.html" : "./login.html";
    accountLink.textContent = session ? "Profile" : "Login";
  }
  if (headerPointsEl) {
    headerPointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
}

function setButtonState(label, disabled) {
  if (!buttonEl) {
    return;
  }
  buttonEl.textContent = label;
  buttonEl.disabled = disabled;
}

function setMessage(message, isError = false) {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = message;
  messageEl.classList.toggle("is-error", isError);
}

function normalizeRow(data) {
  return Array.isArray(data) ? data[0] ?? {} : data ?? {};
}

function formatKstTime(timestamp) {
  if (!timestamp) {
    return "KST 00:00";
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

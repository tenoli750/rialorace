import { getLoginSession, signOutLoginSession } from "./src/supabaseClient.js?v=5";

const idEl = document.querySelector("#profileId");
const pointsEl = document.querySelector("#profilePoints");
const headerPointsEl = document.querySelector("#headerPoints");
const signOutButton = document.querySelector("#signOutButton");

boot();

signOutButton?.addEventListener("click", async () => {
  await signOutLoginSession();
  window.location.href = "./login.html";
});

async function boot() {
  const { session } = await getLoginSession();
  if (!session) {
    window.location.href = "./login.html";
    return;
  }

  idEl.textContent = session.loginId;
  pointsEl.textContent = `${Number(session.pointsBalance ?? 0).toLocaleString()} pts`;
  if (headerPointsEl) {
    headerPointsEl.textContent = `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}`;
  }
}

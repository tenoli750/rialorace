import { getLoginSession, setLoginSessionToken, supabase } from "./src/supabaseClient.js?v=5";
import { initializeBettingProfile } from "./src/supabaseBettingStore.js?v=2";

const DEFAULT_POINTS_BALANCE = 1250;

const form = document.querySelector("#loginForm");
const idInput = document.querySelector("#idInput");
const passwordInput = document.querySelector("#passwordInput");
const signUpButton = document.querySelector("#signUpButton");
const messageEl = document.querySelector("#authMessage");

boot();

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn();
});

signUpButton?.addEventListener("click", async () => {
  await signUp();
});

async function boot() {
  const { session } = await getLoginSession();
  const pointsEl = document.querySelector("#headerPoints");
  if (pointsEl) {
    pointsEl.textContent = session ? `Points ${Number(session.pointsBalance ?? 0).toLocaleString()}` : "Points --";
  }
  if (session) {
    window.location.href = "./profile.html";
  }
}

async function signIn() {
  const id = normalizeId(idInput.value);
  const password = passwordInput.value.trim();
  if (!id || password.length < 6) {
    setMessage("Enter a valid ID and password.", true);
    return;
  }

  const { data, error } = await supabase.rpc("sign_in_with_login_id", {
    requested_login_id: id,
    requested_password: password
  });
  if (error) {
    setMessage(error.message || "Could not sign in.", true);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  setLoginSessionToken(row?.session_token ?? null);
  await initializeBettingProfile(DEFAULT_POINTS_BALANCE);
  window.location.href = "./profile.html";
}

async function signUp() {
  const id = normalizeId(idInput.value);
  const password = passwordInput.value.trim();
  if (!id || password.length < 6) {
    setMessage("Enter a valid ID and password.", true);
    return;
  }

  const { data, error } = await supabase.rpc("sign_up_with_login_id", {
    requested_login_id: id,
    requested_password: password
  });

  if (error) {
    setMessage(error.message || "Could not sign up.", true);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  setLoginSessionToken(row?.session_token ?? null);
  await initializeBettingProfile(DEFAULT_POINTS_BALANCE);
  window.location.href = "./profile.html";
}

function normalizeId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function setMessage(message, isError = false) {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = message;
  messageEl.classList.toggle("is-error", Boolean(isError));
}

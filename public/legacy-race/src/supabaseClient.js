import { PUBLIC_SUPABASE_CONFIG } from "./env.js";

const LOGIN_SESSION_STORAGE_KEY = "binance-ring-rally-login-session-v1";
const SUPABASE_VENDOR_URL = new URL("../vendor/supabase.js?v=1", import.meta.url).href;
const searchParams = new URLSearchParams(globalThis.location?.search ?? "");
const IS_VPS_RECORDING_MODE = searchParams.get("vps") === "1";
const VPS_SUPABASE_STORAGE_KEY = `sb-rialorace-vps-${searchParams.get("id") || "market"}-${Math.random()
  .toString(36)
  .slice(2)}`;

async function loadSupabaseCreateClient() {
  if (globalThis.supabase?.createClient) {
    return globalThis.supabase.createClient;
  }

  await new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Supabase browser vendor requires document."));
      return;
    }

    const existingScript = document.querySelector(`script[data-rialo-supabase-vendor="${SUPABASE_VENDOR_URL}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === "1") {
        resolve();
        return;
      }
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", () => reject(new Error(`Failed to load local Supabase vendor: ${SUPABASE_VENDOR_URL}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SUPABASE_VENDOR_URL;
    script.async = true;
    script.dataset.rialoSupabaseVendor = SUPABASE_VENDOR_URL;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load local Supabase vendor: ${SUPABASE_VENDOR_URL}`));
    document.head.appendChild(script);
  });

  if (!globalThis.supabase?.createClient) {
    throw new Error("Local Supabase vendor did not expose createClient.");
  }

  return globalThis.supabase.createClient;
}

if (!PUBLIC_SUPABASE_CONFIG.url || !PUBLIC_SUPABASE_CONFIG.publishableKey) {
  throw new Error("Missing public Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before building.");
}

const createClient = await loadSupabaseCreateClient();

export const supabase = createClient(PUBLIC_SUPABASE_CONFIG.url, PUBLIC_SUPABASE_CONFIG.publishableKey, {
  auth: {
    storageKey: IS_VPS_RECORDING_MODE ? VPS_SUPABASE_STORAGE_KEY : "sb-rialorace-auth-token",
    persistSession: !IS_VPS_RECORDING_MODE,
    autoRefreshToken: !IS_VPS_RECORDING_MODE,
    detectSessionInUrl: !IS_VPS_RECORDING_MODE
  }
});

export async function getSupabaseSessionUser() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  return {
    user: session?.user ?? null,
    error
  };
}

export function isAnonymousSupabaseUser(user) {
  return Boolean(user?.is_anonymous || user?.app_metadata?.provider === "anonymous");
}

export function getLoginSessionToken() {
  return localStorage.getItem(LOGIN_SESSION_STORAGE_KEY);
}

export function setLoginSessionToken(sessionToken) {
  if (!sessionToken) {
    localStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LOGIN_SESSION_STORAGE_KEY, sessionToken);
}

export async function getLoginSession() {
  const sessionToken = getLoginSessionToken();
  if (!sessionToken) {
    return { session: null, error: null };
  }

  const { data, error } = await supabase.rpc("get_login_session", {
    requested_session_token: sessionToken
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.account_id) {
    setLoginSessionToken(null);
    return { session: null, error };
  }

  return {
    session: {
      sessionToken,
      accountId: row.account_id,
      loginId: row.login_id,
      pointsBalance: Number(row.points_balance ?? 0),
      expiresAt: row.expires_at
    },
    error: null
  };
}

export async function signOutLoginSession() {
  const sessionToken = getLoginSessionToken();
  if (sessionToken) {
    await supabase.rpc("sign_out_login_session", {
      requested_session_token: sessionToken
    });
  }
  setLoginSessionToken(null);
}

export async function ensureSupabaseUser() {
  const { user: sessionUser, error: sessionError } = await getSupabaseSessionUser();
  if (sessionError) {
    return { user: null, error: sessionError };
  }

  if (sessionUser) {
    return { user: sessionUser, error: null };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  return {
    user: data?.user ?? data?.session?.user ?? null,
    error
  };
}

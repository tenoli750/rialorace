import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PUBLIC_SUPABASE_CONFIG } from "./env.js";

const LOGIN_SESSION_STORAGE_KEY = "binance-ring-rally-login-session-v1";

if (!PUBLIC_SUPABASE_CONFIG.url || !PUBLIC_SUPABASE_CONFIG.publishableKey) {
  throw new Error("Missing public Supabase config. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before building.");
}

export const supabase = createClient(PUBLIC_SUPABASE_CONFIG.url, PUBLIC_SUPABASE_CONFIG.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
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

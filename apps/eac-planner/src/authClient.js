import { fetchJson, resolveApiBases } from "./qboClient.js";

let authBootstrapPromise = null;
let supabaseClient = null;
let authConfig = null;

function normalizeUser(session) {
  const user = session?.user || null;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Signed-in user",
    provider: user.app_metadata?.provider || user.identities?.[0]?.provider || "email"
  };
}

export async function initializeAuth(apiBases = resolveApiBases()) {
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = (async () => {
    const result = await fetchJson("/auth/config", {}, apiBases);
    authConfig = result?.data || {};

    if (!authConfig?.enabled || !authConfig?.supabaseUrl || !authConfig?.supabaseAnonKey) {
      return {
        client: null,
        config: authConfig,
        session: null,
        user: null
      };
    }

    const createClient = globalThis.supabase?.createClient;
    if (typeof createClient !== "function") {
      throw new Error("Supabase client library is not loaded in the browser.");
    }

    supabaseClient = createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const { data } = await supabaseClient.auth.getSession();
    return {
      client: supabaseClient,
      config: authConfig,
      session: data?.session || null,
      user: normalizeUser(data?.session || null)
    };
  })();

  return authBootstrapPromise;
}

export function getAuthConfig() {
  return authConfig;
}

export function getSupabaseClient() {
  return supabaseClient;
}

export async function signInWithGoogle() {
  if (!supabaseClient) throw new Error("Authentication is not configured yet.");
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: globalThis.location?.href
    }
  });
  if (error) throw error;
}

export async function signInWithEmail(email) {
  if (!supabaseClient) throw new Error("Authentication is not configured yet.");
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: globalThis.location?.href
    }
  });
  if (error) throw error;
}

export async function signOutAuth() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!supabaseClient) return () => {};
  const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    callback({
      event: _event,
      session,
      user: normalizeUser(session)
    });
  });
  return () => {
    data?.subscription?.unsubscribe?.();
  };
}

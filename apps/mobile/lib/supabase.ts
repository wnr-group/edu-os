import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (Constants.expoConfig?.extra?.supabaseUrl as string) ??
  "http://127.0.0.1:54321";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  (Constants.expoConfig?.extra?.supabaseAnonKey as string) ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const SCHOOL_ID =
  process.env.EXPO_PUBLIC_SCHOOL_ID ??
  (Constants.expoConfig?.extra?.schoolId as string) ??
  "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
  },
  global: {
    headers: {
      "x-school-id": SCHOOL_ID,
    },
  },
});

// The currently active role (teacher | parent). Kept in a module-level variable as
// the source of truth, and also mirrored onto the live PostgREST header bag so that
// subsequent supabase.from(...) requests carry `x-active-role`.
let activeRole = "";

export function getActiveRole(): string {
  return activeRole;
}

/**
 * Update the `x-active-role` header sent on subsequent REST requests.
 *
 * In supabase-js / postgrest-js v2.103, the PostgREST client lives at
 * `supabase.rest` and its `headers` field is a Web `Headers` instance (not a
 * plain object). `from()` reads this live via `new Headers(this.headers)` at
 * call time, so mutating it before issuing a query propagates correctly.
 * We support both a `Headers` instance (via `.set`) and a plain object
 * (bracket assignment) for forward/backward compatibility.
 */
export function setActiveRoleHeader(role: string) {
  activeRole = role;
  const rest = (
    supabase as unknown as {
      rest?: { headers?: Headers | Record<string, string> };
    }
  ).rest;
  const headers = rest?.headers;
  if (!headers) return;
  if (typeof (headers as Headers).set === "function") {
    (headers as Headers).set("x-active-role", role);
  } else {
    (headers as Record<string, string>)["x-active-role"] = role;
  }
}

// Normalize a storage/signed URL's origin to match this app's own configured
// Supabase origin. Edge Functions resolve SUPABASE_URL from inside their own
// runtime (e.g. the internal Docker service address in self-hosted/local
// setups), which differs from the address this app actually reaches Supabase
// through — so a signed URL minted by an Edge Function can come back with a
// host this app (or a physical device) cannot resolve at all. Storage sits
// behind the same gateway as every other Supabase API this app calls, so
// swapping in our own origin always lands on a reachable host; in
// production, where the origins already match, this is a no-op.
export function fixStorageUrl(url: string): string {
  try {
    const configured = new URL(supabaseUrl);
    const target = new URL(url);
    if (target.origin === configured.origin) return url;
    target.protocol = configured.protocol;
    target.host = configured.host;
    return target.toString();
  } catch {
    return url;
  }
}

import { createBrowserClient } from "@supabase/ssr";

function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  if (host.includes("lvh.me")) return ".lvh.me";
  if (host.includes("balajierp.com")) return ".balajierp.com";
  if (host.includes("eduos.wnradvisory.com")) return ".eduos.wnradvisory.com";
  if (host.includes("eduos.com")) return ".eduos.com";
  if (host.includes("connectmyskool.com")) return ".connectmyskool.com";
  return undefined;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

// Forward the scope cookies set by middleware as request headers so the DB
// pre-request hook (scope_pre_request) can resolve get_my_school_id() /
// get_my_role(). The browser client talks to PostgREST directly (middleware
// does not run on these calls), so without this RLS denies every read/write.
// scope_pre_request re-validates the pair against user_roles — the cookie is
// not trusted, it just names which of the user's roles to act as.
function scopeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const schoolId = readCookie("x-school-id");
  const role = readCookie("x-active-role");
  if (schoolId) headers["x-school-id"] = schoolId;
  if (role) headers["x-active-role"] = role;
  return headers;
}

// global.headers is captured once when the client is constructed, so with the
// default (shared) singleton it would freeze whichever cookies were present
// on the first-ever createClient() call for the life of the tab. global.fetch
// is instead invoked fresh on every actual network call, so reading
// scopeHeaders() inside it keeps x-school-id/x-active-role current without
// giving up the singleton (and its single GoTrueClient/auth-refresh cycle).
function scopedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(scopeHeaders())) {
    headers.set(key, value);
  }
  return fetch(input, { ...init, headers });
}

export function createClient() {
  const cookieDomain = getCookieDomain();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    {
      ...(cookieDomain ? { cookieOptions: { domain: cookieDomain } } : {}),
      global: { fetch: scopedFetch },
    }
  );
}

import { createBrowserClient } from "@supabase/ssr";

function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  if (host.includes("lvh.me")) return ".lvh.me";
  if (host.includes("balajierp.com")) return ".balajierp.com";
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

export function createClient() {
  const cookieDomain = getCookieDomain();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    {
      ...(cookieDomain ? { cookieOptions: { domain: cookieDomain } } : {}),
      global: { headers: scopeHeaders() },
    }
  );
}

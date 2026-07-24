// Server-side Supabase client for Next.js App Router only.
// Kept in apps/web (not packages/shared) to avoid importing next/headers
// into the Expo mobile bundle, which does not support it.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

// Bypasses RLS — use only for unauthenticated server-side reads (e.g. login page branding)
export function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isLvh = host.includes("lvh.me");
  const isBalaji = host.includes("balajierp.com");
  const isEduos = host.includes("eduos.com");
  const isConnectmyskool = host.includes("connectmyskool.com");
  const cookieDomain = isLvh ? ".lvh.me" : isBalaji ? ".balajierp.com" : isEduos ? ".eduos.com" : isConnectmyskool ? ".connectmyskool.com" : undefined;
  // Forward the scoping headers set by middleware so PostgREST's
  // scope_pre_request() hook can resolve get_my_school_id()/get_my_role() GUCs
  // that the RLS policies depend on. Without this, RLS denies all web users.
  const forwardHeaders: Record<string, string> = {};
  const xSchoolId = headersList.get("x-school-id");
  const xActiveRole = headersList.get("x-active-role");
  if (xSchoolId) forwardHeaders["x-school-id"] = xSchoolId;
  if (xActiveRole) forwardHeaders["x-active-role"] = xActiveRole;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: forwardHeaders },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, domain: cookieDomain })
            );
          } catch {
            // called from Server Component — cookies will be set by middleware
          }
        },
      },
    }
  );
}

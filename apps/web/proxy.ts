import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/download-app", "/apply", "/verify"];
const PLATFORM_ADMIN_DOMAINS = ["admin.balajierp.com", "core.lvh.me", "core.connectmyskool.com", "core.eduos.com"];

// Fixed apex domains that are marketing on every deployment and will never
// have a schools row — safe to short-circuit without a DB round trip.
const MARKETING_EXACT_HOSTS = new Set([
  "eduos.com",
  "www.eduos.com",
  "eduos.wnradvisory.com",
  "www.eduos.wnradvisory.com",
  "connectmyskool.com",
  "www.connectmyskool.com",
  "lvh.me",
  "localhost",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const domain = host.replace(/:\d+$/, "");
  const isPlatformAdmin =
    PLATFORM_ADMIN_DOMAINS.includes(domain) ||
    pathname.startsWith("/platform-admin");

  if (!isPlatformAdmin && MARKETING_EXACT_HOSTS.has(domain)) {
    return NextResponse.next();
  }

  // Mobile app calls these API routes with Bearer token — skip cookie auth + school-domain check
  if (pathname.startsWith("/api/fees/") || pathname.startsWith("/api/students/import")) {
    return NextResponse.next();
  }

  // Validate the subdomain maps to a real, active school before anything else
  // (including the unauthenticated /login path). RLS hides schools from anon,
  // so use the service-role client. Platform-admin domains have no school row.
  let resolvedSchoolId: string | null = null;
  if (!isPlatformAdmin) {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.qGOA8n458FvP100B26l0_27lS383xT7N5Fw43_t-X8s"
    );
    const { data: schoolId } = await service.rpc("get_school_id_by_domain", { p_domain: domain });

    if (schoolId) {
      // Real tenant — matched schools.domain directly, or a school_domains
      // alias (e.g. a Vercel branch-preview URL assigned for a no-DNS demo).
      resolvedSchoolId = schoolId;
    } else if (domain.endsWith(".vercel.app")) {
      // No school claims this Vercel URL — the default project alias, or
      // an unassigned preview deployment. Show branding, not a 404.
      // Suffix match (not a fixed list), so every current and future
      // preview URL is covered automatically with no code change.
      return NextResponse.next();
    } else {
      // No `status: 404` here deliberately — in Next.js 16's App Router, a
      // rewrite carrying an explicit 404 status is treated as "route not
      // found" and renders the framework's own app/not-found.tsx instead
      // of the destination page, regardless of what that page actually is.
      // We want /school-not-found's own content to render, so the rewrite
      // is left as a plain 200 to the browser.
      return NextResponse.rewrite(new URL("/school-not-found", request.url));
    }
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          const host = request.headers.get("host") ?? "";
          const isLvh = host.includes("lvh.me");
          const isBalaji = host.includes("balajierp.com");
          const isConnectmyskool = host.includes("connectmyskool.com");
          const isEduosWnr = host.includes("eduos.wnradvisory.com");
          const isEduos = host.includes("eduos.com");
          const cookieDomain = isLvh ? ".lvh.me" : isBalaji ? ".balajierp.com" : isEduosWnr ? ".eduos.wnradvisory.com" : isEduos ? ".eduos.com" : isConnectmyskool ? ".connectmyskool.com" : undefined;


          // Set all cookies on the request first, then create ONE response and
          // set all cookies on it. Creating a new NextResponse inside the loop
          // caused each iteration to discard the previous one's cookies, breaking
          // multi-chunk auth tokens and triggering an infinite refresh loop.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              domain: cookieDomain,
            });
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // School already validated above via service-role (RLS hides it from anon
  // until the x-school-id scope header is set, which is a chicken-and-egg for
  // the schools table itself — so we reuse the resolved id rather than re-query).
  let schoolId: string | null = resolvedSchoolId;
  if (!isPlatformAdmin && schoolId) {
    request.headers.set("x-school-id", schoolId);
    response = NextResponse.next({ request });
    response.headers.set("x-school-id", schoolId);
  }

  // Resolve user's role at this school by fixed precedence.
  const ROLE_PRECEDENCE: Record<string, number> = {
    school_admin: 1,
    principal: 2,
    teacher: 3,
    parent: 4,
    student: 5,
  };

  // Use service-role client for role lookups to bypass RLS — middleware is
  // server-side and the service client is already created above for school validation.
  const serviceForRoles = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.qGOA8n458FvP100B26l0_27lS383xT7N5Fw43_t-X8s"
  );

  let role: string | null = null;
  if (schoolId) {
    const { data: rows } = await serviceForRoles
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("school_id", schoolId)
      .eq("is_active", true);
    if (rows && rows.length > 0) {
      role = rows
        .map((r) => r.role as string)
        .sort((a, b) => (ROLE_PRECEDENCE[a] ?? 99) - (ROLE_PRECEDENCE[b] ?? 99))[0];
    }
  }
  if (!role) {
    // Platform admin fallback (NULL school_id, super_admin).
    const { data } = await serviceForRoles
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .is("school_id", null)
      .eq("is_active", true)
      .maybeSingle();
    role = data?.role ?? null;
  }
  if (!role) {
    return NextResponse.redirect(new URL("/login?reason=no_access", request.url));
  }

  // Pass the resolved school role to PostgREST so scope_pre_request validates
  // the exact (user, school, role) triple. Only set when we resolved a real
  // school-level role (platform super_admin uses the NULL-school DB path).
  if (schoolId && ROLE_PRECEDENCE[role]) {
    request.headers.set("x-active-role", role);
    response = NextResponse.next({ request });
    response.headers.set("x-active-role", role);
    response.headers.set("x-school-id", schoolId);

    // Also persist the scope as cookies so the browser Supabase client can
    // forward them as headers on its direct PostgREST calls (middleware only
    // runs on navigations, not on client-side API requests). Not httpOnly:
    // client JS must read them. Not a trust boundary — scope_pre_request
    // re-validates the (user, school, role) triple against user_roles, so a
    // tampered cookie fails closed.
    const host = request.headers.get("host") ?? "";
    const cookieDomain = host.includes("lvh.me")
      ? ".lvh.me"
      : host.includes("balajierp.com")
        ? ".balajierp.com"
        : host.includes("eduos.wnradvisory.com")
          ? ".eduos.wnradvisory.com"
          : host.includes("eduos.com")
            ? ".eduos.com"
            : host.includes("connectmyskool.com")
              ? ".connectmyskool.com"
              : undefined;
    const scopeCookie = { path: "/", sameSite: "lax" as const, domain: cookieDomain };
    response.cookies.set("x-school-id", schoolId, scopeCookie);
    response.cookies.set("x-active-role", role, scopeCookie);
  }

  // Platform admin routing
  if (isPlatformAdmin) {
    if (role !== "super_admin") {
      return NextResponse.redirect(new URL("/login?reason=no_access", request.url));
    }
    if (!pathname.startsWith("/platform-admin") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/platform-admin/dashboard", request.url));
    }
    return response;
  }

  // Read active section cookie and set header
  const activeSection = request.cookies.get("active_section")?.value ?? null;
  if (activeSection) {
    response.headers.set("x-active-section", activeSection);
  }

  // Resolve academic year context for school users
  if (schoolId) {
    let academicYearId: string | null = null;

    // Teachers always use the active year — cookie ignored
    if (role !== "teacher") {
      const yearFromCookie = request.cookies.get("academic_year_id")?.value ?? null;
      if (yearFromCookie) {
        academicYearId = yearFromCookie;
      }
    }

    if (!academicYearId) {
      const { data: activeYear } = await supabase
        .from("academic_years")
        .select("id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .maybeSingle();
      academicYearId = activeYear?.id ?? null;
    }

    if (academicYearId) {
      request.headers.set("x-academic-year-id", academicYearId);
      response.headers.set("x-academic-year-id", academicYearId);
    }
  }

  // Super admin on school domain → treat as school_admin
  const effectiveRole = role === "super_admin" ? "school_admin" : role;

  // Route enforcement
  if (!pathname.startsWith("/api") && !pathname.startsWith("/auth")) {
    if (pathname.startsWith("/teacher")) {
      const canAccessTeacher =
        effectiveRole === "teacher" ||
        ((effectiveRole === "school_admin" || effectiveRole === "principal") && activeSection);
      if (!canAccessTeacher) {
        const dest = effectiveRole === "principal" ? "/principal/dashboard" : "/admin/dashboard";
        return NextResponse.redirect(new URL(dest, request.url));
      }
    } else if (effectiveRole === "school_admin" && !pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    } else if (effectiveRole === "principal" && !pathname.startsWith("/principal") && !pathname.startsWith("/teacher")) {
      return NextResponse.redirect(new URL("/principal/dashboard", request.url));
    } else if (effectiveRole === "teacher" && !pathname.startsWith("/teacher")) {
      return NextResponse.redirect(new URL("/teacher/dashboard", request.url));
    } else if (effectiveRole === "parent" && !pathname.startsWith("/download-app")) {
      return NextResponse.redirect(new URL("/download-app", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|__nextjs_font|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
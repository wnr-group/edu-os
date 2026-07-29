import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCached, setCached, normalizeCacheKey } from "@/lib/geocode-cache";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "EduOS-GeoAttendance/1.0 (school geofence setup)";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_QUERY_LENGTH = 200;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const BURST_LIMIT = { windowMs: 2_000, maxRequests: 5 };
const SUSTAINED_LIMIT = { windowMs: 60_000, maxRequests: 20 };

function log(event: string, fields: Record<string, unknown> = {}) {
  // No PII: never log the raw query text or a user identifier, only event
  // shape/timing/outcome — enough to debug and monitor without a privacy concern.
  console.info(JSON.stringify({ event, ...fields, ts: new Date().toISOString() }));
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function rateLimitedResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

function isFiniteInRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Defense in depth: proxy.ts already redirects any authenticated user with no
  // resolved school role before they can reach any route, including this one.
  // Re-checking the header it sets costs nothing and fails closed if that
  // invariant is ever weakened.
  if (!request.headers.get("x-active-role")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userKey = `user:${user.id}`;
  const ipKey = `ip:${getClientIp(request)}`;
  for (const key of [userKey, ipKey]) {
    const burst = checkRateLimit(`${key}:burst`, BURST_LIMIT);
    if (!burst.allowed) {
      log("search_rate_limited", { scope: key.split(":")[0], window: "burst" });
      return rateLimitedResponse(burst.retryAfterMs);
    }
    const sustained = checkRateLimit(`${key}:sustained`, SUSTAINED_LIMIT);
    if (!sustained.allowed) {
      log("search_rate_limited", { scope: key.split(":")[0], window: "sustained" });
      return rateLimitedResponse(sustained.retryAfterMs);
    }
  }

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "search" && type !== "reverse") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const upstream = new URL(type === "reverse" ? `${NOMINATIM_BASE_URL}/reverse` : `${NOMINATIM_BASE_URL}/search`);
  upstream.searchParams.set("format", "json");
  upstream.searchParams.set("addressdetails", "1");

  let cacheKey: string;
  if (type === "reverse") {
    if (!request.nextUrl.searchParams.has("lat") || !request.nextUrl.searchParams.has("lon")) {
      return NextResponse.json({ error: "invalid lat/lon" }, { status: 400 });
    }
    const lat = Number(request.nextUrl.searchParams.get("lat"));
    const lon = Number(request.nextUrl.searchParams.get("lon"));
    if (!isFiniteInRange(lat, -90, 90) || !isFiniteInRange(lon, -180, 180)) {
      return NextResponse.json({ error: "invalid lat/lon" }, { status: 400 });
    }
    upstream.searchParams.set("lat", String(lat));
    upstream.searchParams.set("lon", String(lon));
    cacheKey = `reverse:${lat.toFixed(5)},${lon.toFixed(5)}`;
  } else {
    const rawQ = request.nextUrl.searchParams.get("q") ?? "";
    const q = rawQ.replace(CONTROL_CHARS, "").trim();
    if (q.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }
    if (!q) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }
    upstream.searchParams.set("q", q);
    upstream.searchParams.set("limit", "5");
    cacheKey = `search:${normalizeCacheKey(q)}`;
  }

  const cached = getCached<unknown>(cacheKey);
  if (cached !== undefined) {
    log("search_completed", { cacheHit: true });
    return NextResponse.json(cached);
  }

  const startedAt = Date.now();
  log("search_started", {});

  // AbortSignal.any requires Node >=20.3 (Next.js 16 already requires Node >=20).
  // If this ever fails to type-check on an older toolchain, the safe fallback is
  // `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` alone — it still satisfies
  // the timeout requirement; only the early-cancel-on-client-disconnect behavior
  // is lost.
  let combinedSignal: AbortSignal;
  try {
    combinedSignal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  } catch {
    combinedSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  try {
    const upstreamResponse = await fetch(upstream.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
      signal: combinedSignal,
    });

    if (upstreamResponse.status === 429) {
      log("search_rate_limited", { scope: "upstream" });
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (!upstreamResponse.ok) {
      log("search_failed", { status: upstreamResponse.status });
      return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    }

    let data: unknown;
    try {
      data = await upstreamResponse.json();
    } catch {
      log("search_failed", { reason: "malformed_json" });
      return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    }

    setCached(cacheKey, data);
    log("search_completed", { durationMs: Date.now() - startedAt, cacheHit: false });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      log("search_timeout", { durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      log("search_client_aborted", { durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "aborted" }, { status: 499 });
    }
    log("search_failed", { reason: "network" });
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }
}

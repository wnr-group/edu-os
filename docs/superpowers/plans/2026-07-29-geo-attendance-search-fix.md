# ERP-68: Geo Attendance — Functional Geofence Search (Production-Hardened) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the currently-dead search box on the geofence setup page actually search places (via OSM Nominatim) and reposition the map/marker/coordinates on selection — hardened to production standards (rate-limited, cached, validated, observable, accessible) — with zero change to any other geofence behavior.

**Architecture:** A server-side Next.js Route Handler (`/api/geocode`) proxies Nominatim so a proper `User-Agent` header can be sent (browsers block custom `User-Agent` on client `fetch`), so an authenticated+authorized gate and per-user/per-IP rate limiting can be enforced, and so an in-memory TTL+LRU cache can absorb repeat queries before they ever leave our server. A typed client lib (`lib/geocoding.ts`) calls that route, validates every field of the response, and classifies errors into distinct, user-appropriate messages. A hook (`hooks/useLocationSearch.ts`) adds debounce/client-cache/abort. A component (`geo-search.tsx`) renders the input + accessible dropdown (with a screen-reader live region), replacing a `<div>` that was never wired to anything. `GeofenceMap` gets one new optional prop (`flyToRequest`) so a search selection can pan the map — every other prop and code path is untouched.

**Tech Stack:** Next.js 16 App Router (Route Handlers, Node runtime ≥20), React 19, react-leaflet 5 / Leaflet, Supabase (`@supabase/ssr`), Tailwind (existing utility classes only), sonner (toasts). No new npm dependencies — rate limiting and caching are hand-rolled in-memory (see Production Impact Analysis for why, and the tradeoff this implies).

## Root Cause Analysis

`apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx:143-145` (current, pre-change):

```tsx
<div className="flex h-9 flex-1 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground">
  <MapPin className="h-3.5 w-3.5" /> {draft?.name ?? "Search or pick a campus"}
</div>
```

This is not an unfinished input with a missing handler — **it is not an `<input>` at all.** It is a static, read-only `<div>` that echoes `draft.name`. No `onChange`, no `onSubmit`, no state, no API call. Root cause: **feature unfinished / dead placeholder markup**, not a wiring bug.

## Impact Analysis (code ownership / state flow)

| File | Role today | Touched by this plan? |
|---|---|---|
| `apps/web/app/(school)/admin/settings/geo-attendance/page.tsx` | Server component: fetches `initialGeofences`/`initialFlags`, renders `GeoAttendanceTabs` | No |
| `apps/web/app/(school)/admin/settings/geo-attendance/geo-attendance-tabs.tsx` | Client tab switcher | No |
| `apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx` | Owns ALL geofence state: `geofences[]`, `selectedId`, `draft`, `dropPinArmed`, `saving`. | **Yes** — replace the dead div with `<GeoSearch>`, add `flyToRequest` state + one handler |
| `apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx` | Fully controlled Leaflet map. `MapContainer`'s `center`/`zoom` only apply at mount — camera does not auto-pan on prop change; Marker/Circle position IS reactive to props. | **Yes** — one new optional prop + one new internal child component; zero changes to existing Marker/Circle/ClickToDropPin/drag logic |
| `apps/web/lib/geo-attendance.ts` | `haversineMeters`, `destinationPoint`, `upsertGeofence`, `deleteGeofence`, flag-review helpers | No |
| `apps/web/proxy.ts` (Next middleware) | Auth/school/role gate before every non-static request, including `/api/*`. Confirmed its `matcher` does not exclude `/api/geocode`; a request reaching our route handler has already passed cookie-auth and, per lines 151-153, been redirected away if it has no resolved role — so "authenticated but role-less" cannot reach our handler at all. It also sets `x-active-role`/`x-school-id` request headers (lines 158-162) that our route can read as a defense-in-depth authorization check. | No — read only, not modified |

**Save-safety already exists, untouched:** `saveDraft()` in `geofence-setup-client.tsx` already sets `saving` state and the Save button already renders `disabled={saving}` (existing code, line ~230). Double-save / rapid-click protection is **already satisfied by existing, unmodified code** — this plan does not touch `saveDraft()` at all (the original ticket explicitly forbids rewriting save logic).

**Conflict-handling / single source of truth already holds, by construction:** `draft.center_lat`/`center_lng` is the one canonical value driving `Marker`, `Circle`, and `saveDraft()`. Search, drag, and manual lat/lng edits all funnel through the same `setDraft` updater, called only from synchronous user gestures (drag-end, input `onChange`, drop-pin click, search-result click) — never from an async fetch resolving automatically. The search hook's network state (`results`/`loading`/`error`) is fully decoupled from `draft` until the user explicitly clicks/Enters a result; a slow or stale search response can never silently overwrite a marker position the user has since moved by another means, because nothing in the fetch-resolution path calls `setDraft`.

**Pre-existing behavior explicitly NOT changed:** switching the selected campus in the sidebar does not pan the map camera today (`MapContainer`'s `center` prop is mount-only) — not fixed here; this plan adds camera panning only for the new search-selection path.

## Production Impact Analysis (performed before writing code, per hardening requirements)

- **Security:** New surface is `/api/geocode`, auth-gated (rejects unauthenticated with 401) and authorization-gated (rejects requests missing the `x-active-role` header, which `proxy.ts` only sets for users with a resolved school role, with 403). Rate-limited per-user and per-IP. Every upstream call is built with `URLSearchParams` (auto-encoded, no string concatenation into the URL) and only the four expected params (`type`, `q`, `lat`, `lon`) are ever read from the incoming request — nothing else is forwarded. No internal error detail (stack traces, upstream response bodies) is ever passed through to the client — only a fixed small set of `{ error: "<code>" }` strings.
- **Performance:** 400ms debounce + client-side cache + server-side cache + abort-in-flight bounds request volume to roughly one round trip per distinct query per session. Isolated to the geo-attendance settings route — no impact on any other page's render or data-fetch path.
- **Memory:** Two new module-level `Map`s in the Node process (rate-limit buckets, geocode cache), both hard-capped with eviction (`MAX_TRACKED_KEYS = 5000` for rate limiting, `MAX_ENTRIES = 500` + 5-minute TTL for the cache) — bounded, not unbounded growth. The hook's client-side cache lives in a `useRef` scoped to the component instance and is garbage-collected on unmount.
- **Network:** Adds outbound calls from our server to `nominatim.openstreetmap.org`, only on a combined client+server cache miss. Debounce + both caches keep this well under Nominatim's usage-policy limits for this traffic profile (a handful of school admins).
- **Rendering:** The dropdown is `position: absolute`, out of document flow — cannot reflow the "Drop pin" button or the map below it. No layout shift.
- **Bundle size:** Zero new npm dependencies. ~450 lines across 8 files, all inside the existing `geo-attendance` route's code-split chunk.
- **Mobile:** This page lives in `apps/web` only, not `apps/mobile`. Zero impact on the Expo app, teacher GPS capture, or the attendance RPC.
- **Accessibility:** Net improvement — a non-interactive `<div>` becomes a labeled, keyboard-navigable combobox with a screen-reader live region. No existing accessible element changes.
- **Browser compatibility:** Client code uses only `AbortController`, `fetch`, and standard DOM APIs — supported in Chrome/Edge/Firefox/Safari for years. `AbortSignal.any` is used server-side only (Node ≥20.3; already required by Next.js 16), with a documented one-line fallback in Task 3 if the toolchain's TS lib doesn't yet type it.
- **Existing API:** No existing route is modified. `/api/geocode` is additive.
- **Existing database:** No schema changes, no migrations. The only write path this feature touches is the pre-existing, unmodified `saveDraft()` → `upsertGeofence()` → `school_geofences`.

**Infrastructure tradeoff, stated explicitly rather than silently decided:** rate limiting and caching below are **in-memory, per-process**. This is correct and sufficient for a single Node instance. If this app is ever deployed as multiple horizontally-scaled instances behind a load balancer without sticky sessions, per-instance in-memory state means the *effective* rate limit is `limit × instance count` and cache hit rate drops proportionally — correctness-safe (never under-protects Nominatim by much, never corrupts data) but not perfectly precise. Fixing that requires a shared store (e.g. Redis/Upstash), which is a new infrastructure dependency this plan does not add unilaterally, since the original ticket's constraint is "no paid API, no new dependency" and provisioning external infra is a deployment decision, not a code decision. Flagging it here so it's a conscious choice, not an oversight.

## Global Constraints

- No new npm dependencies (no Google Maps SDK, no paid geocoding API, no API key, no rate-limit/cache/debounce library — hand-rolled).
- Nominatim request params: `format=json`, `limit=5`, `addressdetails=1`, `q=<query>` (search) — exactly as specified.
- Debounce: 400ms, never fire on every keystroke.
- Every keystroke's in-flight request cancelled via `AbortController` before the next starts.
- Identical (case-insensitive, trimmed) queries served from cache — client-side (hook) and server-side (route) — no duplicate upstream calls.
- Searching must never call `upsertGeofence`/write to Supabase. Only the existing `saveDraft()` (unchanged) does that.
- Zero changes to Tailwind classes/spacing/typography on anything that isn't the dead search `<div>` itself. One exception: a `focus-within` ring on the new input (copied verbatim from this repo's own `Input` primitive's existing focus style) — justified because a real focusable input now exists where a static div did not; omitting focus styling would itself be an accessibility regression.
- **"No console.log" (build-quality item) vs. required observability logging:** these coexist. "No console.log" bans stray debug statements left over from development. The `console.info`/`console.warn` calls added in Task 3 are the intentional, sanctioned structured-logging mechanism the Observability requirement calls for — this repo has no logging library (Pino/Winston/etc.), and adding one would violate the no-new-dependencies constraint, so `console.*` with structured JSON payloads is the pragmatic choice for a low-traffic internal endpoint. Next.js does not strip `console.*` in production builds here (`next.config.mjs` has no `compiler.removeConsole`).
- **Testing approach deviation:** this repo has **no test runner configured** anywhere under `apps/web` (no Jest/Vitest, no `*.test.ts`, no `test` script) and **no ESLint config** anywhere (bare `next lint` would hit an interactive "install ESLint?" prompt). This plan substitutes: `tsc --noEmit` after every code task, `next build` as the production-readiness gate, and one consolidated evidence-producing QA pass (Task 10) using the `webapp-testing` skill (Playwright) against the real running dev server, covering functional, regression, responsive, and cross-engine browser checks.
- Package manager is `pnpm` (workspace `packageManager: pnpm@9.15.0`, Turborepo). Web app package name `@erp/web`. Run scoped commands as `pnpm --filter @erp/web <script>` from the repo root (`c:\Users\Eshwar\WNR\edu-os`).

---

### Task 1: In-memory rate limiter

**Files:**
- Create: `apps/web/lib/rate-limit.ts`

**Interfaces:**
- Produces: `export function checkRateLimit(key: string, config: { windowMs: number; maxRequests: number }, now?: number): { allowed: boolean; retryAfterMs: number }` — consumed by the API route (Task 3).

- [ ] **Step 1: Create the rate limiter**

```ts
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();
const MAX_TRACKED_KEYS = 5000;

function pruneOld(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  if (buckets.size > MAX_TRACKED_KEYS) {
    // Memory-safety valve: a Map iterates in insertion order, so the first key is
    // the oldest-inserted bucket. Evicting it bounds memory regardless of how many
    // distinct users/IPs hit this process — no external store required.
    const firstKey = buckets.keys().next().value;
    if (firstKey !== undefined) buckets.delete(firstKey);
  }

  const entry = buckets.get(key) ?? { timestamps: [] };
  entry.timestamps = pruneOld(entry.timestamps, now, config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    buckets.set(key, entry);
    const oldest = entry.timestamps[0];
    return { allowed: false, retryAfterMs: Math.max(0, oldest + config.windowMs - now) };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true, retryAfterMs: 0 };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `lib/rate-limit.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/rate-limit.ts
git commit -m "feat(web): add in-memory sliding-window rate limiter"
```

---

### Task 2: In-memory TTL+LRU geocode cache

**Files:**
- Create: `apps/web/lib/geocode-cache.ts`

**Interfaces:**
- Produces: `export function getCached<T>(key: string): T | undefined`, `export function setCached<T>(key: string, value: T): void`, `export function normalizeCacheKey(raw: string): string` — consumed by the API route (Task 3).

- [ ] **Step 1: Create the cache**

```ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  // Delete + re-set moves this key to the end of the Map's insertion-order
  // iteration, which is what makes "the first key" in setCached below the
  // least-recently-used one — no separate LRU data structure needed.
  store.delete(key);
  store.set(key, entry);
  return entry.value as T;
}

export function setCached<T>(key: string, value: T): void {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function normalizeCacheKey(raw: string): string {
  return raw.trim().toLowerCase();
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `lib/geocode-cache.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/geocode-cache.ts
git commit -m "feat(web): add in-memory TTL+LRU cache for geocode responses"
```

---

### Task 3: Hardened server-side geocoding proxy route

**Files:**
- Create: `apps/web/app/api/geocode/route.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` from `@/lib/supabase/server` (existing); `checkRateLimit` (Task 1); `getCached`/`setCached`/`normalizeCacheKey` (Task 2).
- Produces: `GET /api/geocode?type=search&q=<text>` → raw Nominatim array on 200. `GET /api/geocode?type=reverse&lat=<n>&lon=<n>` → raw Nominatim object on 200. Status codes: `400` invalid input, `401` unauthenticated, `403` unauthorized (no resolved role), `429` rate-limited (with `Retry-After` header), `502` upstream failure, `504` upstream timeout. Body always `{ error: "<code>" }` on non-200 — never upstream error text or a stack trace.

- [ ] **Step 1: Create the route handler**

```ts
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
    const q = rawQ.replace(CONTROL_CHARS, "").trim().slice(0, MAX_QUERY_LENGTH);
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `app/api/geocode/route.ts`. If `AbortSignal.any` is reported as not existing on the `AbortSignal` type, the `try/catch` around it already falls back safely at runtime — but if it's a *type* error (not a runtime one), change the `combinedSignal` assignment to `const combinedSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);` directly and remove the `try/catch`, then re-run this step.

- [ ] **Step 3: Manual smoke check (unauthenticated rejection)**

Run: `pnpm --filter @erp/web dev`, then in a second terminal:

Run: `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/geocode?type=search&q=Pune"`
Expected: `401` (no auth cookie on a bare curl) — confirms the route is mounted and the auth gate is active. Stop the dev server after this check; full authenticated/rate-limit/cache behavior is verified in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/geocode/route.ts
git commit -m "feat(web): add hardened Nominatim geocoding proxy (auth, rate limit, cache, timeout, logging)"
```

---

### Task 4: Typed, validating geocoding client lib

**Files:**
- Create: `apps/web/lib/geocoding.ts`

**Interfaces:**
- Consumes: `GET /api/geocode` (Task 3, same-origin relative URL).
- Produces:
  - `export interface GeoSearchResult { id: string; primaryName: string; secondaryAddress: string; country: string; lat: number; lng: number; }`
  - `export type GeoSearchErrorCode = "not_found" | "rate_limited" | "server_error" | "network" | "aborted" | "timeout" | "invalid_input";`
  - `export interface GeoSearchError { code: GeoSearchErrorCode; message: string; }`
  - `export async function searchLocation(query: string, signal?: AbortSignal): Promise<{ data: GeoSearchResult[] | null; error: GeoSearchError | null }>`
  - `export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<{ data: GeoSearchResult | null; error: GeoSearchError | null }>`
  - Consumed by `hooks/useLocationSearch.ts` (Task 5). `reverseGeocode` is exported per the spec's stated lib responsibilities; no caller wires it into the UI in this plan (the functional flow only needs forward search).

- [ ] **Step 1: Create the lib file**

```ts
export interface GeoSearchResult {
  id: string;
  primaryName: string;
  secondaryAddress: string;
  country: string;
  lat: number;
  lng: number;
}

export type GeoSearchErrorCode =
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "network"
  | "aborted"
  | "timeout"
  | "invalid_input";

export interface GeoSearchError {
  code: GeoSearchErrorCode;
  message: string;
}

interface NominatimAddress {
  country?: string;
  [key: string]: string | undefined;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

const MAX_QUERY_LENGTH = 200;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const COORD_PATTERN = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

function tryParseCoordinates(query: string): GeoSearchResult | null {
  const match = COORD_PATTERN.exec(query);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    id: `coord:${lat},${lng}`,
    primaryName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    secondaryAddress: "Custom coordinates",
    country: "",
    lat,
    lng,
  };
}

// Never trust the upstream response shape — reject anything that doesn't have
// a valid place id, a non-empty display name, and coordinates in range, rather
// than letting a malformed item crash the mapping step or produce NaN/garbage
// coordinates that would silently corrupt a saved geofence.
function isValidNominatimResult(item: unknown): item is NominatimResult {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  const lat = Number(candidate.lat);
  const lon = Number(candidate.lon);
  return (
    typeof candidate.place_id === "number" &&
    typeof candidate.display_name === "string" &&
    candidate.display_name.trim().length > 0 &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lon) &&
    lon >= -180 &&
    lon <= 180
  );
}

function toSearchResult(item: NominatimResult): GeoSearchResult {
  const segments = item.display_name.split(",").map((s) => s.trim()).filter(Boolean);
  const primaryName = segments[0] ?? item.display_name;
  const country = item.address?.country ?? segments[segments.length - 1] ?? "";
  const middle = segments.slice(1, segments.length - (country ? 1 : 0));
  const secondaryAddress = middle.slice(0, 2).join(", ");
  return {
    id: String(item.place_id),
    primaryName,
    secondaryAddress,
    country,
    lat: Number(item.lat),
    lng: Number(item.lon),
  };
}

async function fetchGeocode(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ data: unknown; error: GeoSearchError | null }> {
  const search = new URLSearchParams(params).toString();

  try {
    const response = await fetch(`/api/geocode?${search}`, { signal });

    if (response.status === 429) {
      return {
        data: null,
        error: { code: "rate_limited", message: "Too many searches. Please wait a moment and try again." },
      };
    }
    if (response.status === 504) {
      return { data: null, error: { code: "timeout", message: "The search took too long. Please try again." } };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        data: null,
        error: { code: "server_error", message: "Your session has expired. Please refresh the page." },
      };
    }
    if (response.status === 400) {
      return {
        data: null,
        error: { code: "invalid_input", message: "That search isn't valid. Try a different place name." },
      };
    }
    if (!response.ok) {
      return { data: null, error: { code: "server_error", message: "Unable to search right now. Please try again." } };
    }
    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: { code: "aborted", message: "" } };
    }
    // Same-origin relative fetch failing to even complete (not a non-2xx status,
    // an actual throw) means the browser couldn't reach our own server at all —
    // the practical signature of being offline. A raw DNS failure on Nominatim
    // itself can never surface here, because the client never talks to Nominatim
    // directly — only to this same-origin route.
    return {
      data: null,
      error: { code: "network", message: "You appear to be offline. Check your connection and try again." },
    };
  }
}

export async function searchLocation(
  query: string,
  signal?: AbortSignal,
): Promise<{ data: GeoSearchResult[] | null; error: GeoSearchError | null }> {
  const trimmed = query.replace(CONTROL_CHARS, "").trim();
  if (!trimmed) return { data: [], error: null };
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      data: null,
      error: { code: "invalid_input", message: `Search text is too long (max ${MAX_QUERY_LENGTH} characters).` },
    };
  }

  const coordinateResult = tryParseCoordinates(trimmed);
  if (coordinateResult) return { data: [coordinateResult], error: null };

  const { data, error } = await fetchGeocode({ type: "search", q: trimmed }, signal);
  if (error) return { data: null, error };
  const rawItems = Array.isArray(data) ? data : [];
  const validItems = rawItems.filter(isValidNominatimResult);
  return { data: validItems.map(toSearchResult), error: null };
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{ data: GeoSearchResult | null; error: GeoSearchError | null }> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { data: null, error: { code: "invalid_input", message: "Invalid coordinates." } };
  }
  const { data, error } = await fetchGeocode({ type: "reverse", lat: String(lat), lon: String(lng) }, signal);
  if (error) return { data: null, error };
  if (!isValidNominatimResult(data)) {
    return { data: null, error: { code: "not_found", message: "No address found for these coordinates." } };
  }
  return { data: toSearchResult(data), error: null };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `lib/geocoding.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/geocoding.ts
git commit -m "feat(web): add typed, response-validating Nominatim geocoding client"
```

---

### Task 5: `useLocationSearch` hook (debounce, client cache, abort, input validation)

**Files:**
- Create: `apps/web/hooks/useLocationSearch.ts`

**Interfaces:**
- Consumes: `searchLocation` from `@/lib/geocoding` (Task 4).
- Produces: `export function useLocationSearch(): { query: string; results: GeoSearchResult[]; loading: boolean; error: GeoSearchError | null; onQueryChange: (value: string) => void; setQuerySilently: (value: string) => void; }` — consumed by `geo-search.tsx` (Task 6).

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchLocation, type GeoSearchError, type GeoSearchResult } from "@/lib/geocoding";

const DEBOUNCE_MS = 400;
const MAX_QUERY_LENGTH = 200;

export interface UseLocationSearchResult {
  query: string;
  results: GeoSearchResult[];
  loading: boolean;
  error: GeoSearchError | null;
  onQueryChange: (value: string) => void;
  setQuerySilently: (value: string) => void;
}

export function useLocationSearch(): UseLocationSearchResult {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GeoSearchError | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, GeoSearchResult[]>>(new Map());

  // Cleanup on unmount: no dangling timer, no dangling in-flight request.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const cacheKey = trimmed.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    searchLocation(trimmed, controller.signal).then(({ data, error: searchError }) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (searchError) {
        if (searchError.code === "aborted") return;
        setError(searchError);
        setResults([]);
        return;
      }
      const safeData = data ?? [];
      cacheRef.current.set(cacheKey, safeData);
      setResults(safeData);
    });
  }, []);

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (!trimmed) {
        abortRef.current?.abort();
        setLoading(false);
        setError(null);
        setResults([]);
        return;
      }
      if (trimmed.length > MAX_QUERY_LENGTH) {
        // Reject immediately, no debounce wait, no wasted network round trip —
        // this can never be valid input, server-side validation would just
        // truncate/reject it a beat later at the cost of a spinner flash.
        abortRef.current?.abort();
        setLoading(false);
        setResults([]);
        setError({
          code: "invalid_input",
          message: `Search text is too long (max ${MAX_QUERY_LENGTH} characters).`,
        });
        return;
      }

      debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
    },
    [runSearch],
  );

  const setQuerySilently = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setLoading(false);
    setError(null);
    setResults([]);
    setQuery(value);
  }, []);

  return { query, results, loading, error, onQueryChange, setQuerySilently };
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `hooks/useLocationSearch.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/useLocationSearch.ts
git commit -m "feat(web): add useLocationSearch hook with debounce, cache, abort, length validation"
```

---

### Task 6: `GeoSearch` component (input + accessible dropdown + live region)

**Files:**
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/geo-search.tsx`

Colocated with its siblings (`geofence-map.tsx`, `flag-review-list.tsx`, `geofence-setup-client.tsx`) rather than a shared `components/` directory — matches this codebase's existing convention for every other geo-attendance-specific component.

**Interfaces:**
- Consumes: `useLocationSearch()` (Task 5), `GeoSearchResult` type (Task 4), `cn` from `@/lib/utils`, `toast` from `sonner`.
- Produces: `export function GeoSearch({ onSelect }: { onSelect: (result: GeoSearchResult) => void }): JSX.Element` — consumed by `geofence-setup-client.tsx` (Task 8).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { GeoSearchResult } from "@/lib/geocoding";

export function GeoSearch({ onSelect }: { onSelect: (result: GeoSearchResult) => void }) {
  const search = useLocationSearch();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    if (search.error?.code === "network") {
      toast.error(search.error.message);
    }
  }, [search.error]);

  function handleQueryChange(value: string) {
    search.onQueryChange(value);
    setHighlightedIndex(-1);
    setDropdownOpen(value.trim().length > 0);
  }

  function handleFocus() {
    if (search.query.trim().length > 0) setDropdownOpen(true);
  }

  function handleBlur() {
    setDropdownOpen(false);
    setHighlightedIndex(-1);
  }

  function handleSelect(result: GeoSearchResult) {
    onSelect(result);
    search.setQuerySilently(result.primaryName);
    setDropdownOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        return;
      }
      if (search.results.length === 0) return;
      setHighlightedIndex((i) => (i + 1) % search.results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        return;
      }
      if (search.results.length === 0) return;
      setHighlightedIndex((i) => (i - 1 + search.results.length) % search.results.length);
    } else if (e.key === "Enter") {
      if (dropdownOpen && highlightedIndex >= 0 && search.results[highlightedIndex]) {
        e.preventDefault();
        handleSelect(search.results[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      if (dropdownOpen) {
        e.preventDefault();
        setDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    }
    // Tab / Shift+Tab are intentionally not intercepted: native browser focus
    // movement away from the input is exactly the correct combobox behavior,
    // and dropdown options are never independently tabbable (role="option" is
    // reached via arrow keys while focus stays on the input) — the correct
    // ARIA combobox pattern, not a gap to fill in.
  }

  const trimmedQuery = search.query.trim();
  const showDropdown = dropdownOpen && trimmedQuery.length > 0;

  const statusText = search.loading
    ? "Searching…"
    : search.error
      ? search.error.message
      : trimmedQuery.length > 0
        ? search.results.length > 0
          ? `${search.results.length} result${search.results.length === 1 ? "" : "s"} found`
          : `No locations found for "${trimmedQuery}"`
        : "";

  return (
    <div className="relative flex-1">
      <div className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <input
          type="text"
          value={search.query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search or pick a campus"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        />
      </div>

      {/* Screen-reader-only announcer, always mounted (not conditionally removed)
          so assistive tech reliably picks up on text changes inside it. */}
      <div aria-live="polite" role="status" className="sr-only">
        {showDropdown ? statusText : ""}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-auto rounded-[13px] border bg-card p-1 shadow-lg"
        >
          {search.loading && <div className="px-2.5 py-2 text-xs text-muted-foreground">Searching…</div>}

          {!search.loading && search.error && search.error.code !== "network" && (
            <div className="px-2.5 py-2 text-xs text-destructive">{search.error.message}</div>
          )}

          {!search.loading && !search.error && search.results.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              No locations found for &ldquo;{trimmedQuery}&rdquo;.
            </div>
          )}

          {!search.loading &&
            search.results.map((result, index) => (
              <div
                key={result.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(result)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2",
                  index === highlightedIndex ? "bg-indigo-50" : "hover:bg-muted/50",
                )}
              >
                <div className="text-sm font-semibold text-foreground">{result.primaryName}</div>
                <div className="text-xs text-muted-foreground">
                  {[result.secondaryAddress, result.country].filter(Boolean).join(", ")}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

**Design notes:**
- Wrapping box keeps the exact classes the dead div had (`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground`, `flex-1` moved to the outer relative wrapper). Same height/padding/border/font-size as before.
- `focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50` is copied verbatim from `apps/web/components/ui/input.tsx:12`'s own focus style — reusing an existing token, not a new design decision.
- Dropdown reuses only classes already present in this file's siblings (`rounded-[13px]`, `border`, `bg-card`, `shadow-lg`, `text-muted-foreground`, `bg-indigo-50` — the same indigo already used for the selected-campus card).
- `onMouseDown` + `preventDefault()` on each option row is the standard technique so a click registers before the input's `onBlur` closes the dropdown — no `setTimeout` hack.
- Nominatim's real "no results" behavior is `200 OK` + empty array, never an actual `404` — modeled as `results.length === 0` with no error.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `geo-search.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(school)/admin/settings/geo-attendance/geo-search.tsx"
git commit -m "feat(web): add GeoSearch dropdown with keyboard nav and screen-reader live region"
```

---

### Task 7: Wire map panning (`GeofenceMap` flyTo)

**Files:**
- Modify: `apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx`

**Interfaces:**
- Consumes: `useMap` from `react-leaflet` (already a dependency; `useMapEvents` from the same package already imported in this file).
- Produces: new optional prop `flyToRequest?: { lat: number; lng: number } | null` on the default-exported component. Consumed by `geofence-setup-client.tsx` (Task 8). Every existing prop is unchanged in name, type, and behavior.

- [ ] **Step 1: Add `useEffect` to the React import**

Change line 3 from:

```tsx
import { useMemo, useState } from "react";
```

to:

```tsx
import { useEffect, useMemo, useState } from "react";
```

- [ ] **Step 2: Add `useMap` to the react-leaflet import**

Change line 4 from:

```tsx
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
```

to:

```tsx
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
```

- [ ] **Step 3: Add the `FlyToOnSelect` child component**

Insert immediately after the existing `ClickToDropPin` component:

```tsx
function FlyToOnSelect({ request }: { request: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!request) return;
    map.flyTo([request.lat, request.lng], map.getZoom(), { animate: true, duration: 1 });
  }, [request, map]);
  return null;
}
```

- [ ] **Step 4: Add the new prop to the interface**

```tsx
interface GeofenceMapProps {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (radiusM: number) => void;
  dropPinArmed: boolean;
  onPinDropped: () => void;
  flyToRequest?: { lat: number; lng: number } | null;
}
```

- [ ] **Step 5: Destructure the new prop and render `FlyToOnSelect`**

Change the default export's signature:

```tsx
export default function GeofenceMap({ centerLat, centerLng, radiusM, onCenterChange, onRadiusChange, dropPinArmed, onPinDropped, flyToRequest }: GeofenceMapProps) {
```

Then, inside `<MapContainer>`, add `<FlyToOnSelect .../>` right after `<ClickToDropPin ... />`:

```tsx
      <ClickToDropPin armed={dropPinArmed} onCenterChange={onCenterChange} onPinDropped={onPinDropped} />
      <FlyToOnSelect request={flyToRequest ?? null} />
      <Circle center={[centerLat, centerLng]} radius={radiusM} pathOptions={{ color: "#4F46E5", weight: 2, dashArray: "6 6", fillColor: "#4F46E5", fillOpacity: 0.12 }} />
```

Everything else (`Marker`, `Circle`, drag handlers, `ClickToDropPin`) is untouched.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `geofence-map.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx"
git commit -m "feat(web): add optional flyToRequest prop to pan the map on search selection"
```

---

### Task 8: Wire `GeoSearch` into the geofence page

**Files:**
- Modify: `apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx`

**Interfaces:**
- Consumes: `GeoSearch` (Task 6), `GeoSearchResult` type (Task 4), the `flyToRequest` prop on `GeofenceMap` (Task 7).

- [ ] **Step 1: Add imports**

After the existing `upsertGeofence, deleteGeofence, type GeofenceRow` import line:

```tsx
import { GeoSearch } from "./geo-search";
import type { GeoSearchResult } from "@/lib/geocoding";
```

- [ ] **Step 2: Add `flyToRequest` state**

After the existing `saving` state declaration:

```tsx
  const [flyToRequest, setFlyToRequest] = useState<{ lat: number; lng: number } | null>(null);
```

- [ ] **Step 3: Add the search-select handler**

After `cancelEdit`, before `saveDraft`:

```tsx
  function handleSearchSelect(result: GeoSearchResult) {
    setDraft((d) => (d ? { ...d, center_lat: result.lat, center_lng: result.lng } : d));
    setFlyToRequest({ lat: result.lat, lng: result.lng });
  }
```

This updates only `center_lat`/`center_lng` — `name` and `radius_m` are untouched, matching "search selection must not change campus name or radius." If `draft` is `null`, `setDraft` no-ops (stays `null`) — the same pre-existing no-op the "Drop pin" button already has in that state; no new disabled/guard logic introduced.

- [ ] **Step 4: Replace the dead search `<div>` and pass `flyToRequest` through**

Replace:

```tsx
          <div className="overflow-hidden rounded-[14px] border">
            <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {draft?.name ?? "Search or pick a campus"}
              </div>
              <Button
                type="button"
                variant={dropPinArmed ? "default" : "outline"}
                size="sm"
                onClick={() => setDropPinArmed((v) => !v)}
              >
                <Crosshair className="h-3.5 w-3.5" /> {dropPinArmed ? "Click the map…" : "Drop pin"}
              </Button>
            </div>

            {draft && (
              <GeofenceMap
                centerLat={draft.center_lat}
                centerLng={draft.center_lng}
                radiusM={draft.radius_m}
                onCenterChange={(lat, lng) => setDraft((d) => (d ? { ...d, center_lat: lat, center_lng: lng } : d))}
                onRadiusChange={(radiusM) => setDraft((d) => (d ? { ...d, radius_m: radiusM } : d))}
                dropPinArmed={dropPinArmed}
                onPinDropped={() => setDropPinArmed(false)}
              />
            )}
```

with:

```tsx
          <div className="overflow-hidden rounded-[14px] border">
            <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
              <GeoSearch onSelect={handleSearchSelect} />
              <Button
                type="button"
                variant={dropPinArmed ? "default" : "outline"}
                size="sm"
                onClick={() => setDropPinArmed((v) => !v)}
              >
                <Crosshair className="h-3.5 w-3.5" /> {dropPinArmed ? "Click the map…" : "Drop pin"}
              </Button>
            </div>

            {draft && (
              <GeofenceMap
                centerLat={draft.center_lat}
                centerLng={draft.center_lng}
                radiusM={draft.radius_m}
                onCenterChange={(lat, lng) => setDraft((d) => (d ? { ...d, center_lat: lat, center_lng: lng } : d))}
                onRadiusChange={(radiusM) => setDraft((d) => (d ? { ...d, radius_m: radiusM } : d))}
                dropPinArmed={dropPinArmed}
                onPinDropped={() => setDropPinArmed(false)}
                flyToRequest={flyToRequest}
              />
            )}
```

`MapPin` stays imported — still used by the sidebar campus-list badge icon elsewhere in this file.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors for `geofence-setup-client.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx"
git commit -m "feat(web): wire GeoSearch into geofence setup page (ERP-68)"
```

---

### Task 9: Senior-engineer self-review pass

No new files. This task verifies a specific list of claims already reasoned through during planning are actually true against the real diff, and fixes anything that isn't, before Task 10's QA.

**Files:** none created; any of the eight files above may be touched if a finding requires a fix.

- [ ] **Step 1: Run the review checklist against `git diff`**

Read the full diff for every file touched in Tasks 1-8 (`git diff` against the branch's base) and confirm each claim below. Any claim that does not hold is a finding — fix it, re-run `pnpm --filter @erp/web type-check`, and re-check before moving on.

1. **Architecture / SOLID:** `lib/rate-limit.ts` and `lib/geocode-cache.ts` each have exactly one responsibility (rate limiting; caching) and no dependency on each other or on `route.ts`'s specifics — both are generic and could be reused by any other route. `route.ts` orchestrates auth → authorization → rate limit → validation → cache → upstream fetch → log, in that order, with no step doing another step's job.
2. **Memory leaks:** `buckets` (Task 1) and `store` (Task 2) are both hard-capped (`MAX_TRACKED_KEYS`, `MAX_ENTRIES`) with eviction — confirm neither can grow unbounded under sustained traffic. The hook's `cacheRef`/`debounceRef`/`abortRef` (Task 5) are cleared in the `useEffect` cleanup on unmount — confirm no timer or controller can outlive the component.
3. **Performance:** confirm `onQueryChange`, `runSearch`, `setQuerySilently` in the hook are all `useCallback`-wrapped with correct, minimal dependency arrays (no stale closures, no missing deps that would cause `exhaustive-deps` warnings if this repo had ESLint configured).
4. **Security:** confirm `route.ts` never interpolates `err.message` or any upstream response body into a client-facing response — every error path returns a fixed string from a small closed set. Confirm the only params ever read from `request.nextUrl.searchParams` are `type`, `q`, `lat`, `lon` — nothing else is forwarded to Nominatim.
5. **Accessibility:** confirm `GeoSearch`'s `role="combobox"`/`aria-expanded`/`aria-activedescendant`/`aria-controls` stay in sync with actual `dropdownOpen`/`highlightedIndex` state on every code path that changes them (query change, focus, blur, Escape, selection).
6. **Concurrency / race conditions:** confirm the "Impact Analysis" claim above still holds after the real edits — search through `geofence-setup-client.tsx` for every call site of `setDraft` and confirm each is triggered by a synchronous user event handler, never inside a `.then()` callback or unguarded `useEffect`.
7. **Code duplication:** the burst+sustained rate-limit check in `route.ts` is a 2-line loop body over `[userKey, ipKey]`, not four hand-copied blocks — confirm it stayed that way. The status→message mapping in `fetchGeocode` should be a flat if-chain, not duplicated per caller (there's exactly one caller of `fetchGeocode`'s error shape logic: `searchLocation`/`reverseGeocode` both funnel through it).
8. **Naming / magic values:** `MAX_QUERY_LENGTH`, `TTL_MS`, `MAX_ENTRIES`, `BURST_LIMIT`, `SUSTAINED_LIMIT`, `REQUEST_TIMEOUT_MS`, `DEBOUNCE_MS` are all named constants, not inline numbers, at every place they're used.
9. **Folder structure:** `lib/rate-limit.ts`, `lib/geocode-cache.ts`, `lib/geocoding.ts` sit alongside the existing generic `lib/utils.ts`/`lib/csv-parser.ts` (correct — generic, not geo-attendance-specific... `geocoding.ts` and `geocode-cache.ts` and `rate-limit.ts` are geo-search-specific in current usage but written generically enough that placing them in `lib/` rather than nested under the route folder is consistent with this repo's existing pattern of `lib/geo-attendance.ts` also being domain-specific but top-level). `geo-search.tsx`, `geofence-map.tsx`, `geofence-setup-client.tsx` stay colocated under the route folder per existing convention.

- [ ] **Step 2: Type-check after any fixes**

Run: `pnpm --filter @erp/web type-check`
Expected: no errors.

- [ ] **Step 3: Commit (only if Step 1 produced fixes)**

```bash
git add -A
git commit -m "refactor(web): address self-review findings on geo search hardening"
```

If Step 1 found nothing to fix, skip this commit — do not create an empty commit.

---

### Task 10: Full QA, regression, responsive/browser matrix, observability, and database verification — evidence-based sign-off

No code changes. This produces the PASS/FAIL evidence table required before the work can be called done. Do not report the feature complete until this table is fully filled in with real evidence — no row may be marked PASS without an attached artifact (screenshot, network capture, log line, or DB query result).

**Files:** none.

- [ ] **Step 1: Production build gate**

Run: `pnpm --filter @erp/web build`
Expected: build succeeds, no TypeScript errors. (No ESLint config exists in this repo — see Global Constraints — so this build is the closest available proxy for "no ESLint issues"; note that explicitly in the sign-off rather than silently skipping the criterion.)

- [ ] **Step 2: Dead-code / debug-log sweep**

Run (from repo root):
```bash
grep -rn "console.log\|TODO\|FIXME" apps/web/lib/geocoding.ts apps/web/lib/rate-limit.ts apps/web/lib/geocode-cache.ts apps/web/hooks/useLocationSearch.ts "apps/web/app/(school)/admin/settings/geo-attendance/geo-search.tsx" "apps/web/app/api/geocode/route.ts"
```
Expected: no matches (the route's structured logging uses `console.info`/`console.warn` only, never `console.log`; there should be zero `TODO`/`FIXME`).

- [ ] **Step 3: Start the dev server**

Run: `pnpm --filter @erp/web dev` (background/separate terminal).
Expected: listening on port 3000.

- [ ] **Step 4: Functional + regression QA via the `webapp-testing` skill**

Using the `webapp-testing` skill (Playwright) against `http://localhost:3000` (or the configured local school subdomain, e.g. `school1.lvh.me:3000`, per `allowedDevOrigins` in `next.config.mjs`), logged in as a school admin or principal, navigate to Admin → Settings → Geo attendance and exercise every row of the table in Step 8. Capture a screenshot after each interaction, the network request/response for at least one search call (`GET /api/geocode?type=search...` → 200 JSON), and the resulting `center_lat`/`center_lng` persisted in `school_geofences` after pressing "Save geofence".

- [ ] **Step 5: Rate-limit verification**

With the dev server running and logged in, fire more than 5 searches within 2 seconds (e.g. type and clear a single character repeatedly, or script 6 rapid `fetch('/api/geocode?type=search&q=test')` calls from the browser console while authenticated). Expected: the 6th request within the burst window returns `429` with a `Retry-After` header, and the corresponding `search_rate_limited` log line appears in the dev server's terminal output.

- [ ] **Step 6: Server-cache verification**

Search the same query twice (e.g. "Pune", clear, "Pune" again, more than 400ms apart so both actually hit the network layer). Expected: the dev server terminal shows one `search_started`/`search_completed` (`cacheHit: false`) pair for the first search, and a `search_completed` with `cacheHit: true` and no `search_started` for the second — confirming the server cache is actually being consulted, not just present in code.

- [ ] **Step 7: Responsive + browser matrix**

Using Playwright (via the `webapp-testing` skill), load the geofence page at four viewport widths — 320px, 768px, 1024px, 1440px — on each of Chromium, Firefox, and WebKit (Playwright's three bundled engines; note in the evidence that this is the closest available stand-in for Chrome/Edge/Firefox/Safari in this Windows dev environment — real Safari is not installable here). At each combination, confirm: the search dropdown opens below the input without clipping off-screen or overlapping the "Drop pin" button, and no existing spacing/layout shifts versus the pre-change screenshot from the original plan.

- [ ] **Step 8: Fill in the sign-off table**

| # | Acceptance criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | Search "Pune" returns results | | screenshot + network |
| 2 | Search "IIT Bombay" returns results | | screenshot + network |
| 3 | Search "MIT WPU" returns results | | screenshot + network |
| 4 | Search "18.5204,73.8567" resolves directly (coordinate short-circuit, no network call) | | screenshot + network tab showing no `/api/geocode` request |
| 5 | Invalid/garbage search shows "No locations found" | | screenshot |
| 6 | Query >200 characters is rejected client-side, no network call | | screenshot + network tab |
| 7 | Offline (DevTools "Offline" throttling) shows a toast, does not crash | | screenshot |
| 8 | Selecting a result: map flies, marker moves, lat/lng fields update, radius unchanged | | before/after screenshots |
| 9 | Selecting a result does NOT save to Supabase until "Save geofence" is pressed | | Supabase row timestamp unchanged until save |
| 10 | Marker drag still updates lat/lng/circle | | screenshot |
| 11 | Manual latitude edit still moves marker | | screenshot |
| 12 | Manual longitude edit still moves marker | | screenshot |
| 13 | Radius slider still works, unaffected by search | | screenshot |
| 14 | "Save geofence" persists to Supabase (existing flow, untouched); Save button disables while saving (pre-existing) | | Supabase row updated + screenshot of disabled state |
| 15 | Delete campus still works | | screenshot |
| 16 | Campus CRUD (add/select campus) still works | | screenshot |
| 17 | Keyboard nav: Tab, Shift+Tab, ArrowDown/Up, Enter, Escape all work | | screen recording or step-by-step screenshots |
| 18 | Screen-reader live region announces "Searching…" / "N results found" / "No locations found" | | accessibility tree snapshot (Playwright `accessibility.snapshot()` or DevTools) |
| 19 | Rate limiting: 6th rapid request returns 429 with Retry-After | | network + server log |
| 20 | Server cache: repeat search shows `cacheHit: true` server-side | | server log |
| 21 | Client cache: repeat search within the same session shows no second network call | | network tab |
| 22 | Responsive: dropdown positions correctly at 320/768/1024/1440px | | 4 screenshots |
| 23 | Cross-engine: Chromium, Firefox, WebKit all render/function correctly | | 3 screenshots + notes |
| 24 | No new TypeScript errors (`pnpm --filter @erp/web type-check`) | | terminal output |
| 25 | Production build succeeds (`pnpm --filter @erp/web build`) | | terminal output |
| 26 | No `console.log`/`TODO`/`FIXME` in new files | | grep output (Step 2) |
| 27 | Database: only `school_geofences` is written, only by Save, no schema change | | `git diff` on `supabase/migrations` (empty) + Supabase row diff |
| 28 | No visual/spacing/typography change to anything outside the search box itself | | side-by-side screenshot vs. pre-change |

If any row lacks real evidence, that row is FAIL and the overall status stays **IN PROGRESS**.

- [ ] **Step 9: Stop the dev server**

Return to the terminal running `pnpm --filter @erp/web dev` and stop it (Ctrl+C).

---

## Self-Review

- **Spec coverage:** every numbered section of the production-hardening spec maps to a concrete task — impact analysis (Production Impact Analysis section, before Task 1), zero-regression (Impact Analysis section + Task 8/9 notes), server hardening (Task 3: timeout, abort, status mapping, auth, authorization, input validation, sanitization, logging, error classification, documented no-retry rationale), rate limiting (Tasks 1 + 3), server cache (Tasks 2 + 3), client cache (Task 5, pre-existing), input validation (Tasks 3 + 4 + 5), data validation (Task 4's `isValidNominatimResult`), save safety (documented as pre-existing/untouched in Impact Analysis), conflict handling (documented as structurally guaranteed in Impact Analysis), error handling (Task 4's status→message mapping), observability (Task 3 logging, verified in Task 10 Steps 5-6), accessibility (Task 6's ARIA + live region, verified in Task 10 Step 7/row 18), performance (debounce/cache/abort/useCallback throughout, verified no leaks in Task 9), security (Task 3's sanitization/auth/no-error-leak, reviewed in Task 9), responsive/browser QA (Task 10 Step 7), build quality (Task 10 Steps 1-2), database verification (Task 10 row 27), regression matrix (Task 10 rows 10-16), final QA evidence (Task 10's table), final code review (Task 9), final production checklist (every item maps to a Task 10 row or an earlier task's explicit verification step).
- **Placeholder scan:** no TBD/TODO/"add appropriate error handling"-style steps anywhere — every step has complete code or an exact command with expected output; Task 9's checklist items are concrete, checkable claims (not "look for issues"), each tied to the specific code that makes the claim true.
- **Type consistency:** `GeoSearchResult` (Task 4) is used with identical field names (`id`, `primaryName`, `secondaryAddress`, `country`, `lat`, `lng`) across `useLocationSearch` (Task 5), `GeoSearch` (Task 6), and `handleSearchSelect` (Task 8). `GeoSearchErrorCode`'s seven values (Task 4) are each handled or explicitly passed through in `fetchGeocode`'s status mapping and `GeoSearch`'s error-rendering branch (only `"network"` is special-cased for the toast; all others render inline via `error.message`, which every code path sets to a non-empty, appropriate string except `"aborted"`, which is filtered out before it ever reaches component state). `flyToRequest: { lat: number; lng: number } | null` matches between `GeofenceMap`'s prop (Task 7) and the state/prop passed in `geofence-setup-client.tsx` (Task 8). `checkRateLimit`'s signature (Task 1) matches its two call sites in `route.ts` (Task 3). `getCached`/`setCached`/`normalizeCacheKey` (Task 2) match their call sites in `route.ts` (Task 3).

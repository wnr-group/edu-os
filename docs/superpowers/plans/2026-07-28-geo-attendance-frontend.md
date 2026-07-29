# Geo Attendance Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client surfaces for geo-tagged attendance — a mobile GPS advisory chip + geo-aware submit on the teacher attendance screen, the matching web marking-form switch, and a web admin console (campus geofence setup with a Leaflet map, and a flag-review inbox for off-campus/no-GPS submissions) — pixel-matched to the approved mockups (mobile: `[sectionId].tsx` on-campus/off-campus screens; web: `stitch-designs/eduos-v2/geo-attendance-web.html`).

**Architecture:** Seven tasks across two apps. Mobile (`apps/mobile`): a new `lib/location.ts` (lazy `expo-location` import + permission handling, mirroring `lib/notifications.ts`) backs a read-only advisory chip on screen-open and a real GPS fix at submit-time that replaces the current inline `.upsert()` with `supabase.rpc('mark_attendance', ...)`. Web (`apps/web`): the existing teacher marking form switches to the same RPC; a new `/admin/settings/geo-attendance` page (Leaflet + OpenStreetMap, no API key) gives `school_admin`/`super_admin` CRUD over `school_geofences`; a shared `FlagReviewList` component (reused by a new `/principal/attendance/geo-review` page) lists flagged submissions for review; a small nav-badge feature surfaces the unreviewed count. All reads/writes ride on RLS already shipped by the backend plan — no new migrations, except verifying a currently-missing prerequisite (see Global Constraints).

**Tech Stack:** Expo SDK ~55 / React Native 0.83 (`apps/mobile`), Next.js 16 / React 19 / Tailwind (`apps/web`), `expo-location` (new mobile dep), `leaflet` + `react-leaflet` (new web deps, OpenStreetMap tiles, no API key). No JS/RN test runner exists in this repo (`apps/mobile/package.json` and `apps/web/package.json` have no jest/vitest/playwright devDependency) — verification is `pnpm --filter @erp/mobile type-check` / `pnpm --filter @erp/web type-check` (both run `tsc --noEmit`) plus documented manual steps, the same convention the sibling backend plan uses for SQL (`docs/superpowers/plans/2026-07-28-geo-attendance-backend.md`).

## Global Constraints

- **Hard blocker, verified 2026-07-28 — `mark_attendance` RPC does not exist yet.** `grep -rn "CREATE OR REPLACE FUNCTION public.mark_attendance" supabase/migrations` returns nothing; the migrations directory ends at `20240001000064_haversine.sql`. The backend plan's Task 3 (which creates it) is itself blocked on `public.feature_enabled(uuid,text)` (a separate ticket, F1/ERP-60), which also does not exist yet (`grep -rn "CREATE OR REPLACE FUNCTION public.feature_enabled" supabase/migrations` — no match). **Do not fabricate either function here** — they belong to other tickets. Task 2 (mobile submit) and Task 3 (web marking switch) each start with a verify-and-stop step that greps for `mark_attendance` and halts if missing, instructing the executor to complete `docs/superpowers/plans/2026-07-28-geo-attendance-backend.md` Task 3 first. Tasks 1, 4, 5, 6, 7 do **not** depend on `mark_attendance` and are fully buildable/testable today.
- **Pixel-match scope is bounded to the NEW geo elements**, not a redesign of screens that already exist in a different visual style. The mobile mockups' roster rows (segmented P/A/L buttons), section dropdown, and "34 students" counter are **not** how `[sectionId].tsx` is built today (it uses tap-to-cycle `StatusBadge` chips, no section dropdown — that lives in the app shell's `SectionSwitcher`). The ticket's own scope bullets ask only for the advisory chip, the submit-time RPC switch, and the off-campus banner/button — so only those new elements are pixel-matched; the existing roster/session UI is left as-is. This mirrors CLAUDE.md's "do what has been asked; nothing more, nothing less."
- **Design tokens are lifted verbatim from `stitch-designs/eduos-v2/geo-attendance-web.html`** (confirmed to be the source the provided screenshots were rendered from): good/verified `#10B981` (ink `#0B7A55`, weak bg `#E7F7F0`), warn/flagged `#F59E0B` (ink `#9A6408`, weak bg `#FDF3E2`), accent `#4F46E5` (== Tailwind `indigo-600`, already the codebase's convention for primary actions in `fee-types-client.tsx`/`discipline-table.tsx`). Mobile `theme.success`/`theme.warning` (`apps/mobile/lib/theme.tsx`) already equal `#10B981`/`#F59E0B` — reused directly for icons/accents; the pastel weak backgrounds and ink tones are the mockup's exact hex values (not derivable from `theme`), applied as literal colors.
- **The "Feature: ON" pill on the geofence setup page is read-only** — sourced from `schools.features_enabled->>'attendance_geo'` (column already exists, migration `20240001000001_tenancy.sql:9`). The toggle control itself belongs to the F1 super-admin console (separate ticket, ERP-59/61) — not built here.
- **No new migrations or RLS in this plan.** `school_geofences` (read: same-school authenticated; write: `school_admin`/`super_admin`) and `attendance_records` geo columns + the existing `attendance_write` policy (covers `super_admin`, `school_admin`/`principal` same-school, or an assigned teacher) already cover every read/write this plan needs, including "mark reviewed" (`geo_reviewed_at`/`geo_reviewed_by`), which principal and school_admin can already write via `attendance_write`.
- **A "submission" in the flag-review UI is a group, not a row.** `mark_attendance` inserts one `attendance_records` row **per student** but stamps the **same** geo verdict across every student in one submit (proven by the backend RPC test, Phase 5: "multi-record submit shares one geo stamp"). A class of 34 marked off-campus produces 34 identical-geo rows. The mockup's flag list shows one row per (teacher, section, date, session) **event**, so Task 5's query groups client-side by `section_id|date|session` and "Mark reviewed" updates every row in that group at once (`.update(...).in('id', recordIds)`), otherwise the group would never fully clear.
- **The ticket text mentions a "map dot" per flag-review row; the actual mockup does not have one.** `stitch-designs/eduos-v2/geo-attendance-web.html`'s `.frow` markup (the file the provided screenshots were rendered from) has no per-row map element — just the avatar block, teacher/class/session/date text, the distance/accuracy fact line, and the review button. Task 5 matches the mockup file exactly (the higher-fidelity, unambiguous reference) rather than adding a UI element neither screenshot shows. If a later ticket wants a per-row mini-map, it slots into the `fwho`/`fact` area in `flag-review-list.tsx` without other changes.
- **Leaflet has no built-in draggable-radius handle.** Task 4 implements it as a second draggable `Marker` placed at the geodesic point `radius_m` metres due east of centre (`destinationPoint`, standard direct-geodesic formula); its `dragend` recomputes `radius_m` via the same Haversine formula the backend uses (`_haversine_m`, migration `20240001000064_haversine.sql`), reimplemented in JS on both mobile (`apps/mobile/lib/location.ts`) and web (`apps/web/lib/geo-attendance.ts`) since neither client can call a Postgres function for client-side-only advisory math.

---

## File Structure

- `apps/mobile/package.json` — Task 1 (add `expo-location`)
- `apps/mobile/lib/location.ts` — Task 1 (new — permission/position helpers, Haversine, advisory compute)
- `apps/mobile/components/GeoAdvisoryChip.tsx` — Task 1 (new — on-open banner)
- `apps/mobile/app/(teacher)/attendance/[sectionId].tsx` — Task 1 (advisory wiring), Task 2 (submit switch + off-campus UI)
- `apps/mobile/components/PrimaryButton.tsx` — Task 2 (add optional `color` prop)
- `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx` — Task 3
- `apps/web/package.json` — Task 4 (add `leaflet`, `react-leaflet`, `@types/leaflet`)
- `apps/web/lib/geo-attendance.ts` — Task 4 (new — shared types + data helpers), Task 5 (extends with flag helpers), Task 7 (extends with count helper)
- `apps/web/app/(school)/admin/settings/geo-attendance/page.tsx` — Task 4 (new), Task 5 (extends)
- `apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx` — Task 4 (new)
- `apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx` — Task 4 (new)
- `apps/web/app/(school)/admin/settings/geo-attendance/geo-attendance-tabs.tsx` — Task 5 (new)
- `apps/web/app/(school)/admin/settings/geo-attendance/flag-review-list.tsx` — Task 5 (new)
- `apps/web/app/(school)/principal/attendance/geo-review/page.tsx` — Task 6 (new)
- `apps/web/lib/nav-config.ts` — Task 6 (add principal item), Task 7 (add `badge` field + admin item)
- `apps/web/components/top-bar.tsx` — Task 7 (render badge)
- `apps/web/components/mobile-nav.tsx` — Task 7 (render badge)
- `apps/web/app/(school)/layout.tsx` — Task 7 (compute + inject badge count)

---

### Task 1: Mobile — `expo-location` + advisory chip (read-only, on screen-open)

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/lib/location.ts`
- Create: `apps/mobile/components/GeoAdvisoryChip.tsx`
- Modify: `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`

**Interfaces:**
- Consumes: `apps/mobile/lib/supabase.ts` (`supabase` client), `apps/mobile/lib/teacherContext.tsx` (`schoolId`).
- Produces: `haversineMeters(lat1,lng1,lat2,lng2): number`, `type GeofenceRow = {id,name,center_lat,center_lng,radius_m}`, `type Advisory = {status:"inside"|"outside"|"neutral", geofenceName:string|null, distanceM:number|null, accuracyM:number|null}`, `computeAdvisory(lat,lng,accuracyM,geofences): Advisory`, `getActiveGeofences(supabase,schoolId): Promise<GeofenceRow[]>`, `getAdvisoryPosition(): Promise<{lat,lng,accuracy}|null>`, `getSubmitPosition(): Promise<{lat,lng,accuracy}|null>`, `formatDistanceM(m:number):string` — all from `lib/location.ts`, consumed by Task 2 and `GeoAdvisoryChip`.

- [ ] **Step 1: Add the `expo-location` dependency**

```json
```

Edit `apps/mobile/package.json`, adding this line into `dependencies` alphabetically (after `expo-linking`, before `expo-notifications`):

```json
    "expo-linking": "~55.0.15",
    "expo-location": "~55.0.10",
    "expo-notifications": "~55.0.23",
```

Run: `pnpm install`
Expected: lockfile updates, no errors; `pnpm --filter @erp/mobile type-check` still exits 0 (nothing imports it yet).

- [ ] **Step 2: Write `lib/location.ts`**

```ts
// apps/mobile/lib/location.ts
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { SupabaseClient } from "@supabase/supabase-js";

const isExpoGo = Constants.appOwnership === "expo";

export interface GeofenceRow {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
}

export type AdvisoryStatus = "inside" | "outside" | "neutral";

export interface Advisory {
  status: AdvisoryStatus;
  geofenceName: string | null;
  /** Metres from centre when inside; metres past the fence edge when outside. */
  distanceM: number | null;
  accuracyM: number | null;
}

export interface DevicePosition {
  lat: number;
  lng: number;
  accuracy: number | null;
}

/** Point-to-point great-circle distance in metres. Mirrors public._haversine_m (migration 20240001000064). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function formatDistanceM(m: number): string {
  const abs = Math.abs(m);
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)} km` : `${Math.round(abs)} m`;
}

/**
 * Client-side-only advisory verdict — never written anywhere. Nearest active
 * geofence wins; "inside" if within its radius, else "outside". No
 * geofences configured, or no position yet, yields "neutral" (chip hidden).
 */
export function computeAdvisory(
  lat: number | null,
  lng: number | null,
  accuracyM: number | null,
  geofences: GeofenceRow[],
): Advisory {
  if (lat == null || lng == null || geofences.length === 0) {
    return { status: "neutral", geofenceName: null, distanceM: null, accuracyM };
  }
  let nearest: GeofenceRow | null = null;
  let nearestDist = Infinity;
  for (const g of geofences) {
    const d = haversineMeters(lat, lng, g.center_lat, g.center_lng);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = g;
    }
  }
  if (!nearest) return { status: "neutral", geofenceName: null, distanceM: null, accuracyM };
  if (nearestDist <= nearest.radius_m) {
    return { status: "inside", geofenceName: nearest.name, distanceM: nearestDist, accuracyM };
  }
  return { status: "outside", geofenceName: nearest.name, distanceM: nearestDist - nearest.radius_m, accuracyM };
}

export async function getActiveGeofences(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<GeofenceRow[]> {
  const { data } = await supabase
    .from("school_geofences")
    .select("id, name, center_lat, center_lng, radius_m")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  return (data ?? []) as GeofenceRow[];
}

/**
 * Cached, no active fix — near-zero battery cost. Never prompts for
 * permission; if it isn't already granted, returns null (chip stays hidden).
 * Mirrors the lazy-import + permission pattern in lib/notifications.ts:13,24.
 */
export async function getAdvisoryPosition(): Promise<DevicePosition | null> {
  if (Platform.OS === "web" || isExpoGo) return null;
  try {
    const Location = await import("expo-location");
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos) return null;
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}

/**
 * Active fix at submit time. Requests permission if not already granted.
 * Denied / unavailable → null (caller submits with null coords, never blocks).
 */
export async function getSubmitPosition(): Promise<DevicePosition | null> {
  if (Platform.OS === "web" || isExpoGo) return null;
  try {
    const Location = await import("expo-location");
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run type-check**

Run: `pnpm --filter @erp/mobile type-check`
Expected: exits 0, no errors.

- [ ] **Step 4: Write `components/GeoAdvisoryChip.tsx` (with prefers-reduced-motion support for WCAG AAA)**

```tsx
// apps/mobile/components/GeoAdvisoryChip.tsx
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Advisory } from "../lib/location";
import { formatDistanceM } from "../lib/location";

// Exact hex values from stitch-designs/eduos-v2/geo-attendance-web.html
// (--good/--good-weak, --warn/--warn-weak) — not derivable from theme.tsx,
// which only carries the flat accent colors, not these pastel/ink pairs.
const GOOD_BG = "#E7F7F0";
const GOOD_INK = "#0B7A55";
const GOOD_ACCENT = "#10B981";
const WARN_BG = "#FDF3E2";
const WARN_INK = "#9A6408";
const WARN_ACCENT = "#F59E0B";

export function GeoAdvisoryChip({ advisory }: { advisory: Advisory | null }) {
  if (!advisory || advisory.status === "neutral") return null;

  const isInside = advisory.status === "inside";
  const bg = isInside ? GOOD_BG : WARN_BG;
  const ink = isInside ? GOOD_INK : WARN_INK;
  const accent = isInside ? GOOD_ACCENT : WARN_ACCENT;
  const distance = formatDistanceM(advisory.distanceM ?? 0);
  const accuracySuffix = advisory.accuracyM != null ? ` · GPS ±${Math.round(advisory.accuracyM)}m` : "";

  const title = isInside ? `On campus · ${advisory.geofenceName}` : `Off campus · ${distance} away`;
  const subtitle = isInside ? `${distance} from centre${accuracySuffix}` : `Outside all geofences${accuracySuffix}`;
  const pillLabel = isInside ? "VERIFIED" : "FLAGGED";

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: bg, borderRadius: 14, padding: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={isInside ? "location" : "warning"} size={17} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: "Inter_700Bold", color: ink }}>{title}</Text>
        <Text style={{ fontSize: 11.5, fontFamily: "Inter_400Regular", color: ink, opacity: 0.75, marginTop: 1 }}>
          {subtitle}
        </Text>
      </View>
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: ink, letterSpacing: 0.3 }}>{pillLabel}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Wire the chip into `[sectionId].tsx`**

Edit `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`. Add imports (after the existing `sendAbsenceNotification` import at line 19):

```tsx
import { sendAbsenceNotification } from "../../../lib/notifications";
import { getActiveGeofences, getAdvisoryPosition, computeAdvisory } from "../../../lib/location";
import type { Advisory } from "../../../lib/location";
import { GeoAdvisoryChip } from "../../../components/GeoAdvisoryChip";
```

Add state (after the existing `notifying` state at line 38):

```tsx
  const [notifying, setNotifying] = useState<Record<string, boolean>>({});
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
```

Add an effect that resolves the advisory once `schoolId` is known (after the existing `load` effect at line 56):

```tsx
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    (async () => {
      const [geofences, position] = await Promise.all([
        getActiveGeofences(supabase, schoolId),
        getAdvisoryPosition(),
      ]);
      if (cancelled) return;
      setAdvisory(computeAdvisory(position?.lat ?? null, position?.lng ?? null, position?.accuracy ?? null, geofences));
    })();
    return () => { cancelled = true; };
  }, [schoolId]);
```

Render the chip right after the header block's marked/date row and before `<SessionSelector>` (insert between the closing `</View>` of the "Marked"/date row at line 173 and the `<SessionSelector .../>` line 174):

```tsx
          </View>
          <GeoAdvisoryChip advisory={advisory} />
          <SessionSelector value={session} onChange={setSession} disabled={disabled} />
```

- [ ] **Step 6: Run type-check**

Run: `pnpm --filter @erp/mobile type-check`
Expected: exits 0, no errors.

- [ ] **Step 7: Manual verification (no test runner in this repo for RN)**

Run: `pnpm --filter @erp/mobile dev` (Expo dev build or device with location permission already granted for the school's coordinates), open the teacher attendance screen for a section whose school has an active `school_geofences` row.
Expected:
- Standing inside the configured radius → green chip reading "On campus · {geofence name}" / "{N} m from centre · GPS ±{N}m" / "VERIFIED" pill.
- Standing outside → amber chip reading "Off campus · {N} {m/km} away" / "Outside all geofences · GPS ±{N}m" / "FLAGGED" pill.
- School with zero `school_geofences` rows, or location permission not yet granted → no chip renders (screen looks exactly as it does today).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/package.json apps/mobile/lib/location.ts apps/mobile/components/GeoAdvisoryChip.tsx "apps/mobile/app/(teacher)/attendance/[sectionId].tsx"
git commit -m "feat(mobile): add geo advisory chip on attendance screen open"
```

---

### Task 2: Mobile — submit-time GPS capture, `mark_attendance` switch, off-campus banner

**Files:**
- Modify: `apps/mobile/components/PrimaryButton.tsx`
- Modify: `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`

**Interfaces:**
- Consumes: `getSubmitPosition()` (Task 1), `Advisory` (Task 1), `public.mark_attendance(...)` RPC (backend plan Task 3 — verified in Step 1).
- Produces: nothing consumed later in this plan.

- [ ] **Step 1: Verify the prerequisite exists — do not proceed if it doesn't**

Run: `grep -rn "CREATE OR REPLACE FUNCTION public.mark_attendance" supabase/migrations`

Expected: at least one match. **If there is no match, stop here** — complete Task 3 of `docs/superpowers/plans/2026-07-28-geo-attendance-backend.md` first (which itself is blocked on `feature_enabled()`, a separate ticket). Do not write `mark_attendance` yourself in this plan.

- [ ] **Step 2: Add a `color` override to `PrimaryButton`**

Read `apps/mobile/components/PrimaryButton.tsx` (already read in Task 1's context) — it hardcodes `theme.primary`. The off-campus submit button needs an amber override without duplicating the whole component.

```tsx
// apps/mobile/components/PrimaryButton.tsx
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from "react-native";
import { useTheme } from "../lib/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Overrides theme.primary — used for the amber off-campus submit state. */
  color?: string;
}

export function PrimaryButton({ label, onPress, loading, compact, disabled, style, color }: PrimaryButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        {
          backgroundColor: disabled ? theme.textMuted : color ?? theme.primary,
          borderRadius: 12,
          paddingVertical: compact ? 10 : 16,
          paddingHorizontal: compact ? 20 : 24,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator color="#fff" size="small" />}
      <Text style={{ fontSize: compact ? 13 : 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 3: Replace the inline `.upsert()` with the RPC in `[sectionId].tsx`**

Add the import (alongside Task 1's `lib/location` import):

```tsx
import { getActiveGeofences, getAdvisoryPosition, getSubmitPosition, computeAdvisory } from "../../../lib/location";
```

Replace the existing `submit()` function (lines 89–115):

```tsx
  async function submit() {
    if (!userId || !schoolId) return;
    // Only save students that have an explicit status; leave the rest unmarked.
    const records = rows
      .filter((r) => statuses[r.studentId] != null)
      .map((r) => ({
        student_id: r.studentId,
        status: statuses[r.studentId] as AttendanceStatus,
      }));
    if (records.length === 0) {
      Alert.alert("Nothing to save", "Mark at least one student first.");
      return;
    }
    setSaving(true);
    const position = await getSubmitPosition();
    const { error } = await supabase.rpc("mark_attendance", {
      p_section_id: sectionId,
      p_session: session,
      p_date: date,
      p_records: records,
      p_lat: position?.lat ?? null,
      p_lng: position?.lng ?? null,
      p_accuracy: position?.accuracy ?? null,
      p_geo_source: "device",
    });
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    await load(); // refresh so recordIds + send icons appear
    Alert.alert("Saved", `Attendance recorded for ${records.length} students.`);
  }
```

- [ ] **Step 4: Off-campus banner + amber submit button**

Replace the bottom action-bar block (lines 238–242):

```tsx
        {!loading && rows.length > 0 && (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border, gap: 10 }}>
            {advisory?.status === "outside" && (
              <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#FDF3E2", borderRadius: 12, borderWidth: 1, borderColor: "#F5D9A8", borderStyle: "dashed", padding: 11 }}>
                <Ionicons name="warning-outline" size={16} color="#9A6408" style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 11.5, fontFamily: "Inter_400Regular", color: "#9A6408", lineHeight: 16 }}>
                  {"You're outside the campus geofence. Marking still works — this submission is tagged “off-campus”."}
                </Text>
              </View>
            )}
            <PrimaryButton
              label={advisory?.status === "outside" ? "Submit (off-campus)" : marked ? "Update Attendance" : `Submit · ${markedCount}/${rows.length} marked`}
              onPress={submit}
              loading={saving}
              color={advisory?.status === "outside" ? "#F59E0B" : undefined}
            />
            {advisory?.status === "outside" && (
              <Text style={{ textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
                Saved &amp; flagged · principal can review later
              </Text>
            )}
          </View>
        )}
```

- [ ] **Step 5: Run type-check**

Run: `pnpm --filter @erp/mobile type-check`
Expected: exits 0, no errors.

- [ ] **Step 6: Manual verification**

Run the app (as in Task 1 Step 7).
Expected:
- On-campus: submit button stays indigo, label reads `Submit · N/M marked` (or `Update Attendance`), no banner, no caption.
- Off-campus: amber dashed note appears above the button; button turns amber and reads "Submit (off-campus)"; caption "Saved & flagged · principal can review later" appears below; tapping it succeeds (no block) and the row's `attendance_records.geo_status` becomes `outside` (verify via `npx supabase db query --local` or the Task 5 flag-review page once built).
- Location permission denied at submit time: submit still succeeds (`no_gps`), no crash, no block.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/components/PrimaryButton.tsx "apps/mobile/app/(teacher)/attendance/[sectionId].tsx"
git commit -m "feat(mobile): capture GPS at submit and switch to mark_attendance RPC"
```

---

### Task 3: Web — marking form switches to `mark_attendance`

**Files:**
- Modify: `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx`

**Interfaces:**
- Consumes: `public.mark_attendance(...)` RPC (backend plan Task 3 — verified in Step 1).
- Produces: nothing consumed later in this plan.

- [ ] **Step 1: Verify the prerequisite exists — do not proceed if it doesn't**

Run: `grep -rn "CREATE OR REPLACE FUNCTION public.mark_attendance" supabase/migrations`

Expected: at least one match. **If there is no match, stop here** (same blocker as Task 2 Step 1).

- [ ] **Step 2: Replace `.upsert()` with the RPC**

Edit `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx`. `schoolId`/`markedBy` are no longer needed client-side — `mark_attendance` resolves `school_id` from the section server-side and `marked_by` from `auth.uid()`.

```tsx
export function AttendanceMarkForm({
  students,
  sectionId,
  date,
  session,
}: {
  students: StudentRow[];
  sectionId: string;
  date: string;
  session: AttendanceSession;
}) {
```

Replace `handleSave` (lines 64–92):

```tsx
  async function handleSave() {
    setError(null);
    setSaving(true);
    const supabase = createClient();

    const records = students.map((s) => ({
      student_id: s.id,
      status: statuses[s.id] ?? "present",
    }));

    const { error: err } = await supabase.rpc("mark_attendance", {
      p_section_id: sectionId,
      p_session: session,
      p_date: date,
      p_records: records,
      p_geo_source: "web",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      toast.error("Failed to save attendance.");
      return;
    }
    toast.success("Attendance saved successfully.");
    router.push(`/teacher/attendance`);
    router.refresh();
  }
```

- [ ] **Step 3: Update the caller**

Edit `apps/web/app/(school)/teacher/attendance/mark/page.tsx` — remove the now-unused `schoolId`/`markedBy` props (lines 128–137):

```tsx
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <AttendanceMarkForm
          students={studentRows}
          sectionId={sectionId}
          date={date}
          session={session}
        />
      </div>
```

The `schoolId`/`user` lookups earlier in `page.tsx` (lines 29–30) are now unused — remove them too:

```tsx
  const supabase = await createServerSupabaseClient();

  const { data: sectionRow } = await supabase
```

- [ ] **Step 4: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors (confirms no other caller still passes `schoolId`/`markedBy`).

- [ ] **Step 5: Manual verification**

Run: `pnpm --filter @erp/web dev`, sign in as a teacher, open `/teacher/attendance/mark?sectionId=...&date=...`, mark a few students, save.
Expected: toast "Attendance saved successfully.", redirect to `/teacher/attendance`; the new rows in `attendance_records` have `geo_status = 'not_captured'` (web source, no coords) rather than the old rows with no geo columns at all.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx apps/web/app/(school)/teacher/attendance/mark/page.tsx
git commit -m "feat(web): switch teacher attendance marking to mark_attendance RPC"
```

---

### Task 4: Web — geofence setup page (Leaflet + OSM, campus CRUD)

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/lib/geo-attendance.ts`
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx`
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx`
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/page.tsx`

**Interfaces:**
- Consumes: `apps/web/lib/supabase/index.ts` (`createClient`), `apps/web/lib/supabase/server.ts` (`createServerSupabaseClient`), `apps/web/lib/school.ts` (`getSchoolId`).
- Produces (from `lib/geo-attendance.ts`): `type GeofenceRow = {id,school_id,name,center_lat,center_lng,radius_m,is_active,created_at}`, `haversineMeters(...)`, `destinationPoint(lat,lng,distanceM,bearingDeg)`, `formatDistanceM(m)`, `fetchAllGeofences(supabase,schoolId): Promise<GeofenceRow[]>`, `upsertGeofence(supabase, row): Promise<{data,error}>`, `deleteGeofence(supabase,id): Promise<{error}>`. Task 5 extends this same file with flag helpers; Task 7 extends it with a count helper.

- [ ] **Step 1: Add Leaflet dependencies**

Edit `apps/web/package.json`:

```json
    "js-cookie": "^3.0.8",
    "leaflet": "^1.9.4",
    "lucide-react": "^1.8.0",
```

and in `devDependencies`:

```json
    "@types/js-cookie": "^3.0.6",
    "@types/leaflet": "^1.9.14",
    "@types/node": "^22.10.1",
```

and add `react-leaflet` to `dependencies`:

```json
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-leaflet": "^5.0.0",
    "razorpay": "^2.9.6",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Write `lib/geo-attendance.ts`**

```ts
// apps/web/lib/geo-attendance.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GeofenceRow {
  id: string;
  school_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  is_active: boolean;
  created_at: string;
}

/** Point-to-point great-circle distance in metres. Mirrors public._haversine_m. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Direct geodesic: the point `distanceM` metres from (lat,lng) at `bearingDeg` (0 = north, 90 = east). */
export function destinationPoint(lat: number, lng: number, distanceM: number, bearingDeg: number): { lat: number; lng: number } {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) + Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceM / R) * Math.cos(lat1),
      Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function formatDistanceM(m: number): string {
  const abs = Math.abs(m);
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)} km` : `${Math.round(abs)} m`;
}

export async function fetchAllGeofences(supabase: SupabaseClient, schoolId: string): Promise<GeofenceRow[]> {
  const { data } = await supabase
    .from("school_geofences")
    .select("id, school_id, name, center_lat, center_lng, radius_m, is_active, created_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true });
  return (data ?? []) as GeofenceRow[];
}

export async function upsertGeofence(
  supabase: SupabaseClient,
  row: { id?: string; school_id: string; name: string; center_lat: number; center_lng: number; radius_m: number },
): Promise<{ data: GeofenceRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("school_geofences")
    .upsert(row, { onConflict: "id" })
    .select("id, school_id, name, center_lat, center_lng, radius_m, is_active, created_at")
    .single();
  return { data: (data as GeofenceRow) ?? null, error: error?.message ?? null };
}

export async function deleteGeofence(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("school_geofences").delete().eq("id", id);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 3: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 4: Write the Leaflet map component**

```tsx
// apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx
"use client";

import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { destinationPoint, haversineMeters } from "@/lib/geo-attendance";

const CENTER_ICON = L.divIcon({
  className: "",
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#4F46E5" stroke="#fff" stroke-width="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

const HANDLE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2.5px solid #4F46E5;box-shadow:0 2px 6px rgba(29,78,216,.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface GeofenceMapProps {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (radiusM: number) => void;
  dropPinArmed: boolean;
  onPinDropped: () => void;
}

function ClickToDropPin({ armed, onCenterChange, onPinDropped }: { armed: boolean; onCenterChange: (lat: number, lng: number) => void; onPinDropped: () => void }) {
  useMapEvents({
    click(e) {
      if (!armed) return;
      onCenterChange(e.latlng.lat, e.latlng.lng);
      onPinDropped();
    },
  });
  return null;
}

export default function GeofenceMap({ centerLat, centerLng, radiusM, onCenterChange, onRadiusChange, dropPinArmed, onPinDropped }: GeofenceMapProps) {
  const [dragging, setDragging] = useState(false);
  const handlePos = useMemo(() => destinationPoint(centerLat, centerLng, radiusM, 90), [centerLat, centerLng, radiusM]);

  return (
    <MapContainer center={[centerLat, centerLng]} zoom={16} style={{ height: 340, width: "100%", cursor: dropPinArmed ? "crosshair" : undefined }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickToDropPin armed={dropPinArmed} onCenterChange={onCenterChange} onPinDropped={onPinDropped} />
      <Circle center={[centerLat, centerLng]} radius={radiusM} pathOptions={{ color: "#4F46E5", weight: 2, dashArray: "6 6", fillColor: "#4F46E5", fillOpacity: 0.12 }} />
      <Marker
        position={[centerLat, centerLng]}
        icon={CENTER_ICON}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onCenterChange(pos.lat, pos.lng);
          },
        }}
      />
      <Marker
        position={[handlePos.lat, handlePos.lng]}
        icon={HANDLE_ICON}
        draggable
        eventHandlers={{
          drag: () => setDragging(true),
          dragend: (e) => {
            setDragging(false);
            const pos = e.target.getLatLng();
            const newRadius = Math.round(haversineMeters(centerLat, centerLng, pos.lat, pos.lng));
            onRadiusChange(Math.max(20, newRadius));
          },
        }}
      />
      {dragging && null}
    </MapContainer>
  );
}
```

- [ ] **Step 5: Write the campus list + form client component**

```tsx
// apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Plus, Crosshair, Save, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { upsertGeofence, deleteGeofence, type GeofenceRow } from "@/lib/geo-attendance";

const GeofenceMap = dynamic(() => import("./geofence-map"), {
  ssr: false,
  loading: () => <div className="h-[340px] w-full animate-pulse bg-muted" />,
});

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_RADIUS = 200;

type DraftGeofence = Omit<GeofenceRow, "id" | "is_active" | "created_at"> & { id: string | null };

function toDraft(row: GeofenceRow): DraftGeofence {
  return { id: row.id, school_id: row.school_id, name: row.name, center_lat: row.center_lat, center_lng: row.center_lng, radius_m: row.radius_m };
}

export function GeofenceSetupClient({ schoolId, initialGeofences }: { schoolId: string; initialGeofences: GeofenceRow[] }) {
  const [geofences, setGeofences] = useState(initialGeofences);
  const [selectedId, setSelectedId] = useState<string | null>(initialGeofences[0]?.id ?? null);
  const [draft, setDraft] = useState<DraftGeofence | null>(initialGeofences[0] ? toDraft(initialGeofences[0]) : null);
  const [dropPinArmed, setDropPinArmed] = useState(false);
  const [saving, setSaving] = useState(false);

  function selectGeofence(row: GeofenceRow) {
    setSelectedId(row.id);
    setDraft(toDraft(row));
    setDropPinArmed(false);
  }

  function addCampus() {
    const base = geofences[0];
    const center = base ? { lat: base.center_lat + 0.002, lng: base.center_lng + 0.002 } : DEFAULT_CENTER;
    setSelectedId(null);
    setDraft({ id: null, school_id: schoolId, name: "New campus", center_lat: center.lat, center_lng: center.lng, radius_m: DEFAULT_RADIUS });
    setDropPinArmed(false);
  }

  function cancelEdit() {
    const selected = geofences.find((g) => g.id === selectedId);
    setDraft(selected ? toDraft(selected) : geofences[0] ? toDraft(geofences[0]) : null);
    setDropPinArmed(false);
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error("Campus name is required."); return; }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await upsertGeofence(supabase, {
      id: draft.id ?? undefined,
      school_id: draft.school_id,
      name: draft.name.trim(),
      center_lat: draft.center_lat,
      center_lng: draft.center_lng,
      radius_m: draft.radius_m,
    });
    setSaving(false);
    if (error || !data) { toast.error(error ?? "Failed to save geofence."); return; }
    setGeofences((prev) => {
      const exists = prev.some((g) => g.id === data.id);
      return exists ? prev.map((g) => (g.id === data.id ? data : g)) : [...prev, data];
    });
    setSelectedId(data.id);
    setDraft(toDraft(data));
    toast.success("Geofence saved. Edits apply to teacher marking on next open.");
  }

  async function removeCampus(id: string) {
    if (!confirm("Delete this campus geofence? Teachers marking here will no longer be treated as on-campus.")) return;
    const supabase = createClient();
    const { error } = await deleteGeofence(supabase, id);
    if (error) { toast.error(error); return; }
    const remaining = geofences.filter((g) => g.id !== id);
    setGeofences(remaining);
    if (selectedId === id) {
      setSelectedId(remaining[0]?.id ?? null);
      setDraft(remaining[0] ? toDraft(remaining[0]) : null);
    }
    toast.success("Geofence deleted.");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3.5">
          <h3 className="text-[15px] font-semibold tracking-tight">Campus geofences</h3>
          <span className="text-xs text-muted-foreground">
            · a submission counts as &ldquo;on campus&rdquo; if it&rsquo;s inside <b>any</b> active geofence
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={addCampus}>
            <Plus className="h-3.5 w-3.5" /> Add campus
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[288px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2.5">
            {geofences.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => selectGeofence(g)}
                className={cn(
                  "cursor-pointer rounded-[13px] border p-3 text-left transition-colors",
                  g.id === selectedId ? "border-indigo-600 bg-indigo-50" : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-2.5 text-sm font-semibold">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", g.id === selectedId ? "bg-white" : "bg-indigo-100 text-indigo-700")}>
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  {g.name}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2.5 pl-[33px] text-[11.5px] text-muted-foreground">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", g.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                    {g.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <span>r = {g.radius_m}&thinsp;m</span>
                  <span>{g.center_lat.toFixed(4)}, {g.center_lng.toFixed(4)}</span>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={addCampus}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-[13px] border border-dashed bg-muted/40 p-2.5 text-sm font-semibold text-indigo-700 hover:bg-muted/60"
            >
              <Plus className="h-3.5 w-3.5" /> Add another campus
            </button>
          </div>

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

            {draft && (
              <>
                <div className="grid grid-cols-1 gap-3.5 border-t p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Campus name</label>
                    <Input value={draft.name} onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))} className="mt-1 h-9" />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Centre latitude</label>
                    <Input
                      type="number"
                      value={draft.center_lat}
                      onChange={(e) => setDraft((d) => (d ? { ...d, center_lat: Number(e.target.value) } : d))}
                      className="mt-1 h-9"
                      step="0.00001"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Centre longitude</label>
                    <Input
                      type="number"
                      value={draft.center_lng}
                      onChange={(e) => setDraft((d) => (d ? { ...d, center_lng: Number(e.target.value) } : d))}
                      className="mt-1 h-9"
                      step="0.00001"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">Radius</label>
                    <div className="mt-1 flex items-center gap-3.5">
                      <input
                        type="range"
                        min={20}
                        max={5000}
                        value={Math.min(draft.radius_m, 5000)}
                        onChange={(e) => setDraft((d) => (d ? { ...d, radius_m: Number(e.target.value) } : d))}
                        className="h-1.5 flex-1 accent-indigo-600"
                      />
                      <div className="flex items-baseline gap-1 text-[17px] font-bold">
                        <input
                          type="number"
                          value={draft.radius_m}
                          onChange={(e) => setDraft((d) => (d ? { ...d, radius_m: Math.max(1, Number(e.target.value)) } : d))}
                          className="w-20 rounded-md border px-2 py-1 text-right text-sm"
                        />
                        <span className="text-xs font-semibold text-muted-foreground">m</span>
                      </div>
                    </div>
                    <p className="mt-2 rounded-lg border border-dashed bg-muted/40 px-2.5 py-2 text-[11.5px] text-muted-foreground">
                      Drag the circle edge or type a value. Radius scales for <b>large / multi-building campuses</b> — up to several kilometres.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 border-t bg-muted/30 px-4 py-3.5">
                  <span className="font-mono text-xs text-muted-foreground">Edits apply to teacher marking on next open.</span>
                  <div className="ml-auto flex gap-2">
                    {draft.id && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeCampus(draft.id!)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                    <Button type="button" size="sm" onClick={saveDraft} disabled={saving}>
                      <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save geofence"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 rounded-xl border border-dashed bg-muted/40 p-3.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600" />
        <p>
          <b className="text-foreground">Server-side check.</b> The teacher&rsquo;s phone reports coordinates, but on/off-campus is decided on
          the server (Haversine vs each geofence) — a spoofed client can&rsquo;t silently pass. Out-of-bounds is{" "}
          <b className="text-foreground">recorded, never blocked</b>.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `page.tsx`**

```tsx
// apps/web/app/(school)/admin/settings/geo-attendance/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAllGeofences } from "@/lib/geo-attendance";
import { GeofenceSetupClient } from "./geofence-setup-client";

export default async function GeoAttendancePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const [geofences, { data: school }] = await Promise.all([
    fetchAllGeofences(supabase, schoolId),
    supabase.from("schools").select("features_enabled").eq("id", schoolId).single(),
  ]);

  const featureOn = Boolean((school?.features_enabled as Record<string, boolean> | null)?.attendance_geo);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Settings
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Geo attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the campus boundary teachers mark within, and review the rare off-campus submissions.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5" /> Feature: <b className={featureOn ? "text-emerald-600" : "text-muted-foreground"}>{featureOn ? "ON" : "OFF"}</b>
        </span>
      </div>

      <GeofenceSetupClient schoolId={schoolId} initialGeofences={geofences} />
    </div>
  );
}
```

- [ ] **Step 7: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 8: Manual verification**

Run: `pnpm --filter @erp/web dev`, sign in as `school_admin`, visit `/admin/settings/geo-attendance`.
Expected: empty state shows "Add campus"/"Add another campus" affordances (no geofences yet); clicking "Add campus" shows a draft centred on the default Bengaluru coordinates with a 200m circle; dragging the centre pin or the edge handle updates the lat/lng/radius fields live; "Save geofence" persists a new `school_geofences` row and it appears in the campus list; editing radius via the slider/number field and re-saving updates the row; deleting a campus removes it after confirmation. Sign in as `teacher` and confirm `/admin/settings/geo-attendance` is unreachable (redirected by `AdminLayout`'s `hasAnyRole` check).

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/lib/geo-attendance.ts "apps/web/app/(school)/admin/settings/geo-attendance"
git commit -m "feat(web): add geofence setup page with Leaflet map (school_admin)"
```

---

### Task 5: Web — flag review list (shared component)

**Files:**
- Modify: `apps/web/lib/geo-attendance.ts`
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/flag-review-list.tsx`
- Create: `apps/web/app/(school)/admin/settings/geo-attendance/geo-attendance-tabs.tsx`
- Modify: `apps/web/app/(school)/admin/settings/geo-attendance/page.tsx`

**Interfaces:**
- Consumes: `GeofenceRow`, `formatDistanceM` (Task 4).
- Produces: `type GeoFlagGroup = {key,teacherName,sectionLabel,session,date,geoStatus,distanceM,accuracyM,recordIds,reviewed,reviewedAt,reviewedByName}`, `fetchFlaggedGroups(supabase,schoolId,sinceDate): Promise<GeoFlagGroup[]>`, `markGroupReviewed(supabase,recordIds,reviewerId): Promise<{error}>`, component `<FlagReviewList groups reviewerId onReviewed />` — Task 6 (principal page) and Task 7 (badge count) both consume `fetchFlaggedGroups`/`FlagReviewList`.

- [ ] **Step 1: Extend `lib/geo-attendance.ts` with flag helpers**

Append to `apps/web/lib/geo-attendance.ts`:

```ts
export type GeoFlagStatus = "outside" | "no_gps";

export interface GeoFlagGroup {
  key: string;
  teacherName: string;
  sectionLabel: string;
  session: string;
  date: string;
  geoStatus: GeoFlagStatus;
  distanceM: number | null;
  accuracyM: number | null;
  recordIds: string[];
  reviewed: boolean;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

interface FlagRow {
  id: string;
  section_id: string;
  date: string;
  session: string;
  geo_status: GeoFlagStatus;
  geo_distance_m: number | null;
  gps_accuracy_m: number | null;
  geo_reviewed_at: string | null;
  marked_by: string | null;
  marker: { full_name: string | null } | null;
  reviewer: { full_name: string | null } | null;
  section: { name: string; class: { name: string } | null } | null;
}

/**
 * mark_attendance stamps every student row in one submit with the SAME geo
 * verdict (proven by the backend RPC test's multi-record phase), so the
 * review UI groups by (section_id, date, session) — one card per teacher
 * submission event, not one per student row.
 */
function groupFlagRows(rows: FlagRow[]): GeoFlagGroup[] {
  const groups = new Map<string, GeoFlagGroup & { _allReviewed: boolean }>();
  for (const r of rows) {
    const key = `${r.section_id}|${r.date}|${r.session}`;
    const className = r.section?.class?.name ?? "";
    const sectionName = r.section?.name ?? "";
    const existing = groups.get(key);
    if (existing) {
      existing.recordIds.push(r.id);
      existing._allReviewed = existing._allReviewed && !!r.geo_reviewed_at;
      continue;
    }
    groups.set(key, {
      key,
      teacherName: r.marker?.full_name ?? "Unknown",
      sectionLabel: className && sectionName ? `${className}-${sectionName}` : sectionName || "—",
      session: r.session,
      date: r.date,
      geoStatus: r.geo_status,
      distanceM: r.geo_distance_m,
      accuracyM: r.gps_accuracy_m,
      recordIds: [r.id],
      reviewed: !!r.geo_reviewed_at,
      reviewedAt: r.geo_reviewed_at,
      reviewedByName: r.reviewer?.full_name ?? null,
      _allReviewed: !!r.geo_reviewed_at,
    });
  }
  return [...groups.values()]
    .map((g) => ({ ...g, reviewed: g._allReviewed }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function fetchFlaggedGroups(supabase: SupabaseClient, schoolId: string, sinceDate: string): Promise<GeoFlagGroup[]> {
  const { data } = await supabase
    .from("attendance_records")
    .select(
      // Bare-column-name PostgREST embedding hints (profiles!<column>), matching
      // the established convention elsewhere in this codebase (e.g.
      // apps/web/app/(school)/teacher/dashboard/page.tsx:68 "profiles!class_teacher_id(...)",
      // student-fees-tab.tsx "profiles!added_by(...)" / "profiles!paid_by_profile_id(...)").
      // attendance_records has two FKs to auth.users (marked_by, geo_reviewed_by), so the
      // column-name hint is required to disambiguate which one each embed follows.
      "id, section_id, date, session, geo_status, geo_distance_m, gps_accuracy_m, geo_reviewed_at, marked_by, marker:profiles!marked_by(full_name), reviewer:profiles!geo_reviewed_by(full_name), section:sections(name, class:classes(name))",
    )
    .eq("school_id", schoolId)
    .in("geo_status", ["outside", "no_gps"])
    .gte("date", sinceDate)
    .order("date", { ascending: false });
  return groupFlagRows((data ?? []) as unknown as FlagRow[]);
}

export async function markGroupReviewed(supabase: SupabaseClient, recordIds: string[], reviewerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("attendance_records")
    .update({ geo_reviewed_at: new Date().toISOString(), geo_reviewed_by: reviewerId })
    .in("id", recordIds);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 2: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 3: Write `flag-review-list.tsx`**

```tsx
// apps/web/app/(school)/admin/settings/geo-attendance/flag-review-list.tsx
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, WifiOff, Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markGroupReviewed, formatDistanceM, type GeoFlagGroup } from "@/lib/geo-attendance";

const SESSION_LABELS: Record<string, string> = { FULL_DAY: "Full day", FN: "Forenoon", AN: "Afternoon" };

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return d >= start;
}

type Filter = "all" | "outside" | "no_gps" | "week";

export function FlagReviewList({ groups: initialGroups, reviewerId }: { groups: GeoFlagGroup[]; reviewerId: string }) {
  const [groups, setGroups] = useState(initialGroups);
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: groups.length,
      outside: groups.filter((g) => g.geoStatus === "outside").length,
      no_gps: groups.filter((g) => g.geoStatus === "no_gps").length,
    }),
    [groups],
  );

  const filtered = groups.filter((g) => {
    if (filter === "outside") return g.geoStatus === "outside";
    if (filter === "no_gps") return g.geoStatus === "no_gps";
    if (filter === "week") return isThisWeek(g.date);
    return true;
  });

  const unreviewedCount = groups.filter((g) => !g.reviewed).length;

  async function reviewGroup(g: GeoFlagGroup) {
    setReviewing(g.key);
    const supabase = createClient();
    const { error } = await markGroupReviewed(supabase, g.recordIds, reviewerId);
    setReviewing(null);
    if (error) { toast.error(error); return; }
    setGroups((prev) => prev.map((x) => (x.key === g.key ? { ...x, reviewed: true, reviewedAt: new Date().toISOString(), reviewedByName: "you" } : x)));
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {unreviewedCount > 0 && (
          <div className="flex items-center gap-2.5 border-b bg-[#FDF3E2] px-[18px] py-2.5 text-[12.5px] font-semibold text-[#9A6408]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {unreviewedCount} submission{unreviewedCount === 1 ? "" : "s"} to review this week · usually there&rsquo;s nothing here — most marking is on-campus.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3.5">
          <h3 className="text-[15px] font-semibold tracking-tight">Flagged submissions</h3>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {([
              ["all", `All ${counts.all}`],
              ["outside", `Off-campus ${counts.outside}`],
              ["no_gps", `No-GPS ${counts.no_gps}`],
              ["week", "This week"],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold",
                  filter === key ? "border-transparent bg-indigo-50 text-indigo-700" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-11 text-center text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          filtered.map((g) => (
            <div key={g.key} className={cn("grid grid-cols-[34px_1fr_auto] items-center gap-3.5 border-b px-[18px] py-3.5 last:border-b-0 hover:bg-muted/30", g.reviewed && "opacity-60")}>
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-indigo-100 text-xs font-bold text-indigo-700">
                {initials(g.teacherName)}
              </div>
              <div>
                <b className="text-sm font-semibold">{g.teacherName}</b>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  · {g.sectionLabel} · {SESSION_LABELS[g.session] ?? g.session} · {new Date(g.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide", g.geoStatus === "outside" ? "bg-[#FDF3E2] text-[#F59E0B]" : "bg-muted text-muted-foreground")}>
                    {g.geoStatus === "outside" ? "OFF-CAMPUS" : "NO-GPS"}
                  </span>
                  {g.geoStatus === "outside" ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" /> {formatDistanceM(g.distanceM ?? 0)} past the fence
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <WifiOff className="h-3.5 w-3.5" /> Location unavailable at submit
                    </span>
                  )}
                  {g.accuracyM != null && <span className="font-mono text-[11.5px] text-muted-foreground">GPS &plusmn;{Math.round(g.accuracyM)}m</span>}
                </div>
              </div>
              <div>
                {g.reviewed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Reviewed{g.reviewedByName ? ` · ${g.reviewedByName}` : ""}
                  </span>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => reviewGroup(g)} disabled={reviewing === g.key}>
                    <Check className="h-3.5 w-3.5" /> {reviewing === g.key ? "Saving…" : "Mark reviewed"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2.5 rounded-xl border border-dashed bg-muted/40 p-3.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p>
          <b className="text-foreground">An exception log, not a scoreboard.</b> No KPIs or &ldquo;impact&rdquo; here — just the handful of
          submissions worth a glance. The nav badge only appears when something&rsquo;s pending. Reviewing clears the flag; it never edits the
          attendance itself.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire tabs into the admin page**

Create `apps/web/app/(school)/admin/settings/geo-attendance/geo-attendance-tabs.tsx`:

```tsx
// apps/web/app/(school)/admin/settings/geo-attendance/geo-attendance-tabs.tsx
"use client";

import { useState } from "react";
import { MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeofenceRow, GeoFlagGroup } from "@/lib/geo-attendance";
import { GeofenceSetupClient } from "./geofence-setup-client";
import { FlagReviewList } from "./flag-review-list";

export function GeoAttendanceTabs({
  schoolId,
  initialGeofences,
  initialFlags,
  reviewerId,
}: {
  schoolId: string;
  initialGeofences: GeofenceRow[];
  initialFlags: GeoFlagGroup[];
  reviewerId: string;
}) {
  const [tab, setTab] = useState<"geofences" | "review">("geofences");
  const unreviewedCount = initialFlags.filter((g) => !g.reviewed).length;

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-0.5 rounded-[11px] border bg-card p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("geofences")}
          className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", tab === "geofences" ? "bg-indigo-50 text-indigo-700" : "text-muted-foreground")}
        >
          <MapPin className="h-3.5 w-3.5" /> Geofences
          <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold", tab === "geofences" ? "bg-white text-indigo-700" : "bg-muted text-foreground")}>
            {initialGeofences.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("review")}
          className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold", tab === "review" ? "bg-indigo-50 text-indigo-700" : "text-muted-foreground")}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Flag review
          {unreviewedCount > 0 && <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[11px] font-bold text-[#F59E0B]">{unreviewedCount}</span>}
        </button>
      </div>

      {tab === "geofences" ? (
        <GeofenceSetupClient schoolId={schoolId} initialGeofences={initialGeofences} />
      ) : (
        <FlagReviewList groups={initialFlags} reviewerId={reviewerId} />
      )}
    </div>
  );
}
```

Edit `apps/web/app/(school)/admin/settings/geo-attendance/page.tsx` — replace the import and final render:

```tsx
import { fetchAllGeofences, fetchFlaggedGroups } from "@/lib/geo-attendance";
import { GeoAttendanceTabs } from "./geo-attendance-tabs";
```

```tsx
export default async function GeoAttendancePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const { data: { user } } = await supabase.auth.getUser();

  const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [geofences, flags, { data: school }] = await Promise.all([
    fetchAllGeofences(supabase, schoolId),
    fetchFlaggedGroups(supabase, schoolId, sinceDate),
    supabase.from("schools").select("features_enabled").eq("id", schoolId).single(),
  ]);

  const featureOn = Boolean((school?.features_enabled as Record<string, boolean> | null)?.attendance_geo);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Settings
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Geo attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the campus boundary teachers mark within, and review the rare off-campus submissions.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5" /> Feature: <b className={featureOn ? "text-emerald-600" : "text-muted-foreground"}>{featureOn ? "ON" : "OFF"}</b>
        </span>
      </div>

      <GeoAttendanceTabs schoolId={schoolId} initialGeofences={geofences} initialFlags={flags} reviewerId={user!.id} />
    </div>
  );
}
```

- [ ] **Step 5: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 6: Manual verification**

With at least one flagged submission from Task 2's manual test (or seed one via `npx supabase db query --local` matching the RPC test fixtures), visit `/admin/settings/geo-attendance`, switch to "Flag review".
Expected: one card per (teacher, section, date, session) — not one per student; filter chips narrow the list; "Mark reviewed" flips the card to a green "Reviewed · you" pill and the tab badge count decrements; marking one student's row reviewed via the same section/date/session clears the whole group (verify by checking `attendance_records` — all sibling rows now have `geo_reviewed_at` set).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/geo-attendance.ts "apps/web/app/(school)/admin/settings/geo-attendance"
git commit -m "feat(web): add geo attendance flag review tab"
```

---

### Task 6: Web — principal-only geo review page

**Files:**
- Create: `apps/web/app/(school)/principal/attendance/geo-review/page.tsx`
- Modify: `apps/web/lib/nav-config.ts`

**Interfaces:**
- Consumes: `fetchFlaggedGroups`, `FlagReviewList` (Task 5).
- Produces: route `/principal/attendance/geo-review`, nav item `{label:"Geo Review", href:"/principal/attendance/geo-review"}` under `principal.administration` — Task 7 attaches a badge to this same item.

- [ ] **Step 1: Write the principal page**

Principal has read + review access via the existing `attendance_write` RLS policy (same-school `principal` branch) but no geofence-CRUD access (`school_geofences_write` is `school_admin`/`super_admin` only) — this page renders only the flag list, no map.

```tsx
// apps/web/app/(school)/principal/attendance/geo-review/page.tsx
export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { fetchFlaggedGroups } from "@/lib/geo-attendance";
import { FlagReviewList } from "../../../admin/settings/geo-attendance/flag-review-list";

export default async function PrincipalGeoReviewPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const { data: { user } } = await supabase.auth.getUser();

  const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const flags = await fetchFlaggedGroups(supabase, schoolId, sinceDate);

  return (
    <div>
      <PageHeader title="Geo Review" description="Off-campus and no-GPS attendance submissions awaiting review." />
      <FlagReviewList groups={flags} reviewerId={user!.id} />
    </div>
  );
}
```

- [ ] **Step 2: Add the principal nav item**

Edit `apps/web/lib/nav-config.ts`, in the `principal` config's `administration` array (lines 102–105):

```ts
      administration: [
        { label: "Discipline", href: "/principal/discipline" },
        { label: "Geo Review", href: "/principal/attendance/geo-review" },
        { label: "Reports", href: "/principal/reports" },
      ],
```

- [ ] **Step 3: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 4: Manual verification**

Sign in as `principal`, open the "More" nav dropdown, click "Geo Review".
Expected: same flagged-groups list as the admin tab (read from the same table); "Mark reviewed" works (principal is in the `attendance_write` RLS branch); no geofence map or campus CRUD is present on this page. Sign in as `teacher` and confirm `/principal/attendance/geo-review` redirects (blocked by `PrincipalLayout`'s `hasAnyRole` check).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(school)/principal/attendance/geo-review" apps/web/lib/nav-config.ts
git commit -m "feat(web): add principal geo review page"
```

---

### Task 7: Web — nav badge for unreviewed flags

**Files:**
- Modify: `apps/web/lib/geo-attendance.ts`
- Modify: `apps/web/lib/nav-config.ts`
- Modify: `apps/web/components/top-bar.tsx`
- Modify: `apps/web/components/mobile-nav.tsx`
- Modify: `apps/web/app/(school)/layout.tsx`

**Interfaces:**
- Consumes: `fetchFlaggedGroups` (Task 5), `NAV_CONFIG` (Task 6).
- Produces: `NavItem.badge?: number`, `fetchUnreviewedFlagGroupCount(supabase,schoolId): Promise<number>`.

- [ ] **Step 1: Add the count helper**

Append to `apps/web/lib/geo-attendance.ts`:

```ts
/** Lightweight count for the nav badge — avoids the join fetchFlaggedGroups does. */
export async function fetchUnreviewedFlagGroupCount(supabase: SupabaseClient, schoolId: string): Promise<number> {
  const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("attendance_records")
    .select("section_id, date, session")
    .eq("school_id", schoolId)
    .in("geo_status", ["outside", "no_gps"])
    .is("geo_reviewed_at", null)
    .gte("date", sinceDate);
  const keys = new Set((data ?? []).map((r) => `${r.section_id}|${r.date}|${r.session}`));
  return keys.size;
}
```

- [ ] **Step 2: Add `badge` to `NavItem` and both admin/principal entries**

Edit `apps/web/lib/nav-config.ts`:

```ts
export interface NavItem {
  label: string;
  href: string;
  /** Small count pill next to the label — omitted or 0 renders nothing. */
  badge?: number;
}
```

Add the school_admin entry (in `administration`, alongside `Fee Types`):

```ts
      administration: [
        { label: "Fees", href: "/admin/fees" },
        { label: "Discipline", href: "/admin/discipline" },
        { label: "Fee Types", href: "/admin/settings/fee-types" },
        { label: "Geo Attendance", href: "/admin/settings/geo-attendance" },
        { label: "Reports", href: "/admin/reports" },
      ],
```

(The `principal.administration` "Geo Review" entry from Task 6 already exists — no change needed there beyond Task 6.)

Add a small helper used by the layout to attach a live count onto whichever nav config is active:

```ts
/** Returns a copy of `config` with `badge` attached to the item matching `href`. */
export function withBadge(config: RoleNavConfig, href: string, count: number): RoleNavConfig {
  if (count <= 0) return config;
  const patch = (item: NavItem): NavItem => (item.href === href ? { ...item, badge: count } : item);
  return {
    frequent: config.frequent.map(patch),
    sections: config.sections.map((s) => ({ ...s, items: s.items.map(patch) })),
  };
}
```

- [ ] **Step 3: Render the badge in `TopBar`**

Edit `apps/web/components/top-bar.tsx`. Update `NavLink` (lines 46–66) to render a pill when `item.badge` is set:

```tsx
function NavLink({ item, isActive, accent }: { item: NavItem; isActive: boolean; accent: string }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className="group relative flex items-center gap-1.5 px-1 py-1.5 text-sm transition-colors"
      style={{ color: isActive ? accent : "#475569", fontWeight: isActive ? 600 : 500 }}
    >
      {item.label}
      {!!item.badge && (
        <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
      )}
      {isActive && (
        <span
          className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left animate-nav-underline rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
      {!isActive && (
        <span className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left scale-x-0 rounded-full bg-slate-300 transition-transform duration-300 ease-out group-hover:scale-x-100" />
      )}
    </Link>
  );
}
```

Update the "More" dropdown items (lines 159–163) to show the badge too:

```tsx
                    {section.items.map((item) => (
                      <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                        <span className="flex-1">{item.label}</span>
                        {!!item.badge && (
                          <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
                        )}
                      </DropdownMenuItem>
                    ))}
```

Also render a badge dot on the "More" trigger itself when any hidden section item has one, so the count is visible without opening the dropdown — add just above the closing `</DropdownMenuTrigger>` (after the `ChevronDown`, inside the trigger at lines 136–153):

```tsx
              <DropdownMenuTrigger
                className="group relative flex shrink-0 items-center gap-1 px-1 py-1.5 text-sm outline-none"
                style={{ color: moreActive ? accent : "#475569", fontWeight: moreActive ? 600 : 500 }}
              >
                More
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[popup-open]:rotate-180" />
                {sections.some((s) => s.items.some((i) => !!i.badge)) && (
                  <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-[#F59E0B]" />
                )}
```

- [ ] **Step 4: Render the badge in `MobileNav`**

Edit `apps/web/components/mobile-nav.tsx`. Drawer item (lines 92–117) — insert a badge pill after the label:

```tsx
                    {isActive && (
                      <span
                        className="absolute left-0 top-[9px] bottom-[9px] w-[3px] rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    <Icon className="h-[21px] w-[21px] shrink-0" style={{ color: isActive ? accent : inactiveIcon }} />
                    <span className="flex-1">{item.label}</span>
                    {!!item.badge && (
                      <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
                    )}
```

- [ ] **Step 5: Compute and inject the count in `(school)/layout.tsx`**

Edit `apps/web/app/(school)/layout.tsx`. Add the import:

```tsx
import { NAV_CONFIG, allNavItems, withBadge } from "@/lib/nav-config";
import { fetchUnreviewedFlagGroupCount } from "@/lib/geo-attendance";
```

Replace the line `const navConfig = NAV_CONFIG[navKey] ?? { frequent: [], sections: [] };` (line 172) with:

```tsx
  let navConfig = NAV_CONFIG[navKey] ?? { frequent: [], sections: [] };
  if (schoolId && (displayRole === "school_admin" || displayRole === "principal")) {
    const unreviewedCount = await fetchUnreviewedFlagGroupCount(supabase, schoolId);
    const badgeHref = displayRole === "school_admin" ? "/admin/settings/geo-attendance" : "/principal/attendance/geo-review";
    navConfig = withBadge(navConfig, badgeHref, unreviewedCount);
  }
```

(`const` → `let`, since `navConfig` is now conditionally reassigned.)

- [ ] **Step 6: Run type-check**

Run: `pnpm --filter @erp/web type-check`
Expected: exits 0, no errors.

- [ ] **Step 7: Manual verification**

With at least one unreviewed flagged group (from Task 5's test data): sign in as `school_admin`, open the "More" dropdown — "Geo Attendance" shows an amber count pill, and the "More" trigger itself shows a small amber dot; on mobile viewport, open the drawer and confirm the same pill appears next to "Geo Attendance". Mark the flag reviewed (Task 5's UI), refresh the page (badge is computed server-side per request) — the pill disappears. Repeat for `principal` / "Geo Review". Sign in as `teacher` and confirm no badge/dot appears anywhere (teacher's nav config never receives `withBadge`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/geo-attendance.ts apps/web/lib/nav-config.ts apps/web/components/top-bar.tsx apps/web/components/mobile-nav.tsx "apps/web/app/(school)/layout.tsx"
git commit -m "feat(web): show unreviewed geo-flag count as a nav badge"
```

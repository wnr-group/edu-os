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
  const { data: rows } = await supabase
    .from("attendance_records")
    .select(
      "id, section_id, date, session, geo_status, geo_distance_m, gps_accuracy_m, geo_reviewed_at, marked_by, geo_reviewed_by, section:sections(name, class:classes(name))",
    )
    .eq("school_id", schoolId)
    .in("geo_status", ["outside", "no_gps"])
    .gte("date", sinceDate)
    .order("date", { ascending: false });

  if (!rows || rows.length === 0) return [];

  // Fetch profile names for marker and reviewer users
  const userIds = new Set<string>();
  rows.forEach(row => {
    if (row.marked_by) userIds.add(row.marked_by);
    if (row.geo_reviewed_by) userIds.add(row.geo_reviewed_by);
  });

  let profileMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(userIds));
    profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
  }

  const rowsWithProfiles = rows.map(row => ({
    ...row,
    marker: row.marked_by ? { full_name: profileMap.get(row.marked_by) || null } : null,
    reviewer: row.geo_reviewed_by ? { full_name: profileMap.get(row.geo_reviewed_by) || null } : null,
    // Remove geo_reviewed_by from the final object since FlagRow doesn't expect it
  } as unknown as FlagRow));

  return groupFlagRows(rowsWithProfiles);
}

export async function markGroupReviewed(supabase: SupabaseClient, recordIds: string[], reviewerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("attendance_records")
    .update({ geo_reviewed_at: new Date().toISOString(), geo_reviewed_by: reviewerId })
    .in("id", recordIds);
  return { error: error?.message ?? null };
}

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

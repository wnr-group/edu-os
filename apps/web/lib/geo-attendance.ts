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

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
  distanceM: number | null;
  accuracyM: number | null;
}

export interface DevicePosition {
  lat: number;
  lng: number;
  accuracy: number | null;
}

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

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

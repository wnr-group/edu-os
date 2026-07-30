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

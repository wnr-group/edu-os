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
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2")}>
          <ArrowLeft className="h-4 w-4" /> Back to settings
        </Link>
        <h1 className="text-2xl font-bold">Geo-attendance setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Define campus geofences for automatic on/off-campus detection during attendance marking.</p>
      </div>

      {!featureOn && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <p className="text-amber-900">
            <b>Feature not enabled.</b> Contact your account manager to enable attendance geo-detection for your school.
          </p>
        </div>
      )}

      <GeofenceSetupClient schoolId={schoolId} initialGeofences={geofences} />
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAllGeofences, fetchFlaggedGroups } from "@/lib/geo-attendance";
import { GeoAttendanceTabs } from "./geo-attendance-tabs";

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

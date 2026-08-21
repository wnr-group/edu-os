import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { loadPtmRows, loadPtmSchedulingContext, loadPtmBookings, loadPtmAvailableSlots } from "@/lib/ptm";
import { PtmInbox } from "@/components/ptm-inbox";

export default async function PrincipalPtmPage() {
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.ptm !== true) return <ModuleUnavailable module="Parent-Teacher Meetings" />;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ rows, viewerLabel }, schedulingContext, bookings, slotGroups] = await Promise.all([
    loadPtmRows("Principal view · school-wide"),
    loadPtmSchedulingContext("principal", user!.id),
    loadPtmBookings(user!.id),
    loadPtmAvailableSlots(),
  ]);

  return (
    <PtmInbox
      meetings={rows}
      bookings={bookings}
      slotGroups={slotGroups}
      schoolId={schoolId}
      currentUserId={user!.id}
      viewerLabel={viewerLabel}
      schedulingContext={schedulingContext}
      basePath="/principal/ptm"
      canEditFeedback={false}
    />
  );
}

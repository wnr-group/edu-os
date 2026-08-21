import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Video } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PtmFeedbackForm } from "@/components/ptm-feedback-form";
import { PtmFeedbackView } from "@/components/ptm-feedback-view";

// Shared by /admin/ptm/[meetingId], /principal/ptm/[meetingId], and
// /teacher/ptm/[meetingId] — the SAME data and the SAME edit/view decision
// regardless of which role-scoped route it's reached from. canEdit is
// computed here from the real session (auth.uid() === meeting.teacher_id),
// not passed in by the caller, so it can't be spoofed by picking a
// different route — it mirrors record_ptm_feedback's own RPC-level check.
export async function PtmMeetingDetail({ meetingId, backHref }: { meetingId: string; backHref: string }) {
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.ptm !== true) return <ModuleUnavailable module="Parent-Teacher Meetings" />;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meeting } = await supabase
    .from("ptm_meetings")
    .select(
      "id, teacher_id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, student:student_profiles(id, full_name), section:sections(name, class:classes(name)), subject:subjects(name)"
    )
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) notFound();

  const { data: teacherProfile } = await supabase.from("profiles").select("full_name").eq("id", meeting.teacher_id).maybeSingle();

  const { data: feedback } = await supabase
    .from("ptm_feedback")
    .select("summary, visible_to_parent, internal_notes, academic_rating, behavior_rating, follow_up_required, edited_at")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  const student = meeting.student as unknown as { id: string; full_name: string | null } | null;
  const section = meeting.section as unknown as { name: string; class: { name: string } | null } | null;
  const subject = meeting.subject as unknown as { name: string } | null;
  const canEdit = user?.id === meeting.teacher_id;
  const isCompleted = meeting.status === "completed" || meeting.status === "no_show";

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to PTM
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{student?.full_name ?? "Student"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {section ? `${section.class?.name ?? ""} – ${section.name}` : ""}{subject ? ` · ${subject.name}` : ""} · with {teacherProfile?.full_name ?? "—"}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          {meeting.meeting_mode === "online" ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
          {new Date(meeting.scheduled_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          {" · "}{meeting.start_time.slice(0, 5)} · {meeting.duration_minutes} min
          {meeting.location ? ` · ${meeting.location}` : ""}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        {!isCompleted ? (
          <p className="text-sm text-muted-foreground">
            Feedback can be added once this meeting is marked completed or no-show from the PTM list.
          </p>
        ) : canEdit ? (
          <PtmFeedbackForm meetingId={meeting.id} existingFeedback={feedback ?? null} />
        ) : (
          <PtmFeedbackView feedback={feedback ?? null} />
        )}
      </div>
    </div>
  );
}

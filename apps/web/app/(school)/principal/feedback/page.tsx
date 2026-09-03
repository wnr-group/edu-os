import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { PageHeader } from "@/components/page-header";
import { FeedbackList } from "../../teacher/feedback/feedback-list";

export default async function PrincipalFeedbackPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("id, subject, message, status, created_at, response, from_user_id, thread_id")
    .eq("school_id", schoolId)
    .in("to_role", ["school_admin", "principal"])
    .order("created_at", { ascending: false });

  // Contact Management inserts one row per staff role (school_admin +
  // principal) sharing a thread_id, so this school-wide admin+principal
  // query always returns both siblings for the same submission. Keep one
  // representative row per thread — the two stay content-identical anyway
  // (resolveFeedback's sibling sweep keeps status/response/responded_by in
  // sync across both), so either survives with no loss of information.
  const seenThreads = new Set<string>();
  const feedback = (feedbackRows ?? []).filter((f) => {
    const key = f.thread_id ?? f.id;
    if (seenThreads.has(key)) return false;
    seenThreads.add(key);
    return true;
  });

  const fromUserIds = [...new Set((feedback ?? []).map((f) => f.from_user_id))];

  const [profilesRes, studentsRes] = await Promise.all([
    fromUserIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", fromUserIds)
      : Promise.resolve({ data: [] }),
    fromUserIds.length
      ? supabase
          .from("student_profiles")
          .select("id, full_name, photo_url, parent_profile_id")
          .in("parent_profile_id", fromUserIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name])
  );
  // One student per parent assumed; multi-child not yet supported
  const studentByParent = Object.fromEntries(
    (studentsRes.data ?? []).map((s: any) => [
      s.parent_profile_id,
      {
        id: s.id,
        full_name: s.full_name ?? null,
        class_name: null,
        section_name: null,
        roll_number: null,
        photo_url: s.photo_url ?? null,
      },
    ])
  );

  const items = (feedback ?? []).map((f) => ({
    id: f.id,
    subject: f.subject ?? "—",
    message: f.message ?? "—",
    from_name: profileMap[f.from_user_id] ?? "—",
    from_role: "parent",
    status: f.status ?? "open",
    response: f.response ?? "",
    created_at: f.created_at ? new Date(f.created_at).toLocaleDateString() : "—",
    student: studentByParent[f.from_user_id],
  }));

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="View and respond to feedback & requests from parents."
      />
      <FeedbackList items={items} profileBasePath="/principal/students" />
    </div>
  );
}
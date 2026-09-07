import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { PageHeader } from "@/components/page-header";
import { FeedbackList } from "./feedback-list";

export default async function TeacherFeedbackPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const schoolId = (await getSchoolId())!;

  // feedback.from_user_id references auth.users, not profiles — there is no
  // direct FK from feedback to profiles for PostgREST to embed through, so
  // (unlike the query this replaced, which asked for a nonexistent
  // "profiles!feedback_from_user_id_fkey" relationship and got a PGRST200
  // error on every request — silently discarded because only `data` was
  // destructured, never `error`) the sender's name is resolved as a
  // separate lookup, same pattern already used successfully on the
  // admin/principal Feedback pages.
  const { data: feedback } = await supabase
    .from("feedback")
    .select("id, subject, message, status, created_at, response, from_user_id")
    .eq("school_id", schoolId)
    .eq("to_role", "teacher")
    .eq("to_user_id", user!.id)
    .order("created_at", { ascending: false });

  const fromUserIds = [...new Set((feedback ?? []).map((f) => f.from_user_id))];
  const { data: profiles } = fromUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", fromUserIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  const items = (feedback ?? []).map((f) => ({
    id: f.id,
    subject: f.subject ?? "—",
    message: f.message ?? "—",
    from_name: profileMap[f.from_user_id] ?? "—",
    // Message Teacher is parent-only — there's no other sender this page
    // ever receives, same assumption the admin/principal page already makes.
    from_role: "parent",
    status: f.status ?? "pending",
    response: f.response ?? "",
    created_at: f.created_at
      ? new Date(f.created_at).toLocaleDateString()
      : "—",
  }));

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="View and respond to feedback from parents."
      />
      <FeedbackList items={items} />
    </div>
  );
}
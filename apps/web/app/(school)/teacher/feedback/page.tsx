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

  const { data: feedback } = await supabase
    .from("feedback")
    .select(
      "id, subject, message, status, created_at, response, from_user:profiles!feedback_from_user_id_fkey(full_name), from_role_row:user_roles!user_roles_user_id_fkey(role)"
    )
    .eq("school_id", schoolId)
    .eq("to_role", "teacher")
    .eq("to_user_id", user!.id)
    .order("created_at", { ascending: false });

  const items = (feedback ?? []).map((f) => {
    const fromUser = f.from_user as unknown as { full_name: string } | null;
    const fromRoleRow = (f as any).from_role_row as { role: string } | null;
    return {
      id: f.id,
      subject: f.subject ?? "—",
      message: f.message ?? "—",
      from_name: fromUser?.full_name ?? "—",
      from_role: fromRoleRow?.role ?? "parent",
      status: f.status ?? "pending",
      response: f.response ?? "",
      created_at: f.created_at
        ? new Date(f.created_at).toLocaleDateString()
        : "—",
    };
  });

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
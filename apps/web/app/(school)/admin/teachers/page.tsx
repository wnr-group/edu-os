import { Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { InviteTeacherDialog } from "./invite-teacher-dialog";
import { TeachersTable } from "./teachers-table";

export default async function TeachersPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: activeRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("role", "teacher")
    .eq("is_active", true);

  const activeUserIds = new Set((activeRoles ?? []).map((r) => r.user_id));

  const { data: teachers } = await supabase
    .from("teacher_profiles")
    .select("id, profile_id, profile:profiles(full_name, email, phone)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true });

  const uniqueTeacherMap = new Map<string, { id: string; name: string; email: string; phone: string }>();
  for (const t of teachers ?? []) {
    if (activeUserIds.has(t.profile_id) && !uniqueTeacherMap.has(t.profile_id)) {
      const p = (t.profile as unknown as { full_name: string; email: string; phone: string | null } | null);
      uniqueTeacherMap.set(t.profile_id, {
        id: t.id,
        name: p?.full_name ?? "",
        email: p?.email ?? "",
        phone: p?.phone ?? "",
      });
    }
  }

  const rows = Array.from(uniqueTeacherMap.values());

  return (
    <TeachersTable
      rows={rows}
      schoolId={schoolId}
      headerAction={<InviteTeacherDialog schoolId={schoolId} />}
      stats={
        <KpiGrid>
          <KpiCard icon={Users} label="Total Teachers" value={rows.length} />
        </KpiGrid>
      }
    />
  );
}
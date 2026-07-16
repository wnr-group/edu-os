import { Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { InviteTeacherDialog } from "./invite-teacher-dialog";
import { TeachersTable } from "./teachers-table";

export default async function TeachersPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: teachers } = await supabase
    .from("teacher_profiles")
    .select("id, profile:profiles(full_name, email, phone)")
    .eq("school_id", schoolId);

  const rows = (teachers ?? []).map((t) => {
    const p = (t.profile as unknown as { full_name: string; email: string; phone: string | null } | null);
    return {
      id: t.id,
      name: p?.full_name ?? "",
      email: p?.email ?? "",
      phone: p?.phone ?? "",
    };
  });

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
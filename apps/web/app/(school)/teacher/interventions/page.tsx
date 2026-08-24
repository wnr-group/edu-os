import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { InterventionsView, type InterventionRow } from "@/components/interventions/interventions-view";

export default async function TeacherInterventionsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const schoolId = (await getSchoolId())!;

  // Fetch interventions visible to this teacher
  const { data: records, error } = await supabase
    .from("interventions")
    .select(`
      id,
      student_id,
      kind,
      type,
      title,
      status,
      severity_band,
      due_date,
      assigned_via,
      assignee_id,
      outcome_note,
      dismissal_reason,
      started_at,
      completed_at,
      dismissed_at,
      created_at,
      student_profiles (
        id,
        full_name,
        student_enrollments (
          roll_number,
          sections (
            name,
            classes (
              name
            )
          )
        )
      ),
      student_risk_snapshots!interventions_source_snapshot_id_fkey (
        factors,
        recommended_action,
        subjects (
          name
        )
      ),
      intervention_academic_evidence (
        snapshot_id,
        is_pinned,
        student_risk_snapshots (
          score,
          band,
          subjects (
            name
          )
        )
      ),
      intervention_parent_notifications (
        sent_at
      )
    `)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching teacher interventions:", error);
  }

  const rows: InterventionRow[] = (records || []).map((r: any) => {
    const sp = r.student_profiles;
    const activeEnrollment = Array.isArray(sp?.student_enrollments)
      ? sp.student_enrollments[0]
      : sp?.student_enrollments;

    const evidenceList = (r.intervention_academic_evidence || []).map((ev: any) => ({
      snapshot_id: ev.snapshot_id,
      is_pinned: ev.is_pinned,
      subject_name: ev.student_risk_snapshots?.subjects?.name || "Subject",
      score: ev.student_risk_snapshots?.score ?? 0,
      band: ev.student_risk_snapshots?.band ?? "MED",
    }));

    const lastNotif = Array.isArray(r.intervention_parent_notifications) && r.intervention_parent_notifications.length > 0
      ? r.intervention_parent_notifications[0].sent_at
      : null;

    return {
      id: r.id,
      student_id: r.student_id,
      student_name: sp?.full_name ?? "Student",
      roll_number: activeEnrollment?.roll_number,
      class_name: activeEnrollment?.sections?.classes?.name,
      section_name: activeEnrollment?.sections?.name,
      kind: r.kind,
      type: r.type,
      title: r.title,
      status: r.status,
      severity_band: r.severity_band,
      due_date: r.due_date,
      assigned_via: r.assigned_via,
      assignee_id: r.assignee_id,
      outcome_note: r.outcome_note,
      dismissal_reason: r.dismissal_reason,
      started_at: r.started_at,
      completed_at: r.completed_at,
      dismissed_at: r.dismissed_at,
      created_at: r.created_at,
      factors: Array.isArray(r.student_risk_snapshots?.factors) ? r.student_risk_snapshots.factors : [],
      recommended_action: r.student_risk_snapshots?.recommended_action || r.title,
      subject_name: r.student_risk_snapshots?.subjects?.name,
      evidence: evidenceList,
      last_notified_at: lastNotif,
    };
  });

  return (
    <InterventionsView
      initialInterventions={rows}
      schoolId={schoolId}
      currentUserId={user!.id}
      currentUserRole="teacher"
      isAdmin={false}
    />
  );
}

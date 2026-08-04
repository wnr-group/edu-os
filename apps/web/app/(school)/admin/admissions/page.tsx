import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { AdmissionsBoard, type ApplicationCard } from "./admissions-board";

export default async function AdmissionsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.admissions !== true) return <ModuleUnavailable module="Admissions" />;

  // save_admission_settings is school_admin/super_admin only — principal is
  // operational-only on this module (walk-ins, review, moving cards, enrol).
  // Mirrors the same role-check pattern used in (school)/dashboard/page.tsx.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roles = user ? await getActiveRoles(supabase, user.id) : [];
  const role = topRole(roles);
  const canManageSettings = role === "school_admin" || role === "super_admin";
  const [{ data: apps }, { data: classes }, { data: settings }, { data: school }, { data: years }] = await Promise.all([
    supabase
      .from("admission_applications")
      .select("id, applicant_name, parent_phone, class_applied_id, classes(name), stage, source, payment_status, entrance_test_score, assigned_to, created_at, converted_student_id")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: true }),
    supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("admission_settings").select("*").eq("school_id", schoolId).maybeSingle(),
    supabase.from("schools").select("domain").eq("id", schoolId).single(),
    supabase.from("academic_years").select("id, name, status").eq("school_id", schoolId).order("start_date", { ascending: false }),
  ]);

  const rows = apps ?? [];

  // Duplicate detection: non-terminal match on (parent_phone, lower(applicant_name)).
  const nonTerminal = rows.filter((r) => r.stage !== "rejected" && r.stage !== "enrolled");
  const dupKey = (r: (typeof rows)[number]) => `${r.parent_phone}|${r.applicant_name.toLowerCase()}`;
  const dupCounts = new Map<string, number>();
  for (const r of nonTerminal) dupCounts.set(dupKey(r), (dupCounts.get(dupKey(r)) ?? 0) + 1);

  const cards: ApplicationCard[] = rows
    .filter((r) => r.payment_status !== "pending") // hidden while pending, per D17
    .map((r) => {
      const cls = r.classes as unknown as { name: string } | null;
      return {
        id: r.id,
        applicantName: r.applicant_name,
        parentPhone: r.parent_phone,
        className: cls?.name ?? "—",
        stage: r.stage,
        source: r.source,
        paymentStatus: r.payment_status,
        testScore: r.entrance_test_score,
        assignedTo: r.assigned_to,
        createdAt: r.created_at,
        isDuplicate: r.stage !== "rejected" && r.stage !== "enrolled" && (dupCounts.get(dupKey(r)) ?? 0) > 1,
        isConverted: !!r.converted_student_id,
      };
    });

  const pendingCount = rows.filter((r) => r.payment_status === "pending").length;

  return (
   <AdmissionsBoard
      schoolId={schoolId}
      applications={cards}
      classes={classes ?? []}
      settings={settings ?? { is_open: false, application_fee: 0, admission_academic_year_id: null }}
      years={years ?? []}
      canManageSettings={canManageSettings}
      awaitingPaymentCount={pendingCount}
      publicFormUrl={school?.domain ? `https://${school.domain}/apply` : ""}
    />
  );
}
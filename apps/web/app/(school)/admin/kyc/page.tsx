import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { KycDashboard, type QueueRow } from "./kyc-dashboard";

export default async function KycPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.kyc_documents !== true) return <ModuleUnavailable module="KYC Documents" />;

  // Lazy-seed — idempotent, no-op if already seeded.
  await supabase.rpc("seed_document_types", { p_school_id: schoolId });

  const [{ data: completeness }, { data: docs }] = await Promise.all([
    supabase.from("student_kyc_completeness").select("student_id, student_name, required_total, verified_count, pending_count"),
    // No embed on subject_id — kyc_documents.subject_id has NO foreign key
    // (deliberately polymorphic; the RPC validates it, not a constraint).
    // PostgREST's `!subject_id` embed shorthand requires an actual FK to
    // resolve, so it errored on every call and silently returned no rows.
    // Student names are joined manually below instead.
    supabase
      .from("kyc_documents")
      .select("id, subject_id, status, expires_on, file_name, file_type, file_size, created_at, uploaded_by, document_type:document_types(name)"),
  ]);

  const rows = completeness ?? [];
  const totalStudents = rows.length;
  const fullyVerified = rows.filter((r) => r.required_total > 0 && r.verified_count >= r.required_total).length;
  const incompleteCount = rows.filter((r) => r.required_total > r.verified_count).length;
  const recordsCompletePct = totalStudents > 0 ? Math.round((fullyVerified / totalStudents) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const in30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

 const enrollmentByStudent = new Map<string, { className: string }>();
  const studentNameById = new Map<string, string>();
  const studentIds = [...new Set((docs ?? []).map((d) => d.subject_id))];
  if (studentIds.length > 0) {
    const [{ data: enrollments }, { data: students }] = await Promise.all([
      supabase
        .from("student_enrollments")
        .select("student_profile_id, classes(name)")
        .in("student_profile_id", studentIds)
        .eq("is_active", true),
      supabase
        .from("student_profiles")
        .select("id, full_name")
        .in("id", studentIds),
    ]);
    for (const e of enrollments ?? []) {
      const cls = e.classes as unknown as { name: string } | null;
      enrollmentByStudent.set(e.student_profile_id, { className: cls?.name ?? "—" });
    }
    for (const s of students ?? []) {
      studentNameById.set(s.id, s.full_name ?? "—");
    }
  }

  const toVerify: QueueRow[] = [];
  const expiring: QueueRow[] = [];
  for (const d of docs ?? []) {
    const docType = d.document_type as unknown as { name: string } | null;
    const row: QueueRow = {
      id: d.id,
      studentId: d.subject_id,
      studentName: studentNameById.get(d.subject_id) ?? "—",
      className: enrollmentByStudent.get(d.subject_id)?.className ?? "—",
      documentTypeName: docType?.name ?? "—",
      fileName: d.file_name,
      fileType: d.file_type,
      fileSize: d.file_size,
      status: d.status,
      expiresOn: d.expires_on,
      createdAt: d.created_at,
    };
    if (d.status === "submitted") toVerify.push(row);
    if (d.status === "verified" && d.expires_on && d.expires_on <= in30d) expiring.push(row);
  }

  const expiredCount = expiring.filter((r) => r.expiresOn && r.expiresOn < today).length;

  const incompleteStudents = rows
    .filter((r) => r.required_total > r.verified_count)
    .map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      className: enrollmentByStudent.get(r.student_id)?.className ?? "—",
      missing: r.required_total - r.verified_count,
    }));

  return (
    <KycDashboard
      recordsCompletePct={recordsCompletePct}
      fullyVerifiedCount={fullyVerified}
      totalStudents={totalStudents}
      incompleteCount={incompleteCount}
      toVerify={toVerify}
      expiring={expiring}
      expiredCount={expiredCount}
      incompleteStudents={incompleteStudents}
    />
  );
}
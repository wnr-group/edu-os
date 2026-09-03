export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { PageHeader } from "@/components/page-header";
import { CertificatesTable } from "@/app/(school)/admin/certificates/certificates-table";

export default async function PrincipalCertificatesPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: enrollments }, { data: classes }, { data: history }] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_profile_id, roll_number, student_profile:student_profiles(id, full_name, admission_number), class:classes(name), section:sections(name)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true)
      .order("student_profile_id"),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("bonafide_certificates")
      .select("id, generated_at, generated_by, student_profile_id, student_profile:student_profiles(full_name), academic_year:academic_years(name)")
      .eq("school_id", schoolId)
      .order("generated_at", { ascending: false })
      .limit(200),
  ]);

  const students = (enrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null; admission_number: string | null } | null;
    const cls = e.class as unknown as { name: string } | null;
    const sec = e.section as unknown as { name: string } | null;
    return { id: sp?.id ?? "", name: sp?.full_name ?? "—", admission: sp?.admission_number ?? "—", class_name: cls?.name ?? "—", section: sec?.name ?? "—" };
  }).filter((s) => s.id);

  const generatorIds = [...new Set((history ?? []).map((h) => (h as any).generated_by).filter(Boolean))];
  const { data: generators } = generatorIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", generatorIds)
    : { data: [] };
  const generatorMap = new Map((generators ?? []).map((g) => [g.id, g.full_name]));

  const historyRows = (history ?? []).map((h) => {
    const sp = h.student_profile as unknown as { full_name: string | null } | null;
    const ay = h.academic_year as unknown as { name: string | null } | null;
    return { id: h.id, student_profile_id: (h as any).student_profile_id ?? "", student_name: sp?.full_name ?? "—", class_name: "—", academic_year: ay?.name ?? "—", generated_by_name: generatorMap.get((h as any).generated_by) ?? "—", generated_at: new Date(h.generated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) };
  });

  const classOptions = (classes ?? []).map((c) => ({ label: c.name, value: c.name }));

  return (
    <div>
      <PageHeader title="Certificates" description="Generate bonafide certificates for students." stats={[{ label: "Total Students", value: students.length }]} />
      <CertificatesTable students={students} history={historyRows} classOptions={classOptions} baseHref="/principal/certificates" studentDetailHrefPrefix="/principal/students" />
    </div>
  );
}

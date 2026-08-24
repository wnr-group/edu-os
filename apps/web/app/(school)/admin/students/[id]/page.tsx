export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { DetailPageTemplate } from "@/components/detail-page-template";
import { PhotoUpload } from "./photo-upload";
import { StudentEditForm } from "./student-edit-form";
import { StudentAttendanceTab } from "./student-attendance-tab";
import { StudentAcademicsTab } from "./student-academics-tab";
import { StudentFeesTab } from "./student-fees-tab";
import { StudentDocumentsTab } from "./student-documents-tab";
import { StudentIdCardTab } from "./student-id-card-tab";

type Tab = "attendance" | "academics" | "fees" | "documents" | "id-card";

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; month?: string; year?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab = (sp.tab ?? "attendance") as Tab;
  const now = new Date();
  const month = sp.month !== undefined ? parseInt(sp.month, 10) : now.getMonth();
  const year = sp.year !== undefined ? parseInt(sp.year, 10) : now.getFullYear();

  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const { data: kycCompleteness } = await supabase
    .from("student_kyc_completeness")
    .select("required_total, verified_count")
    .eq("student_id", id)
    .maybeSingle();

  const [{ data: student }, { data: classes }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id, full_name, email, photo_url, admission_number, date_of_birth, gender, profile:profiles!profile_id(full_name, email), parent:profiles!parent_profile_id(full_name, phone)")
      .eq("id", id)
      .single(),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
  ]);

  if (!student) notFound();

  // Fetch current enrollment for class/section/roll
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("id, roll_number, class_id, section_id, class:classes(name), section:sections(name)")
    .eq("student_profile_id", id)
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId ?? "")
    .maybeSingle();

  const profile = student.profile as unknown as { full_name: string; email: string } | null;
  const parent = student.parent as unknown as { full_name: string | null; phone: string | null } | null;
  const displayName = profile?.full_name ?? (student as unknown as { full_name: string | null }).full_name ?? "Student";
  const displayEmail = profile?.email ?? (student as unknown as { email: string | null }).email ?? "";
  // Parent is the linked identity via parent_profile_id.
  const displayParentPhone = parent?.phone ?? "";
  const displayParentName = parent?.full_name ?? "";
  const cls = enrollment?.class as unknown as { name: string } | null;
  const sec = enrollment?.section as unknown as { name: string } | null;

  const prevDate = new Date(year, month - 1);
  const nextDate = new Date(year, month + 1);
  const prevHref = `?tab=attendance&month=${prevDate.getMonth()}&year=${prevDate.getFullYear()}`;
  const nextHref = `?tab=attendance&month=${nextDate.getMonth()}&year=${nextDate.getFullYear()}`;
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const subtitleParts = [
    cls?.name ? `${cls.name}${sec?.name ? ` · Section ${sec.name}` : ""}` : null,
    enrollment?.roll_number ? `Roll No: ${enrollment.roll_number}` : null,
    student.admission_number ? `Adm: ${student.admission_number}` : null,
  ].filter(Boolean);

  const attendanceContent = (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Link href={prevHref} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">←</Link>
        <span className="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
        <Link href={nextHref} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">→</Link>
      </div>
      <StudentAttendanceTab studentId={id} month={month} year={year} />
    </>
  );

  return (
    <DetailPageTemplate
      backHref="/admin/students"
      backLabel="Back to Students"
      title={displayName}
      subtitle={subtitleParts.length > 0 ? subtitleParts.join("  ·  ") : undefined}
      basePath={`/admin/students/${id}`}
      activeTab={activeTab}
      header={
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex items-start gap-5">
              <PhotoUpload
                studentId={student.id}
                studentName={displayName}
                photoUrl={(student as unknown as { photo_url: string | null }).photo_url}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Profile</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                  {cls?.name && <span>{cls.name}{sec?.name ? ` · Section ${sec.name}` : ""}</span>}
                  {enrollment?.roll_number && <span>Roll No: {enrollment.roll_number}</span>}
                  {student.admission_number && <span>Adm: {student.admission_number}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Edit Profile</h2>
            <StudentEditForm
              studentId={student.id}
              enrollmentId={enrollment?.id ?? null}
              schoolId={schoolId}
              initialName={displayName !== "Student" ? displayName : ""}
              initialEmail={displayEmail}
              initialParentPhone={displayParentPhone}
              initialRoll={enrollment?.roll_number ?? ""}
              initialAdmission={student.admission_number ?? ""}
              initialDateOfBirth={(student as any).date_of_birth ?? ""}
              initialParentName={displayParentName}
              initialGender={(student as any).gender ?? ""}
              initialClassId={enrollment?.class_id ?? ""}
              initialSectionId={enrollment?.section_id ?? ""}
              classes={classes ?? []}
            />
          </div>
        </div>
      }
      tabs={[
        { key: "attendance", label: "Attendance", content: attendanceContent },
        { key: "academics", label: "Academics", content: <StudentAcademicsTab studentId={id} /> },
        { key: "fees", label: "Fees", content: <StudentFeesTab studentId={id} studentName={displayName} /> },
        {
          key: "documents",
          label: kycCompleteness ? `Documents (${kycCompleteness.verified_count}/${kycCompleteness.required_total})` : "Documents",
          content: <StudentDocumentsTab studentId={id} schoolId={schoolId} />,
        },
        { key: "id-card", label: "ID Card", content: <StudentIdCardTab studentId={id} schoolId={schoolId} /> },
      ]}
    />
  );
}
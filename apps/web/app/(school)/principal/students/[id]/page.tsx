export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, Cake, VenetianMask } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { DetailPageTemplate } from "@/components/detail-page-template";
import { StudentAttendanceTab } from "@/app/(school)/admin/students/[id]/student-attendance-tab";
import { StudentAcademicsTab } from "@/app/(school)/admin/students/[id]/student-academics-tab";
import { StudentFeesTab } from "@/app/(school)/admin/students/[id]/student-fees-tab";
import { StudentDocumentsTab } from "@/app/(school)/admin/students/[id]/student-documents-tab";
import { StudentIdCardTab } from "@/app/(school)/admin/students/[id]/student-id-card-tab";
import { StudentHealthTab } from "@/app/(school)/admin/students/[id]/student-health-tab";
import { avatarColor, initialsOf } from "@/lib/student-avatar";

type Tab = "attendance" | "academics" | "fees" | "documents" | "id-card" | "health";

export default async function PrincipalStudentDetailPage({
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

 const [{ data: student }, { data: kycCompleteness }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id, full_name, email, photo_url, admission_number, date_of_birth, gender, profile:profiles!profile_id(full_name, email), parent:profiles!parent_profile_id(full_name, phone)")
      .eq("id", id)
      .eq("school_id", schoolId)
      .single(),
    supabase
      .from("student_kyc_completeness")
      .select("required_total, verified_count")
      .eq("student_id", id)
      .maybeSingle(),
  ]);

  if (!student) notFound();

  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("roll_number, class:classes(name), section:sections(name)")
    .eq("student_profile_id", id)
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId ?? "")
    .maybeSingle();

  const profile = student.profile as unknown as { full_name: string; email: string } | null;
  const parent = student.parent as unknown as { full_name: string | null; phone: string | null } | null;
  const displayName = profile?.full_name ?? (student as unknown as { full_name: string | null }).full_name ?? "Student";
  const displayEmail = profile?.email ?? (student as unknown as { email: string | null }).email ?? "";
  const photoUrl = (student as unknown as { photo_url: string | null }).photo_url;
  const cls = enrollment?.class as unknown as { name: string } | null;
  const sec = enrollment?.section as unknown as { name: string } | null;

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const prevDate = new Date(year, month - 1);
  const nextDate = new Date(year, month + 1);
  const prevHref = `?tab=attendance&month=${prevDate.getMonth()}&year=${prevDate.getFullYear()}`;
  const nextHref = `?tab=attendance&month=${nextDate.getMonth()}&year=${nextDate.getFullYear()}`;

  const subtitleParts = [
    cls?.name ? `${cls.name}${sec?.name ? ` · Section ${sec.name}` : ""}` : null,
    enrollment?.roll_number ? `Roll No: ${enrollment.roll_number}` : null,
    student.admission_number ? `Adm: ${student.admission_number}` : null,
  ].filter(Boolean);

  const gender = (student as unknown as { gender: string | null }).gender;
  const dob = (student as unknown as { date_of_birth: string | null }).date_of_birth;
  const av = avatarColor(displayName);

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
      backHref="/principal/students"
      backLabel="Back to Students"
      title={displayName}
      subtitle={subtitleParts.length > 0 ? subtitleParts.join("  ·  ") : undefined}
      basePath={`/principal/students/${id}`}
      activeTab={activeTab}
      header={
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-5">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={displayName} className="h-20 w-20 shrink-0 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold"
                style={{ background: av.bg, color: av.fg }}
              >
                {initialsOf(displayName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Profile</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
                {cls?.name && <span>{cls.name}{sec?.name ? ` · Section ${sec.name}` : ""}</span>}
                {enrollment?.roll_number && <span>Roll No: {enrollment.roll_number}</span>}
                {student.admission_number && <span>Adm: {student.admission_number}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
                {displayEmail && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {displayEmail}
                  </span>
                )}
                {parent?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {parent.phone}
                    {parent.full_name ? ` (${parent.full_name})` : ""}
                  </span>
                )}
                {dob && (
                  <span className="inline-flex items-center gap-1.5">
                    <Cake className="h-3.5 w-3.5 text-muted-foreground" /> {dob}
                  </span>
                )}
                {gender && (
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <VenetianMask className="h-3.5 w-3.5 text-muted-foreground" /> {gender}
                  </span>
                )}
              </div>
            </div>
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
        { key: "health", label: "Health", content: <StudentHealthTab studentId={id} schoolId={schoolId} /> },
      ]}
    />
  );
}

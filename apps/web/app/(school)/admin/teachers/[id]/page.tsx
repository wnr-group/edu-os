import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { DetailPageTemplate } from "@/components/detail-page-template";
import { RemoveTeacherButton } from "./remove-teacher-button";

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: teacher } = await supabase
    .from("teacher_profiles")
    .select("id, created_at, profile_id, school_id, profile:profiles(full_name, email, phone)")
    .eq("id", id)
    .single();

  if (!teacher) notFound();

  const profile = teacher.profile as unknown as { full_name: string; email: string; phone: string | null } | null;

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  let assignedSections: { id: string; name: string; className: string }[] = [];
  let subjectsTaught: { id: string; name: string; className: string }[] = [];

  const schoolId = await getSchoolId();
  const userId = teacher.profile_id as string | null;

  if (userId && schoolId) {
    const academicYearId = await getAcademicYearId(schoolId);

    let query = supabase
      .from("timetable")
      .select(`
        section:sections(id, name, class:classes(name)),
        subject:subjects(id, name, class:classes(name))
      `)
      .eq("teacher_id", userId)
      .eq("school_id", schoolId);

    if (academicYearId) {
      query = query.eq("academic_year_id", academicYearId);
    }

    const { data: timetableRows } = await query;

    const seenSections = new Set<string>();
    const seenSubjects = new Set<string>();

    for (const row of timetableRows ?? []) {
      const sec = row.section as unknown as { id: string; name: string; class: { name: string } | null } | null;
      if (sec?.id && !seenSections.has(sec.id)) {
        seenSections.add(sec.id);
        assignedSections.push({ id: sec.id, name: sec.name, className: sec.class?.name ?? "" });
      }
      const sub = row.subject as unknown as { id: string; name: string; class: { name: string } | null } | null;
      if (sub?.id && !seenSubjects.has(sub.id)) {
        seenSubjects.add(sub.id);
        subjectsTaught.push({ id: sub.id, name: sub.name, className: sub.class?.name ?? "" });
      }
    }
  }

  return (
    <DetailPageTemplate
      backHref="/admin/teachers"
      backLabel="Back to Teachers"
      title={profile?.full_name ?? "—"}
      subtitle={`Joined ${new Date(teacher.created_at).toLocaleDateString()}`}
      actions={
        <RemoveTeacherButton
          teacherId={teacher.id}
          schoolId={schoolId!}
          teacherName={profile?.full_name ?? "Teacher"}
        />
      }
      activeTab=""
      tabs={[]}
      header={
        <div className="space-y-6">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600">
                {initials}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" />
                  {profile?.phone ? (
                    <a href={`tel:${profile.phone}`} className="hover:underline">
                      {profile.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                {profile?.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="h-3.5 w-3.5" />
                    {profile.email}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Assigned Classes</h2>
              {assignedSections.length === 0 ? (
                <p className="text-sm italic text-gray-400">No classes assigned for this academic year.</p>
              ) : (
                <div className="space-y-2">
                  {assignedSections.map((sec) => (
                    <div key={sec.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800">Class {sec.className}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Section {sec.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Subjects Taught</h2>
              {subjectsTaught.length === 0 ? (
                <p className="text-sm italic text-gray-400">No subjects assigned for this academic year.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {subjectsTaught.map((sub) => (
                    <span key={sub.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                      {sub.name}
                      {sub.className && <span className="ml-1 text-xs text-indigo-400">· {sub.className}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
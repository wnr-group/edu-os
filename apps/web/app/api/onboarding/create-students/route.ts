import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

interface StudentInput {
  fullName: string;
  parentPhone: string;
  classId: string;
  sectionId: string;
  academicYearId: string;
}

export async function POST(request: NextRequest) {
  const { students }: { students: StudentInput[] } = await request.json();
  if (!students?.length) return NextResponse.json({ created: 0 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceSupabaseClient();
  let created = 0;
  const failed: string[] = [];

  for (const s of students) {
    const uid = crypto.randomUUID();

    // Resolve the parent identity by phone and link via parent_profile_id.
    let parentProfileId: string | null = null;
    const normalizedParent = `+91${(s.parentPhone ?? "").replace(/\D/g, "").slice(-10)}`;
    if (/^\+91\d{10}$/.test(normalizedParent)) {
      try {
        const { userId } = await findOrCreateUserByPhone(svc, normalizedParent, "");
        await attachRole(svc, userId, schoolId, "parent");
        parentProfileId = userId;
      } catch {
        failed.push(s.fullName);
        continue;
      }
    }

    const { data: sp, error: spErr } = await svc.from("student_profiles").insert({
      school_id: schoolId,
      full_name: s.fullName,
      admission_number: `ADM-${uid.slice(0, 8).toUpperCase()}`,
      parent_profile_id: parentProfileId,
    }).select("id").single();

    if (spErr || !sp) { failed.push(s.fullName); continue; }

    const { error: enrollErr } = await svc.from("student_enrollments").insert({
      student_profile_id: sp.id,
      academic_year_id: s.academicYearId,
      school_id: schoolId,
      class_id: s.classId,
      section_id: s.sectionId,
      is_active: true,
    });

    if (enrollErr) {
      failed.push(s.fullName);
      await svc.from("student_profiles").delete().eq("id", sp.id);
      continue;
    }

    created++;
  }

  return NextResponse.json({ created, failed: failed.length > 0 ? failed : undefined });
}

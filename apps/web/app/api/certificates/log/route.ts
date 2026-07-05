import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "principal", "super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const academicYearId = await getAcademicYearId(schoolId);
  if (!academicYearId) return NextResponse.json({ error: "No active academic year" }, { status: 400 });

  let body: { student_profile_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.student_profile_id) {
    return NextResponse.json({ error: "student_profile_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bonafide_certificates")
    .insert({
      school_id: schoolId,
      student_profile_id: body.student_profile_id,
      academic_year_id: academicYearId,
      generated_by: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}

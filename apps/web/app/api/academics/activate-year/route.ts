import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
  const { draftYearId } = await request.json();
  if (!draftYearId) return NextResponse.json({ error: "draftYearId required" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  // Verify the caller is authenticated and has admin rights
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Archive current active year
  const { data: currentActive } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();

  if (currentActive) {
    await supabase
      .from("academic_years")
      .update({ status: "archived" })
      .eq("id", currentActive.id);

    // Deactivate all enrollments from the archived year
    await supabase
      .from("student_enrollments")
      .update({ is_active: false })
      .eq("school_id", schoolId)
      .eq("academic_year_id", currentActive.id)
      .eq("is_active", true);
  }

  // Activate draft year
  const { error } = await supabase
    .from("academic_years")
    .update({ status: "active" })
    .eq("id", draftYearId)
    .eq("school_id", schoolId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

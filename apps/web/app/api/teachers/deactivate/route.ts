import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { teacherId: string; schoolId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { teacherId, schoolId } = body;
  if (!teacherId || !schoolId) {
    return NextResponse.json({ error: "teacherId and schoolId are required" }, { status: 400 });
  }

  // Check caller role
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const activeRoles = (roleRows ?? []).map((r) => r.role);
  const isAuthorized = activeRoles.includes("super_admin") || activeRoles.includes("school_admin");
  if (!isAuthorized) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch teacher profile to get profile_id
  const { data: teacherProfile, error: profileErr } = await adminClient
    .from("teacher_profiles")
    .select("id, profile_id, school_id")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (profileErr || !teacherProfile) {
    return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
  }

  // Deactivate teacher role in user_roles
  const { error: roleErr } = await adminClient
    .from("user_roles")
    .update({ is_active: false })
    .eq("user_id", teacherProfile.profile_id)
    .eq("school_id", schoolId)
    .eq("role", "teacher");

  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 500 });
  }

  // Clear class_teacher_of assignment if present
  await adminClient
    .from("teacher_profiles")
    .update({ class_teacher_of: null })
    .eq("id", teacherId);

  // Clear assigned timetable slots for this teacher at this school
  await adminClient
    .from("timetable")
    .delete()
    .eq("teacher_id", teacherProfile.profile_id)
    .eq("school_id", schoolId);

  // Clear class teacher assignments for this teacher at this school
  await adminClient
    .from("section_assignments")
    .delete()
    .eq("class_teacher_id", teacherProfile.profile_id)
    .eq("school_id", schoolId);

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // getSchoolId() resolves from middleware x-school-id header (domain-based) or host header.
  // The host header can be influenced by the client, so hasAnyRole cross-checks the
  // school_id bound to the caller's role to prevent cross-tenant data access.
  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { class_id: string; academic_year_id: string; fee_type_id: string; total_amount: number; due_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.class_id || !body.fee_type_id || typeof body.total_amount !== "number" || body.total_amount <= 0 || !isFinite(body.total_amount)) {
    return NextResponse.json({ error: "Missing or invalid required fields" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all students enrolled in this class
  const { data: enrollments, error: studentsError } = await adminClient
    .from("student_enrollments")
    .select("student_profile_id")
    .eq("school_id", schoolId)
    .eq("class_id", body.class_id)
    .eq("is_active", true);

  if (studentsError) {
    return NextResponse.json({ error: studentsError.message }, { status: 500 });
  }

  if (!enrollments || enrollments.length === 0) {
    return NextResponse.json({ created: 0, message: "No students in this class." });
  }

  const lineItems = enrollments.map((s) => ({
    school_id: schoolId,
    student_id: s.student_profile_id,
    fee_type_id: body.fee_type_id,
    total_amount: body.total_amount,
    due_date: body.due_date ?? null,
    added_by: user.id,
    class_id: body.class_id,
    academic_year_id: body.academic_year_id ?? null,
    status: "pending",
  }));

  const { data: inserted, error: insertError } = await adminClient
    .from("fee_line_items")
    .insert(lineItems)
    .select("id");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ created: inserted?.length ?? 0 });
}

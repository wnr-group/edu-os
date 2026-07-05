import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: schoolId } = await params;
  let body: { phone: string; fullName: string; role: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { phone, fullName, role } = body;

  const allowedRoles = ["school_admin", "principal", "teacher", "parent"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden: invalid role" }, { status: 403 });
  }

  if (!/^\+91\d{10}$/.test(phone)) {
    return NextResponse.json({ error: "Invalid phone number. Must be +91 followed by 10 digits." }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let userId: string;
  try {
    const result = await findOrCreateUserByPhone(adminClient, phone, fullName);
    userId = result.userId;
    await attachRole(adminClient, userId, schoolId, role);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Provisioning failed" },
      { status: 400 },
    );
  }

  if (role === "teacher") {
    const { error: teacherError } = await adminClient
      .from("teacher_profiles")
      .insert({ profile_id: userId, school_id: schoolId });
    if (teacherError && teacherError.code !== "23505") {
      return NextResponse.json({ error: `Failed to create teacher profile: ${teacherError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ userId });
}

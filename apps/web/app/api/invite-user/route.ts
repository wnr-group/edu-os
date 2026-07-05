import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const activeRoles = (roleRows ?? []).map((r) => r.role);
  // A user may hold several roles (e.g. school_admin + teacher). Pick the most
  // privileged one that is allowed to invite others.
  const callerRole = activeRoles.includes("super_admin")
    ? "super_admin"
    : activeRoles.includes("school_admin")
      ? "school_admin"
      : null;

  if (!callerRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    phone: string;
    fullName: string;
    schoolId: string;
    role: string;
    extraInserts?: { table: string; data: Record<string, unknown> }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { phone, fullName, schoolId, role, extraInserts } = body;

  // school_admin must belong to the target school
  if (callerRole === "school_admin") {
    const { data: schoolRoleRow } = await supabase
      .from("user_roles")
      .select("school_id")
      .eq("user_id", user.id)
      .eq("role", "school_admin")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .maybeSingle();
    if (!schoolRoleRow) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Restrict what roles each caller can assign
  const allowedRoles: Record<string, string[]> = {
    school_admin: ["teacher", "parent"],
    super_admin: ["school_admin", "principal", "teacher", "parent"],
  };
  if (!allowedRoles[callerRole]?.includes(role)) {
    return NextResponse.json({ error: "Forbidden: cannot assign that role" }, { status: 403 });
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

  if (extraInserts) {
    const allowedTables = ["teacher_profiles", "parent_profiles"];
    for (const { table } of extraInserts) {
      if (!allowedTables.includes(table)) {
        return NextResponse.json({ error: `Forbidden: table '${table}' is not allowed` }, { status: 403 });
      }
    }
    for (const { table, data } of extraInserts) {
      const { error: insertError } = await adminClient.from(table).insert({ ...data, profile_id: userId });
      if (insertError && insertError.code !== "23505") {
        return NextResponse.json({ error: `Failed to insert into ${table}: ${insertError.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ userId });
}

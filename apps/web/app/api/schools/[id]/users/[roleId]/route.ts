import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

async function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, error: "Unauthorized", status: 401 };

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["super_admin"])) {
    return { user: null, error: "Forbidden", status: 403 };
  }

  return { user, error: null, status: 200 };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { error, status } = await requireSuperAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const { roleId } = await params;

  const body = (await request.json()) as { role?: string; is_active?: boolean };
  const updates: Record<string, unknown> = {};
  if ("role" in body) updates.role = body.role;
  if ("is_active" in body) updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const adminClient = await getAdminClient();

  const { data, error: dbError } = await adminClient
    .from("user_roles")
    .update(updates)
    .eq("id", roleId)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { error, status } = await requireSuperAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const { roleId } = await params;
  const adminClient = await getAdminClient();

  // Resolve the auth user id from the role row
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("user_id")
    .eq("id", roleId)
    .single();

  if (roleErr || !roleRow) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const userId = roleRow.user_id as string;

  // Delete all records that reference this user with NOT NULL FKs.
  // Records with nullable FKs are nulled out instead (school_gallery, feedback, audit_log).
  await Promise.all([
    // Operational records owned by the user (NOT NULL FK — must delete)
    adminClient.from("timetable").delete().eq("teacher_id", userId),
    adminClient.from("section_assignments").delete().eq("class_teacher_id", userId),
    adminClient.from("attendance_records").delete().eq("marked_by", userId),
    adminClient.from("homework").delete().eq("teacher_id", userId),
    adminClient.from("exam_results").delete().eq("teacher_id", userId),
    adminClient.from("discipline_records").delete().eq("recorded_by", userId),
    adminClient.from("announcements").delete().eq("created_by", userId),
    adminClient.from("feedback").delete().eq("from_user_id", userId),
    // Nullable FK columns — null out rather than delete
    adminClient.from("school_gallery").update({ uploaded_by: null }).eq("uploaded_by", userId),
    adminClient.from("feedback").update({ to_user_id: null }).eq("to_user_id", userId),
  ]);

  // Delete the auth user — cascades to profiles and user_roles automatically
  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

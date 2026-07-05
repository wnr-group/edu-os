import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

interface TeacherInput {
  fullName: string;
  phone: string;
}

export async function POST(request: NextRequest) {
  const { teachers }: { teachers: TeacherInput[] } = await request.json();
  if (!teachers?.length) return NextResponse.json({ created: 0 });

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
  const created: string[] = [];
  const failed: string[] = [];

  for (const t of teachers) {
    const phone = `+91${t.phone.replace(/\D/g, "").slice(-10)}`;
    try {
      const { userId } = await findOrCreateUserByPhone(svc, phone, t.fullName);
      await attachRole(svc, userId, schoolId, "teacher");
      const { error: tpErr } = await svc
        .from("teacher_profiles")
        .insert({ profile_id: userId, school_id: schoolId });
      if (tpErr && tpErr.code !== "23505") { failed.push(t.fullName); continue; }
      created.push(userId);
    } catch {
      failed.push(t.fullName);
    }
  }

  return NextResponse.json({ created: created.length, failed: failed.length > 0 ? failed : undefined });
}

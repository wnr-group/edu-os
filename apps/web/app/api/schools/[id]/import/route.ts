import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

interface ImportRow {
  full_name: string;
  phone: string;
  roll_number?: string;
  class_name?: string;
  section_name?: string;
  parent_phone?: string;
  parent_name?: string;
}

interface ImportBody {
  role: string;
  rows: ImportRow[];
}

interface RowResult {
  row: number;
  status: "ok" | "error";
  error?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check — super_admin only
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["super_admin"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Get schoolId from params
  const { id: schoolId } = await params;

  // 3. Create admin client with service role
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: school } = await adminClient
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { role, rows } = body;

  // Validate role against allowlist
  const allowedRoles = ["school_admin", "principal", "teacher", "parent", "student"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden: invalid role" }, { status: 403 });
  }

  // 4. Pre-fetch classes and sections for student imports
  const classMap = new Map<string, string>();
  const sectionMap = new Map<string, string>();

  if (role === "student") {
    const { data: classes } = await adminClient
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId);

    if (classes) {
      for (const cls of classes) {
        classMap.set(cls.name.toLowerCase(), cls.id);
      }
    }

    const { data: sections } = await adminClient
      .from("sections")
      .select("id, name, class_id")
      .eq("school_id", schoolId);

    if (sections) {
      for (const sec of sections) {
        sectionMap.set(`${sec.class_id}:${sec.name.toLowerCase()}`, sec.id);
      }
    }
  }

  // 5. Process each row sequentially
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (role === "student") {
        // Students are data-only records — no auth account needed
        const className = row.class_name?.toLowerCase() ?? "";
        const sectionName = row.section_name?.toLowerCase() ?? "";
        const classId = className ? classMap.get(className) : undefined;
        const sectionId = classId && sectionName
          ? sectionMap.get(`${classId}:${sectionName}`)
          : undefined;

        let parentProfileId: string | null = null;
        if (row.parent_phone) {
          const parentPhone = `+91${row.parent_phone.replace(/\D/g, "").slice(-10)}`;
          if (/^\+91\d{10}$/.test(parentPhone)) {
            const { userId: parentId } = await findOrCreateUserByPhone(
              adminClient,
              parentPhone,
              row.parent_name ?? "",
            );
            await attachRole(adminClient, parentId, schoolId, "parent");
            parentProfileId = parentId;
          }
        }

        const { error: studentError } = await adminClient
          .from("student_profiles")
          .insert({
            school_id: schoolId,
            full_name: row.full_name,
            class_id: classId ?? null,
            section_id: sectionId ?? null,
            roll_number: row.roll_number ?? null,
            parent_profile_id: parentProfileId,
          });
        if (studentError) throw new Error(studentError.message);
      } else {
        // Teachers and parents get auth accounts via phone
        if (!/^\+91\d{10}$/.test(row.phone)) {
          throw new Error(`Invalid phone number: ${row.phone}. Must be +91 followed by 10 digits.`);
        }
        const { userId } = await findOrCreateUserByPhone(adminClient, row.phone, row.full_name);
        await attachRole(adminClient, userId, schoolId, role);

        if (role === "teacher") {
          const { error: teacherError } = await adminClient
            .from("teacher_profiles")
            .insert({ profile_id: userId, school_id: schoolId });
          if (teacherError && teacherError.code !== "23505") {
            throw new Error(`teacher_profiles: ${teacherError.message}`);
          }
        }
      }

      results.push({ row: i, status: "ok" });
    } catch (err) {
      results.push({
        row: i,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 6. Return results
  return NextResponse.json({ results });
}

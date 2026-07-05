import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { sendParentWelcomeSmsBatch, type WelcomeRecipient } from "@/lib/provisioning/send-welcome-sms";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

interface ImportRow {
  full_name: string;
  email?: string;
  roll_number?: string;
  admission_number?: string;
  class_name?: string;
  section_name?: string;
  parent_phone?: string;
  parent_name?: string;
}

interface RowResult {
  row: number;
  status: "created" | "updated" | "error";
  error?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { rows } = (await request.json()) as { rows: ImportRow[] };

  const { data: schoolData } = await adminClient
    .from("schools")
    .select("domain")
    .eq("id", schoolId)
    .single();
  const schoolDomain = schoolData?.domain ?? null;

  const { data: classes } = await adminClient
    .from("classes")
    .select("id, name")
    .eq("school_id", schoolId);

  const { data: sections } = await adminClient
    .from("sections")
    .select("id, name, class_id")
    .eq("school_id", schoolId);

  const classMap = new Map<string, string>();
  for (const cls of classes ?? []) {
    classMap.set(cls.name.toLowerCase().trim(), cls.id);
  }

  const sectionMap = new Map<string, string>();
  for (const sec of sections ?? []) {
    sectionMap.set(`${sec.class_id}:${sec.name.toLowerCase().trim()}`, sec.id);
  }

  const results: RowResult[] = [];
  const welcomeRecipients: WelcomeRecipient[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.full_name?.trim()) {
        throw new Error("Missing full_name");
      }

      const className = row.class_name?.toLowerCase().trim() ?? "";
      const sectionName = row.section_name?.toLowerCase().trim() ?? "";
      const classId = className ? classMap.get(className) : undefined;
      const sectionId = classId && sectionName
        ? sectionMap.get(`${classId}:${sectionName}`)
        : undefined;

      // Resolve the parent identity by phone and link via parent_profile_id.
      let parentProfileId: string | null = null;
      const normalizedParent = `+91${(row.parent_phone ?? "").replace(/\D/g, "").slice(-10)}`;
      if (/^\+91\d{10}$/.test(normalizedParent)) {
        const { userId, created } = await findOrCreateUserByPhone(adminClient, normalizedParent, row.parent_name?.trim() ?? "");
        await attachRole(adminClient, userId, schoolId, "parent");
        parentProfileId = userId;
        if (created && schoolDomain) {
          welcomeRecipients.push({
            phone: normalizedParent,
            parentName: row.parent_name?.trim() ?? "",
            studentName: row.full_name.trim(),
          });
        }
      }

      const record = {
        school_id: schoolId,
        full_name: row.full_name.trim(),
        email: row.email?.trim() || null,
        roll_number: row.roll_number?.trim() || null,
        admission_number: row.admission_number?.trim() || null,
        class_id: classId ?? null,
        section_id: sectionId ?? null,
        parent_profile_id: parentProfileId,
      };

      if (row.admission_number?.trim()) {
        const { data: existing } = await adminClient
          .from("student_profiles")
          .select("id")
          .eq("school_id", schoolId)
          .eq("admission_number", row.admission_number.trim())
          .maybeSingle();

        if (existing) {
          const { error } = await adminClient
            .from("student_profiles")
            .update(record)
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          results.push({ row: i, status: "updated" });
        } else {
          const { error } = await adminClient
            .from("student_profiles")
            .insert(record);
          if (error) throw new Error(error.message);
          results.push({ row: i, status: "created" });
        }
      } else {
        const { error } = await adminClient
          .from("student_profiles")
          .insert(record);
        if (error) throw new Error(error.message);
        results.push({ row: i, status: "created" });
      }
    } catch (err) {
      results.push({
        row: i,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Send welcome SMS to all newly-created parents in batches of 100.
  if (schoolDomain && welcomeRecipients.length > 0) {
    for (let i = 0; i < welcomeRecipients.length; i += 100) {
      await sendParentWelcomeSmsBatch(welcomeRecipients.slice(i, i + 100), schoolDomain);
    }
  }

  return NextResponse.json({ results });
}

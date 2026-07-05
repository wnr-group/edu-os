import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";
import { sendParentWelcomeSmsBatch, type WelcomeRecipient } from "@/lib/provisioning/send-welcome-sms";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
import { getAcademicYearId } from "@/lib/academic-year";

interface ImportRow {
  full_name: string;
  email?: string;
  roll_number?: string;
  admission_number?: string;
  class_name?: string;
  section_name?: string;
  parent_phone?: string;
  parent_name?: string;
  date_of_birth?: string;
  gender?: string;
}

// Accept common date formats and normalize to YYYY-MM-DD (Postgres date).
// Returns null for empty/unparseable values so a bad date never fails the row.
function normalizeDob(raw?: string): string | null {
  const v = raw?.trim();
  if (!v) return null;
  // Already ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // DD/MM/YYYY or DD-MM-YYYY (the format the edit form displays)
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function normalizeGender(raw?: string): string | null {
  const v = raw?.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  if (v === "other" || v === "o") return "other";
  return null;
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

  // Class/section/roll live on student_enrollments, scoped to an academic year.
  const academicYearId = await getAcademicYearId(schoolId);

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

      // Identity lives on student_profiles; class/section/roll live on
      // student_enrollments (scoped to the active academic year).
      const record = {
        school_id: schoolId,
        full_name: row.full_name.trim(),
        email: row.email?.trim() || null,
        admission_number: row.admission_number?.trim() || null,
        date_of_birth: normalizeDob(row.date_of_birth),
        gender: normalizeGender(row.gender),
        parent_profile_id: parentProfileId,
      };

      let studentProfileId: string;
      let status: "created" | "updated" = "created";

      const existingId = row.admission_number?.trim()
        ? (
            await adminClient
              .from("student_profiles")
              .select("id")
              .eq("school_id", schoolId)
              .eq("admission_number", row.admission_number.trim())
              .maybeSingle()
          ).data?.id ?? null
        : null;

      if (existingId) {
        const { error } = await adminClient
          .from("student_profiles")
          .update(record)
          .eq("id", existingId);
        if (error) throw new Error(error.message);
        studentProfileId = existingId;
        status = "updated";
      } else {
        const { data: inserted, error } = await adminClient
          .from("student_profiles")
          .insert(record)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        studentProfileId = inserted.id;
      }

      // Enroll into the active year's class/section when both resolve. Skip
      // silently if the class/section names don't match or no active year —
      // the student profile is still created, just unassigned.
      if (classId && sectionId && academicYearId) {
        const enrollment = {
          student_profile_id: studentProfileId,
          academic_year_id: academicYearId,
          school_id: schoolId,
          class_id: classId,
          section_id: sectionId,
          roll_number: row.roll_number?.trim() || null,
          is_active: true,
        };
        const { data: existingEnroll } = await adminClient
          .from("student_enrollments")
          .select("id")
          .eq("student_profile_id", studentProfileId)
          .eq("academic_year_id", academicYearId)
          .maybeSingle();

        const { error: enrollErr } = existingEnroll
          ? await adminClient.from("student_enrollments").update(enrollment).eq("id", existingEnroll.id)
          : await adminClient.from("student_enrollments").insert(enrollment);
        if (enrollErr) throw new Error(enrollErr.message);
      }

      results.push({ row: i, status });
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

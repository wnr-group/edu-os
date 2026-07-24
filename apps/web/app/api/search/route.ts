import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ results: [] });

  const pattern = `%${q}%`;

  const [{ data: students }, { data: teachers }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id, full_name, admission_number")
      .eq("school_id", schoolId)
      .or(`full_name.ilike.${pattern},admission_number.ilike.${pattern}`)
      .limit(8),
    supabase
      .from("teacher_profiles")
      .select("id, profile_id, profile:profiles!teacher_profiles_profile_id_fkey(full_name)")
      .eq("school_id", schoolId)
      .limit(8),
  ]);

  const teacherResults = (teachers ?? [])
    .filter((t) => {
      const name = (t.profile as unknown as { full_name: string } | null)?.full_name ?? "";
      return name.toLowerCase().includes(q.toLowerCase());
    })
    .slice(0, 5);

  const results = [
    ...(students ?? []).map((s) => {
      return {
        id: s.id,
        type: "student" as const,
        name: s.full_name ?? "—",
        detail: s.admission_number ?? "",
      };
    }),
    ...teacherResults.map((t) => {
      const profile = t.profile as unknown as { full_name: string } | null;
      return {
        id: t.id,
        type: "teacher" as const,
        name: profile?.full_name ?? "—",
        detail: "Teacher",
      };
    }),
  ];

  return NextResponse.json({ results });
}

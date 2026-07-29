import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Shared-secret guard (set CRON_SECRET in function env; cron sends it).
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().split("T")[0];

  // Homework due today.
  const { data: dueHw } = await admin
    .from("homework")
    .select("id, school_id, section_id, title")
    .eq("due_date", today);

  // Batch check: one query for every school touched by today's due homework,
  // instead of an RPC call per row. Cron no-ops the disabled school, silently.
  const schoolIds = [...new Set((dueHw ?? []).map((h) => h.school_id))];
  const { data: schoolsData } = schoolIds.length
    ? await admin.from("schools").select("id, features_enabled").in("id", schoolIds)
    : { data: [] as { id: string; features_enabled: Record<string, boolean> }[] };
  const homeworkEnabledSchools = new Set(
    (schoolsData ?? []).filter((s) => s.features_enabled?.homework === true).map((s) => s.id)
  );

  let notified = 0;
  for (const hw of dueHw ?? []) {
    if (!homeworkEnabledSchools.has(hw.school_id)) continue;
    // Students enrolled in the section.
    const { data: enrollments } = await admin
      .from("student_enrollments")
      .select("student_profiles(id, full_name, parent_profile_id)")
      .eq("section_id", hw.section_id)
      .eq("is_active", true);

    // Students who already marked done for this homework.
    const { data: doneRows } = await admin
      .from("homework_status")
      .select("student_id")
      .eq("homework_id", hw.id)
      .eq("state", "done");
    const doneSet = new Set((doneRows ?? []).map((d: any) => d.student_id));

    const { data: school } = await admin.from("schools").select("name").eq("id", hw.school_id).maybeSingle();
    const schoolName = school?.name ?? "School";

    for (const row of enrollments ?? []) {
      const sp = (row as any).student_profiles;
      if (!sp?.parent_profile_id || doneSet.has(sp.id)) continue;

      const body = `Reminder: "${hw.title}" is due today.`;
      await admin.from("notifications").insert({
        school_id: hw.school_id, user_id: sp.parent_profile_id, student_id: sp.id,
        title: schoolName, body, type: "homework_due",
      });

      const { data: parent } = await admin.from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
      if (parent?.push_token) {
        await fetch(EXPO_PUSH_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: parent.push_token, title: schoolName, body, sound: "default" }),
        }).catch(() => {});
      }
      notified++;
    }
  }
  return json({ result: "ok", notified });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

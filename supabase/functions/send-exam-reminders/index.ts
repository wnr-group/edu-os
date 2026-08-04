import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Only slots belonging to a PUBLISHED exam — independent of edit/notify history.
  const { data: dueSlots } = await admin
    .from("exam_schedule_slots")
    .select("id, school_id, class_id, subject_id, start_time, exam_id, exams!inner(name, datesheet_published_at)")
    .eq("exam_date", tomorrowStr)
    .not("exams.datesheet_published_at", "is", null);

  let notified = 0;
  for (const slot of dueSlots ?? []) {
    const { data: className } = await admin.from("classes").select("name").eq("id", slot.class_id).maybeSingle();
    const { data: subject } = await admin.from("subjects").select("name").eq("id", slot.subject_id).maybeSingle();
    const { data: school } = await admin.from("schools").select("name").eq("id", slot.school_id).maybeSingle();
    const schoolName = school?.name ?? "School";

    const title = schoolName;
    const body = `${subject?.name ?? "Exam"} tomorrow, ${slot.start_time.slice(0, 5)}.`;

    const { data: enrollments } = await admin
      .from("student_enrollments")
      .select("student_profiles(id, parent_profile_id)")
      .eq("class_id", slot.class_id)
      .eq("is_active", true);

    for (const row of enrollments ?? []) {
      const sp = (row as any).student_profiles;
      if (!sp?.parent_profile_id) continue;

      await admin.from("notifications").insert({
        school_id: slot.school_id,
        user_id: sp.parent_profile_id,
        student_id: sp.id,
        title,
        body,
        type: "exam_reminder",
      });

      const { data: parent } = await admin.from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
      if (parent?.push_token) {
        await fetch(EXPO_PUSH_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: parent.push_token, title, body, sound: "default" }),
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
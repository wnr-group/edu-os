import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const REMINDER_WINDOW_DAYS = 7;

// Invoked daily by pg_cron (service-role, no user JWT). Finds vaccinations
// with next_due_date within REMINDER_WINDOW_DAYS that haven't already been
// reminded (reminder_sent_at IS NULL — set once per due date, cleared by
// upsert_vaccination whenever next_due_date actually changes), notifies the
// linked parent, and pushes to their device. Guarded by a shared secret so
// it can't be triggered by anyone, same pattern as send-birthday-wishes.
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

  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const { data: due } = await admin
    .from("student_vaccinations")
    .select("id, school_id, student_id, vaccine_name, next_due_date, student:student_profiles!student_id(full_name, parent_profile_id)")
    .is("reminder_sent_at", null)
    .not("next_due_date", "is", null)
    .gte("next_due_date", today)
    .lte("next_due_date", windowEnd);

  let notified = 0;

  for (const v of due ?? []) {
    const student = v.student as unknown as { full_name: string; parent_profile_id: string | null } | null;
    if (!student?.parent_profile_id) continue;

    const { data: enabled } = await admin.rpc("feature_enabled", { p_school_id: v.school_id, p_key: "health_records" });
    if (!enabled) continue;

    const firstName = (student.full_name ?? "").trim().split(/\s+/)[0] || "your child";
    const title = "Vaccination reminder";
    const body = `${firstName}'s ${v.vaccine_name} is due on ${v.next_due_date}.`;

    const { error: notifyError } = await admin.from("notifications").insert({
      school_id: v.school_id,
      user_id: student.parent_profile_id,
      student_id: v.student_id,
      title,
      body,
      type: "vaccination_reminder",
    });

    if (notifyError) {
      console.error("vaccination reminder insert failed", { vaccinationId: v.id, notifyError });
      continue; // skip the stamp — tomorrow's run retries it
    }

    const { data: parent } = await admin
      .from("profiles").select("push_token").eq("id", student.parent_profile_id).maybeSingle();
    if (parent?.push_token) {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: parent.push_token, title, body, sound: "default" }),
      }).catch(() => {});
    }

    // Only stamp once we know the notification actually landed.
    await admin.from("student_vaccinations").update({ reminder_sent_at: new Date().toISOString() }).eq("id", v.id);
    notified++;
  }

  return json({ result: "ok", notified });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

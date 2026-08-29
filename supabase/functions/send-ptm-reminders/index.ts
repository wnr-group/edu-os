import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Cron-triggered daily (see 20260821100200_ptm_notification_cron.sql),
// mirrors send-exam-reminders/index.ts. Only ever matches a given meeting on
// exactly one calendar day (scheduled_date = tomorrow), and additionally
// guards on reminder_sent_at IS NULL so a re-triggered/duplicate cron run
// can't double-send — the same nullable-timestamp guard exams.
// datesheet_last_notified_at already uses. reschedule_ptm_meeting resets
// reminder_sent_at to NULL, so a moved meeting gets a fresh reminder for its
// new date instead of none.
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

  const { data: dueMeetings } = await admin
    .from("ptm_meetings")
    .select("id, school_id, teacher_id, student_id, parent_id, start_time, meeting_mode, location")
    .eq("scheduled_date", tomorrowStr)
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .not("parent_id", "is", null);

  // Batched per-school feature check (not per-meeting) — same approach
  // send-homework-reminders uses across all touched schools in one query.
  const schoolIds = [...new Set((dueMeetings ?? []).map((m) => m.school_id))];
  const { data: schoolRows } = schoolIds.length > 0
    ? await admin.from("schools").select("id, features_enabled").in("id", schoolIds)
    : { data: [] as { id: string; features_enabled: Record<string, boolean> }[] };
  const ptmEnabledSchools = new Set((schoolRows ?? []).filter((s) => s.features_enabled?.ptm === true).map((s) => s.id));

  let notified = 0;
  for (const m of (dueMeetings ?? []).filter((m) => ptmEnabledSchools.has(m.school_id))) {
    const [{ data: student }, { data: teacherProfile }, { data: school }] = await Promise.all([
      admin.from("student_profiles").select("full_name").eq("id", m.student_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", m.teacher_id).maybeSingle(),
      admin.from("schools").select("name").eq("id", m.school_id).maybeSingle(),
    ]);
    const schoolName = school?.name ?? "School";
    const whereLabel = m.meeting_mode === "online" ? "online" : (m.location || "in person");
    const body = `Reminder: PTM for ${student?.full_name ?? "your child"} tomorrow, ${m.start_time.slice(0, 5)} with ${teacherProfile?.full_name ?? "the teacher"} — ${whereLabel}.`;

    await admin.from("notifications").insert({
      school_id: m.school_id,
      user_id: m.parent_id,
      student_id: m.student_id,
      title: schoolName,
      body,
      type: "ptm_reminder",
    });

    const { data: parent } = await admin.from("profiles").select("push_token").eq("id", m.parent_id).maybeSingle();
    if (parent?.push_token) {
      await fetch(EXPO_PUSH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: parent.push_token, title: schoolName, body, sound: "default" }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
    }

    // Set even if the push itself failed/had no token — the reminder was
    // still recorded in-app (notifications row), which is what the guard
    // protects against duplicating; a missing push token isn't retried.
    await admin.from("ptm_meetings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", m.id);
    notified++;
  }

  return json({ result: "ok", notified });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

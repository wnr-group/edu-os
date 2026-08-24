import { createClient } from "@/lib/supabase";

export interface QuizNotifyResult {
  ok: boolean;
  notified?: number;
  error?: string;
}

// Same underlying call shape as callNotify in apps/web/lib/homework.ts (JWT
// bearer fetch to an edge function), but the caller here needs to know
// whether it actually worked — unlike the fire-and-forget homework/leave
// notifiers, the host screen shows the teacher an explicit "sent"
// confirmation, so that confirmation has to reflect a real outcome instead
// of assuming success.
async function callQuizNotify(payload: { event: "reminder" | "results_ready"; quizId: string }): Promise<QuizNotifyResult> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: "Not signed in." };
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-quiz-notification`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.reason ?? body?.error ?? `Failed (${res.status})` };
    return { ok: true, notified: body?.notified };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export const notifyLiveQuizReminder = (quizId: string) => callQuizNotify({ event: "reminder", quizId });
export const notifyLiveQuizResultsReady = (quizId: string) => callQuizNotify({ event: "results_ready", quizId });

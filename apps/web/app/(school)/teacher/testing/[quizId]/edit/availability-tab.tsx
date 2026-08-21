"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { QuizDetail } from "./types";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function AvailabilityTab({ quiz }: { quiz: QuizDetail }) {
  const router = useRouter();
  const [opensAt, setOpensAt] = useState(toLocalInput(quiz.opens_at));
  const [closesAt, setClosesAt] = useState(toLocalInput(quiz.closes_at));
  const [durationMinutes, setDurationMinutes] = useState(String(Math.round(quiz.duration_seconds / 60)));
  const [attemptsAllowed, setAttemptsAllowed] = useState(String(quiz.attempts_allowed));
  const [shuffle, setShuffle] = useState(quiz.shuffle_questions);
  const [passMark, setPassMark] = useState(quiz.pass_mark_pct !== null ? String(quiz.pass_mark_pct) : "");
  const [showAnswers, setShowAnswers] = useState(quiz.show_answers_after_close);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const minutes = parseInt(durationMinutes, 10);
    if (!minutes || minutes <= 0) {
      toast.error("Duration must be a positive number of minutes.");
      return;
    }
    const opens = fromLocalInput(opensAt);
    const closes = fromLocalInput(closesAt);
    if (opens && closes && new Date(closes) <= new Date(opens)) {
      toast.error("Closing time must be after the opening time.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const updates: Record<string, unknown> = {
      opens_at: opens,
      closes_at: closes,
      duration_seconds: minutes * 60,
      attempts_allowed: parseInt(attemptsAllowed, 10) || 1,
      shuffle_questions: shuffle,
      pass_mark_pct: passMark === "" ? null : parseInt(passMark, 10),
      show_answers_after_close: showAnswers,
    };
    // publish_quiz only computes status='open' vs 'scheduled' once, at publish
    // time. If the teacher edits the window afterward so it's now open, flip
    // status immediately rather than waiting for the next cron sweep — this
    // is what parents' quiz lists key off, not the raw opens_at value.
    if (quiz.status === "scheduled" && (!opens || new Date(opens) <= new Date())) {
      updates.status = "open";
    }
    const { error } = await supabase.from("quizzes").update(updates).eq("id", quiz.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Availability saved.");
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Opens</Label>
          <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </div>
        <div>
          <Label>Closes</Label>
          <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Duration per attempt (minutes)</Label>
          <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </div>
        <div>
          <Label>Attempts allowed</Label>
          <Input type="number" min={1} max={5} value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Pass mark % (optional)</Label>
          <Input type="number" min={0} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} placeholder="e.g. 60" />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Shuffle questions per student</p>
          <p className="text-xs text-muted-foreground">Each student sees questions in a different order.</p>
        </div>
        <Switch checked={shuffle} onCheckedChange={setShuffle} />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Show answer review after grading</p>
          <p className="text-xs text-muted-foreground">Parents see correct answers once the attempt is fully graded.</p>
        </div>
        <Switch checked={showAnswers} onCheckedChange={setShowAnswers} />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {quiz.question_count} questions · {quiz.total_points} marks total. A student who opens the quiz near the closing
        time still gets their full duration, capped at the close time — whichever ends first.
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save availability"}
      </Button>
    </div>
  );
}

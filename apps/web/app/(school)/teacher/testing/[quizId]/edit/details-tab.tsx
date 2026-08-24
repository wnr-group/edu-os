"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { QuizDetail, SubjectOption } from "./types";

const MODE_OPTIONS = [
  { value: "async", label: "Async — open window" },
  { value: "live", label: "Live — single sitting" },
];

export function DetailsTab({ quiz, subjects }: { quiz: QuizDetail; subjects: SubjectOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(quiz.title);
  const [subjectId, setSubjectId] = useState(quiz.subject_id);
  const [mode, setMode] = useState(quiz.mode);
  const [instructions, setInstructions] = useState(quiz.instructions ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title || !subjectId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("quizzes")
      .update({ title, subject_id: subjectId, mode, instructions: instructions || null })
      .eq("id", quiz.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Details saved.");
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Subject</Label>
          <NativeSelect
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <Label>Mode</Label>
          <NativeSelect options={MODE_OPTIONS} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-full" />
        </div>
      </div>
      <div>
        <Label>Instructions for students</Label>
        <textarea
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Read each question carefully before answering…"
        />
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Formative by default. This quiz stays standalone practice unless you push it to the gradebook from the
        results page after it closes — that&rsquo;s the only way a score reaches Exams &amp; Results.
      </div>
      <Button onClick={handleSave} disabled={saving || !title || !subjectId}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

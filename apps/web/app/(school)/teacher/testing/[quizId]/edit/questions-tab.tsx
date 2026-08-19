"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { QuizQuestion } from "./types";

const TYPE_OPTIONS = [
  { value: "mcq", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer (manual grading)" },
];
const TYPE_TAG_STYLE: Record<string, string> = {
  mcq: "bg-blue-100 text-blue-700",
  true_false: "bg-amber-100 text-amber-700",
  short_answer: "bg-pink-100 text-pink-700",
};
const TYPE_TAG_LABEL: Record<string, string> = { mcq: "MCQ", true_false: "T/F", short_answer: "SHORT" };

export function QuestionsTab({
  quizId, schoolId, questions, locked, mode,
}: { quizId: string; schoolId: string; questions: QuizQuestion[]; locked: boolean; mode: "async" | "live" }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<QuizQuestion["type"]>("mcq");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState("5");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [tfCorrect, setTfCorrect] = useState<"true" | "false" | null>(null);
  const [rubric, setRubric] = useState("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("30");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setType("mcq");
    setPrompt("");
    setPoints("5");
    setOptions(["", ""]);
    setCorrectIndex(null);
    setTfCorrect(null);
    setRubric("");
    setTimeLimitSeconds("30");
  }

  function startEdit(q: QuizQuestion) {
    setEditingId(q.id);
    setType(q.type);
    setPrompt(q.prompt);
    setPoints(String(q.points));
    setRubric(q.short_answer_rubric ?? "");
    setTimeLimitSeconds(q.time_limit_seconds != null ? String(q.time_limit_seconds) : "30");
    if (q.type === "mcq") {
      setOptions(q.options.map((o) => o.option_text));
      const ci = q.options.findIndex((o) => o.is_correct);
      setCorrectIndex(ci >= 0 ? ci : null);
      setTfCorrect(null);
    } else if (q.type === "true_false") {
      setOptions(["", ""]);
      setCorrectIndex(null);
      const trueOpt = q.options.find((o) => o.option_text === "True");
      setTfCorrect(trueOpt?.is_correct ? "true" : "false");
    } else {
      setOptions(["", ""]);
      setCorrectIndex(null);
      setTfCorrect(null);
    }
  }

  async function handleSave() {
    const pts = parseFloat(points);
    if (!prompt || !pts || pts <= 0) {
      toast.error("Enter a prompt and a points value greater than 0.");
      return;
    }
    if (type === "mcq") {
      const filled = options.map((o) => o.trim()).filter(Boolean);
      if (filled.length < 2 || correctIndex === null || !options[correctIndex]?.trim()) {
        toast.error("Add at least two options and mark the correct one.");
        return;
      }
    }
    if (type === "true_false" && tfCorrect === null) {
      toast.error("Mark True or False as correct.");
      return;
    }
    let timeLimit: number | null = null;
    if (mode === "live") {
      timeLimit = parseInt(timeLimitSeconds, 10);
      if (!timeLimit || timeLimit < 10 || timeLimit > 600) {
        toast.error("Time limit must be between 10 and 600 seconds.");
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();

    let questionId = editingId;
    if (editingId) {
      const { error } = await supabase
        .from("quiz_questions")
        .update({
          type,
          prompt,
          points: pts,
          short_answer_rubric: type === "short_answer" ? rubric || null : null,
          time_limit_seconds: timeLimit,
        })
        .eq("id", editingId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      // Options are replaced wholesale rather than diffed — simplest correct
      // way to handle text edits, added/removed options, and type changes
      // (e.g. mcq -> true_false) all at once.
      const { error: delErr } = await supabase.from("quiz_options").delete().eq("question_id", editingId);
      if (delErr) {
        setSaving(false);
        toast.error(delErr.message);
        return;
      }
    } else {
      const nextOrder = questions.length > 0 ? Math.max(...questions.map((q) => q.order_index)) + 1 : 1;
      const { data: created, error } = await supabase
        .from("quiz_questions")
        .insert({
          quiz_id: quizId,
          school_id: schoolId,
          type,
          prompt,
          points: pts,
          order_index: nextOrder,
          short_answer_rubric: type === "short_answer" ? rubric || null : null,
          time_limit_seconds: timeLimit,
        })
        .select("id")
        .single();
      if (error || !created) {
        setSaving(false);
        toast.error(error?.message ?? "Could not add question.");
        return;
      }
      questionId = created.id;
    }

    if (type === "mcq") {
      const rows = options
        .map((text, i) => ({ text: text.trim(), i }))
        .filter((o) => o.text)
        .map((o) => ({
          question_id: questionId,
          school_id: schoolId,
          option_text: o.text,
          is_correct: o.i === correctIndex,
          order_index: o.i + 1,
        }));
      const { error: optErr } = await supabase.from("quiz_options").insert(rows);
      if (optErr) {
        setSaving(false);
        toast.error(optErr.message);
        return;
      }
    } else if (type === "true_false") {
      const { error: optErr } = await supabase.from("quiz_options").insert([
        { question_id: questionId, school_id: schoolId, option_text: "True", is_correct: tfCorrect === "true", order_index: 1 },
        { question_id: questionId, school_id: schoolId, option_text: "False", is_correct: tfCorrect === "false", order_index: 2 },
      ]);
      if (optErr) {
        setSaving(false);
        toast.error(optErr.message);
        return;
      }
    }

    setSaving(false);
    resetForm();
    toast.success(editingId ? "Question updated." : "Question added.");
    router.refresh();
  }

  async function handleDelete(questionId: string) {
    setDeletingId(questionId);
    const supabase = createClient();
    const { error } = await supabase.from("quiz_questions").delete().eq("id", questionId);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (editingId === questionId) resetForm();
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Questions</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {questions.length} question{questions.length === 1 ? "" : "s"} · {questions.reduce((s, q) => s + q.points, 0)} marks total
          </span>
        </div>
        {questions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No questions yet — add one on the right.</p>
        ) : (
          <div className="divide-y divide-border">
            {questions.map((q, i) => (
              <div key={q.id} className={`flex items-center gap-3 px-4 py-3 ${editingId === q.id ? "bg-primary/5" : ""}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{q.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.type === "short_answer" ? "Short answer · graded manually" : `${q.options.length} options`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_TAG_STYLE[q.type]}`}>
                  {TYPE_TAG_LABEL[q.type]}
                </span>
                {mode === "live" && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${q.time_limit_seconds ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"}`}>
                    {q.time_limit_seconds ? `${q.time_limit_seconds}s` : "no limit set"}
                  </span>
                )}
                <span className="w-14 shrink-0 text-right text-xs font-semibold text-muted-foreground">{q.points} pts</span>
                {!locked && (
                  <>
                    <button
                      onClick={() => startEdit(q)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit question"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      disabled={deletingId === q.id}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        {locked ? (
          <p className="text-sm text-muted-foreground">
            Questions are locked once this quiz is published. Close it and duplicate it to make changes.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{editingId ? "Edit question" : "Add question"}</h3>
              {editingId && (
                <button onClick={resetForm} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              )}
            </div>
            <div>
              <Label>Type</Label>
              <NativeSelect
                options={TYPE_OPTIONS}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as QuizQuestion["type"]);
                  setCorrectIndex(null);
                  setTfCorrect(null);
                }}
                className="w-full"
              />
            </div>
            <div>
              <Label>Prompt</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Question text…"
              />
            </div>

            {type === "mcq" && (
              <div>
                <Label>Options — mark the correct one</Label>
                <div className="mt-1 space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="mcq-correct"
                        checked={correctIndex === i}
                        onChange={() => setCorrectIndex(i)}
                        className="h-4 w-4 accent-primary"
                      />
                      <Input
                        value={opt}
                        onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                        placeholder={`Option ${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
                {options.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => [...prev, ""])}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add option
                  </button>
                )}
              </div>
            )}

            {type === "true_false" && (
              <div>
                <Label>Correct answer</Label>
                <div className="mt-1 flex gap-4">
                  {(["true", "false"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm capitalize">
                      <input type="radio" name="tf-correct" checked={tfCorrect === v} onChange={() => setTfCorrect(v)} className="h-4 w-4 accent-primary" />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {type === "short_answer" && (
              <div>
                <Label>Grading rubric (optional, for your reference)</Label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  rows={2}
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  placeholder="What a full-marks answer should cover…"
                />
              </div>
            )}

            <div className="flex gap-3">
              <div className="w-24">
                <Label>Points</Label>
                <Input type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} />
              </div>
              {mode === "live" && (
                <div className="w-36">
                  <Label>Time limit (seconds)</Label>
                  <Input type="number" min={10} max={600} value={timeLimitSeconds} onChange={(e) => setTimeLimitSeconds(e.target.value)} />
                </div>
              )}
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving || !prompt}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add question"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

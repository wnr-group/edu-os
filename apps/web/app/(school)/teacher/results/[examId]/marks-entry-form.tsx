"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

interface SubjectOption {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  roll_number: string;
  full_name: string;
  section_label: string;
}

interface ExistingResult {
  student_id: string;
  subject_id: string;
  marks_obtained: number | null;
  max_marks: number | null;
}

export function MarksEntryForm({
  examId,
  schoolId,
  subjects,
  students,
  existingResults,
}: {
  examId: string;
  schoolId: string;
  subjects: SubjectOption[];
  students: StudentRow[];
  existingResults: ExistingResult[];
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Pre-fill marks when subject changes
  useEffect(() => {
    if (!subjectId) {
      setMarks({});
      return;
    }
    const map: Record<string, string> = {};
    for (const r of existingResults) {
      if (r.subject_id === subjectId) {
        map[r.student_id] =
          r.marks_obtained !== null ? String(r.marks_obtained) : "";
        if (r.max_marks !== null) setMaxMarks(String(r.max_marks));
      }
    }
    setMarks(map);
  }, [subjectId, existingResults]);

  async function handleSave() {
    if (!subjectId) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const records = students
      .filter((s) => marks[s.id] !== undefined && marks[s.id] !== "")
      .map((s) => ({
        school_id: schoolId,
        exam_id: examId,
        student_id: s.id,
        subject_id: subjectId,
        marks_obtained: parseFloat(marks[s.id] ?? "0"),
        max_marks: parseFloat(maxMarks || "100"),
        teacher_id: user?.id,
      }));

    const { error: err } = await supabase
      .from("exam_results")
      .upsert(records, { onConflict: "exam_id,student_id,subject_id" });

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-56">
          <Label>Subject</Label>
          <NativeSelect
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="Select subject"
            className="w-full"
          />
        </div>
        <div className="w-32">
          <Label>Max Marks</Label>
          <Input
            type="number"
            min={1}
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
            placeholder="100"
          />
        </div>
      </div>

      {!subjectId && (
        <p className="text-sm text-gray-400">
          Select a subject to enter marks.
        </p>
      )}

      {subjectId && (
        <>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {saved && (
            <p className="mb-3 text-sm text-green-600">Marks saved successfully.</p>
          )}

          <div className="divide-y">
            {students.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <span className="mr-2 text-sm text-gray-400">
                    {s.roll_number || "—"}
                  </span>
                  <span className="font-medium text-gray-900">{s.full_name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {s.section_label}
                  </span>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={parseFloat(maxMarks || "100")}
                  className="w-24"
                  placeholder={`/ ${maxMarks}`}
                  value={marks[s.id] ?? ""}
                  onChange={(e) =>
                    setMarks((prev) => ({ ...prev, [s.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Marks"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

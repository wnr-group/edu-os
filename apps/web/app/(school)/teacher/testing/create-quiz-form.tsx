"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

interface ClassOption {
  id: string;
  name: string;
}
interface SectionOption {
  id: string;
  name: string;
  classId: string;
}
interface SubjectOption {
  id: string;
  name: string;
  classId: string;
}

const MODE_OPTIONS = [
  { value: "async", label: "Async — open window" },
  { value: "live", label: "Live — single sitting" },
];

export function CreateQuizForm({
  teacherId,
  schoolId,
  academicYearId,
  classes,
  sections: allSections,
  subjects: allSubjects,
  activeSectionId,
  activeSectionClassId,
}: {
  teacherId: string;
  schoolId: string;
  academicYearId: string;
  classes: ClassOption[];
  sections: SectionOption[];
  subjects: SubjectOption[];
  activeSectionId?: string;
  activeSectionClassId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [mode, setMode] = useState("async");
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sections/subjects are loaded server-side (scoped to taught sections) and
  // filtered here by the selected class — mirrors the homework create form.
  const sections = allSections.filter((s) => s.classId === classId);
  const subjects = allSubjects.filter((s) => s.classId === classId);

  useEffect(() => {
    setSectionId("");
    setSubjectId("");
  }, [classId]);

  useEffect(() => {
    if (activeSectionClassId) setClassId(activeSectionClassId);
  }, [activeSectionClassId]);

  useEffect(() => {
    if (activeSectionId && sections.some((s) => s.id === activeSectionId)) {
      setSectionId(activeSectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSectionId, classId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!title || !classId || !sectionId || !subjectId || !academicYearId) return;
    const minutes = parseInt(durationMinutes, 10);
    if (!minutes || minutes <= 0) {
      setError("Duration must be a positive number of minutes.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: created, error: err } = await supabase
      .from("quizzes")
      .insert({
        school_id: schoolId,
        academic_year_id: academicYearId,
        class_id: classId,
        section_id: sectionId,
        subject_id: subjectId,
        created_by: teacherId,
        title,
        mode,
        duration_seconds: minutes * 60,
      })
      .select("id")
      .single();

    setLoading(false);
    if (err || !created) {
      setError(err?.message ?? "Could not create quiz.");
      return;
    }
    toast.success("Draft quiz created — add questions next.");
    router.push(`/teacher/testing/${created.id}/edit`);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

      <div className="col-span-2 sm:col-span-1">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Chapter 4 Check"
          required
        />
      </div>

      <div>
        <Label>Mode</Label>
        <NativeSelect
          options={MODE_OPTIONS}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full"
        />
      </div>

      <div>
        <Label>Class</Label>
        <NativeSelect
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          placeholder="Select class"
          className="w-full"
        />
      </div>

      <div>
        <Label>Section</Label>
        <NativeSelect
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          placeholder="Select section"
          disabled={!classId}
          className="w-full"
        />
      </div>

      <div>
        <Label>Subject</Label>
        <NativeSelect
          options={subjects.map((s) => ({ value: s.id, label: s.name }))}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder="Select subject"
          disabled={!classId}
          className="w-full"
        />
      </div>

      <div>
        <Label>Duration (minutes)</Label>
        <Input
          type="number"
          min={1}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
        />
      </div>

      <div className="col-span-2">
        <Button
          type="submit"
          disabled={loading || !title || !classId || !sectionId || !subjectId}
        >
          {loading ? "Creating…" : "Create draft quiz"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

interface ClassOption {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
  classId: string | null;
}

interface AcademicYearOption {
  id: string;
  name: string;
}

interface UploadSyllabusFormProps {
  schoolId: string;
  classes: ClassOption[];
  subjects: SubjectOption[];
  academicYears: AcademicYearOption[];
  onSuccess?: () => void;
}

export function UploadSyllabusForm({
  schoolId,
  classes,
  subjects,
  academicYears,
  onSuccess,
}: UploadSyllabusFormProps) {
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredSubjects = classId
    ? subjects.filter((s) => s.classId === classId)
    : subjects;

  function handleClassChange(value: string) {
    setClassId(value);
    setSubjectId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !subjectId || !academicYearId || !file) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();

    // Upload file to Supabase Storage
    const filePath = `syllabus/${schoolId}/${classId}/${subjectId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      // If bucket doesn't exist, try creating it or show helpful error
      const errMsg = uploadError.message.includes("not found")
        ? "Storage bucket 'files' not configured. Ask admin to create it in Supabase Studio → Storage."
        : uploadError.message;
      setError(errMsg);
      toast.error(errMsg);
      setLoading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("files")
      .getPublicUrl(filePath);

    await supabase.from("syllabus").insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      academic_year_id: academicYearId,
      file_url: urlData.publicUrl,
    });

    setClassId("");
    setSubjectId("");
    setAcademicYearId("");
    setFile(null);
    setLoading(false);
    toast.success("Syllabus uploaded.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>Class</Label>
          <NativeSelect
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            value={classId}
            onChange={(e) => handleClassChange(e.target.value)}
            placeholder="Select class"
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Subject</Label>
          <NativeSelect
            options={filteredSubjects.map((s) => ({ value: s.id, label: s.name }))}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="Select subject"
            disabled={!classId}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Academic Year</Label>
          <NativeSelect
            options={academicYears.map((y) => ({ value: y.id, label: y.name }))}
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            placeholder="Select year"
            className="w-full"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>PDF File</Label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
      </div>
      <Button type="submit" disabled={loading || !classId || !subjectId || !academicYearId || !file}>
        {loading ? "Uploading…" : "Upload Syllabus"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "sonner";

interface TeacherOption {
  value: string;
  label: string;
}

interface ClassOption {
  value: string;
  label: string;
  order: number;
}

interface SectionOption {
  value: string;
  label: string;
  classId: string;
}

interface SubjectOption {
  value: string;
  label: string;
  classId: string;
}

interface TimetableFormProps {
  schoolId: string;
  academicYearId: string;
  teachers: TeacherOption[];
  classes: ClassOption[];
  sections: SectionOption[];
  subjects: SubjectOption[];
}

const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const PERIOD_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: `Period ${i + 1}`,
}));

export function TimetableForm({
  schoolId,
  academicYearId,
  teachers,
  classes,
  sections,
  subjects,
}: TimetableFormProps) {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [period, setPeriod] = useState("");
  const [allWeekdays, setAllWeekdays] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredSections = sections.filter((s) => s.classId === classId);
  const filteredSubjects = subjects.filter((s) => s.classId === classId);

  function handleClassChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setClassId(e.target.value);
    setSectionId("");
    setSubjectId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId || !classId || !sectionId || !subjectId || !period || (!dayOfWeek && !allWeekdays)) {
      toast.error("Please fill in all fields.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const days = allWeekdays
      ? [1, 2, 3, 4, 5]
      : [parseInt(dayOfWeek, 10)];

    const periodNum = parseInt(period, 10);

    // Pre-check for existing slots to give clear feedback
    const { data: existing } = await supabase
      .from("timetable")
      .select("day_of_week")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId)
      .eq("section_id", sectionId)
      .eq("period", periodNum)
      .in("day_of_week", days);

    if (existing && existing.length > 0) {
      setSaving(false);
      toast.error("One or more slots already exist for this section/day/period combination.");
      return;
    }

    const rows = days.map((d) => ({
      school_id: schoolId,
      academic_year_id: academicYearId,
      section_id: sectionId,
      subject_id: subjectId,
      teacher_id: teacherId,
      day_of_week: d,
      period: periodNum,
    }));

    const { error } = await supabase.from("timetable").insert(rows);

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("One or more slots already exist for this section/day/period combination.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(
      allWeekdays
        ? `Timetable assigned for Mon–Fri, Period ${period}.`
        : `Timetable slot added.`
    );

    setTeacherId("");
    setClassId("");
    setSectionId("");
    setSubjectId("");
    setDayOfWeek("");
    setPeriod("");
    setAllWeekdays(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Teacher */}
        <div className="space-y-1.5">
          <Label>Teacher</Label>
          <NativeSelect
            options={teachers}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            placeholder="Select teacher"
          />
        </div>

        {/* Class */}
        <div className="space-y-1.5">
          <Label>Class</Label>
          <NativeSelect
            options={classes}
            value={classId}
            onChange={handleClassChange}
            placeholder="Select class"
          />
        </div>

        {/* Section — cascades from Class */}
        <div className="space-y-1.5">
          <Label>Section</Label>
          <NativeSelect
            options={filteredSections}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            placeholder="Select section"
            disabled={!classId}
          />
        </div>

        {/* Subject — cascades from Class */}
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <NativeSelect
            options={filteredSubjects}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="Select subject"
            disabled={!classId}
          />
        </div>

        {/* Day */}
        <div className="space-y-1.5">
          <Label>Day</Label>
          <NativeSelect
            options={DAY_OPTIONS}
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            placeholder="Select day"
            disabled={allWeekdays}
          />
        </div>

        {/* Period */}
        <div className="space-y-1.5">
          <Label>Period</Label>
          <NativeSelect
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="Select period"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allWeekdays}
            onChange={(e) => {
              setAllWeekdays(e.target.checked);
              if (e.target.checked) setDayOfWeek("");
            }}
            className="h-4 w-4 rounded border-border"
          />
          Apply to all weekdays (Mon–Fri)
        </label>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Assign Slot"}
        </Button>
      </div>
    </form>
  );
}

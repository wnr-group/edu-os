"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AttendanceStatus = "present" | "absent" | "late";
type AttendanceSession = "FULL_DAY" | "FN" | "AN";

interface StudentRow {
  id: string;
  roll_number: string;
  full_name: string;
  status: string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; colors: string }[] = [
  { value: "present", label: "Present", colors: "bg-green-100 text-green-800 border-green-300" },
  { value: "absent", label: "Absent", colors: "bg-red-100 text-red-800 border-red-300" },
  { value: "late", label: "Late", colors: "bg-yellow-100 text-yellow-800 border-yellow-300" },
];

function activeColors(status: AttendanceStatus): string {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  return opt?.colors ?? "";
}

export function AttendanceMarkForm({
  students,
  sectionId,
  date,
  session,
  schoolId,
  markedBy,
}: {
  students: StudentRow[];
  sectionId: string;
  date: string;
  session: AttendanceSession;
  schoolId: string;
  markedBy: string;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(
    () => {
      const map: Record<string, AttendanceStatus> = {};
      for (const s of students) {
        map[s.id] = (s.status as AttendanceStatus) ?? "present";
      }
      return map;
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAll(status: AttendanceStatus) {
    const map: Record<string, AttendanceStatus> = {};
    for (const s of students) map[s.id] = status;
    setStatuses(map);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    const supabase = createClient();

    const recordsPayload = students.map((s) => ({
      student_id: s.id,
      status: statuses[s.id] ?? "present",
    }));

    const { error: err } = await supabase.rpc("mark_attendance", {
      p_section_id: sectionId,
      p_session: session,
      p_date: date,
      p_records: recordsPayload,
      p_lat: null,
      p_lng: null,
      p_accuracy: null,
      p_geo_source: "web",
    });

    setSaving(false);
    if (err) {
      setError(err.message);
      toast.error("Failed to save attendance.");
      return;
    }
    toast.success("Attendance saved successfully.");
    router.push(`/teacher/attendance`);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          onClick={() => setAll("present")}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          All Present
        </Button>
        <Button
          type="button"
          onClick={() => setAll("absent")}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          All Absent
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="divide-y">
        {students.map((s) => {
          const current = statuses[s.id] ?? "present";
          return (
            <div
              key={s.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 text-right text-sm text-gray-400">
                  {s.roll_number || "—"}
                </span>
                <span className="font-medium text-gray-900">{s.full_name}</span>
              </div>
              <div className="flex gap-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setStatuses((prev) => ({
                        ...prev,
                        [s.id]: opt.value,
                      }))
                    }
                    className={`rounded border px-2 py-1 text-xs font-medium transition-all ${
                      current === opt.value
                        ? activeColors(opt.value) + " ring-2 ring-offset-1"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Button onClick={handleSave} disabled={saving || students.length === 0}>
          {saving ? "Saving…" : "Save Attendance"}
        </Button>
      </div>
    </div>
  );
}

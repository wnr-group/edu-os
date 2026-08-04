"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import type { ApplicationCard } from "./admissions-board";

export function EnrolDialog({
  app, schoolId, classes, onClose, onEnrolled,
}: {
  app: ApplicationCard; schoolId: string; classes: { id: string; name: string }[]; onClose: () => void; onEnrolled: () => void;
}) {
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [classId, setClassId] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: appRow } = await supabase.from("admission_applications").select("class_applied_id").eq("id", app.id).single();
      const cId = appRow?.class_applied_id;
      setClassId(cId ?? "");
      if (cId) {
        const { data } = await supabase.from("sections").select("id, name").eq("class_id", cId).order("name");
        setSections(data ?? []);
      }
    })();
  }, [app.id]);

  async function handleEnrol() {
    if (!sectionId) { toast.error("Section is required."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admissions/${app.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, rollNumber, admissionNumber }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to enrol"); return; }
      toast.success(`${app.applicantName} enrolled.`);
      onEnrolled();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Enrol {app.applicantName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">This creates a student and provisions the parent's account.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Section *</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm">
              <option value="">Select a section…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Roll number</label>
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Admission number</label>
            <input value={admissionNumber} onChange={(e) => setAdmissionNumber(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">Safe to run once — if already enrolled, this is disabled.</p>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-input px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleEnrol} disabled={saving || app.isConverted} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Enrolling…" : "Create student & enrol"}
          </button>
        </div>
      </div>
    </div>
  );
}
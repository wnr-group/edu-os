"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";

export function AddEnquiryDrawer({
  schoolId, classes, onClose, onSaved,
}: {
  schoolId: string; classes: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    applicant_name: "", date_of_birth: "", gender: "male", class_applied_id: "",
    parent_name: "", parent_phone: "", parent_email: "", previous_school: "", area: "", applicant_note: "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.applicant_name || !form.class_applied_id || !form.parent_name || !form.parent_phone) {
      toast.error("Fill in the required fields.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_walkin_application", {
      p_school_id: schoolId, p_applicant_name: form.applicant_name, p_date_of_birth: form.date_of_birth || null,
      p_gender: form.gender, p_class_applied_id: form.class_applied_id, p_parent_name: form.parent_name,
      p_parent_phone: form.parent_phone, p_parent_email: form.parent_email || null,
      p_previous_school: form.previous_school || null, p_area: form.area || null, p_applicant_note: form.applicant_note || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Enquiry added.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Add enquiry (walk-in)</h2>
        <div className="mt-4 space-y-3">
          <input placeholder="Applicant name *" value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          <select value={form.class_applied_id} onChange={(e) => set("class_applied_id", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm">
            <option value="">Select class *</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Parent name *" value={form.parent_name} onChange={(e) => set("parent_name", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          <input placeholder="Parent phone *" value={form.parent_phone} onChange={(e) => set("parent_phone", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          <input placeholder="Parent email" value={form.parent_email} onChange={(e) => set("parent_email", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
          <textarea placeholder="Notes" value={form.applicant_note} onChange={(e) => set("applicant_note", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" rows={3} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-input px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            {saving ? "Saving…" : "Add enquiry"}
          </button>
        </div>
      </div>
    </div>
  );
}
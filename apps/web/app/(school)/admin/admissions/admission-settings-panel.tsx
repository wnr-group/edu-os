"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { useFeature } from "@/lib/features-context";

interface YearOption { id: string; name: string; status: "draft" | "active" | "archived" }

export function AdmissionSettingsPanel({
  schoolId, settings, years, onClose, onSaved,
}: {
  schoolId: string; settings: { is_open: boolean; application_fee: number; admission_academic_year_id: string | null };
  years: YearOption[]; onClose: () => void; onSaved: () => void;
}) {
  const onlinePaymentsEnabled = useFeature("online_payments");
  const [isOpen, setIsOpen] = useState(settings.is_open);
  const [feeRupees, setFeeRupees] = useState((settings.application_fee / 100).toString());
  const [yearId, setYearId] = useState(settings.admission_academic_year_id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_admission_settings", {
      p_school_id: schoolId,
      p_is_open: isOpen,
      // Defensive: the RPC rejects a nonzero fee when online_payments is off,
      // so never send a stale value from before the module was disabled.
      p_fee: onlinePaymentsEnabled ? Math.round(Number(feeRupees || 0) * 100) : 0,
      p_year_id: yearId || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Admissions settings</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium">Accepting applications</span>
            <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
          </label>

          <div>
            <label className="mb-1 block text-xs font-semibold">Admitting year</label>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm">
              <option value="">Use active year (default)</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}{y.status === "draft" ? " (draft)" : ""}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">New applications are attached to this year. Leave on default to always use whichever year is active.</p>
          </div>

          {onlinePaymentsEnabled ? (
            <div>
              <label className="mb-1 block text-xs font-semibold">Application fee (₹)</label>
              <input value={feeRupees} onChange={(e) => setFeeRupees(e.target.value)} type="number" className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
            </div>
          ) : (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Application fees require Online Payments to be enabled for this school. Turn it on in Settings to charge for applications.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-input px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
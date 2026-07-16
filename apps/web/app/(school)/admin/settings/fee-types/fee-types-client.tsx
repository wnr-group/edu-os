"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FeeType } from "@/components/fee-type-select";

interface Props {
  predefined: FeeType[];
  custom: FeeType[];
}

const CATEGORIES = [
  { value: "core", label: "Core Fees" },
  { value: "ancillary", label: "Ancillary & Service Fees" },
  { value: "miscellaneous", label: "Miscellaneous Fees" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core Fees",
  ancillary: "Ancillary & Service Fees",
  miscellaneous: "Miscellaneous Fees",
};

const CATEGORY_ORDER = ["core", "ancillary", "miscellaneous"];

function FlagBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-medium opacity-60">
      {label}
    </span>
  );
}

export function FeeTypesClient({ predefined, custom: initialCustom }: Props) {
  const [custom, setCustom] = useState(initialCustom);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", category: "core" as string });
  const [addLoading, setAddLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "" });
  const [editLoading, setEditLoading] = useState(false);

  async function handleAdd() {
    if (!addForm.name.trim()) { toast.error("Name is required."); return; }
    setAddLoading(true);
    const res = await fetch("/api/fee-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    setAddLoading(false);
    if (!res.ok) { toast.error(data.error ?? "Failed to add."); return; }
    setCustom((prev) => [...prev, data.feeType]);
    setAddForm({ name: "", category: "core" });
    setAdding(false);
    toast.success("Custom fee type added.");
  }

  async function handleEdit(id: string) {
    setEditLoading(true);
    const res = await fetch(`/api/fee-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    setEditLoading(false);
    if (!res.ok) { toast.error(data.error ?? "Failed to update."); return; }
    setCustom((prev) => prev.map((ft) => ft.id === id ? data.feeType : ft));
    setEditingId(null);
    toast.success("Fee type updated.");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this custom fee type? Any line items using it will lose their type reference.")) return;
    const res = await fetch(`/api/fee-types/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Failed to delete."); return; }
    setCustom((prev) => prev.filter((ft) => ft.id !== id));
    toast.success("Fee type deleted.");
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Predefined Fee Types</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          These are standard fee types available to all schools. They cannot be edited or deleted.
        </p>
        {CATEGORY_ORDER.map((cat) => {
          const types = predefined.filter((ft) => ft.category === cat);
          if (types.length === 0) return null;
          return (
            <div key={cat} className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="divide-y divide-border rounded-lg border bg-card">
                {types.map((ft) => (
                  <div key={ft.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-sm font-medium text-foreground">{ft.name}</span>
                    <div className="flex gap-1.5">
                      {(ft as any).is_one_time && <FlagBadge label="One-Time" />}
                      {(ft as any).is_refundable && <FlagBadge label="Refundable" />}
                      {(ft as any).is_optional && <FlagBadge label="Optional" />}
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Predefined
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custom Fee Types</h2>
            <p className="mt-1 text-sm text-muted-foreground">Fee types specific to your school.</p>
          </div>
          <button
            onClick={() => { setAdding(!adding); setAddForm({ name: "", category: "core" }); }}
            className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 sm:self-auto"
          >
            + Add Custom Type
          </button>
        </div>

        {adding && (
          <div className="my-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600">New Custom Fee Type</p>
            <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-end">
              <div className="w-full sm:w-auto">
                <label className="text-xs text-muted-foreground">Name *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Annual Day Fee"
                  className="mt-0.5 block w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm sm:w-56"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="text-xs text-muted-foreground">Category *</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-0.5 block w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm sm:w-auto"
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAdd}
                  disabled={addLoading}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addLoading ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setAdding(false)} className="text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {custom.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No custom fee types yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border bg-card">
            {custom.map((ft) => (
              <div key={ft.id} className="flex items-center gap-3 px-4 py-3">
                {editingId === ft.id ? (
                  <>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-48 rounded-md border border-input bg-white px-3 py-1 text-sm"
                    />
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                      className="rounded-md border border-input bg-white px-3 py-1 text-sm"
                    >
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button
                      onClick={() => handleEdit(ft.id)}
                      disabled={editLoading}
                      className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      {editLoading ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-sm text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-foreground">{ft.name}</span>
                    <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[ft.category]}</span>
                    <button
                      onClick={() => { setEditingId(ft.id); setEditForm({ name: ft.name, category: ft.category }); }}
                      className="text-sm font-medium text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ft.id)}
                      className="text-sm font-medium text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

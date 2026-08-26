"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DocType {
  id: string; name: string; description: string | null; is_required: boolean;
  is_active: boolean; expires: boolean; default_validity_months: number | null; is_custom: boolean;
}

export function DocumentTypeSettings({ schoolId, types }: { schoolId: string; types: DocType[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [newExpires, setNewExpires] = useState(false);
  const [newMonths, setNewMonths] = useState(12);
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_document_type", {
      p_id: null, p_school_id: schoolId, p_name: newName.trim(), p_description: null,
      p_is_required: newRequired, p_expires: newExpires, p_default_validity_months: newExpires ? newMonths : null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Document type added.");
    setAdding(false);
    setNewName("");
    setNewExpires(false);
    setNewMonths(12);
    router.refresh();
  }

  async function handleToggleRequired(t: DocType) {
    const supabase = createClient();
    const { data: current } = await supabase
      .from("document_types")
      .select("name, description, expires, default_validity_months")
      .eq("id", t.id)
      .maybeSingle();

    const name = current?.name ?? t.name;
    const description = current?.description ?? t.description;
    const expires = current?.expires ?? t.expires;
    const months = current?.default_validity_months ?? t.default_validity_months;

    const { error } = await supabase.rpc("save_document_type", {
      p_id: t.id,
      p_school_id: schoolId,
      p_name: name,
      p_description: description,
      p_is_required: !t.is_required,
      p_expires: expires,
      p_default_validity_months: months,
    });
    if (error) { toast.error(error.message); return; }
    router.refresh();
  }

  async function handleToggleExpires(t: DocType) {
    const nextExpires = !t.expires;
    const supabase = createClient();
    const { data: current } = await supabase
      .from("document_types")
      .select("name, description, is_required, default_validity_months")
      .eq("id", t.id)
      .maybeSingle();

    const name = current?.name ?? t.name;
    const description = current?.description ?? t.description;
    const isRequired = current?.is_required ?? t.is_required;
    const nextMonths = nextExpires ? (current?.default_validity_months ?? t.default_validity_months ?? 12) : null;

    const { error } = await supabase.rpc("save_document_type", {
      p_id: t.id,
      p_school_id: schoolId,
      p_name: name,
      p_description: description,
      p_is_required: isRequired,
      p_expires: nextExpires,
      p_default_validity_months: nextMonths,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Expiry rule updated to: ${nextExpires ? `${nextMonths} months` : "Never expires"}`);
    router.refresh();
  }

  async function handleUpdateMonths(t: DocType, months: number) {
    const supabase = createClient();
    const { data: current } = await supabase
      .from("document_types")
      .select("name, description, is_required")
      .eq("id", t.id)
      .maybeSingle();

    const name = current?.name ?? t.name;
    const description = current?.description ?? t.description;
    const isRequired = current?.is_required ?? t.is_required;

    const { error } = await supabase.rpc("save_document_type", {
      p_id: t.id,
      p_school_id: schoolId,
      p_name: name,
      p_description: description,
      p_is_required: isRequired,
      p_expires: true,
      p_default_validity_months: months,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Validity updated to ${months} months.`);
    router.refresh();
  }

  async function handleToggleActive(t: DocType) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_document_type_active", { p_id: t.id, p_active: !t.is_active });
    if (error) { toast.error(error.message); return; }
    router.refresh();
  }

  const requiredCount = types.filter((t) => t.is_active && t.is_required).length;
  const optionalCount = types.filter((t) => t.is_active && !t.is_required).length;

  return (
    <div className="space-y-6">
      <Link href="/admin/kyc" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to KYC documents
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document types</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What you collect from every student — and which ones are mandatory. We've seeded the Indian-standard set; edit it to fit your school.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add document type</Button>
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <Label>Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. House / Community Form" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} /> Required
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={newExpires} onChange={(e) => setNewExpires(e.target.checked)} /> Expires
          </label>
          {newExpires && (
            <div>
              <Label>Validity</Label>
              <select
                value={newMonths}
                onChange={(e) => setNewMonths(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
              </select>
            </div>
          )}
          <Button onClick={handleAdd} disabled={saving || !newName.trim()}>{saving ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="font-semibold text-foreground">Active types</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{requiredCount} required · {optionalCount} optional</span>
        </div>
        <div className="divide-y divide-border">
          {types.map((t) => (
            <div key={t.id} className={`flex flex-wrap items-center justify-between gap-4 px-5 py-3 ${!t.is_active ? "opacity-50" : ""}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  {t.is_custom && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-600">Custom</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {!t.is_active ? "Deactivated · hidden from new checklists" : t.description ?? ""}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="inline-flex gap-1 rounded-lg bg-muted p-0.5">
                  <button onClick={() => !t.is_required && handleToggleRequired(t)} className={`rounded px-2.5 py-1 text-xs font-semibold ${t.is_required ? "bg-red-100 text-red-700" : "text-muted-foreground"}`}>Required</button>
                  <button onClick={() => t.is_required && handleToggleRequired(t)} className={`rounded px-2.5 py-1 text-xs font-semibold ${!t.is_required ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Optional</button>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleExpires(t)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${t.expires ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {t.expires ? "Expires" : "Never expires"}
                  </button>
                  {t.expires && (
                    <select
                      value={t.default_validity_months ?? 12}
                      onChange={(e) => handleUpdateMonths(t, Number(e.target.value))}
                      className="rounded border border-input bg-background px-2 py-1 text-xs font-medium text-foreground"
                    >
                      <option value={1}>1 month</option>
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months</option>
                      <option value={24}>24 months</option>
                    </select>
                  )}
                </div>

                <Switch checked={t.is_active} onCheckedChange={() => handleToggleActive(t)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Requirements apply school-wide. A Required type counts toward every student's completeness; Optional ones are
        collected but don't block. Turning a type Off deactivates it — existing documents are kept, but it drops out of
        new checklists (types with documents on file are never hard-deleted).
      </div>
    </div>
  );
}
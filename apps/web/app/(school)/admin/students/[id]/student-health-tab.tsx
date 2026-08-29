"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Droplet, Phone, Stethoscope, StickyNote, FileHeart, Upload as UploadIcon, Eye,
  Syringe, Plus, Trash2, ClipboardCheck, Check, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useFeature } from "@/lib/features-context";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface HealthRecord {
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  special_notes: string | null;
  updated_at: string | null;
}

interface ChecklistRow {
  document_type_id: string;
  document_type_name: string;
  category: string;
  is_required: boolean;
  expires: boolean;
  document_id: string | null;
  file_name: string | null;
  file_size: number | null;
  status: "submitted" | "verified" | "rejected" | null;
  rejection_reason: string | null;
  verified_by_name: string | null;
}

interface Vaccination {
  id: string;
  vaccine_name: string;
  dose_number: number | null;
  administered_date: string | null;
  next_due_date: string | null;
  notes: string | null;
}

interface Submission {
  id: string;
  student_id: string;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  special_notes: string | null;
  created_at: string;
}

const EMPTY: HealthRecord = {
  blood_group: "", allergies: "", chronic_conditions: "", current_medications: "",
  emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relation: "",
  doctor_name: "", doctor_phone: "", special_notes: "", updated_at: null,
};

const EMPTY_VAX = { id: null as string | null, vaccine_name: "", dose_number: "", administered_date: "", next_due_date: "", notes: "" };

const textareaClass =
  "w-full min-h-[72px] rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

function isValidPhone(value: string) {
  return value === "" || /^\d{10}$/.test(value);
}

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function StudentHealthTab({ studentId, schoolId, readOnly = false }: { studentId: string; schoolId: string; readOnly?: boolean }) {
  const healthRecordsEnabled = useFeature("health_records");
  const [data, setData] = useState<HealthRecord>(EMPTY);
  const [hasRecord, setHasRecord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<ChecklistRow[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocTypeRef = useRef<string | null>(null);

  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [vaxForm, setVaxForm] = useState<typeof EMPTY_VAX | null>(null);
  const [savingVax, setSavingVax] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  // True whenever the last load attempt failed to reach the server — a
  // failed read must never be treated as "no record yet", since Save
  // writes back everything currently in `data`, and blanks would overwrite
  // a real existing row via _apply_health_record's ON CONFLICT DO UPDATE.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!healthRecordsEnabled) {
      setLoading(false);
      return;
    }
    load();
  }, [studentId, healthRecordsEnabled]);

  // Fetches only the health-record fields (Medical Information / Emergency
  // Contact / Doctor Details / Special Notes). Kept separate from loadAux()
  // so that saving a vaccination or uploading a document — neither of which
  // touch student_health_records — never overwrites whatever the admin is
  // currently typing into this form before they've clicked Save.
  // Returns whether the load succeeded — callers combine this with loadAux's
  // own result rather than each setting the shared loadFailed flag
  // independently, since both run concurrently via Promise.all() and one
  // resolving after the other could otherwise clear a failure it never saw.
  async function loadHealthRecord(): Promise<boolean> {
    const supabase = createClient();
    const { data: record, error } = await supabase
      .from("student_health_records")
      .select(
        "blood_group, allergies, chronic_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, doctor_name, doctor_phone, special_notes, updated_at"
      )
      .eq("student_id", studentId)
      .maybeSingle();

    if (error) return false; // do NOT touch the form — a failed read is not "no record"

    if (record) {
      setData({ ...EMPTY, ...record });
      setHasRecord(true);
    } else {
      setData(EMPTY);
      setHasRecord(false);
    }
    return true;
  }

  // Vaccinations, medical documents, and pending submissions — independent
  // of the health-record form above.
  async function loadAux(): Promise<boolean> {
    const supabase = createClient();
    const [
      { data: checklist, error: checklistError },
      { data: vax, error: vaxError },
      { data: subs, error: subsError },
    ] = await Promise.all([
      supabase.rpc("get_student_kyc_checklist", { p_student_id: studentId }),
      supabase
        .from("student_vaccinations")
        .select("id, vaccine_name, dose_number, administered_date, next_due_date, notes")
        .eq("student_id", studentId)
        .order("administered_date", { ascending: false, nullsFirst: false }),
      // RLS-scoped to admin/principal — returns empty for teacher/other roles, no separate readOnly branch needed.
      supabase
        .from("student_health_record_submissions")
        .select(
          "id, student_id, blood_group, allergies, chronic_conditions, current_medications, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, doctor_name, doctor_phone, special_notes, created_at"
        )
        .eq("student_id", studentId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (checklistError || vaxError || subsError) return false; // do NOT touch docs/vaccinations/submissions with a partial result

    setDocs(((checklist ?? []) as ChecklistRow[]).filter((r) => r.category === "medical"));
    setVaccinations((vax ?? []) as Vaccination[]);
    setSubmissions((subs ?? []) as Submission[]);
    return true;
  }

  async function load() {
    setLoading(true);
    const [recordOk, auxOk] = await Promise.all([loadHealthRecord(), loadAux()]);
    if (!recordOk || !auxOk) {
      setLoadFailed(true);
      toast.error("Could not load the health record. Please refresh.");
    } else {
      setLoadFailed(false);
    }
    setLoading(false);
  }

  function set<K extends keyof HealthRecord>(key: K, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function setPhone(key: "emergency_contact_phone" | "doctor_phone", raw: string) {
    set(key, raw.replace(/\D/g, "").slice(0, 10));
  }

  const emergencyPhoneValid = isValidPhone(data.emergency_contact_phone ?? "");
  const doctorPhoneValid = isValidPhone(data.doctor_phone ?? "");

  async function handleSave() {
    if (loadFailed) {
      toast.error("Can't save — the record didn't load. Please refresh first.");
      return;
    }
    if (!emergencyPhoneValid || !doctorPhoneValid) {
      toast.error("Enter a valid 10-digit mobile number, or leave the field empty.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_health_record", {
      p_student_id: studentId,
      p_blood_group: data.blood_group,
      p_allergies: data.allergies,
      p_chronic_conditions: data.chronic_conditions,
      p_current_medications: data.current_medications,
      p_emergency_contact_name: data.emergency_contact_name,
      p_emergency_contact_phone: data.emergency_contact_phone,
      p_emergency_contact_relation: data.emergency_contact_relation,
      p_doctor_name: data.doctor_name,
      p_doctor_phone: data.doctor_phone,
      p_special_notes: data.special_notes,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Health record saved.");
    const reloadOk = await loadHealthRecord();
    setLoadFailed(!reloadOk);
    if (!reloadOk) toast.error("Saved, but could not refresh the form. Please refresh the page.");
  }

  function triggerUpload(documentTypeId: string) {
    pendingDocTypeRef.current = documentTypeId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const documentTypeId = pendingDocTypeRef.current;
    e.target.value = "";
    if (!file || !documentTypeId) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File exceeds 5MB.");
      return;
    }

    setUploadingFor(documentTypeId);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `kyc/${schoolId}/${studentId}/${documentTypeId}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("kyc-docs").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;

      const { error: rpcErr } = await supabase.rpc("upsert_kyc_document", {
        p_subject_id: studentId,
        p_document_type_id: documentTypeId,
        p_file_path: path,
        p_file_name: file.name,
        p_file_type: file.type,
        p_file_size: file.size,
      });
      if (rpcErr) throw rpcErr;

      toast.success("Document uploaded.");
      await loadAux();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleView(documentId: string) {
    const res = await fetch(`/api/kyc/${documentId}/url`);
    const result = await res.json();
    if (!res.ok) {
      toast.error(result.error ?? "Could not open document");
      return;
    }
    window.open(result.url, "_blank");
  }

  async function handleVerify(documentId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_documents", { p_ids: [documentId] });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verified.");
    loadAux();
  }

  async function handleSaveVaccination() {
    if (!vaxForm) return;
    if (!vaxForm.vaccine_name.trim()) {
      toast.error("Vaccine name is required.");
      return;
    }
    setSavingVax(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_vaccination", {
      p_id: vaxForm.id,
      p_student_id: studentId,
      p_vaccine_name: vaxForm.vaccine_name.trim(),
      p_dose_number: vaxForm.dose_number ? parseInt(vaxForm.dose_number, 10) : null,
      p_administered_date: vaxForm.administered_date || null,
      p_next_due_date: vaxForm.next_due_date || null,
      p_notes: vaxForm.notes || null,
    });
    setSavingVax(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(vaxForm.id ? "Vaccination updated." : "Vaccination added.");
    setVaxForm(null);
    loadAux();
  }

  async function handleDeleteVaccination(id: string) {
    if (!confirm("Delete this vaccination record?")) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_vaccination", { p_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Vaccination deleted.");
    loadAux();
  }

  async function handleReview(id: string, approve: boolean) {
    setReviewingId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc("review_health_submission", {
      p_id: id,
      p_approve: approve,
      p_note: reviewNote || null,
    });
    setReviewingId(null);
    setReviewNote("");
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? "Submission approved and applied." : "Submission rejected.");
    load();
  }

  if (!healthRecordsEnabled) return <ModuleUnavailable module="Health Records" />;

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  if (readOnly && !hasRecord && docs.every((d) => !d.document_id) && vaccinations.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No health record on file.</p>;
  }

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />

      {!readOnly && submissions.length > 0 && (
        <Card icon={ClipboardCheck} title={`Pending Submissions (${submissions.length})`}>
          <div className="space-y-4">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-xs text-muted-foreground">Submitted {new Date(s.created_at).toLocaleString()}</p>
                <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {s.blood_group && <p><span className="font-medium">Blood Group:</span> {s.blood_group}</p>}
                  {s.allergies && <p><span className="font-medium">Allergies:</span> {s.allergies}</p>}
                  {s.chronic_conditions && <p><span className="font-medium">Chronic Conditions:</span> {s.chronic_conditions}</p>}
                  {s.current_medications && <p><span className="font-medium">Medications:</span> {s.current_medications}</p>}
                  {s.emergency_contact_name && (
                    <p><span className="font-medium">Emergency Contact:</span> {[s.emergency_contact_name, s.emergency_contact_relation, s.emergency_contact_phone].filter(Boolean).join(" · ")}</p>
                  )}
                  {s.doctor_name && <p><span className="font-medium">Doctor:</span> {[s.doctor_name, s.doctor_phone].filter(Boolean).join(" · ")}</p>}
                  {s.special_notes && <p className="sm:col-span-2"><span className="font-medium">Notes:</span> {s.special_notes}</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={reviewingId === s.id ? reviewNote : ""}
                    onChange={(e) => setReviewNote(e.target.value)}
                    onFocus={() => setReviewingId(s.id)}
                    placeholder="Optional note (required for reject)"
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={() => handleReview(s.id, true)}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (!reviewNote.trim()) { toast.error("A note is required to reject."); return; }
                      handleReview(s.id, false);
                    }}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card icon={Droplet} title="Medical Information">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="blood-group">Blood Group</Label>
            <Input id="blood-group" value={data.blood_group ?? ""} onChange={(e) => set("blood_group", e.target.value)} placeholder="e.g. O+" disabled={readOnly} />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="allergies">Allergies</Label>
            <textarea id="allergies" className={textareaClass} value={data.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Peanuts, penicillin" disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chronic-conditions">Chronic Conditions</Label>
            <textarea id="chronic-conditions" className={textareaClass} value={data.chronic_conditions ?? ""} onChange={(e) => set("chronic_conditions", e.target.value)} placeholder="e.g. Asthma, epilepsy" disabled={readOnly} />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="current-medications">Current Medications</Label>
          <textarea id="current-medications" className={textareaClass} value={data.current_medications ?? ""} onChange={(e) => set("current_medications", e.target.value)} disabled={readOnly} />
        </div>
      </Card>

      <Card icon={Phone} title="Emergency Contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Name</Label>
            <Input id="ec-name" value={data.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-phone">Phone</Label>
            <Input
              id="ec-phone"
              type="tel"
              inputMode="numeric"
              value={data.emergency_contact_phone ?? ""}
              onChange={(e) => setPhone("emergency_contact_phone", e.target.value)}
              placeholder="10-digit mobile number"
              disabled={readOnly}
              aria-invalid={!emergencyPhoneValid}
            />
            {!emergencyPhoneValid && <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-relation">Relation</Label>
            <Input id="ec-relation" value={data.emergency_contact_relation ?? ""} onChange={(e) => set("emergency_contact_relation", e.target.value)} placeholder="e.g. Mother" disabled={readOnly} />
          </div>
        </div>
      </Card>

      <Card icon={Stethoscope} title="Doctor Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name">Name</Label>
            <Input id="doc-name" value={data.doctor_name ?? ""} onChange={(e) => set("doctor_name", e.target.value)} disabled={readOnly} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-phone">Phone</Label>
            <Input
              id="doc-phone"
              type="tel"
              inputMode="numeric"
              value={data.doctor_phone ?? ""}
              onChange={(e) => setPhone("doctor_phone", e.target.value)}
              placeholder="10-digit mobile number"
              disabled={readOnly}
              aria-invalid={!doctorPhoneValid}
            />
            {!doctorPhoneValid && <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>}
          </div>
        </div>
      </Card>

      <Card icon={StickyNote} title="Special Notes">
        <textarea id="special-notes" className={textareaClass} value={data.special_notes ?? ""} onChange={(e) => set("special_notes", e.target.value)} disabled={readOnly} />
      </Card>

      <Card icon={Syringe} title="Vaccination History">
        <div className="space-y-3">
          {vaccinations.length === 0 && !vaxForm && <p className="text-sm text-muted-foreground">No vaccination records yet.</p>}
          {vaccinations.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {vaccinations.map((v) => {
                const dueSoon = v.next_due_date && v.next_due_date >= new Date().toISOString().slice(0, 10)
                  && v.next_due_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                const overdue = v.next_due_date && v.next_due_date < new Date().toISOString().slice(0, 10);
                return (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{v.vaccine_name}</span>
                        {v.dose_number && <Badge variant="outline">Dose {v.dose_number}</Badge>}
                        {overdue && <Badge variant="destructive">Overdue</Badge>}
                        {!overdue && dueSoon && <Badge variant="secondary" className="bg-amber-100 text-amber-700">Due soon</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {v.administered_date && `Given ${v.administered_date}`}
                        {v.administered_date && v.next_due_date && " · "}
                        {v.next_due_date && `Next due ${v.next_due_date}`}
                        {v.notes && ` · ${v.notes}`}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setVaxForm({
                            id: v.id, vaccine_name: v.vaccine_name, dose_number: v.dose_number?.toString() ?? "",
                            administered_date: v.administered_date ?? "", next_due_date: v.next_due_date ?? "", notes: v.notes ?? "",
                          })}
                          className="rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDeleteVaccination(v.id)} className="rounded-lg border border-input p-1.5 text-destructive hover:bg-muted">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!readOnly && vaxForm && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="vax-name">Vaccine Name</Label>
                  <Input id="vax-name" value={vaxForm.vaccine_name} onChange={(e) => setVaxForm({ ...vaxForm, vaccine_name: e.target.value })} placeholder="e.g. MMR" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vax-dose">Dose Number</Label>
                  <Input id="vax-dose" type="number" min={1} value={vaxForm.dose_number} onChange={(e) => setVaxForm({ ...vaxForm, dose_number: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vax-given">Administered Date</Label>
                  <Input id="vax-given" type="date" value={vaxForm.administered_date} onChange={(e) => setVaxForm({ ...vaxForm, administered_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vax-due">Next Due Date</Label>
                  <Input id="vax-due" type="date" value={vaxForm.next_due_date} onChange={(e) => setVaxForm({ ...vaxForm, next_due_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vax-notes">Notes</Label>
                <Input id="vax-notes" value={vaxForm.notes} onChange={(e) => setVaxForm({ ...vaxForm, notes: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveVaccination} disabled={savingVax}>{savingVax ? "Saving…" : "Save"}</Button>
                <Button size="sm" variant="outline" onClick={() => setVaxForm(null)}>Cancel</Button>
              </div>
            </div>
          )}

          {!readOnly && !vaxForm && (
            <button
              onClick={() => setVaxForm(EMPTY_VAX)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-input px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Add Vaccination
            </button>
          )}
        </div>
      </Card>

      <Card icon={FileHeart} title="Medical Documents">
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medical document types configured for this school.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {docs.map((r) => {
              const busy = uploadingFor === r.document_type_id;
              return (
                <div key={r.document_type_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{r.document_type_name}</span>
                      {r.status === "verified" && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">✓ Verified</Badge>}
                      {r.status === "submitted" && <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">Awaiting review</Badge>}
                      {r.status === "rejected" && <Badge variant="destructive">✕ Rejected</Badge>}
                      {!r.status && <Badge variant="outline">Missing</Badge>}
                    </div>
                    {r.status === "rejected" && r.rejection_reason && (
                      <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Rejected: &quot;{r.rejection_reason}&quot;</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.document_id && (
                      <button onClick={() => handleView(r.document_id!)} className="flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    )}
                    {!readOnly && r.status === "submitted" && (
                      <Button size="sm" onClick={() => handleVerify(r.document_id!)}>Verify</Button>
                    )}
                    {!readOnly && (
                      <button
                        onClick={() => triggerUpload(r.document_type_id)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                      >
                        <UploadIcon className="h-3.5 w-3.5" /> {busy ? "Uploading…" : r.document_id ? "Re-upload" : "Upload"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!readOnly && (
        <div className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm">
          {data.updated_at ? (
            <p className="text-xs text-muted-foreground">Last updated {new Date(data.updated_at).toLocaleDateString()}</p>
          ) : (
            <span />
          )}
          <Button onClick={handleSave} disabled={saving || loadFailed}>
            {saving ? "Saving…" : "Save Health Record"}
          </Button>
        </div>
      )}
    </div>
  );
}

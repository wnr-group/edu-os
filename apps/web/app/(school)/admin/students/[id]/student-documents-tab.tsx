"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Upload as UploadIcon, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

interface ChecklistRow {
  document_type_id: string;
  document_type_name: string;
  is_required: boolean;
  expires: boolean;
  document_id: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: "submitted" | "verified" | "rejected" | null;
  rejection_reason: string | null;
  expires_on: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  uploaded_by_name: string | null;
  created_at: string | null;
}

function deriveState(r: ChecklistRow): "missing" | "submitted" | "verified" | "rejected" | "expiring" | "expired" {
  if (!r.document_id) return "missing";
  if (r.status === "submitted") return "submitted";
  if (r.status === "rejected") return "missing"; // counts as missing until re-uploaded, per mockup
  if (r.status === "verified") {
    if (r.expires_on) {
      const today = new Date().toISOString().slice(0, 10);
      const in30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      if (r.expires_on < today) return "expired";
      if (r.expires_on <= in30d) return "expiring";
    }
    return "verified";
  }
  return "missing";
}

// Fire-and-forget, mirrors leave-inbox.tsx's callLeaveNotify — the document
// is already saved by the time this runs, so a notify failure never blocks
// or reverts the upload itself.
function callKycDocumentNotify(documentId: string) {
  const supabase = createClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/kyc-document-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ document_id: documentId }),
    }).catch(() => {});
  });
}

export function StudentDocumentsTab({ studentId, schoolId }: { studentId: string; schoolId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocTypeRef = useRef<string | null>(null);

  useEffect(() => { load(); }, [studentId]);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_student_kyc_checklist", { p_student_id: studentId });
    setRows((data ?? []) as ChecklistRow[]);
    setLoading(false);
  }

  const requiredTotal = rows.filter((r) => r.is_required).length;
  const requiredDone = rows.filter((r) => r.is_required && deriveState(r) === "verified").length;

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

      const { data: documentId, error: rpcErr } = await supabase.rpc("upsert_kyc_document", {
        p_subject_id: studentId,
        p_document_type_id: documentTypeId,
        p_file_path: path,
        p_file_name: file.name,
        p_file_type: file.type,
        p_file_size: file.size,
      });
      if (rpcErr) throw rpcErr;

      toast.success("Document uploaded.");
      callKycDocumentNotify(documentId as string);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleView(documentId: string) {
    const res = await fetch(`/api/kyc/${documentId}/url`);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Could not open document"); return; }
    window.open(data.url, "_blank");
  }

  async function handleVerify(documentId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_documents", { p_ids: [documentId] });
    if (error) { toast.error(error.message); return; }
    toast.success("Verified.");
    await load();
    router.refresh();
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Required documents</p>
          <p className="text-xs text-muted-foreground">{requiredDone}/{requiredTotal} verified</p>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => {
          const state = deriveState(r);
          const busy = uploadingFor === r.document_type_id;
          return (
            <div key={r.document_type_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{r.document_type_name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${r.is_required ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                      {r.is_required ? "Required" : "Optional"}
                    </span>
                    {state === "verified" && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Verified</span>}
                    {state === "submitted" && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Awaiting review</span>}
                    {state === "expiring" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Expires {r.expires_on}</span>}
                    {state === "expired" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Expired</span>}
                    {state === "missing" && r.status !== "rejected" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Missing</span>}
                    {r.status === "rejected" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">✕ Rejected</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.document_id
                      ? `${state === "verified" || state === "expiring" || state === "expired" ? "Verified by " + (r.verified_by_name ?? "—") : "Uploaded by " + (r.uploaded_by_name ?? "—")}`
                      : "Not on file yet"}
                  </p>
                  {r.status === "rejected" && r.rejection_reason && (
                    <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Rejected: "{r.rejection_reason}"</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {r.document_id && (
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{r.file_name}</p>
                    <p>{r.file_size ? `${Math.round(r.file_size / 1024)} KB` : ""}</p>
                  </div>
                )}
                {r.document_id && (
                  <button onClick={() => handleView(r.document_id!)} className="flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                )}
                {r.status === "submitted" && (
                  <Button size="sm" onClick={() => handleVerify(r.document_id!)}>Verify</Button>
                )}
                <button
                  onClick={() => triggerUpload(r.document_type_id)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                >
                  <UploadIcon className="h-3.5 w-3.5" /> {busy ? "Uploading…" : r.document_id ? "Re-upload" : "Upload"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        The checklist is the required document types minus what's on file. A type shows Missing until a document is
        uploaded, then Awaiting review until an admin or principal verifies it. A Rejected doc still counts as missing
        until a corrected version is re-uploaded. Files sit in a private bucket — "View" opens a 60-second signed link.
      </div>
    </div>
  );
}
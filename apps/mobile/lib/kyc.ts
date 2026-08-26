// apps/mobile/lib/kyc.ts
import { File } from "expo-file-system";
import { supabase, supabaseUrl } from "./supabase";

export type KycState = "missing" | "submitted" | "verified" | "expiring" | "expired";

export interface KycChecklistItem {
  documentTypeId: string;
  documentId: string | null;
  documentTypeName: string;
  isRequired: boolean;
  state: KycState;
  isRejected: boolean;
  rejectionReason: string | null;
  fileName: string | null;
  expiresOn: string | null;
  verifiedByName: string | null;
  uploadedByName: string | null;
}

interface ChecklistRow {
  document_type_id: string;
  document_type_name: string;
  is_required: boolean;
  expires: boolean;
  document_id: string | null;
  file_name: string | null;
  status: "submitted" | "verified" | "rejected" | "expired" | null;
  rejection_reason: string | null;
  expires_on: string | null;
  verified_by_name: string | null;
  uploaded_by_name: string | null;
}

/**
 * Ported verbatim from deriveState() in
 * apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx — same
 * five states, same rejected-counts-as-missing-until-reupload rule, same
 * 30-day "expiring" window. Do not diverge from the Web logic here.
 */
function deriveState(r: ChecklistRow): KycState {
  if (!r.document_id) return "missing";
  if (r.status === "submitted") return "submitted";
  if (r.status === "rejected") return "missing";
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

export async function loadKycChecklist(
  studentId: string,
): Promise<{ items: KycChecklistItem[]; error: string | null }> {
  const { data, error }: { data: ChecklistRow[] | null; error: any } = await supabase.rpc(
    "get_student_kyc_checklist",
    { p_student_id: studentId }
  );
  if (error) return { items: [], error: error.message };

  const rows = data ?? [];
  const items: KycChecklistItem[] = rows.map((r) => ({
    documentTypeId: r.document_type_id,
    documentId: r.document_id,
    documentTypeName: r.document_type_name,
    isRequired: r.is_required,
    state: deriveState(r),
    isRejected: r.status === "rejected",
    rejectionReason: r.rejection_reason,
    fileName: r.file_name,
    expiresOn: r.expires_on,
    verifiedByName: r.verified_by_name,
    uploadedByName: r.uploaded_by_name,
  }));
  return { items, error: null };
}

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * Upload one picked file as the KYC document for (studentId, documentTypeId)
 * and register it via upsert_kyc_document. Mirrors uploadAttachment() in
 * lib/homework.ts. On storage-upload success but RPC failure, the orphaned
 * storage object is left in place (matches the existing web admin upload's
 * handleFileSelected behavior — it doesn't clean up on RPC failure either;
 * the error is surfaced to the user either way, never silently reported as
 * success).
 */
export async function uploadKycDocument(
  schoolId: string,
  studentId: string,
  documentTypeId: string,
  file: PickedFile,
): Promise<{ error: string | null }> {
  if (file.size > MAX_FILE_SIZE) return { error: "File exceeds 5MB." };
  if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
    return { error: "Unsupported file type. Use PDF, JPG, or PNG." };
  }

  const ext = file.name.split(".").pop() || "bin";
  const path = `kyc/${schoolId}/${studentId}/${documentTypeId}-${Date.now()}.${ext}`;
  const bytes = await new File(file.uri).bytes();

  const up = await supabase.storage
    .from("kyc-docs")
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (up.error) return { error: up.error.message };

  const { error: rpcErr } = await supabase.rpc("upsert_kyc_document", {
    p_subject_id: studentId,
    p_document_type_id: documentTypeId,
    p_file_path: path,
    p_file_name: file.name,
    p_file_type: file.mimeType,
    p_file_size: file.size,
  });
  if (rpcErr) return { error: rpcErr.message };

  return { error: null };
}

/** Signed URL for a parent's own child's KYC document, via the kyc-signed-url Edge Function. */
export async function getKycSignedUrl(documentId: string): Promise<{ url: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: "Not authenticated" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/kyc-signed-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? "Could not open document" };
    return { url: data.url as string, error: null };
  } catch {
    return { url: null, error: "Network error" };
  }
}

// apps/mobile/lib/admissions.ts
import { supabase, supabaseUrl, SCHOOL_ID } from "./supabase";

export interface AdmissionClassOption {
  id: string;
  name: string;
}

export async function loadClassesForEnquiry(): Promise<AdmissionClassOption[]> {
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, order")
    .eq("school_id", SCHOOL_ID)
    .order("order", { ascending: true })
    .returns<{ id: string; name: string }[]>();

  if (error || !data) return [];
  return data.map((c) => ({ id: c.id, name: c.name }));
}

export async function loadMyProfileForPrefill(): Promise<{ fullName: string; email: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { fullName: "", email: "" };

  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single()
    .returns<{ full_name: string }>();

  return { fullName: prof?.full_name ?? "", email: user.email ?? "" };
}

export interface AdmissionEnquiryInput {
  applicantName: string;
  dateOfBirth: string; // "" if not set
  gender: "male" | "female" | "other";
  classAppliedId: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  previousSchool: string;
  area: string;
  applicantNote: string;
}

export type AdmissionSubmitResult =
  | { kind: "success"; referenceNo: string }
  | { kind: "payment_required"; referenceNo: string }
  | { kind: "error"; message: string };

const REASON_MESSAGES: Record<string, string> = {
  missing_school: "This app isn't linked to a school yet. Please contact the school office.",
  not_found: "Admissions aren't currently open for this school.",
  closed: "Admissions are currently closed for this school.",
  rate_limited: "Too many attempts. Please try again in a little while.",
  invalid_fields: "Please check the required fields and try again.",
  no_academic_year: "Admissions can't be processed right now — no active academic year is configured. Please contact the school office.",
  payments_unavailable: "Online payment isn't available right now. Please try again later or contact the school office.",
  insert_failed: "Something went wrong submitting your enquiry. Please try again.",
  bad_request: "Something went wrong submitting your enquiry. Please try again.",
  network_error: "Couldn't reach the server. Please check your connection and try again.",
};

export function describeAdmissionError(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Something went wrong submitting your enquiry. Please try again.";
}

/**
 * Submits to the existing admission-submit Edge Function verbatim — same
 * field set, same bot-trap fields (honeypot/form_ts), same school_id
 * resolution as apps/web/app/apply/apply-form.tsx. Mobile has no paid-
 * admission checkout: if the response includes order_id (fee required),
 * this returns "payment_required" without attempting Razorpay — the
 * enquiry row already exists server-side (payment_status: "pending") by
 * the time that happens, which the caller must communicate honestly.
 */
export async function submitAdmissionEnquiry(
  input: AdmissionEnquiryInput,
  formTs: number,
): Promise<AdmissionSubmitResult> {
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/admission-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: SCHOOL_ID,
        form_ts: formTs,
        honeypot: "",
        applicant_name: input.applicantName,
        date_of_birth: input.dateOfBirth || undefined,
        gender: input.gender,
        class_applied_id: input.classAppliedId,
        parent_name: input.parentName,
        parent_phone: input.parentPhone,
        parent_email: input.parentEmail || undefined,
        previous_school: input.previousSchool || undefined,
        area: input.area || undefined,
        applicant_note: input.applicantNote || undefined,
      }),
    });
  } catch {
    return { kind: "error", message: describeAdmissionError("network_error") };
  }

  let data: { ok?: boolean; reference_no?: string; reason?: string; order_id?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    return { kind: "error", message: describeAdmissionError("bad_request") };
  }
  if (!data) return { kind: "error", message: describeAdmissionError("bad_request") };

  if (data.ok && data.order_id) {
    return { kind: "payment_required", referenceNo: data.reference_no ?? "" };
  }
  if (data.ok && data.reference_no) {
    return { kind: "success", referenceNo: data.reference_no };
  }
  return { kind: "error", message: describeAdmissionError(data.reason ?? "bad_request") };
}

"use client";

import { useState } from "react";

interface ClassOption { id: string; name: string }
interface Config {
  school_id: string; school_name: string; primary_color: string | null;
  is_open: boolean; application_fee: number; classes: ClassOption[];
}

export function ApplyForm({ config, schoolId }: { config: Config; schoolId: string }) {
  const [formTs] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState("");
  const [form, setForm] = useState({
    applicant_name: "", date_of_birth: "", gender: "male", class_applied_id: "",
    parent_name: "", parent_phone: "", parent_email: "", previous_school: "", area: "", applicant_note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; reference_no?: string; reason?: string } | null>(null);

  const brand = config.primary_color ?? "#4F46E5";

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.applicant_name || !form.class_applied_id || !form.parent_name || !form.parent_phone) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admission-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, form_ts: formTs, honeypot, ...form }),
      });
      const data = await res.json();

      if (data.ok && data.order_id) {
        // Fee path — open Razorpay checkout in-page (Story C).
        const options = {
          key: data.key_id, amount: data.amount, currency: "INR", order_id: data.order_id,
          name: config.school_name,
          handler: () => setResult({ ok: true, reference_no: data.reference_no }),
          modal: { ondismiss: () => setResult({ ok: false, reason: "payment_cancelled" }) },
        };
        // @ts-expect-error Razorpay script loaded globally via checkout.js
        const rzp = new window.Razorpay(options);
        rzp.open();
        return;
      }

      setResult(data);
    } catch {
      setResult({ ok: false, reason: "network_error" });
    } finally {
      setSubmitting(false);
    }
  }

  const REASON_COPY: Record<string, string> = {
    closed: "Admissions are currently closed.",
    rate_limited: "Too many attempts — please contact the school office directly.",
    payments_unavailable: "Online payment isn't available right now — please contact the school office.",
    payment_cancelled: "Payment was cancelled. You can try again.",
    invalid_fields: "Please check the required fields and try again.",
    network_error: "Something went wrong. Please try again.",
  };

  if (result?.ok) {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", padding: 24, fontFamily: "sans-serif", textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>Application received</h1>
        <p style={{ color: "#475569" }}>Thank you! Your reference number is:</p>
        <div style={{ fontSize: 28, fontWeight: 800, color: brand, margin: "16px 0" }}>{result.reference_no}</div>
        <p style={{ fontSize: 13, color: "#94A0B4" }}>The school will contact you on your registered mobile number.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24 }}>Apply for admission — {config.school_name}</h1>
      <p style={{ color: "#475569", fontSize: 14 }}>It takes about 3 minutes — the school will contact you after reviewing your application.</p>

      {result && !result.ok && (
        <div style={{ background: "#FCECEC", border: "1px solid #F3C9C9", borderRadius: 8, padding: 12, marginBottom: 16, color: "#EF4444", fontSize: 13 }}>
          {REASON_COPY[result.reason ?? ""] ?? "Something went wrong. Please try again."}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Honeypot — hidden from real users via off-screen positioning, not display:none (some bots skip display:none fields) */}
        <div style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }} aria-hidden="true">
          <label>Company
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        <input required placeholder="Student's full name *" value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} style={inputStyle} />
        <input type="date" placeholder="Date of birth" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} style={inputStyle} />
        <select required value={form.class_applied_id} onChange={(e) => set("class_applied_id", e.target.value)} style={inputStyle}>
          <option value="">Select a class…</option>
          {config.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={form.gender} onChange={(e) => set("gender", e.target.value)} style={inputStyle}>
          <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select>

        <input required placeholder="Parent / guardian name *" value={form.parent_name} onChange={(e) => set("parent_name", e.target.value)} style={inputStyle} />
        <input required type="tel" placeholder="Mobile number *" value={form.parent_phone} onChange={(e) => set("parent_phone", e.target.value)} style={inputStyle} />
        <input type="email" placeholder="Email (optional)" value={form.parent_email} onChange={(e) => set("parent_email", e.target.value)} style={inputStyle} />

        <input placeholder="Previous school (optional)" value={form.previous_school} onChange={(e) => set("previous_school", e.target.value)} style={inputStyle} />
        <input placeholder="Area / locality (optional)" value={form.area} onChange={(e) => set("area", e.target.value)} style={inputStyle} />
        <textarea placeholder="Anything you'd like the school to know? (optional)" value={form.applicant_note} onChange={(e) => set("applicant_note", e.target.value)} style={{ ...inputStyle, minHeight: 70 }} />

        {config.application_fee > 0 && (
          <div style={{ background: "#EEF1FE", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>Application fee</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>₹{(config.application_fee / 100).toLocaleString("en-IN")}</span>
          </div>
        )}

        <button type="submit" disabled={submitting} style={{ height: 46, borderRadius: 10, background: brand, color: "#fff", border: "none", fontWeight: 700, fontSize: 15 }}>
          {submitting ? "Submitting…" : config.application_fee > 0 ? `Submit & pay ₹${(config.application_fee / 100).toLocaleString("en-IN")}` : "Submit application"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 42, border: "1px solid #EBECF4", borderRadius: 10, padding: "0 13px", fontSize: 14, fontFamily: "inherit",
};
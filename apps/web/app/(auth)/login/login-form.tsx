"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "../../../lib/supabase";
import { phoneSchema, otpSchema } from "@erp/shared";
import { GraduationCap } from "lucide-react";

export function LoginForm({
  schoolId,
  schoolName,
  primaryColor,
}: {
  schoolId: string | null;
  schoolName: string;
  primaryColor: string;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [noAccess, setNoAccess] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason === "no_access") setNoAccess(true);
    const supabase = createClient();
    // Validate against the auth server (getUser), not just the local cookie
    // (getSession). A stale cookie — e.g. after a DB reset or expired refresh
    // token — otherwise makes the login page redirect to "/" while middleware
    // bounces back to "/login", causing an infinite reload. Sign out on no user.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        supabase.auth.signOut();
      } else if (reason === "no_access") {
        supabase.auth.signOut();
      } else if (!reason) {
        window.location.href = "/";
      }
    });
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNoAccess(false);
    const result = phoneSchema.safeParse({ phone });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }
    setLoading(true);
    const supabase = createClient();

    const { data: allowed, error: checkError } = await supabase.rpc(
      "check_phone_has_access",
      { p_phone: `+91${phone}`, p_school_id: schoolId },
    );
    if (checkError) {
      setLoading(false);
      setError("Could not verify access. Please try again.");
      return;
    }
    if (!allowed) {
      setLoading(false);
      setNoAccess(true);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithOtp({
      phone: `+91${phone}`,
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setStep("otp");
    setResendCooldown(30);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = otpSchema.safeParse({ otp });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.verifyOtp({
      phone: `+91${phone}`,
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (authError) {
      setError("Invalid or expired OTP. Please try again.");
      return;
    }
    window.location.href = "/";
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      phone: `+91${phone}`,
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setResendCooldown(30);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F9FB]">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: primaryColor }}
          >
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">{schoolName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>

        {noAccess && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You don&apos;t have access to this school. Please contact your school administrator.
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {step === "phone" ? (
          <form onSubmit={handleSendOtp}>
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Mobile Number
              </label>
              <div className="flex overflow-hidden rounded-lg border border-border focus-within:border-[#2B6CB0] focus-within:ring-2 focus-within:ring-[#2B6CB0]/20">
                <span className="flex items-center bg-muted px-3 text-sm text-muted-foreground">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="\d{10}"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="9876543210"
                  required
                  className="flex-1 bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <p className="mb-4 text-sm text-muted-foreground">
              OTP sent to <span className="font-medium text-foreground">+91 {phone}</span>.{" "}
              <button
                type="button"
                onClick={() => { setStep("phone"); setOtp(""); setError(null); setLoading(false); }}
                className="text-[#2B6CB0] underline"
              >
                Change
              </button>
            </p>
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Enter OTP
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                required
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tracking-widest transition-colors focus:border-[#2B6CB0] focus:outline-none focus:ring-2 focus:ring-[#2B6CB0]/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? "Verifying…" : "Verify OTP"}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="mt-3 w-full text-sm text-[#2B6CB0] disabled:text-muted-foreground"
            >
              {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
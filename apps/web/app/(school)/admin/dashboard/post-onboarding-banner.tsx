"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "onboarding_banner_dismissed";

export function PostOnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-sm font-medium text-emerald-800">
          Setup complete — here&apos;s what to do next:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/timetable" className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
            Add Timetable
          </Link>
          <Link href="/admin/subjects" className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
            Assign Subjects
          </Link>
          <Link href="/admin/fees" className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
            Set Up Fees
          </Link>
        </div>
      </div>
      <button onClick={dismiss} aria-label="Dismiss onboarding banner" className="self-end rounded p-1 text-emerald-600 hover:bg-emerald-100 sm:self-auto">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, School } from "lucide-react";

export function FindSchoolForm({ host }: { host: string }) {
  const [slug, setSlug] = useState("");

  // host is the apex the user landed on, e.g. "lvh.me:3000" or
  // "eduos.com". Strip a leading "www." so the school subdomain
  // sits directly under the bare apex.
  const baseHost = host.replace(/^www\./, "");
  const [hostname, port] = baseHost.split(":");
  const portSuffix = port ? `:${port}` : "";
  const protocol = hostname === "localhost" || hostname.endsWith("lvh.me") ? "http" : "https";

  const cleanSlug = slug.trim().toLowerCase();
  const canSubmit = cleanSlug.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    window.location.href = `${protocol}://${cleanSlug}.${baseHost}/login`;
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F6F9FB] px-6 font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <Image src="/logo-mark.png" alt="EduOS" width={48} height={48} className="rounded-xl" />
         <span className="mt-6 inline-block rounded-full border border-[#2B6CB0]/30 bg-[#2B6CB0]/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#2B6CB0]">
            School Portal
          </span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Find your <span className="text-[#2B6CB0]">school portal</span>
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
            Enter your school&apos;s ID to jump straight to its sign-in page. It&apos;s the
            short name in your school&apos;s web address.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
          <label htmlFor="school-slug" className="mb-2 block text-sm font-semibold text-[#0D1B2A]">
            School ID
          </label>
          <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white transition-colors focus-within:border-[#2B6CB0] focus-within:ring-2 focus-within:ring-[#2B6CB0]/20">
            <span className="flex items-center pl-3 text-slate-400">
              <School className="h-4 w-4" />
            </span>
            <input
              id="school-slug"
              type="text"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={slug}
              onChange={(e) => setSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
              placeholder="your-school"
              className="min-w-0 flex-1 bg-transparent px-2.5 py-3 text-sm text-[#0D1B2A] outline-none placeholder:text-slate-400"
            />
            <span className="flex items-center whitespace-nowrap border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
              .{baseHost.split(":")[0]}
            </span>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#0D1B2A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all hover:bg-[#16283b] enabled:hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue to sign in
            <ArrowRight className="h-4 w-4" />
          </button>

          {cleanSlug && (
            <p className="mt-3 truncate text-center text-xs text-slate-500">
              Going to{" "}
               <span className="font-medium text-[#2B6CB0]">
                {cleanSlug}.{baseHost.split(":")[0]}
              </span>
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Don&apos;t know your school ID?{" "}
          <a
            href="https://wa.me/919789471572"
            target="_blank"
            rel="noopener noreferrer"
             className="font-semibold text-[#2B6CB0] underline-offset-2 hover:underline"
          >
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}

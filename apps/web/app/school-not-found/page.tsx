import type { Metadata } from "next";
import Image from "next/image";
import { HeroReveal } from "@/components/hero-animations";

export const metadata: Metadata = {
  title: "School Not Found | EduOS",
  robots: { index: false, follow: false },
};

export default function SchoolNotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F6F9FB] px-6 py-16 font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />


      <div className="relative flex flex-col items-center text-center">
        <HeroReveal delay={0}>
          <Image
            src="/EduOS_icon.png"
            alt="EduOS"
            width={88}
            height={88}
            className="drop-shadow-sm"
          />
        </HeroReveal>

        <HeroReveal delay={100}>
          <span className="mt-8 inline-block rounded-full border border-[#2B6CB0]/30 bg-[#2B6CB0]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#2B6CB0]">
            Error 404
          </span>
        </HeroReveal>

        <HeroReveal delay={200}>
          <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            This school portal{" "}
            <span className="text-[#2B6CB0]">doesn&apos;t exist</span>
          </h1>
        </HeroReveal>

        <HeroReveal delay={300}>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
            The web address you entered isn&apos;t linked to any school on
            EduOS. Check the link from your school, or reach out to your
            school administrator.
          </p>
        </HeroReveal>

        <HeroReveal delay={400}>
          <div className="mt-9 flex w-full flex-wrap items-center justify-center gap-3 sm:w-auto">
            <a
              href="https://eduos.com"
              className="w-full rounded-full bg-[#0D1B2A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all hover:scale-[1.03] hover:bg-[#16283b] active:scale-[0.97] sm:w-auto"
            >
              Go to EduOS
            </a>
            <a
              href="https://wa.me/919789471572"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#0D1B2A] transition-all hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97] sm:w-auto"
            >
              Contact Support
            </a>
          </div>
        </HeroReveal>
      </div>
    </main>
  );
}
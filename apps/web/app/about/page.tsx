import type { Metadata } from "next";
import Image from "next/image";
import { BarChart3, ShieldCheck, Lock, Users, Share2, Rss } from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "About EduOS — Modernizing the Digital Campus",
  description:
    "EduOS is an institutional operating system designed to bridge the gap between administrative complexity and educational excellence.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/about",
  },
};

const TIMELINE = [
  {
    year: "2018",
    title: "Founded",
    description: "The core vision for EduOS was drafted in a university research lab.",
  },
  {
    year: "2020",
    title: "Beta Launch",
    description: "First pilots deployed across five regional community colleges.",
  },
  {
    year: "2022",
    title: "Standard v1.0",
    description: "Official release of the Enterprise OS for 4-year institutions.",
  },
  {
    year: "2024",
    title: "Global Reach",
    description: "EduOS now manages over 1 million student profiles worldwide.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6F9FB] font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <Navbar active="About Us" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF3F8] px-5 py-16 md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Left */}
          <div>
            <HeroReveal delay={100}>
              <p className="text-xs font-bold uppercase tracking-widest text-[#2B6CB0] md:text-sm">
                Redefining Education
              </p>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-4 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
                Modernizing the Digital Campus with Academic Precision
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
                EduOS is an institutional operating system designed to bridge the gap
                between administrative complexity and educational excellence. We provide
                the structural backbone for modern learning environments.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-8 flex items-center gap-6 md:mt-10">
                <div className="flex items-baseline gap-2 border-l-2 border-[#2B6CB0] pl-3">
                  <span className="text-2xl font-extrabold text-[#0D1B2A] md:text-3xl">500+</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Institutions
                  </span>
                </div>
                <div className="flex items-baseline gap-2 border-l-2 border-[#2B6CB0] pl-3">
                  <span className="text-2xl font-extrabold text-[#0D1B2A] md:text-3xl">1M+</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Students
                  </span>
                </div>
              </div>
            </HeroReveal>
          </div>

          {/* Right — hero photo, stacked below text on mobile/tablet, beside it on desktop */}
          <HeroFloat delay={400} className="relative flex justify-center lg:justify-end">
            <div className="relative aspect-[4/5] w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl shadow-slate-300/40 lg:max-w-none">
              <Image
                src="/about-hero.jpg"
                alt="Students and staff collaborating in a modern campus library"
                fill
                priority
                quality={100}
                sizes="(min-width: 1024px) 50vw, (min-width: 640px) 85vw, 100vw"
                className="object-cover"
              />
            </div>
          </HeroFloat>
        </div>
      </section>

      {/* ── MISSION & PRINCIPLES ── */}
      <section className="bg-[#EEF3F8] px-5 pb-20 pt-6 md:px-6 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
              Our Mission &amp; Principles
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={120}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Founded by educators and engineers, our mission is to eliminate
              administrative noise so teachers can focus on what matters: the students.
            </p>
          </AnimateOnScroll>
        </div>

        <div className="mx-auto mt-14 flex max-w-7xl flex-col gap-4 lg:gap-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            {/* Precision Intelligence */}
            <AnimateOnScroll
              delay={0}
              className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#2B6CB0]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-8 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2B6CB0]/10 transition-transform duration-300 group-hover:scale-105">
                <BarChart3 className="h-5 w-5 text-[#2B6CB0]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#0D1B2A] lg:text-2xl">
                Precision Intelligence
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 lg:text-base">
                We believe data should be actionable, not overwhelming. Our analytics
                suite translates raw academic data into strategic insights for
                institutional growth.
              </p>
              <div className="mt-6 flex h-40 items-end gap-3 rounded-xl bg-[#EEF3F8] p-5">
                {[40, 55, 38, 68, 52].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md bg-[#2B6CB0] transition-all duration-500"
                    style={{ height: `${h}%`, opacity: 0.45 + i * 0.14 }}
                  />
                ))}
              </div>
            </AnimateOnScroll>

            {/* Enterprise Trust */}
            <AnimateOnScroll
              delay={150}
              className="group flex flex-col rounded-2xl bg-[#0D1B2A] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-[#2B6CB0]/20 lg:col-span-4 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:scale-105">
                <ShieldCheck className="h-5 w-5 text-white" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-white lg:text-2xl">Enterprise Trust</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#B9CBDF] lg:text-base">
                Built on top-tier security protocols to ensure every piece of
                institutional data remains private and protected.
              </p>
              <div className="mt-8 flex flex-1 items-center justify-center">
                <div className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-white/40">
                  <Lock className="h-7 w-7 text-white" />
                </div>
              </div>
            </AnimateOnScroll>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            {/* Collaboration */}
            <AnimateOnScroll
              delay={0}
              className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#2B6CB0]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-4 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2B6CB0]/10 transition-transform duration-300 group-hover:scale-105">
                <Users className="h-5 w-5 text-[#2B6CB0]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#0D1B2A] lg:text-2xl">Collaboration</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                Breaking silos between departments with a unified interface.
              </p>
            </AnimateOnScroll>

            {/* Global Scalability */}
            <AnimateOnScroll
              delay={150}
              className="group rounded-2xl bg-[#EAF1FB] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-8 lg:p-7"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-sm">
                  <h3 className="text-xl font-bold text-[#0D1B2A] lg:text-2xl">Global Scalability</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                    From small private schools to national university systems, EduOS
                    scales with your ambition without compromising performance.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 rounded-xl bg-white px-6 py-5 text-center shadow-sm sm:flex-none sm:min-w-[140px]">
                    <p className="text-xl font-extrabold text-[#0D1B2A]">99.9%</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">Uptime</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-white px-6 py-5 text-center shadow-sm sm:flex-none sm:min-w-[140px]">
                    <p className="text-xl font-extrabold text-[#0D1B2A]">24/7</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">Support</p>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── THE REASON WHY WE CREATED EDUOS ── */}
      <section className="bg-[#F6F9FB] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <span className="inline-block rounded-full bg-[#EEF3F8] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#2B6CB0] md:text-xs">
              Vision 2035: Reimagining the Future of Learning
            </span>
          </AnimateOnScroll>
          <AnimateOnScroll delay={100}>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
              The Reason Why We Created EduOS
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={200}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Empowering education and eliminating the unwanted heavy lifting for
              schools, so you can focus on what matters most: the students.
            </p>
          </AnimateOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <AnimateOnScroll from="left" delay={0}>
            <div>
              <h3 className="text-xl font-bold text-[#0D1B2A] lg:text-2xl">
                Streamlining Operations
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                We recognized that educators were spending more time on spreadsheets
                than on students. EduOS was built to automate the administrative
                friction that slows down institutional progress.
              </p>
            </div>
            <div className="mt-8">
              <h3 className="text-xl font-bold text-[#0D1B2A] lg:text-2xl">
                Modernizing the Digital Campus
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                Our mission is to provide a unified digital infrastructure that scales
                with the evolving needs of global education, ensuring every institution
                has access to enterprise-grade precision.
              </p>
            </div>
            <a
              href="#mission"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-[#0D1B2A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all hover:bg-[#16283b] hover:scale-[1.03] active:scale-[0.97]"
            >
              Learn More About Our Mission
            </a>
          </AnimateOnScroll>

          <AnimateOnScroll from="right" delay={150}>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-xl shadow-slate-300/40">
              <Image
                src="/about-hero.jpg"
                alt="Students studying together in a modern campus library"
                fill
                quality={100}
                sizes="(min-width: 1024px) 50vw, (min-width: 640px) 85vw, 100vw"
                className="object-cover"
              />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── THE EVOLUTION OF EDUOS (TIMELINE) ── */}
      <section className="bg-[#EAF1FB] px-5 py-20 md:px-6 md:py-28">
        <AnimateOnScroll delay={0} className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
            The Evolution of EduOS
          </h2>
        </AnimateOnScroll>

        <div className="relative mx-auto mt-16 max-w-4xl">
          {/* vertical dotted line — flush-left on mobile, centered from sm up */}
          <div className="absolute left-[18px] top-0 h-full border-l-2 border-dotted border-slate-400/60 sm:hidden" />
          <div className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 border-l-2 border-dotted border-slate-400/60 sm:block" />

          <div className="relative flex flex-col gap-10 sm:gap-0">
            {TIMELINE.map((item, i) => {
              const isLeft = i % 2 === 0;
              return (
                <AnimateOnScroll
                  key={item.year}
                  delay={i * 80}
                  from={isLeft ? "left" : "right"}
                >
                  {/* Mobile: marker above/beside text, single column, left-aligned to the line */}
                  <div className="relative pl-14 sm:hidden">
                    <span className="absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#0D1B2A] text-xs font-bold text-white shadow-md">
                      {item.year}
                    </span>
                    <h3 className="pt-1.5 text-base font-bold text-[#0D1B2A]">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {item.description}
                    </p>
                  </div>

                  {/* Tablet/Desktop: alternating sides around the center line */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:py-8">
                    <div className={isLeft ? "text-right" : ""}>
                      {isLeft && (
                        <>
                          <h3 className="text-base font-bold text-[#0D1B2A]">{item.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            {item.description}
                          </p>
                        </>
                      )}
                    </div>
                    <span className="relative z-10 grid h-14 w-14 flex-shrink-0 place-items-center rounded-full bg-[#0D1B2A] text-sm font-bold text-white shadow-md">
                      {item.year}
                    </span>
                    <div>
                      {!isLeft && (
                        <>
                          <h3 className="text-base font-bold text-[#0D1B2A]">{item.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            {item.description}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section id="cta" className="bg-[#F6F9FB] px-5 pb-16 pt-4 md:px-6 md:pb-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#132C46] to-[#0A1622] px-6 py-14 text-center md:px-12 md:py-20">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px] rounded-full bg-[#2B6CB0]/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Ready to Modernize Your Campus?
              </h2>
              <p className="mt-4 text-sm text-[#B9CBDF] md:text-lg">
                Join the growing network of elite institutions leveraging EduOS to
                drive academic outcomes through technological precision.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <a
                  href="mailto:balaji.p2prhel@gmail.com?subject=Request%20a%20Demo"
                  className="w-full rounded-full border border-white/10 bg-[#0A1622] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[#050b12] hover:scale-[1.03] active:scale-[0.97] sm:w-auto"
                >
                  Request a Demo
                </a>
                <a
                  href="/eduos-brochure.pdf"
                  className="w-full rounded-full border border-white/30 bg-white/5 px-8 py-3 text-sm font-semibold text-[#B9CBDF] transition-all hover:bg-white/10 hover:scale-[1.03] active:scale-[0.97] sm:w-auto"
                >
                  Download Brochure
                </a>
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0D1B2A] px-5 pb-8 pt-14 md:px-6 md:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div>
              <span className="text-lg font-bold text-white/10">EduOS</span>
              <p className="mt-4 text-sm leading-relaxed text-[#8FA3BC]">
                The structural backbone for the next century of learning.
                Enterprise-grade institutional management.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <a
                  href="https://wa.me/919789471572"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Share"
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-[#8FA3BC] transition-colors hover:border-white/40 hover:text-white"
                >
                  <Share2 className="h-4 w-4" />
                </a>
                <a
                  href="/rss.xml"
                  aria-label="RSS feed"
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-[#8FA3BC] transition-colors hover:border-white/40 hover:text-white"
                >
                  <Rss className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">Product</h4>
              <ul className="mt-4 space-y-3">
                {[
                  { label: "Features", href: "/#features" },
                  { label: "For Universities", href: "#" },
                  { label: "For K-12 Schools", href: "#" },
                  { label: "Pricing", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">Company</h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <a href="/about" className="text-sm font-semibold text-white">
                    About Us
                  </a>
                </li>
                {["Newsroom", "Careers", "Partners"].map((label) => (
                  <li key={label}>
                    <a href="#" className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">Legal</h4>
              <ul className="mt-4 space-y-3">
                {[
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "#" },
                  { label: "Cookie Policy", href: "#" },
                  { label: "Support Center", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-[#8FA3BC]">
            <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
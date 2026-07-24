import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  LineChart,
  HeartHandshake,
  Check,
  BarChart3,
  FileInput,
  Shield,
  CloudCheck,
  PlaySquare,
  BookOpen,
  Headphones,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "How EduOS Works: From Student Data to Educational Intelligence",
  description:
    "See exactly how EduOS turns everyday school data into meaningful insight: five steps from data collection to better decisions, backed by expert-led onboarding and 24/7 support.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/how-it-works",
  },
};

const STEPS = [
  {
    step: "STEP 01",
    title: "Collect Student Data",
    description:
      "Attendance, academics, behaviour, extracurricular activities, and teacher observations are captured as they happen and become part of the student's evolving learning profile.",
    items: ["Daily attendance & academics", "Behaviour & teacher notes"],
    icon: Database,
    iconBg: "bg-[#073571]",
    accentText: "text-[#72A9E2]",
    accentBg: "bg-[#72A9E2]",
    hoverBorder: "hover:border-[#72A9E2]/30",
  },
  {
    step: "STEP 02",
    title: "Build Learning Profile",
    description:
      "EduOS organises every data point into one unified educational profile per student, replacing scattered spreadsheets and disconnected reports.",
    items: ["Unified student record", "Continuous, not one-off"],
    icon: Layers,
    iconBg: "bg-[#72A9E2]",
    accentText: "text-[#72A9E2]",
    accentBg: "bg-[#72A9E2]",
    hoverBorder: "hover:border-[#72A9E2]/30",
  },
  {
    step: "STEP 03",
    title: "AI Intelligence Engine",
    description:
      "Our intelligence layer is designed to identify learning patterns, subject-wise strengths, and areas that may need support, surfacing what matters, not just what was recorded.",
    items: ["Pattern & trend detection", "Responsible, privacy-first AI"],
    icon: Sparkles,
    iconBg: "bg-[#A87D2E]",
    accentText: "text-[#A87D2E]",
    accentBg: "bg-[#A87D2E]",
    hoverBorder: "hover:border-[#A87D2E]/30",
  },
  {
    step: "STEP 04",
    title: "Generate Quality Insights",
    description:
      "Instead of raw reports, schools receive meaningful, educator-ready recommendations: the kind of insight that supports a conversation, not just a number on a page.",
    items: ["Educator-ready summaries", "Early-signal, not just history"],
    icon: LineChart,
    iconBg: "bg-[#073571]",
    accentText: "text-[#72A9E2]",
    accentBg: "bg-[#72A9E2]",
    hoverBorder: "hover:border-[#72A9E2]/30",
  },
  {
    step: "STEP 05",
    title: "Support Better Decisions",
    description:
      "Teachers, counsellors, and parents work from the same understanding of each learner, helping every student grow, with technology that empowers educators rather than replacing them.",
    items: ["Shared educator + parent view", "Teachers stay at the centre"],
    icon: HeartHandshake,
    iconBg: "bg-[#72A9E2]",
    accentText: "text-[#72A9E2]",
    accentBg: "bg-[#72A9E2]",
    hoverBorder: "hover:border-[#72A9E2]/30",
  },
];

const TRAINING_ITEMS = [
  {
    title: "On-Site Workshops",
    description: "Hands-on sessions conducted at your campus by our implementation experts.",
    icon: PlaySquare,
  },
  {
    title: "Resource Library",
    description: "Access 24/7 to our comprehensive guide of video tutorials and documentation.",
    icon: BookOpen,
  },
  {
    title: "Priority Support",
    description: "A dedicated success manager assigned to your institution for life.",
    icon: Headphones,
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <Navbar active="How EduOS Works" />

      {/* ── HERO ── */}
      <section className="relative h-[calc(100vh-73px)] w-full overflow-hidden bg-[#052247]">
        <HeroFloat delay={100} className="absolute inset-0">
          <Image
            src="/sample.jpg"
            alt="EduOS dashboard preview showing key metrics, schedule, and campus overview"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Navy gradient overlay — left side, for text readability, blending into the image */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#052247] via-[#052247]/80 to-transparent sm:via-[#052247]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#052247]/50 via-transparent to-transparent" />
        </HeroFloat>

        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 animate-glow-pulse rounded-full bg-[#72A9E2]/10 blur-[110px]" />

        <div className="relative flex h-full items-center px-6 sm:px-10 md:px-14 lg:px-16 xl:px-20">
          <div className="max-w-xl">
            <HeroReveal delay={100}>
              <span className="inline-block rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#AFC6E8] backdrop-blur-sm md:text-xs">
                Data → Intelligence → Action
              </span>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
                From everyday school data to{" "}
                <span className="text-[#72A9E2]">educational intelligence.</span>
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 md:mt-6 md:text-lg">
                EduOS doesn&apos;t simply collect information, it turns scattered records
                into a living picture of every learner. Here&apos;s exactly how data becomes
                a decision, in five steps.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row md:mt-10">
                <a
                  href="#phases"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#72A9E2] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all duration-300 hover:scale-[1.03] hover:bg-[#4A82BE] active:scale-[0.97] sm:w-auto"
                >
                  See the 5 Steps <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/eduos-brochure.pdf"
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:scale-[1.03] hover:bg-white/15 active:scale-[0.97] sm:w-auto"
                >
                  View Documentation
                </a>
              </div>
            </HeroReveal>
          </div>
        </div>
      </section>

      {/* ── 5-STEP INTELLIGENCE JOURNEY ── */}
      <section id="phases" className="bg-[#EEF4FB] px-5 pb-20 pt-4 md:px-6 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              The 5-Step Intelligence Journey
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={120}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Every insight EduOS surfaces follows the same disciplined path, from a single
              attendance mark to a recommendation a teacher can act on.
            </p>
          </AnimateOnScroll>
        </div>

        <div className="relative mx-auto mt-16 max-w-4xl">
          {/* Connector line, running the full length of the journey */}
          <div className="pointer-events-none absolute bottom-4 left-7 top-4 w-px bg-slate-300 sm:left-9" />

          <div className="flex flex-col gap-8">
            {STEPS.map((phase, i) => {
              const Icon = phase.icon;
              return (
                <AnimateOnScroll key={phase.step} delay={i * 130}>
                  <div className="group relative flex gap-5 sm:gap-7">
                    <span
                      className={`relative z-10 grid h-14 w-14 flex-shrink-0 place-items-center rounded-full ${phase.iconBg} shadow-lg shadow-slate-300/30 ring-4 ring-[#EEF4FB] transition-transform duration-300 group-hover:scale-110 sm:h-[72px] sm:w-[72px]`}
                    >
                      <Icon className="h-6 w-6 text-white sm:h-7 sm:w-7" />
                    </span>

                    <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-slate-300/40 sm:p-7">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className={`text-xs font-bold uppercase tracking-widest ${phase.accentText}`}>
                          {phase.step}
                        </p>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <h3 className="text-xl font-bold text-[#073571] lg:text-2xl">{phase.title}</h3>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                        {phase.description}
                      </p>
                      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                        {phase.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-center gap-2 text-sm font-medium text-[#073571]"
                          >
                            <span
                              className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${phase.accentBg}`}
                            >
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>
      {/* ── POWERFUL INTEGRATION INFRASTRUCTURE ── */}
      <section className="bg-[#F6FAFD] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <AnimateOnScroll delay={0} className="max-w-xl">
              <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
                Powerful Integration Infrastructure
              </h2>
              <p className="mt-4 text-sm text-slate-600 md:text-base">
                EduOS isn&apos;t an island. It&apos;s a hub that connects all your essential
                academic and administrative tools into one ecosystem.
              </p>
            </AnimateOnScroll>
            <AnimateOnScroll delay={120}>
              <a
                href="/api-docs"
                className="inline-flex flex-shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-center text-sm font-bold text-[#073571] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
              >
                Explore API Specs
              </a>
            </AnimateOnScroll>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-6">
            {/* Unified Data Core */}
            <AnimateOnScroll delay={0} className="lg:col-span-7">
              <div className="group flex h-full flex-col justify-between rounded-2xl bg-[#073571] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-[#72A9E2]/20 sm:p-7">
                <div>
                  <h3 className="text-xl font-bold text-white lg:text-2xl">Unified Data Core</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-[#AFC6E8] lg:text-base">
                    Consolidate disparate data sources into a single, high-fidelity truth
                    source. Real-time sync ensures everyone from administrators to parents
                    sees current information.
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3.5">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#72A9E2] transition-transform duration-300 group-hover:scale-105">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
                        Sync Progress
                      </span>
                      <span className="text-[11px] font-semibold text-[#9CC1EA]">
                        88% Complete
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-[88%] rounded-full bg-[#72A9E2]" />
                    </div>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>

            {/* Right column: Legacy Support + Bank-Grade Security + 100% Cloud-Native */}
            <div className="flex flex-col gap-5 lg:col-span-5">
              <AnimateOnScroll delay={150}>
                <div className="group flex items-center justify-between gap-4 rounded-2xl bg-[#DCEAFB] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-[#073571] lg:text-xl">
                      Legacy Support
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      We support migration from over 50+ legacy SIS platforms with zero data
                      loss guaranteed.
                    </p>
                  </div>
                  <span className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-2xl bg-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                    <FileInput className="h-6 w-6 text-[#073571]" />
                  </span>
                </div>
              </AnimateOnScroll>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <AnimateOnScroll delay={250}>
                  <div className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#E8D6A8] p-6 text-center transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                    <Shield className="h-7 w-7 text-[#073571] transition-transform duration-300 group-hover:scale-110" />
                    <p className="text-base font-bold text-[#073571]">Bank-Grade Security</p>
                  </div>
                </AnimateOnScroll>
                <AnimateOnScroll delay={350}>
                  <div className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#AFD2F7] p-6 text-center transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                    <CloudCheck className="h-7 w-7 text-[#073571] transition-transform duration-300 group-hover:scale-110" />
                    <p className="text-base font-bold text-[#073571]">100% Cloud-Native</p>
                  </div>
                </AnimateOnScroll>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EXPERT-LED TRAINING & SUCCESS ── */}
      <section className="bg-white px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Image — first on tablet/desktop, last on mobile */}
          <AnimateOnScroll from="left" delay={0} className="order-2 md:order-1">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 shadow-xl shadow-slate-300/40">
              <Image
                src="/how-it-works.jpg"
                alt="EduOS implementation team leading an on-site training workshop"
                fill
                sizes="(min-width: 1024px) 50vw, (min-width: 640px) 85vw, 100vw"
                className="object-cover"
              />
            </div>
          </AnimateOnScroll>

          {/* Text — first on mobile, last on tablet/desktop */}
          <div className="order-1 md:order-2">
            <AnimateOnScroll from="right" delay={0}>
              <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
                Expert-Led Training &amp; Success
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
                We don&apos;t just hand you the keys. Our EduSuccess&trade; program provides
                comprehensive training modules for every user level, from system
                administrators to student teachers.
              </p>
            </AnimateOnScroll>

            <div className="mt-8 flex flex-col gap-6">
              {TRAINING_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <AnimateOnScroll key={item.title} delay={120 + i * 120}>
                    <div className="group flex items-start gap-4">
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#EEF4FB] transition-transform duration-300 group-hover:scale-105">
                        <Icon className="h-5 w-5 text-[#073571]" />
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-[#073571]">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </AnimateOnScroll>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="cta" className="bg-[#073571] px-5 py-16 md:px-6 md:py-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to see your students&apos; stories come to life?
          </h2>
          <p className="mt-4 text-sm text-[#AFC6E8] md:text-lg">
            Book a personalised demo to see how EduOS turns your school&apos;s everyday
            data into insight that helps every learner grow.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="mailto:admin@wnradvisory.com?subject=Book%20a%20Demo"
              className="w-full rounded-full bg-[#72A9E2] px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-[#2E5C96] active:scale-[0.97] sm:w-auto"
            >
              Book a Demo
            </a>
           <a 
              href="mailto:admin@wnradvisory.com?subject=Request%20a%20Proposal"
              className="w-full rounded-full border border-white/30 bg-transparent px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-white/10 active:scale-[0.97] sm:w-auto"
            >
              Request a Proposal
            </a>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <Footer variant="how-it-works" />
    </div>
  );
}
import type { Metadata } from "next";
import {
  Sparkles,
  Layers,
  UserCircle,
  BrainCircuit,
  Lightbulb,
  HeartHandshake,
  Infinity as InfinityIcon,
  ShieldCheck,
  Lock,
  Eye,
  Ban,
  ArrowRight,
  TrendingUp,
  Target,
  LineChart,
  Compass,
} from "lucide-react";
import { AnimateOnScroll, StaggerChildren } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { NetworkBackground } from "@/components/network-background";

export const metadata: Metadata = {
  title: "AI Intelligence: The EduOS Intelligence Framework",
  description:
    "Turning student data into meaningful educational insight. See how EduOS builds a unified learning profile for every student and applies responsible AI to help educators act on it.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/ai-intelligence",
  },
};

const ENGINE_SIGNALS = [
  {
    icon: TrendingUp,
    title: "Learning Consistency",
    detail: "Spots steady effort versus one-off spikes across terms.",
  },
  {
    icon: Target,
    title: "Subject-Wise Strengths",
    detail: "Surfaces where a student is quietly excelling.",
  },
  {
    icon: HeartHandshake,
    title: "Areas Requiring Support",
    detail: "Flags gaps early enough for a teacher to step in.",
  },
  {
    icon: LineChart,
    title: "Attendance-Performance Link",
    detail: "Connects presence in class to outcomes over time.",
  },
  {
    icon: Sparkles,
    title: "Emerging Talents",
    detail: "Notices interests and skills outside the mark sheet.",
  },
  {
    icon: Compass,
    title: "Overall Learning Growth",
    detail: "Rolls every signal into one picture of progress.",
  },
];

const RESPONSIBLE_AI = [
  { icon: Ban, text: "Educational purpose only: never used to rank, punish, or label a child" },
  { icon: Lock, text: "No sale of student data, ever" },
  { icon: Eye, text: "Full transparency into what data feeds every insight" },
  { icon: ShieldCheck, text: "Human educators always make the final call" },
];

export default function AiIntelligencePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <Navbar active="Intelligence Framework" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#72A9E2]/10 blur-[120px]" />
        <div className="pointer-events-none absolute -right-16 top-24 h-52 w-52 animate-drift rounded-full bg-[#C3983C]/10 blur-3xl" />
        <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full text-[#72A9E2]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <HeroReveal delay={100}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C3983C]/30 bg-[#C3983C]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#A87D2E] md:text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              EduOS Intelligence Framework
            </span>
          </HeroReveal>
          <HeroReveal delay={200}>
            <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-extrabold leading-[1.15] tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
              Turning Student Data into{" "}
              <span className="text-[#72A9E2]">Meaningful Educational Insights</span>
            </h1>
          </HeroReveal>
          <HeroReveal delay={350}>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
              Most School ERPs stop at recording what happened. EduOS goes further, organising
              every signal into one learning profile per student, and applying responsible AI to
              surface what a teacher should know, while keeping teachers firmly at the centre of
              every decision.
            </p>
          </HeroReveal>
          <HeroReveal delay={500}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/contact"
                className="flex items-center justify-center gap-2 rounded-full bg-[#073571] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all duration-300 hover:scale-[1.03] hover:bg-[#052247] active:scale-[0.97]"
              >
                Book a Demo <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/features"
                className="flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#073571] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
              >
                Explore All Features
              </a>
            </div>
          </HeroReveal>
        </div>

        <HeroFloat delay={450} className="relative mx-auto mt-14 max-w-4xl">
          <div className="animate-float rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/40 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Layers, label: "Data In", detail: "12 evolving sources" },
                { icon: BrainCircuit, label: "Intelligence Engine", detail: "Pattern recognition" },
                { icon: Lightbulb, label: "Insight Out", detail: "Educator-ready" },
              ].map((step, i) => (
                <div
                  key={step.label}
                  className={`flex items-center gap-3 rounded-xl bg-[#F6FAFD] p-4 ${
                    i === 1 ? "sm:scale-105 sm:bg-[#073571]" : ""
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg ${
                      i === 1 ? "bg-white/10" : "bg-[#72A9E2]/10"
                    }`}
                  >
                    <step.icon className={`h-5 w-5 ${i === 1 ? "text-white" : "text-[#72A9E2]"}`} />
                  </span>
                  <div>
                    <p className={`text-sm font-bold ${i === 1 ? "text-white" : "text-[#073571]"}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs ${i === 1 ? "text-[#AFC6E8]" : "text-slate-500"}`}>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </HeroFloat>
      </section>

      {/* ── STUDENT LEARNING PROFILE + UNIFIED RECORDS ── */}
      <section className="bg-white px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <AnimateOnScroll from="left" delay={0}>
            <span className="inline-block rounded-full bg-[#72A9E2]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#72A9E2] md:text-xs">
              The Foundation
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Student Learning Profile
            </h2>
            <p className="mt-4 text-justify text-sm leading-relaxed text-slate-600 md:text-base">
              Every interaction becomes part of a student&apos;s lifelong learning journey.
              EduOS continuously builds an evolving profile from academic performance,
              attendance, assignments, behaviour, sports, competitions, teacher feedback, and
              more, so instead of isolated reports, schools get one unified understanding of every
              learner.
            </p>
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6">
              <h3 className="text-lg font-bold text-[#073571]">Unified Educational Records</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                No more switching between spreadsheets and disconnected systems. Academics,
                attendance, and fees already live in one record today, and the intelligence layer
                extends that same unification to behaviour, participation, and achievement.
              </p>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll from="right" delay={150}>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 -z-10 animate-glow-pulse rounded-[2rem] bg-[#72A9E2]/10 blur-2xl" />
              <div className="group rounded-2xl border border-slate-200 bg-[#EEF4FB] p-6 shadow-xl shadow-slate-300/30 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-slate-300/40 sm:p-8">
                {/* Animated data-flow line — signals streaming in */}
                <div className="relative mb-6 h-px w-full overflow-hidden rounded-full bg-[#72A9E2]/15">
                  <span className="absolute inset-y-0 left-0 w-12 animate-pulse rounded-full bg-gradient-to-r from-transparent via-[#72A9E2] to-transparent" />
                </div>

                <StaggerChildren staggerMs={40} baseDelay={0} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    "Academics",
                    "Attendance",
                    "Assignments",
                    "Behaviour",
                    "Sports",
                    "Competitions",
                    "Teacher Feedback",
                    "Leadership",
                    "Skills",
                    "Parent Interactions",
                    "Projects",
                    "Co-curricular",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="block rounded-xl border border-[#72A9E2]/20 bg-white px-3 py-3 text-center text-xs font-semibold text-[#073571] shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md"
                    >
                      {tag}
                    </span>
                  ))}
                </StaggerChildren>

                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#073571] py-3 text-center">
                  <UserCircle className="h-4 w-4 animate-icon-pulse text-[#72A9E2]" />
                  <span className="text-sm font-bold text-white">One Learning Profile</span>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── AI PATTERN RECOGNITION + EDUCATIONAL INTELLIGENCE ── */}
      <section className="relative overflow-hidden bg-[#073571] px-5 py-20 md:px-6 md:py-28">
        <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#72A9E2]/10 blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[#C3983C]/10 blur-[110px]" />
        {/* Fine isometric grid for premium depth, consistent with the Mission 2030 treatment on Home */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#72A9E2 1px, transparent 1px), linear-gradient(90deg, #72A9E2 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <span className="inline-block rounded-full bg-[#C3983C]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#C3983C] md:text-xs">
              The Engine
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              AI Pattern Recognition &amp; Educational Intelligence
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#AFC6E8] md:text-base">
              EduOS doesn&apos;t simply collect information, it&apos;s designed to analyse
              educational data and surface patterns that would otherwise take weeks to notice
              manually, early enough for a teacher to act on them.
            </p>
          </AnimateOnScroll>
        </div>

        {/* Engine core visual, feeding the six signal cards below */}
        <AnimateOnScroll delay={120} className="relative mx-auto mt-14 flex flex-col items-center">
          <div className="relative flex h-32 w-32 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-[#72A9E2]/25 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
            <span className="absolute inset-4 rounded-full border border-[#72A9E2]/25 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:1s]" />
            <span className="absolute inset-0 animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-xl" />
            <span className="relative grid h-20 w-20 animate-icon-pulse place-items-center rounded-full bg-white/10">
              <BrainCircuit className="h-9 w-9 text-[#72A9E2]" />
            </span>
          </div>
          <div className="pointer-events-none -mt-4 h-10 w-px bg-gradient-to-b from-[#72A9E2]/50 to-transparent" />
        </AnimateOnScroll>

        {/* Six signals the engine surfaces, as a proper card grid */}
        <div className="relative mx-auto mt-2 max-w-5xl">
          <StaggerChildren
            staggerMs={70}
            baseDelay={0}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {ENGINE_SIGNALS.map((signal) => (
              <div
                key={signal.title}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#72A9E2]/40 hover:bg-white/10 hover:shadow-xl hover:shadow-black/20"
              >
                {/* Soft glow that blooms on hover */}
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#72A9E2]/0 blur-2xl transition-all duration-500 group-hover:bg-[#72A9E2]/20" />
                <span className="relative grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/15 transition-transform duration-300 group-hover:scale-110">
                  <signal.icon className="h-5 w-5 text-[#72A9E2]" />
                </span>
                <p className="relative mt-4 text-sm font-bold text-white">{signal.title}</p>
                <p className="relative mt-1.5 text-xs leading-relaxed text-[#AFC6E8]">
                  {signal.detail}
                </p>
                <span className="pointer-events-none absolute bottom-0 left-5 right-5 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#72A9E2]/60 to-transparent transition-transform duration-500 group-hover:scale-x-100" />
              </div>
            ))}
          </StaggerChildren>
        </div>

        <AnimateOnScroll delay={200} className="relative mx-auto mt-10 max-w-2xl text-center">
          <p className="text-sm leading-relaxed text-[#AFC6E8] md:text-base">
            Every insight is built to support educators in making better decisions, not to
            replace their judgement. The intelligence engine is a planned, actively developed
            layer of the EduOS platform, built on the same unified data foundation already
            powering attendance, academics, and fees today.
          </p>
        </AnimateOnScroll>
      </section>

      {/* ── HUMAN-CENTRED RECOMMENDATIONS + CONTINUOUS JOURNEY ── */}
      <section className="bg-white px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Insight That Empowers Educators, Not Replaces Them
            </h2>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Technology should empower teachers, not replace them. Every part of the
              intelligence framework is built around that principle.
            </p>
          </AnimateOnScroll>

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2">
            <AnimateOnScroll
              delay={0}
              className="group rounded-2xl border border-slate-200 bg-[#EEF4FB] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-lg hover:shadow-slate-300/30 sm:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/15 transition-transform duration-300 group-hover:scale-105">
                <HeartHandshake className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#073571]">Human-Centred Recommendations</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Insights are written for a teacher or counsellor to act on in a real conversation
                with a student, a parent, or a colleague, not buried in a spreadsheet.
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll
              delay={150}
              className="group rounded-2xl border border-slate-200 bg-[#EEF4FB] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-lg hover:shadow-slate-300/30 sm:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/15 transition-transform duration-300 group-hover:scale-105">
                <InfinityIcon className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#073571]">Continuous Student Journey</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                A learning profile doesn&apos;t reset every term. EduOS is designed to follow each
                student year over year, so growth, not just a single exam score, is what gets
                remembered.
              </p>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── RESPONSIBLE AI ── */}
      <section className="bg-[#073571] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll delay={0} className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9CC1EA] md:text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Responsible AI
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Built on Trust, By Design
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#AFC6E8] md:text-base">
              Student information deserves the highest level of trust. Every part of the
              intelligence framework is built around privacy-first, educational-purpose-only
              principles, and schools always remain owners of their data.
            </p>
          </AnimateOnScroll>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {RESPONSIBLE_AI.map((item, i) => (
              <AnimateOnScroll key={item.text} delay={i * 100}>
                <div className="group flex items-center gap-4 rounded-2xl bg-white/5 p-5 transition-all duration-300 hover:bg-white/10">
                  <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:scale-105">
                    <item.icon className="h-5 w-5 text-[#72A9E2]" />
                  </span>
                  <p className="text-sm font-medium text-white">{item.text}</p>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-5 py-16 md:px-6 md:py-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#EEF4FB] px-6 py-14 text-center md:px-12 md:py-20">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px] animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
                See the Intelligence Layer in Action
              </h2>
              <p className="mt-4 text-sm text-slate-600 md:text-lg">
                Book a walkthrough and see exactly how EduOS turns your school&apos;s everyday
                data into insight that helps every learner grow.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <a
                  href="mailto:admin@wnradvisory.com?subject=Book%20a%20Demo%20-%20AI%20Intelligence"
                  className="rounded-full bg-[#073571] px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all duration-300 hover:scale-[1.03] hover:bg-[#052247] active:scale-[0.97]"
                >
                  Book a Demo
                </a>
                <a
                  href="mailto:admin@wnradvisory.com?subject=Request%20a%20Proposal"
                  className="rounded-full border border-slate-300 bg-white px-8 py-3 text-sm font-semibold text-[#073571] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
                >
                  Request a Proposal
                </a>
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </section>

      <Footer variant="home" />
    </div>
  );
}
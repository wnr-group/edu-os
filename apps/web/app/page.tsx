import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  BrainCircuit,
  Lightbulb,
  Users,
  ShieldCheck,
  Lock,
  Eye,
  Ban,
  Building2,
  GraduationCap,
  Wallet,
  MessagesSquare,
  LineChart,
  Database,
  ChevronDown,
  HeartHandshake,
  Compass,
  Target,
} from "lucide-react";
import { AnimateOnScroll, StaggerChildren } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SectionNav } from "@/components/section-nav";
import { AnimatedCounter } from "@/components/animated-counter";
import { AnimatedBar } from "@/components/animated-bar";

export const metadata: Metadata = {
  title: "EduOS: Building Every Student's Success Story",
  description:
    "EduOS is an AI-powered Student Intelligence Platform that helps schools move beyond administration to truly understand every learner, combining academics, attendance, behaviour, and more into one evolving profile.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "EduOS",
      url: "https://eduos.com",
      // NOTE: placeholder — point at the real EduOS logo file once available.
      logo: "https://eduos.com/logo-mark.png",
      contactPoint: {
        "@type": "ContactPoint",
        email: "admin@wnradvisory.com",
        contactType: "sales",
        availableLanguage: ["English", "Tamil"],
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "EduOS",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web, Android, iOS",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        description: "Personalised demo available",
      },
      description:
        "AI-powered Student Intelligence Platform combining school administration with a unified, evolving learning profile for every student.",
    },
  ],
};

const SECTION_NAV_ITEMS = [
  { id: "mission", label: "Mission 2030" },
  { id: "why-eduos", label: "Why EduOS" },
  { id: "intelligence-platform", label: "Intelligence Framework" },
  { id: "school-management", label: "Modules" },
  { id: "philosophy", label: "Philosophy" },
  { id: "how-it-works", label: "How It Works" },
  { id: "why-choose", label: "Why EduOS" },
  { id: "privacy", label: "Privacy" },
  
];

const LEARNING_PROFILE_INPUTS = [
  "Academic Performance",
  "Attendance",
  "Assignments",
  "Projects",
  "Behaviour",
  "Sports",
  "Competitions",
  "Teacher Feedback",
  "Leadership Activities",
  "Skills",
  "Parent Interactions",
  "Co-curricular Activities",
];

const AI_INSIGHTS = [
  "Learning consistency",
  "Subject-wise strengths",
  "Areas requiring support",
  "Attendance–performance relationships",
  "Student engagement",
  "Skill progression",
  "Behavioural patterns",
  "Emerging talents",
  "Overall learning growth",
];

const MODULE_CATEGORIES = [
  {
    icon: Building2,
    title: "Administration",
    items: ["Admissions", "Student Management", "Employee Management", "Timetable"],
  },
  {
    icon: GraduationCap,
    title: "Academics",
    items: ["Attendance", "Examinations", "Assignments", "Report Cards"],
  },
  {
    icon: Wallet,
    title: "Finance",
    items: ["Fee Collection", "Online Payments", "Accounting", "Financial Reports"],
  },
  {
    icon: MessagesSquare,
    title: "Communication",
    items: ["Parent App", "Teacher App", "Notifications", "WhatsApp Integration"],
  },
  {
    icon: LineChart,
    title: "Analytics",
    items: ["Student Intelligence Dashboard", "School Performance", "Teacher Analytics"],
  },
];

const PHILOSOPHY = [
  "Every student is intelligent.",
  "Every student learns differently.",
  "Success is more than examination scores.",
  "Technology should empower teachers, not replace them.",
];

const HOW_IT_WORKS_STEPS = [
  { step: "01", title: "Collect Student Data", icon: Database },
  { step: "02", title: "Build Learning Profile", icon: Layers },
  { step: "03", title: "AI Intelligence Engine", icon: BrainCircuit },
  { step: "04", title: "Generate Quality Insights", icon: Lightbulb },
  { step: "05", title: "Support Better Decisions", icon: HeartHandshake },
];

const WHY_CHOOSE = [
  "AI Powered Student Intelligence",
  "Complete School ERP",
  "Parent Engagement",
  "Teacher Productivity",
  "Real-time Dashboards",
  "Secure Cloud Platform",
  "Role-based Access",
  "Student Lifecycle Tracking",
  "Longitudinal Learning Profiles",
  "Responsible AI",
];

const PRIVACY_COMMITMENTS = [
  { icon: Compass, text: "Educational purpose only" },
  { icon: Ban, text: "No sale of student data" },
  { icon: ShieldCheck, text: "School ownership of information" },
  { icon: Lock, text: "Secure cloud infrastructure" },
  { icon: Users, text: "Role-based access control" },
  { icon: Sparkles, text: "Ethical AI" },
  { icon: Eye, text: "Privacy-first architecture" },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── NAVBAR ── */}
      <Navbar active="Home" />
      <SectionNav items={SECTION_NAV_ITEMS} />

      {/* ── HERO (video, full-height, stacked) ── */}
      <section id="hero" className="relative h-[calc(100vh-73px)] w-full overflow-hidden bg-[#052247]">
        <HeroFloat delay={100} className="absolute inset-0">
          {/*
            TODO(video): replace with the official EduOS hero video.
            Using a public placeholder video + poster frame until the real asset is supplied.
          */}
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1600&auto=format&fit=crop"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source
              src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
              type="video/mp4"
            />
          </video>
          <div className="absolute inset-0 bg-gradient-to-b from-[#052247]/25 via-transparent to-[#052247]" />
        </HeroFloat>

        <div className="absolute inset-x-0 bottom-8 flex justify-center">
          <a
            href="#hero-statement"
            className="flex animate-float flex-col items-center gap-2 text-white/70 transition-colors duration-300 hover:text-white"
          >
            <span className="text-[11px] font-semibold uppercase tracking-widest">Scroll</span>
            <ChevronDown className="h-5 w-5" />
          </a>
        </div>
      </section>

      {/* ── HERO STATEMENT (headline, revealed as you scroll past the video) ── */}
      <section
        id="hero-statement"
        className="relative flex min-h-[calc(100vh-73px)] items-center justify-center overflow-hidden bg-[#052247] px-6 py-20 text-center text-white sm:px-10"
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 animate-glow-pulse rounded-full bg-[#72A9E2]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-2xl">
          <HeroReveal delay={100}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#AFC6E8] backdrop-blur-sm md:text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Student Intelligence Platform
            </span>
          </HeroReveal>
          <HeroReveal delay={200}>
            <h1 className="mx-auto mt-6 max-w-xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Building Every Student&apos;s Success Story
            </h1>
          </HeroReveal>
          <HeroReveal delay={300}>
            <p className="mt-5 text-base font-medium text-[#AFC6E8] md:text-lg">
              Every Student Has Potential. Every Journey Deserves to Be Understood.
            </p>
          </HeroReveal>
          <HeroReveal delay={400}>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/75 md:text-base">
              EduOS combines academics, attendance, behaviour, participation, achievements,
              teacher observations, and extracurricular activities into one comprehensive
              student profile, helping educators make informed, compassionate, and
              personalised decisions.
            </p>
          </HeroReveal>
          <HeroReveal delay={550}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/contact"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#72A9E2] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all duration-300 hover:scale-[1.03] hover:bg-[#4A82BE] active:scale-[0.97] sm:w-auto"
              >
                Book Demo <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/contact"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:scale-[1.03] hover:bg-white/15 active:scale-[0.97] sm:w-auto"
              >
                Request Proposal
              </a>
            </div>
          </HeroReveal>
        </div>
      </section>

      {/* ── MISSION 2030 ── */}
      <section id="mission" className="relative overflow-hidden bg-[#073571] px-5 py-20 md:px-6 md:py-28">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 animate-drift rounded-full bg-[#72A9E2]/10 blur-3xl" />
        <div
          className="pointer-events-none absolute -right-16 bottom-0 h-56 w-56 animate-drift rounded-full bg-[#C3983C]/10 blur-3xl"
          style={{ animationDelay: "3s" }}
        />
        {/* Faint isometric grid backdrop for premium depth */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#72A9E2 1px, transparent 1px), linear-gradient(90deg, #72A9E2 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative mx-auto max-w-6xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9CC1EA] md:text-xs">
              <Target className="h-3.5 w-3.5" />
              Mission 2030
            </span>
            <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Every Learner Deserves a Path to Their Potential
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-[#AFC6E8] md:text-base">
              By helping every learner discover their strengths and unlock their true
              potential, one school, one student, one story at a time.
            </p>
          </AnimateOnScroll>

          {/* Layered composition: giant "2030" watermark behind a floating counter card */}
          <AnimateOnScroll delay={150} className="relative mt-14 flex items-center justify-center">
            {/* Oversized 2030 as the primary visual anchor */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute select-none text-[7rem] font-black leading-none tracking-tighter text-white/[0.06] sm:text-[10rem] lg:text-[13rem]"
            >
              2030
            </span>

            <div className="relative flex flex-col items-center gap-6 lg:flex-row lg:gap-10">
              {/* Small floating accent card, offset behind the main card for depth */}
              <div
                className="absolute -left-6 -top-6 hidden h-24 w-24 animate-float rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:-left-10 lg:block"
                style={{ animationDelay: "1.2s" }}
              >
                <div className="grid h-full place-items-center">
                  <GraduationCap className="h-8 w-8 text-[#72A9E2]/70" />
                </div>
              </div>

              {/* Primary counter card */}
              <div className="relative flex animate-float flex-col items-center rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/10 to-white/[0.03] px-10 py-12 text-center shadow-2xl shadow-black/30 backdrop-blur-md sm:px-16 sm:py-14">
                <div className="pointer-events-none absolute inset-0 -z-10 animate-glow-pulse rounded-[2rem] bg-[#72A9E2]/15 blur-2xl" />
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <span className="relative grid h-14 w-14 place-items-center rounded-full bg-[#72A9E2]/15 ring-1 ring-[#72A9E2]/30">
                  <span className="absolute inset-0 animate-icon-pulse rounded-full bg-[#72A9E2]/20 blur-md" />
                  <Target className="relative h-6 w-6 text-[#72A9E2]" />
                </span>
                <p className="relative mt-6 text-4xl font-extrabold text-white sm:text-5xl">
                  <AnimatedCounter value={1000000} suffix="+" />
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-widest text-[#9CC1EA]">
                  Students Empowered by 2030
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[#C3983C]/15 px-3.5 py-1 text-[11px] font-bold text-[#E8CE97]">
                  <Sparkles className="h-3 w-3" />
                  The Road to 2030
                </span>
              </div>

              {/* Secondary floating accent card, front-offset for layered depth */}
              <div
                className="absolute -bottom-6 -right-4 hidden h-20 w-20 animate-float rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm lg:-right-8 lg:block"
                style={{ animationDelay: "2.4s" }}
              >
                <div className="grid h-full place-items-center">
                  <HeartHandshake className="h-7 w-7 text-[#C3983C]/70" />
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── WHY EDUOS? ── */}
      <section id="why-eduos" className="relative scroll-mt-32 overflow-hidden bg-white px-5 py-20 md:px-6 md:py-28">
        <div className="pointer-events-none absolute -right-32 top-0 h-96 w-96 rounded-full bg-[#72A9E2]/5 blur-[110px]" />
        <div className="relative mx-auto max-w-6xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full bg-[#72A9E2]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#72A9E2] md:text-xs">
              The EduOS Difference
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Why EduOS?
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
              Behind every attendance record, examination, assignment, competition, and
              achievement lies a story. EduOS transforms scattered school data into meaningful
              educational intelligence that enables schools to identify strengths, recognise
              challenges early, and guide every student towards success.
            </p>
          </AnimateOnScroll>

          {/* Transformation diagram: scattered data → EduOS core → real understanding */}
          <AnimateOnScroll delay={150} className="mt-16">
            <div className="rounded-[2rem] border border-slate-200 bg-[#F6FAFD] px-6 py-10 sm:px-10 sm:py-12">
              <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between lg:gap-4">
                {/* Data in */}
                <div className="flex flex-col items-center gap-4 lg:items-start">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Scattered Data
                  </p>
                  <div className="flex gap-3">
                    {[
                      { icon: GraduationCap, label: "Academics" },
                      { icon: Users, label: "Behaviour" },
                      { icon: Wallet, label: "Fees" },
                      { icon: MessagesSquare, label: "Comms" },
                    ].map((node) => (
                      <div
                        key={node.label}
                        className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#72A9E2]/40 hover:shadow-lg"
                      >
                        <node.icon className="h-5 w-5 text-slate-400 transition-colors duration-300 group-hover:text-[#72A9E2]" />
                        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#073571] px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:opacity-100">
                          {node.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="max-w-[11rem] text-center text-xs leading-relaxed text-slate-500 lg:text-left">
                    Most School ERPs stop here: records stored, not understood.
                  </p>
                </div>

                {/* Connector 1 */}
                <div className="relative hidden h-px flex-1 overflow-hidden bg-slate-200 lg:block">
                  <span className="absolute inset-y-0 left-0 w-8 animate-pulse bg-gradient-to-r from-transparent via-[#72A9E2] to-transparent" />
                </div>
                <ArrowRight className="h-4 w-4 rotate-90 text-slate-300 lg:hidden" />

                {/* EduOS core */}
                <div className="relative flex flex-shrink-0 flex-col items-center gap-3">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <span className="absolute inset-0 animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-xl" />
                    <span className="relative grid h-16 w-16 place-items-center rounded-full bg-[#073571] shadow-xl shadow-[#073571]/20">
                      <BrainCircuit className="h-7 w-7 text-[#72A9E2]" />
                    </span>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#073571]">EduOS</p>
                </div>

                {/* Connector 2 */}
                <div className="relative hidden h-px flex-1 overflow-hidden bg-slate-200 lg:block">
                  <span
                    className="absolute inset-y-0 left-0 w-8 animate-pulse bg-gradient-to-r from-transparent via-[#C3983C] to-transparent"
                    style={{ animationDelay: "0.6s" }}
                  />
                </div>
                <ArrowRight className="h-4 w-4 rotate-90 text-slate-300 lg:hidden" />

                {/* Understanding out */}
                <div className="flex flex-col items-center gap-4 lg:items-end">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#72A9E2]">
                    Real Understanding
                  </p>
                  <div className="flex gap-3">
                    {[
                      { icon: Lightbulb, label: "Insight" },
                      { icon: HeartHandshake, label: "Support" },
                      { icon: CheckCircle2, label: "Success" },
                    ].map((node) => (
                      <div
                        key={node.label}
                        className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-[#72A9E2]/30 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                      >
                        <node.icon className="h-5 w-5 text-[#72A9E2] transition-transform duration-300 group-hover:scale-110" />
                        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#073571] px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:opacity-100">
                          {node.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="max-w-[11rem] text-center text-xs leading-relaxed text-slate-500 lg:text-right">
                    EduOS turns that same data into understanding schools can act on.
                  </p>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── AI POWERED INSIGHTS ── */}
      <section id="intelligence-platform" className="scroll-mt-32 bg-[#073571] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Left — copy + connected vertical stepper */}
            <AnimateOnScroll from="left" delay={0}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9CC1EA] md:text-xs">
                <BrainCircuit className="h-3.5 w-3.5" />
                AI Powered Insights
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Data <span className="text-[#72A9E2]">→</span> Intelligence{" "}
                <span className="text-[#72A9E2]">→</span> Action
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#AFC6E8] md:text-base">
                EduOS doesn&apos;t simply collect information. It&apos;s designed to analyse
                educational data and surface what matters most, so every insight supports
                educators in making better decisions while keeping teachers at the centre of
                education.
              </p>

              <div className="relative mt-9 flex flex-col gap-7">
                <div className="pointer-events-none absolute bottom-2 left-[19px] top-2 w-px bg-white/15" />
                {[
                  { label: "Data", icon: Database, desc: "Every signal, captured continuously" },
                  { label: "Intelligence", icon: BrainCircuit, desc: "Patterns identified, responsibly" },
                  { label: "Action", icon: Lightbulb, desc: "Insight an educator can use" },
                ].map((stage) => (
                  <div key={stage.label} className="relative flex items-start gap-4">
                    <span className="relative z-10 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#72A9E2]/15 ring-4 ring-[#073571]">
                      <stage.icon className="h-4 w-4 text-[#72A9E2]" />
                    </span>
                    <div className="pt-1.5">
                      <p className="text-base font-bold text-white">{stage.label}</p>
                      <p className="mt-0.5 text-xs text-[#AFC6E8]">{stage.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimateOnScroll>

            {/* Right — animated dashboard mockup */}
            <AnimateOnScroll from="right" delay={150}>
              <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-7">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#9CC1EA]">
                    Learning Signals
                  </p>
                  <span className="flex items-center gap-1.5 rounded-full bg-[#72A9E2]/15 px-2.5 py-1 text-[10px] font-bold text-[#72A9E2]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#72A9E2]" />
                    Live
                  </span>
                </div>

                <div className="mt-5 flex h-28 items-end gap-2.5">
                  {[35, 62, 48, 80, 55, 70, 42].map((h, i) => (
                    <AnimatedBar
                      key={i}
                      orientation="vertical"
                      targetPercent={h}
                      delay={i * 80}
                      duration={800}
                      className="flex-1 rounded-t-md bg-gradient-to-t from-[#72A9E2]/40 to-[#72A9E2]"
                    />
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {AI_INSIGHTS.map((insight) => (
                    <span
                      key={insight}
                      className="rounded-lg bg-white/5 px-2 py-2 text-center text-[10px] font-medium leading-snug text-[#AFC6E8]"
                    >
                      {insight}
                    </span>
                  ))}
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── COMPLETE SCHOOL MANAGEMENT ── */}
      <section
        id="school-management"
        className="scroll-mt-32 bg-white px-5 py-16 md:px-6 md:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Complete School Management
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
              EduOS combines intelligent student analytics with a modern School ERP: five
              connected categories, one unified platform.
            </p>
          </AnimateOnScroll>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {MODULE_CATEGORIES.map((cat, i) => (
              <AnimateOnScroll
                key={cat.title}
                delay={i * 100}
                className="group rounded-2xl border border-slate-200 bg-[#F6FAFD] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-[#72A9E2]/30 hover:shadow-lg hover:shadow-slate-300/30"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#073571] transition-transform duration-300 group-hover:scale-105">
                  <cat.icon className="h-5 w-5 text-white" />
                </span>
                <h3 className="mt-4 text-base font-bold text-[#073571]">{cat.title}</h3>
                <ul className="mt-3 space-y-1.5">
                  {cat.items.map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-slate-600">
                      {item}
                    </li>
                  ))}
                </ul>
              </AnimateOnScroll>
            ))}
          </div>

          <AnimateOnScroll delay={200} className="mt-10 text-center">
            <a
              href="/features"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#073571] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
            >
              View All Features <ArrowRight className="h-4 w-4" />
            </a>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── OUR PHILOSOPHY ── */}
      <section id="philosophy" className="scroll-mt-32 bg-[#EEF4FB] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Our Philosophy
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={100}>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              Education should help students discover who they are, not simply evaluate what
              they know. EduOS is built around these principles.
            </p>
          </AnimateOnScroll>

          <StaggerChildren
            staggerMs={100}
            baseDelay={200}
            className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:auto-rows-fr"
          >
            {PHILOSOPHY.map((line) => (
              <div
                key={line}
                className="flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#72A9E2]" />
                <p className="text-sm font-semibold leading-relaxed text-[#073571]">{line}</p>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ── HOW EDUOS WORKS ── */}
      <section id="how-it-works" className="scroll-mt-32 bg-white px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-6xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              How EduOS Works
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
              From a single attendance mark to a recommendation a teacher can act on: five
              steps, every time.
            </p>
          </AnimateOnScroll>

          <div className="relative mx-auto mt-14 max-w-6xl">
            <div className="pointer-events-none absolute left-0 right-0 top-[36px] hidden lg:block">
              <div className="border-t-2 border-dashed border-slate-300" />
              <AnimatedBar
                orientation="horizontal"
                targetPercent={100}
                duration={1400}
                className="absolute inset-y-0 left-0 top-[-1px] h-[2px] rounded-full bg-[#72A9E2]"
              />
            </div>
            <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <AnimateOnScroll key={step.step} delay={i * 100} className="text-center">
                  <span className="mx-auto grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white bg-[#073571] shadow-lg shadow-slate-300/40 transition-transform duration-300 hover:scale-105">
                    <step.icon className="h-6 w-6 text-[#72A9E2]" />
                  </span>
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-[#72A9E2]">
                    Step {step.step}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#073571]">{step.title}</p>
                </AnimateOnScroll>
              ))}
            </div>
          </div>

          <AnimateOnScroll delay={200} className="mt-12 text-center">
            <a
              href="/how-it-works"
              className="inline-flex items-center gap-2 rounded-full bg-[#073571] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all duration-300 hover:scale-[1.03] hover:bg-[#052247] active:scale-[0.97]"
            >
              See the Full Journey <ArrowRight className="h-4 w-4" />
            </a>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── WHY SCHOOLS CHOOSE EDUOS ── */}
      <section id="why-choose" className="scroll-mt-32 bg-[#F6FAFD] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-5xl">
          <AnimateOnScroll delay={0} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
              Why Schools Choose EduOS
            </h2>
          </AnimateOnScroll>

          <StaggerChildren
            staggerMs={60}
            baseDelay={150}
            className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {WHY_CHOOSE.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#72A9E2]/30 hover:shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#72A9E2]" />
                <span className="text-sm font-semibold text-[#073571]">{item}</span>
              </div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ── PRIVACY & SECURITY ── */}
      <section id="privacy" className="relative scroll-mt-32 overflow-hidden bg-[#073571] px-5 py-16 md:px-6 md:py-24">
        <div className="pointer-events-none absolute -left-24 top-1/2 h-80 w-80 -translate-y-1/2 animate-glow-pulse rounded-full bg-[#72A9E2]/10 blur-[100px]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Left — animated trust seal + copy */}
            <AnimateOnScroll
              from="left"
              delay={0}
              className="flex flex-col items-center text-center lg:items-start lg:text-left"
            >
              <div className="relative flex h-40 w-40 items-center justify-center">
                {/* Soft ambient glow breathing behind the seal */}
                <span className="absolute inset-2 animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-xl" />
                {/* Expanding ripple rings */}
                <span className="absolute inset-0 rounded-full border border-[#72A9E2]/30 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                <span className="absolute inset-3 rounded-full border border-[#72A9E2]/30 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:1s]" />
                <span className="absolute inset-6 rounded-full border border-[#72A9E2]/30 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:2s]" />
                {/* Static outer ring for a defined, trustworthy edge */}
                <span className="absolute inset-9 rounded-full border border-[#72A9E2]/40" />
                <span className="relative grid h-20 w-20 animate-icon-pulse place-items-center rounded-full bg-white/10 ring-1 ring-white/10">
                  <ShieldCheck className="h-9 w-9 text-[#72A9E2]" />
                </span>
              </div>

              <span className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#9CC1EA] md:text-xs">
                Privacy &amp; Security
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Student Information Deserves the Highest Level of Trust
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[#AFC6E8] md:text-base">
                EduOS is built around responsible data practices. Student information is never
                commercialised, and schools always remain owners of their educational data.
              </p>
            </AnimateOnScroll>

            {/* Right — connected vertical checklist, count-agnostic */}
           <div className="relative mx-auto w-full max-w-sm">
              <div className="pointer-events-none absolute bottom-3 left-7 top-3 w-px bg-white/10" />
              <div className="flex flex-col gap-2">
                {PRIVACY_COMMITMENTS.map((item, i) => (
                  <AnimateOnScroll key={item.text} from="right" delay={i * 90}>
                    <div className="group relative flex items-center gap-4 rounded-xl px-3 py-3 transition-all duration-300 hover:bg-white/5">
                      <span className="relative z-10 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#72A9E2]/15 ring-4 ring-[#073571] transition-transform duration-300 group-hover:scale-110">
                        <item.icon className="h-4 w-4 text-[#72A9E2]" />
                      </span>
                      <span className="text-sm font-medium text-white sm:text-base">{item.text}</span>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <Footer variant="home" />
    </div>
  );
}
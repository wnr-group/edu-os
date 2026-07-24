import type { Metadata } from "next";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  Wallet,
  MessagesSquare,
  LineChart,
  Smartphone,
  FileCheck2,
  UploadCloud,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { NetworkBackground } from "@/components/network-background";

export const metadata: Metadata = {
  title: "Features: Everything Your School Needs, In One Place",
  description:
    "Administration, academics, finance, communication, and analytics: explore every module in the EduOS platform, from instant staff onboarding to AI-powered student intelligence.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/features",
  },
};

const CATEGORIES = [
  {
    id: "administration",
    icon: Building2,
    title: "Administration",
    description:
      "Set up and run the operational backbone of your school, from staff onboarding to day-to-day campus records.",
    flagship: {
      title: "Instant Phone/OTP Staff Login",
      body: "No passwords to manage or reset. Teachers and staff are invited by phone number and log in instantly, one less thing for your IT admin to handle.",
      icon: Smartphone,
    },
    tags: [
      "Admissions",
      "Student Management",
      "Employee Management",
      "Academic Calendar",
      "Timetable",
      "Transport",
      "Hostel",
      "Library",
    ],
  },
  {
    id: "academics",
    icon: GraduationCap,
    title: "Academics",
    description:
      "Attendance, examinations, and report cards: the daily academic record, unified into one place per student.",
    flagship: {
      title: "One Profile: Attendance + Academics + Fees",
      body: "Every student has a single detail page with Attendance, Academics, and Fees tabs, no more switching between spreadsheets to answer one parent's question.",
      icon: FileCheck2,
    },
    tags: [
      "Attendance",
      "Examinations",
      "Assignments",
      "Homework",
      "Lesson Planning",
      "Grade Book",
      "Report Cards",
    ],
  },
  {
    id: "finance",
    icon: Wallet,
    title: "Finance",
    description:
      "Fee collection built for how Indian schools actually get paid: partial payments, multiple methods, and a clear status on every account.",
    flagship: {
      title: "Partial Payments & Multi-Item Allocation",
      body: "Push a fee to an entire class in one click, record offline payments by cash, UPI, bank, or cheque, and let EduOS auto-track Pending, Partial, and Paid status.",
      icon: CreditCard,
    },
    tags: ["Fee Collection", "Online Payments", "Accounting", "Expense Management", "Financial Reports"],
  },
  {
    id: "communication",
    icon: MessagesSquare,
    title: "Communication",
    description:
      "Bridge the gap between school and home with announcements, notifications, and a dedicated app for parents and teachers.",
    flagship: {
      title: "Bonafide Certificates, Instantly",
      body: "Generate pre-filled, print-ready Bonafide Certificates in one click, with a full print-history audit log. A small task that used to take a full day, done in a minute.",
      icon: UploadCloud,
    },
    tags: [
      "Parent App",
      "Teacher App",
      "Student Portal",
      "Notifications",
      "Circulars",
      "WhatsApp Integration",
      "SMS",
      "Email",
    ],
  },
  {
    id: "analytics",
    icon: LineChart,
    title: "Analytics & AI Insights",
    description:
      "From fixed KPI dashboards available today to the Student Intelligence layer EduOS is building, see every learner, not just every number.",
    flagship: {
      title: "Student Intelligence Dashboard",
      body: "The same data already flowing through EduOS (attendance, academics, behaviour, and more) organised into the educational-intelligence layer described on our AI Intelligence page.",
      icon: Sparkles,
      href: "/ai-intelligence",
    },
    tags: [
      "School Performance Dashboard",
      "Teacher Analytics",
      "Attendance Reports",
      "Academic Insights",
      "Predictive Reports",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <Navbar active="Features" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 text-center md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 animate-glow-pulse rounded-full bg-[#72A9E2]/10 blur-[120px]" />
        <div className="pointer-events-none absolute -right-16 top-24 h-52 w-52 animate-drift rounded-full bg-[#C3983C]/10 blur-3xl" />
        <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full text-[#72A9E2]" />
        <div className="relative mx-auto max-w-3xl">
          <HeroReveal delay={100}>
            <span className="inline-block rounded-full bg-[#72A9E2]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#72A9E2] md:text-xs">
              Complete School Management
            </span>
          </HeroReveal>
          <HeroReveal delay={200}>
            <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
              Everything Your School Needs, In One Place
            </h1>
          </HeroReveal>
          <HeroReveal delay={350}>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
              EduOS combines intelligent student analytics with a modern School ERP:
              administration, academics, finance, and communication, all built on one unified
              record per student.
            </p>
          </HeroReveal>
        </div>

        {/* Floating module preview: a lightweight, premium visual anchor for the hero */}
        <HeroFloat delay={450} className="relative mx-auto mt-12 max-w-3xl">
          <div className="animate-float rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/40 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {CATEGORIES.map((cat, i) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="group flex flex-col items-center gap-2 rounded-xl bg-[#F6FAFD] p-3 transition-all duration-300 hover:-translate-y-1 hover:bg-[#EEF4FB] hover:shadow-md"
                  style={{ animationDelay: `${i * 0.3}s` }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#72A9E2]/10 transition-transform duration-300 group-hover:scale-110">
                    <cat.icon className="h-4 w-4 text-[#72A9E2]" />
                  </span>
                  <p className="text-center text-[11px] font-bold text-[#073571]">{cat.title}</p>
                </a>
              ))}
            </div>
          </div>
        </HeroFloat>
      </section>

      {/* ── QUICK JUMP ── */}
      <nav className="sticky top-[73px] z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 overflow-x-auto px-5 py-3.5 [scrollbar-width:none] md:gap-3 md:px-6 [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="flex-shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-slate-500 transition-all duration-300 hover:bg-[#EEF4FB] hover:text-[#073571] md:text-[13px]"
            >
              {cat.title}
            </a>
          ))}
        </div>
      </nav>

      {/* ── CATEGORY SECTIONS ── */}
      {CATEGORIES.map((cat, catIndex) => {
        const CatIcon = cat.icon;
        const FlagshipIcon = cat.flagship.icon;
        const isEven = catIndex % 2 === 0;
        return (
          <section
            id={cat.id}
            key={cat.id}
            className={`relative scroll-mt-32 overflow-hidden px-5 py-16 md:px-6 md:py-20 ${isEven ? "bg-white" : "bg-[#F6FAFD]"}`}
          >
            {/* Alternating soft glow per category for layered depth */}
            <div
              className={`pointer-events-none absolute h-64 w-64 rounded-full blur-[100px] ${
                isEven ? "-right-20 top-0 bg-[#72A9E2]/5" : "-left-20 bottom-0 bg-[#C3983C]/5"
              }`}
            />
            <div className="relative mx-auto max-w-7xl">
              <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
                {/* Category intro */}
                <AnimateOnScroll delay={0} className="lg:col-span-4">
                  <span className="group relative grid h-12 w-12 place-items-center rounded-xl bg-[#073571] transition-transform duration-300 hover:scale-110">
                    <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[#72A9E2]/30 opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-100" />
                    <CatIcon className="h-6 w-6 text-white" />
                  </span>
                  <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-[#073571] lg:text-3xl">
                    {cat.title}
                  </h2>
                  <p className="mt-3 text-justify text-sm leading-relaxed text-slate-600 lg:text-base">{cat.description}</p>
                </AnimateOnScroll>

                {/* Flagship feature + module tag grid */}
                <div className="lg:col-span-8">
                  <AnimateOnScroll
                    delay={100}
                    className="group rounded-2xl border border-slate-200 bg-[#EEF4FB] p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/30 sm:p-7"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                        <FlagshipIcon className="h-5 w-5 text-[#72A9E2]" />
                      </span>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-[#72A9E2]">
                          Live Today
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-[#073571] lg:text-xl">
                          {cat.flagship.title}
                        </h3>
                        <p className="mt-2 text-justify text-sm leading-relaxed text-slate-600">{cat.flagship.body}</p>
                        {cat.flagship.href && (
                         <a 
                            href={cat.flagship.href}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#72A9E2] hover:text-[#4A82BE]"
                          >
                            Learn more <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </AnimateOnScroll>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    {cat.tags.map((tag, i) => (
                      <AnimateOnScroll key={tag} delay={150 + i * 40}>
                        <span className="inline-block rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#073571] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#72A9E2]/40 hover:shadow-sm">
                          {tag}
                        </span>
                      </AnimateOnScroll>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ── CTA ── */}
      <section className="px-5 py-16 md:px-6 md:py-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-[#073571] px-6 py-14 text-center md:px-12 md:py-20">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px] animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                See Every Module, Live
              </h2>
              <p className="mt-4 text-sm text-[#AFC6E8] md:text-lg">
                Book a personalised walkthrough of the full EduOS platform, tailored to your
                school&apos;s size and workflows.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <a
                  href="mailto:admin@wnradvisory.com?subject=Book%20a%20Demo%20-%20Features"
                  className="rounded-full bg-[#72A9E2] px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-[#4A82BE] active:scale-[0.97]"
                >
                  Book a Demo
                </a>
                <a
                  href="/ai-intelligence"
                  className="rounded-full border border-white/30 bg-transparent px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-white/10 active:scale-[0.97]"
                >
                  Explore AI Intelligence
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
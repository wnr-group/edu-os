import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  IdCard,
  ArrowLeftRight,
  Rocket,
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

// lucide-react no longer ships brand/social icons (Twitter, Linkedin, etc. were
// removed), so these are small local placeholders matching the existing h-4 w-4
// icon sizing used across the footer.
function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2H21.5l-7.51 8.59L23 22h-6.828l-5.35-6.36L4.7 22H1.44l8.03-9.19L1 2h6.998l4.836 5.81L18.244 2Zm-1.197 18h1.803L7.03 3.89H5.1L17.047 20Z" />
    </svg>
  );
}
function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "How It Works — EduOS Implementation Guide",
  description:
    "See how EduOS takes your campus live in three clear phases — institutional onboarding, secure data integration, and launch — backed by expert-led training and 24/7 support.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/how-it-works",
  },
};

const PHASES = [
  {
    phase: "PHASE 01",
    title: "Institutional Onboarding",
    description:
      "We begin with a strategic audit of your current workflows. Our specialist team sets up your unique cloud environment and configures security protocols tailored to your campus needs.",
    items: ["Stakeholder Consultations", "Security Environment Setup"],
    icon: IdCard,
    iconBg: "bg-[#0D1B2A]",
    accentText: "text-[#2B6CB0]",
    accentBg: "bg-[#2B6CB0]",
    hoverBorder: "hover:border-[#2B6CB0]/30",
  },
  {
    phase: "PHASE 02",
    title: "Secure Data Integration",
    description:
      "Our proprietary migration engine securely imports student records, faculty data, and financial history. We ensure seamless synchronization with your existing legacy platforms.",
    items: ["SIS/ERP Data Migration", "Automated Validation Checks"],
    icon: ArrowLeftRight,
    iconBg: "bg-[#2B6CB0]",
    accentText: "text-[#2B6CB0]",
    accentBg: "bg-[#2B6CB0]",
    hoverBorder: "hover:border-[#2B6CB0]/30",
  },
  {
    phase: "PHASE 03",
    title: "Launch & Go Live",
    description:
      "Final activation includes role-based training for staff and teachers. Your digital campus officially opens with 24/7 technical monitoring and priority support.",
    items: ["Staff Certification Workshops", "Production Launch"],
    icon: Rocket,
    iconBg: "bg-[#C98A2E]",
    accentText: "text-[#C98A2E]",
    accentBg: "bg-[#C98A2E]",
    hoverBorder: "hover:border-[#C98A2E]/30",
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

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Integrations", href: "#" },
    { label: "Pricing", href: "#" },
    { label: "Security", href: "#" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Blog", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Contact", href: "/#cta" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Policy", href: "#" },
    { label: "Support Center", href: "#" },
  ],
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6F9FB] font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <Navbar active="How It Works" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF3F8] px-5 py-16 md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Left */}
          <div>
            <HeroReveal delay={100}>
              <span className="inline-block rounded-full bg-[#2B6CB0]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#2B6CB0] md:text-xs">
                Implementation Guide
              </span>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
                Modernizing your campus is a{" "}
                <span className="text-[#2B6CB0]">seamless journey.</span>
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
                We&apos;ve refined our implementation process into three clear phases. From
                initial setup to full operations, our team ensures your transition to EduOS
                is efficient, secure, and intuitive.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row md:mt-10">
                <a
                  href="#phases"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0D1B2A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all duration-300 hover:scale-[1.03] hover:bg-[#16283b] active:scale-[0.97] sm:w-auto"
                >
                  Start Journey <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/eduos-brochure.pdf"
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#0D1B2A] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97] sm:w-auto"
                >
                  View Documentation
                </a>
              </div>
            </HeroReveal>
          </div>

          {/* Right — device mockup, stacked below text on mobile/tablet, beside it on desktop */}
          <HeroFloat delay={400} className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-xl lg:max-w-none">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/50 sm:p-4">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  <Image
                    src="/sample.jpg"
                    alt="EduOS How It Works dashboard preview showing key metrics, schedule, and campus overview"
                    fill
                    priority
                    sizes="(min-width: 1024px) 55vw, (min-width: 640px) 85vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </HeroFloat>
        </div>
      </section>

      {/* ── 3-STEP SUCCESS PATH ── */}
      <section id="phases" className="bg-[#EEF3F8] px-5 pb-20 pt-4 md:px-6 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
              The 3-Step Success Path
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={120}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Our standardized rollout protocol ensures zero downtime and 100% data integrity
              for your educational institution.
            </p>
          </AnimateOnScroll>
        </div>

        <div className="relative mx-auto mt-14 max-w-7xl">
          {/* Dashed connector — desktop only, sits behind the cards */}
          <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden border-t-2 border-dashed border-slate-300 lg:block" />

          <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-3">
            {PHASES.map((phase, i) => {
              const Icon = phase.icon;
              return (
                <AnimateOnScroll key={phase.phase} delay={i * 150}>
                  <div
                    className={`group rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-xl hover:shadow-slate-300/40 ${phase.hoverBorder} sm:p-7`}
                  >
                    <span
                      className={`grid h-14 w-14 place-items-center rounded-xl ${phase.iconBg} transition-transform duration-300 group-hover:scale-105`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </span>
                    <p className={`mt-6 text-xs font-bold uppercase tracking-widest ${phase.accentText}`}>
                      {phase.phase}
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-[#0D1B2A] lg:text-2xl">
                      {phase.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                      {phase.description}
                    </p>
                    <ul className="mt-5 space-y-2.5">
                      {phase.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2.5 text-sm font-medium text-[#0D1B2A]"
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
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── POWERFUL INTEGRATION INFRASTRUCTURE ── */}
      <section className="bg-[#F6F9FB] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <AnimateOnScroll delay={0} className="max-w-xl">
              <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
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
                className="inline-flex flex-shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-center text-sm font-bold text-[#0D1B2A] transition-all duration-300 hover:scale-[1.03] hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
              >
                Explore API Specs
              </a>
            </AnimateOnScroll>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-6">
            {/* Unified Data Core */}
            <AnimateOnScroll delay={0} className="lg:col-span-7">
              <div className="group flex h-full flex-col justify-between rounded-2xl bg-[#0D1B2A] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-[#2B6CB0]/20 sm:p-7">
                <div>
                  <h3 className="text-xl font-bold text-white lg:text-2xl">Unified Data Core</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-[#B9CBDF] lg:text-base">
                    Consolidate disparate data sources into a single, high-fidelity truth
                    source. Real-time sync ensures everyone from administrators to parents
                    sees current information.
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3.5">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#2B6CB0] transition-transform duration-300 group-hover:scale-105">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
                        Sync Progress
                      </span>
                      <span className="text-[11px] font-semibold text-[#8FB4DA]">
                        88% Complete
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-[88%] rounded-full bg-[#2B6CB0]" />
                    </div>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>

            {/* Right column: Legacy Support + Bank-Grade Security + 100% Cloud-Native */}
            <div className="flex flex-col gap-5 lg:col-span-5">
              <AnimateOnScroll delay={150}>
                <div className="group flex items-center justify-between gap-4 rounded-2xl bg-[#DCE9FB] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                  <div>
                    <h3 className="text-lg font-bold text-[#0D1B2A] lg:text-xl">
                      Legacy Support
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      We support migration from over 50+ legacy SIS platforms with zero data
                      loss guaranteed.
                    </p>
                  </div>
                  <span className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-2xl bg-white shadow-sm transition-transform duration-300 group-hover:scale-105">
                    <FileInput className="h-6 w-6 text-[#0D1B2A]" />
                  </span>
                </div>
              </AnimateOnScroll>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <AnimateOnScroll delay={250}>
                  <div className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#FBDFA6] p-6 text-center transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                    <Shield className="h-7 w-7 text-[#0D1B2A] transition-transform duration-300 group-hover:scale-110" />
                    <p className="text-base font-bold text-[#0D1B2A]">Bank-Grade Security</p>
                  </div>
                </AnimateOnScroll>
                <AnimateOnScroll delay={350}>
                  <div className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#AFD2F7] p-6 text-center transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7">
                    <CloudCheck className="h-7 w-7 text-[#0D1B2A] transition-transform duration-300 group-hover:scale-110" />
                    <p className="text-base font-bold text-[#0D1B2A]">100% Cloud-Native</p>
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
              <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
                Expert-Led Training &amp; Success
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
                We don&apos;t just hand you the keys. Our EduSuccess&trade; program provides
                comprehensive training modules for every user level—from system
                administrators to student teachers.
              </p>
            </AnimateOnScroll>

            <div className="mt-8 flex flex-col gap-6">
              {TRAINING_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <AnimateOnScroll key={item.title} delay={120 + i * 120}>
                    <div className="group flex items-start gap-4">
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#EEF3F8] transition-transform duration-300 group-hover:scale-105">
                        <Icon className="h-5 w-5 text-[#0D1B2A]" />
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-[#0D1B2A]">{item.title}</h3>
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
      <section id="cta" className="bg-[#0D1B2A] px-5 py-16 md:px-6 md:py-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Ready to upgrade your institutional operations?
          </h2>
          <p className="mt-4 text-sm text-[#B9CBDF] md:text-lg">
            Schedule a personalized discovery session to see how EduOS can specifically
            benefit your school&apos;s unique ecosystem.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="mailto:balaji.p2prhel@gmail.com?subject=Book%20a%20Demo"
              className="w-full rounded-full bg-[#2B6CB0] px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-[#245a91] active:scale-[0.97] sm:w-auto"
            >
              Book a Demo
            </a>
           <a 
              href="mailto:balaji.p2prhel@gmail.com?subject=Talk%20to%20Sales"
              className="w-full rounded-full border border-white/30 bg-transparent px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:bg-white/10 active:scale-[0.97] sm:w-auto"
            >
              Talk to Sales
            </a>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0D1B2A] px-5 pb-8 pt-14 md:px-6 md:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div>
              <span className="text-lg font-bold text-white">EduOS</span>
              <p className="mt-4 text-sm leading-relaxed text-[#8FA3BC]">
                Empowering institutions with modern, secure, and intuitive management systems
                since 2018.
              </p>
            </div>

            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading}>
                <h4 className="text-sm font-bold text-white">{heading}</h4>
                <ul className="mt-4 space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-[#8FA3BC] transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#8FA3BC] md:flex-row">
            <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="transition-colors hover:text-white"
              >
                <XIcon />
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="transition-colors hover:text-white"
              >
                <LinkedInIcon />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
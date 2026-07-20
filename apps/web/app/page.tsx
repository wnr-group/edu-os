import type { Metadata } from "next";
import Image from "next/image";
import {
  CheckCircle,
  TrendingUp,
  MessageSquare,
  PenSquare,
  Archive,
  PlayCircle,
  ArrowRight,
  Globe,
  Mail,
  Share2,
  Rows3,
  BarChart3,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "EduOS — Empowering Schools with Intelligent Management",
  description:
    "EduOS gives your school a unified platform for administration, academics, and communication — attendance, grading, fee tracking, and parent engagement in one place.",
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
        email: "balaji.p2prhel@gmail.com",
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
        description: "Free demo available",
      },
      description:
        "Unified school management platform covering attendance, grading, fee tracking, inventory, and parent communication.",
    },
  ],
};

const NAV_LINKS = [
  { label: "Home", href: "#", active: true },
  { label: "About Us", href: "#about" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Contact Us", href: "#cta" },
];

function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-lg ${className}`}>
      <Image
        src="/logo.jpg"
        alt="EduOS logo"
        fill
        sizes="40px"
        className="object-contain"
      />
    </span>
  );
}
function CircularProgress({ percent = 80 }: { percent?: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const filled = (circumference * percent) / 100;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8F0" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#F5A623"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        transform="rotate(90 50 50)"
        className="fill-[#0D1B2A] text-[22px] font-extrabold"
      >
        {percent}%
      </text>
    </svg>
  );
}

export default function MarketingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6F9FB] font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── NAVBAR ── */}
      <Navbar active="Home" />

    
      {/* ── HERO ── */}
      <section className="relative flex min-h-screen flex-col justify-center overflow-hidden px-5 pb-14 pt-12 md:px-6 md:pb-20 md:pt-16 lg:pb-24 lg:pt-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          {/* Left */}
          <div>
            <HeroReveal delay={100}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2B6CB0]/30 bg-[#2B6CB0]/10 px-3 py-1.5 text-[11px] font-semibold text-[#2B6CB0] md:px-4 md:text-xs">
                <CheckCircle className="h-3.5 w-3.5" />
                Next-Generation School Management
              </span>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-4 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
                Empowering Schools with{" "}
                <span className="text-[#2B6CB0]">Intelligent Management</span>
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
                Streamline your entire campus ecosystem with a unified platform. From
                automated grading to real-time parent communication, we provide the
                tools educators need to focus on what matters most: student success.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-8">
                <a
                  href="#cta"
                  className="flex items-center justify-center gap-2 rounded-full bg-[#0D1B2A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all hover:bg-[#16283b] hover:scale-[1.03] active:scale-[0.97]"
                >
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="mailto:balaji.p2prhel@gmail.com?subject=Request%20a%20Demo"
                  className="flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#0D1B2A] transition-all hover:border-slate-400 hover:bg-slate-50 hover:scale-[1.03] active:scale-[0.97]"
                >
                  <PlayCircle className="h-4 w-4 text-[#2B6CB0]" />
                  Watch Demo
                </a>
              </div>
            </HeroReveal>
            <HeroReveal delay={650}>
              <div className="mt-6 flex items-center gap-3 md:mt-8">
                <div className="flex -space-x-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-8 w-8 rounded-full border-2 border-white bg-[#2B6CB0]/15"
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-600 sm:text-sm">
                  Trusted by <span className="font-bold text-[#0D1B2A]">500+</span> Institutions
                  worldwide
                </p>
              </div>
            </HeroReveal>
          </div>

          {/* Right — hero photo, stacked below text on mobile/tablet, beside it on desktop */}
          <HeroFloat delay={400} className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-xl lg:max-w-none">
              <div className="hero-glow-pulse absolute inset-0 rounded-2xl bg-[#2B6CB0]/10 blur-3xl" />
              <div className="hero-drift absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F5A623]/15 blur-2xl" />
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl shadow-slate-300/40">
                <Image
                  src="/hero-section.jpg"
                  alt="Teacher reviewing real-time student performance data with her class"
                  fill
                  priority
                  sizes="(min-width: 1024px) 50vw, (min-width: 640px) 85vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="card-float absolute -bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-300/40 sm:left-6 sm:right-6">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#F5A623]/15">
                    <TrendingUp className="h-4 w-4 text-[#F5A623]" />
                  </span>
                  <div>
                    <p className="text-[10px] font-medium text-slate-500">Real-time Performance</p>
                    <p className="text-sm font-bold text-[#0D1B2A]">+24% Efficiency</p>
                  </div>
                </div>
                <BarChart3 className="h-5 w-5 flex-shrink-0 text-[#2B6CB0]" />
              </div>
            </div>
          </HeroFloat>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="bg-[#0D1B2A] px-5 py-12 md:px-6 md:py-16">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 text-center lg:grid-cols-4 lg:gap-8">
          {[
            { value: "99.9%", label: "Uptime Reliability" },
            { value: "1.2M+", label: "Active Students" },
            { value: "25+", label: "Integrated Tools" },
            { value: "4.9/5", label: "User Rating" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-extrabold text-white md:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-[#8FB4DA] md:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES HEADING ── */}
      <section id="features" className="px-5 pb-10 pt-14 md:px-6 md:pb-12 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-4xl">
              Centralized Command for Modern Education
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={120}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Designed to eliminate administrative silos and provide a seamless experience for
              staff, students, and parents alike.
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── BENTO GRID ── */}
      {/* ── BENTO GRID ── */}
      <section className="px-5 pb-20 md:px-6 md:pb-28">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:gap-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            {/* Comprehensive Student Tracking */}
            <AnimateOnScroll
              delay={0}
              className="group rounded-2xl border border-slate-200 bg-[#EEF3F8] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#2B6CB0]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-7 lg:p-7"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6">
                <div className="flex-1">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2B6CB0]/10 transition-transform duration-300 group-hover:scale-105">
                    <TrendingUp className="h-5 w-5 text-[#2B6CB0]" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[#0D1B2A] lg:text-2xl">
                    Comprehensive Student Tracking
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                    Monitor attendance, academic progress, and behavioral patterns in real-time.
                    Our AI-driven analytics flag students at risk, allowing for early intervention
                    and personalized support.
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {["Dynamic Academic Portfolios", "Automated Attendance Reports"].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-sm font-medium text-[#0D1B2A] lg:text-base"
                      >
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-[#2B6CB0] lg:h-5 lg:w-5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="w-full overflow-hidden rounded-xl border border-slate-200 shadow-lg shadow-slate-300/30 md:max-w-[280px] md:flex-shrink-0 lg:max-w-[320px]">
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-red-400" />
                      <div className="h-2 w-2 rounded-full bg-yellow-400" />
                      <div className="h-2 w-2 rounded-full bg-green-400" />
                    </div>
                  </div>
                  <Image
                    src="/screenshots/01-dashboard.webp"
                    alt="Student progress dashboard preview"
                    width={900}
                    height={500}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </AnimateOnScroll>

            {/* Parent Hub */}
            <AnimateOnScroll
              delay={150}
              className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#F5A623]/40 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-5 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#F5A623]/15 transition-transform duration-300 group-hover:scale-105">
                <MessageSquare className="h-5 w-5 text-[#F5A623]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#0D1B2A] lg:text-2xl">Parent Hub</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                Bridge the gap between school and home with instant messaging, fee payments,
                and event calendars.
              </p>
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2.5 rounded-xl bg-[#EEF3F8] px-4 py-3.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-[#0D1B2A] lg:text-base">New Grade Published</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl bg-[#EEF3F8] px-4 py-3.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#2B6CB0]" />
                  <span className="text-sm font-medium text-[#0D1B2A] lg:text-base">Parent-Teacher Meeting</span>
                </div>
              </div>
            </AnimateOnScroll>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
            {/* Automated Grading */}
            <AnimateOnScroll
              delay={0}
              className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#2B6CB0]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-4 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2B6CB0]/10 transition-transform duration-300 group-hover:scale-105">
                <PenSquare className="h-5 w-5 text-[#2B6CB0]" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-[#0D1B2A] lg:text-xl">Automated Grading</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                Reduce teacher workload by 40% with smart grading tools and instant feedback
                loops for digital assessments.
              </p>
              <div className="mt-5 self-center">
                <CircularProgress percent={80} />
              </div>
            </AnimateOnScroll>

            {/* Inventory & Resource Control */}
            <AnimateOnScroll
              delay={150}
              className="group flex flex-col justify-center rounded-2xl bg-[#0D1B2A] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-[#2B6CB0]/20 lg:col-span-8 lg:p-7"
            >
              <div className="flex w-full flex-col items-center gap-5 lg:flex-row lg:justify-between lg:gap-6">
                <div className="max-w-sm">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:scale-105">
                    <Archive className="h-5 w-5 text-white" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-white lg:text-xl">Inventory &amp; Resource Control</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#B9CBDF]">
                    Maintain a digital audit trail of textbooks, lab equipment, and sports gear
                    across multiple campuses.
                  </p>
                </div>
                <div className="w-full rounded-xl bg-white/5 p-4 lg:w-auto lg:min-w-[280px]">
                  {[
                    { label: "Library Books", value: "84% Stocked", accent: false },
                    { label: "Lab Supplies", value: "Low Stock", accent: true },
                    { label: "Athletic Gear", value: "Pending Order", accent: true },
                  ].map((row, i, arr) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between gap-6 py-2.5 md:py-3 ${i < arr.length - 1 ? "border-b border-white/10" : ""
                        }`}
                    >
                      <span className="text-sm font-semibold text-white">{row.label}</span>
                      <span
                        className={`text-sm font-medium ${row.accent ? "text-[#F5A623]" : "text-white"
                          }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section id="cta" className="px-5 pb-16 md:px-6 md:pb-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-[#0D1B2A] px-6 py-14 text-center md:px-12 md:py-20">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px] rounded-full bg-[#2B6CB0]/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Ready to transform your school?
              </h2>
              <p className="mt-4 text-sm text-[#B9CBDF] md:text-lg">
                Join hundreds of innovative schools and districts that have already switched to
                EduOS. Request a personalized demo today.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <a
                  href="/login"
                  className="text-sm font-bold text-white transition-opacity hover:opacity-80"
                >
                  Get Started Now
                </a>
                <a
                  href="mailto:balaji.p2prhel@gmail.com?subject=Schedule%20a%20Call"
                  className="rounded-full border border-white/30 bg-white/5 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10 hover:scale-[1.03] active:scale-[0.97]"
                >
                  Schedule a Call
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
              <div className="flex items-center gap-2">
                <LogoMark className="h-7 w-7" />
                <span className="text-base font-bold text-white">EduOS</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#8FA3BC]">
                Leading the evolution of educational technology with enterprise-grade
                management systems for the modern campus.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">Product</h4>
              <ul className="mt-4 space-y-3">
                {[
                  { label: "Features", href: "#features" },
                  { label: "Solutions", href: "#" },
                  { label: "Pricing", href: "#" },
                  { label: "Security", href: "#" },
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
              <h4 className="text-sm font-bold text-white">Resources</h4>
              <ul className="mt-4 space-y-3">
                {["Documentation", "Blog", "Support Center", "Webinars"].map((label) => (
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

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#8FA3BC] md:flex-row">
            <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="/" aria-label="Website" className="transition-colors hover:text-white">
                <Globe className="h-4 w-4" />
              </a>
              <a
                href="mailto:balaji.p2prhel@gmail.com"
                aria-label="Email"
                className="transition-colors hover:text-white"
              >
                <Mail className="h-4 w-4" />
              </a>
              <a
                href="https://wa.me/919789471572"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="transition-colors hover:text-white"
              >
                <Share2 className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes heroGlowPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.08); }
        }
        @keyframes heroDrift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-14px, 16px); }
        }
        .hero-glow-pulse {
          animation: heroGlowPulse 7s ease-in-out infinite;
        }
        .hero-drift {
          animation: heroDrift 11s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          details[open] > div,
          .hero-glow-pulse,
          .hero-drift {
            animation: none !important;
          }
        }
      `}</style>
      <style>{`
  @keyframes heroGlowPulse {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50% { opacity: 0.9; transform: scale(1.08); }
  }
  @keyframes heroDrift {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(-14px, 16px); }
  }
  @keyframes cardFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  .hero-glow-pulse { animation: heroGlowPulse 7s ease-in-out infinite; }
  .hero-drift { animation: heroDrift 11s ease-in-out infinite; }
  .card-float { animation: cardFloat 5s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    details[open] > div,
    .hero-glow-pulse,
    .hero-drift,
    .card-float {
      animation: none !important;
    }
  }
`}</style>
    </div>
  );
}
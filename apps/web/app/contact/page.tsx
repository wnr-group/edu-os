import type { Metadata } from "next";
import type { InputHTMLAttributes } from "react";
import Image from "next/image";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  MessageSquare,
  Map as MapIcon,
  Send,
  Share2,
  Globe,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Contact EduOS — Connect with Our Team",
  description:
    "Have questions about modernizing your educational infrastructure? Reach out to EduOS's specialized team for tailored school management solutions.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/contact",
  },
};

function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
      </label>
      <input
        {...props}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm text-[#0D1B2A] placeholder:text-slate-400 transition-all duration-300 focus:border-[#2B6CB0] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2B6CB0]/10"
      />
    </div>
  );
}

function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-lg ${className}`}>
      <Image
        src="/logo.jpg"
        alt="EduOS logo"
        fill
        sizes="32px"
        className="object-contain"
      />
    </span>
  );
}

const OFFICE_DETAILS = [
  {
    icon: MapPin,
    label: "Global HQ",
    lines: ["800 Tech Innovation Plaza", "Suite 450, Palo Alto, CA 94301"],
  },
  {
    icon: Phone,
    label: "Phone",
    lines: ["+1 (888) EDU-OS-SYS"],
  },
  {
    icon: Mail,
    label: "Email",
    lines: ["admin@eduos.io"],
  },
];

const SUPPORT_HOURS = [
  { days: "Mon - Fri", hours: "8:00 AM - 8:00 PM" },
  { days: "Sat - Sun", hours: "10:00 AM - 4:00 PM" },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6F9FB] font-[family-name:var(--font-display)] text-[#0D1B2A]">
      <Navbar active="Contact Us" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF3F8] px-5 py-16 text-center md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl">
          <HeroReveal delay={100}>
            <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
              Connect with EduOS
            </h1>
          </HeroReveal>
          <HeroReveal delay={250}>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
              Have questions about modernizing your educational infrastructure?
              Our specialized team is ready to assist your institution with
              tailored management solutions.
            </p>
          </HeroReveal>
        </div>
      </section>

      {/* ── FORM + SIDEBAR ── */}
      <section className="px-5 py-16 md:px-6 md:py-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Send a Message */}
          <AnimateOnScroll
            from="left"
            delay={0}
            className="group rounded-3xl border border-slate-200 bg-white p-6 transition-all duration-300 ease-out hover:border-[#2B6CB0]/20 hover:shadow-lg hover:shadow-slate-300/30 sm:p-8 lg:col-span-8 lg:p-10"
          >
            <h2 className="text-2xl font-extrabold text-[#0D1B2A] lg:text-3xl">
              Send a Message
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              We typically respond to institutional inquiries within 4 business hours.
            </p>

            <form className="mt-8 space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field label="Full Name" name="fullName" type="text" placeholder="Dr. Sarah Johnson" />
                <Field
                  label="School Name"
                  name="schoolName"
                  type="text"
                  placeholder="Lexington International Academy"
                />
              </div>

              <Field
                label="Email Address"
                name="email"
                type="email"
                placeholder="s.johnson@edu.example.com"
              />

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Message
                </label>
                <textarea
                  name="message"
                  rows={5}
                  placeholder="How can EduOS help your administration today?"
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-sm text-[#0D1B2A] placeholder:text-slate-400 transition-all duration-300 focus:border-[#2B6CB0] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2B6CB0]/10"
                />
              </div>

              <label className="flex items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="privacyConsent"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-[#2B6CB0] transition-colors focus:ring-2 focus:ring-[#2B6CB0]/30"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/privacy"
                    className="font-semibold text-[#2B6CB0] underline-offset-2 transition-colors hover:text-[#1d4e80] hover:underline"
                  >
                    Privacy Policy
                  </a>{" "}
                  regarding my data processing.
                </span>
              </label>

              {/* type="button": UI only for this pass, no submit handler wired yet */}
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-full bg-[#0D1B2A] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all hover:bg-[#16283b] hover:scale-[1.03] active:scale-[0.97]"
              >
                Send Inquiry <Send className="h-4 w-4" />
              </button>
            </form>
          </AnimateOnScroll>

          {/* Sidebar */}
          <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
            {/* Our Office */}
            <AnimateOnScroll
              from="right"
              delay={100}
              className="group rounded-2xl bg-[#EAF1FB] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-300/30 sm:p-7"
            >
              <h3 className="text-xl font-bold text-[#0D1B2A]">Our Office</h3>
              <div className="mt-5 flex flex-col gap-5">
                {OFFICE_DETAILS.map((item) => (
                  <div key={item.label} className="flex items-start gap-3.5">
                    <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#0D1B2A] transition-transform duration-300 group-hover:scale-105">
                      <item.icon className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#0D1B2A]">{item.label}</p>
                      {item.lines.map((line) => (
                        <p key={line} className="text-sm text-slate-600">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </AnimateOnScroll>

            {/* Support Availability */}
            <AnimateOnScroll
              from="right"
              delay={200}
              className="group rounded-2xl bg-[#0D1B2A] p-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-[#2B6CB0]/20 sm:p-7"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#2B6CB0]" />
                <h3 className="text-lg font-bold text-white">Support Availability</h3>
              </div>
              <div className="mt-4">
                {SUPPORT_HOURS.map((row, i) => (
                  <div
                    key={row.days}
                    className={`flex items-center justify-between py-2.5 ${
                      i < SUPPORT_HOURS.length - 1 ? "border-b border-white/10" : ""
                    }`}
                  >
                    <span className="text-sm text-white">{row.days}</span>
                    <span className="text-sm font-semibold text-[#B9CBDF]">{row.hours}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl bg-white/5 p-4">
                <p className="text-sm leading-relaxed text-[#B9CBDF]">
                  Need immediate help? Our administrative experts are online now.
                </p>
                {/* Decorative for this pass — no live-chat widget found in the provided files */}
                <button
                  type="button"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#8FC1F0] px-5 py-2.5 text-sm font-semibold text-[#0D1B2A] transition-all hover:bg-[#a3cdf3] hover:scale-[1.03] active:scale-[0.97]"
                >
                  <MessageSquare className="h-4 w-4" />
                  Start Live Chat
                </button>
              </div>
            </AnimateOnScroll>

            {/* Map placeholder */}
            <AnimateOnScroll
              from="right"
              delay={300}
              className="grid place-items-center rounded-2xl bg-slate-100 px-6 py-16 text-center transition-all duration-300 ease-out hover:bg-slate-200/70 sm:py-20"
            >
              <MapIcon className="h-7 w-7 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-500">Interactive Map Loading…</p>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── DOCUMENTATION BAND ── */}
      <section className="bg-[#EAF1FB] px-5 py-14 md:px-6 md:py-16">
        <AnimateOnScroll className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#0D1B2A] sm:text-3xl">
              Looking for technical documentation?
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 md:text-base">
              Browse our extensive knowledge base for quick answers to common
              implementation and configuration questions.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <a
              href="#"
              className="rounded-full border border-[#2B6CB0] bg-white px-6 py-3 text-sm font-semibold text-[#2B6CB0] transition-all hover:bg-[#2B6CB0]/5 hover:scale-[1.03] active:scale-[0.97]"
            >
              Documentation
            </a>
            <a
              href="#"
              className="rounded-full bg-[#1d4e80] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#163d67] hover:scale-[1.03] active:scale-[0.97]"
            >
              Support Portal
            </a>
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
                Empowering institutions through digital operational excellence and
                structured data clarity.
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
                  href="/"
                  aria-label="Website"
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-[#8FA3BC] transition-colors hover:border-white/40 hover:text-white"
                >
                  <Globe className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">Product</h4>
              <ul className="mt-4 space-y-3">
                {[
                  { label: "Platform", href: "#" },
                  { label: "Integrations", href: "#" },
                  { label: "Enterprise", href: "#" },
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
              <h4 className="text-sm font-bold text-white">Company</h4>
              <ul className="mt-4 space-y-3">
                <li>
                  <a href="/about" className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/contact" className="text-sm font-semibold text-white">
                    Contact Us
                  </a>
                </li>
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
import type { Metadata } from "next";
import type { InputHTMLAttributes } from "react";
import {
  MapPin,
  MessageCircle,
  Mail,
  Clock,
  Globe,
  Send,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { AnimatedCounter } from "@/components/animated-counter";
import { HeroReveal } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Contact EduOS: Build Every Student's Success Story",
  description:
    "Book a personalised demo to see how EduOS can transform your school's operations while providing meaningful insight into every learner's growth.",
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
        className="mt-2 w-full rounded-xl border border-slate-200 bg-[#F8FBFE] px-4 py-3 text-sm text-[#073571] placeholder:text-slate-400 transition-all duration-300 focus:border-[#72A9E2] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#72A9E2]/10"
      />
    </div>
  );
}

const OFFICE_DETAILS = [
  {
    icon: MapPin,
    label: "Office",
    lines: [
      "115D, First Floor, TIDEL Park, No.4,",
      "Rajiv Gandhi Salai, Tharamani, Chennai – 600113",
    ],
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    lines: ["+91 XXXXXXXXXX"],
  },
  {
    icon: Mail,
    label: "Email",
    lines: ["admin@wnradvisory.com"],
  },
];

const SUPPORT_HOURS = [
  { days: "Mon - Fri", hours: "8:00 AM - 8:00 PM" },
  { days: "Sat - Sun", hours: "10:00 AM - 4:00 PM" },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <Navbar active="Contact Us" />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 text-center md:px-6 md:py-20 lg:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 animate-glow-pulse rounded-full bg-[#72A9E2]/10 blur-[120px]" />
        <div className="pointer-events-none absolute -right-16 top-24 h-52 w-52 animate-drift rounded-full bg-[#C3983C]/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <HeroReveal delay={100}>
            <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
              Ready to Build Every Student&apos;s Success Story?
            </h1>
          </HeroReveal>
          <HeroReveal delay={250}>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
              Book a personalised demo to discover how EduOS can transform your
              school&apos;s operations while providing meaningful insight into
              every learner&apos;s growth.
            </p>
          </HeroReveal>
        </div>
      </section>

      {/* ── FORM + SIDEBAR ── */}
      <section className="relative overflow-hidden px-5 py-16 md:px-6 md:py-20">
        {/* Ambient background depth, consistent with the rest of the site */}
        <div className="pointer-events-none absolute -left-32 top-1/3 h-72 w-72 animate-drift rounded-full bg-[#72A9E2]/5 blur-[100px]" />
        <div
          className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 animate-drift rounded-full bg-[#C3983C]/5 blur-[100px]"
          style={{ animationDelay: "4s" }}
        />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-8">
          {/* Send a Message */}
          <AnimateOnScroll
            from="left"
            delay={0}
            className="group rounded-3xl border border-slate-200 bg-white p-6 transition-all duration-300 ease-out hover:border-[#72A9E2]/20 hover:shadow-lg hover:shadow-slate-300/30 sm:p-8 lg:col-span-8"
          >
            <h2 className="text-2xl font-extrabold text-[#073571] lg:text-3xl">
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
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-[#F8FBFE] px-4 py-3 text-sm text-[#073571] placeholder:text-slate-400 transition-all duration-300 focus:border-[#72A9E2] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#72A9E2]/10"
                />
              </div>

              <label className="flex items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="privacyConsent"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-[#72A9E2] transition-colors focus:ring-2 focus:ring-[#72A9E2]/30"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/privacy"
                    className="font-semibold text-[#72A9E2] underline-offset-2 transition-colors hover:text-[#4A82BE] hover:underline"
                  >
                    Privacy Policy
                  </a>{" "}
                  regarding my data processing.
                </span>
              </label>

              {/* type="button": UI only for this pass, no submit handler wired yet */}
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-full bg-[#073571] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all hover:bg-[#052247] hover:scale-[1.03] active:scale-[0.97]"
              >
                Send Inquiry <Send className="h-4 w-4" />
              </button>
            </form>
          </AnimateOnScroll>

          {/* Sidebar: stretches to match the form's height so both columns align */}
          <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
            {/* Our Office */}
            <AnimateOnScroll
              from="right"
              delay={100}
              className="group relative overflow-hidden rounded-2xl bg-[#E8F1FC] p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/30 sm:p-7"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#72A9E2]/10 blur-2xl transition-all duration-500 group-hover:bg-[#72A9E2]/20" />
              <h3 className="relative text-xl font-bold text-[#073571]">Our Office</h3>
              <div className="relative mt-5 flex flex-col gap-5">
                {OFFICE_DETAILS.map((item) => (
                  <div key={item.label} className="group/item flex items-start gap-3.5">
                    <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#073571] transition-transform duration-300 group-hover/item:scale-110">
                      <item.icon className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#073571]">{item.label}</p>
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

            {/* Support Availability: flex-1 so it grows to fill the remaining height and match the form card */}
            <AnimateOnScroll
              from="right"
              delay={200}
              className="group relative flex flex-1 flex-col overflow-hidden rounded-2xl bg-[#073571] p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-[#72A9E2]/20 sm:p-7"
            >
              {/* Ambient glow, breathing gently */}
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 animate-glow-pulse rounded-full bg-[#72A9E2]/15 blur-2xl" />

              <div className="relative flex flex-1 flex-col justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-white/10">
                      <span className="absolute inset-0 animate-icon-pulse rounded-lg bg-[#72A9E2]/20" />
                      <Clock className="relative h-4 w-4 text-[#72A9E2]" />
                    </span>
                    <h3 className="text-lg font-bold text-white">Support Availability</h3>
                  </div>
                  <div className="mt-5">
                    {SUPPORT_HOURS.map((row, i) => (
                      <div
                        key={row.days}
                        className={`flex items-center justify-between py-3 ${
                          i < SUPPORT_HOURS.length - 1 ? "border-b border-white/10" : ""
                        }`}
                      >
                        <span className="text-sm text-white">{row.days}</span>
                        <span className="text-sm font-semibold text-[#AFC6E8]">{row.hours}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Animated response-time indicator, fills the card with real content instead of empty space */}
                <div className="rounded-xl bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#9CC1EA]">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#72A9E2]/60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#72A9E2]" />
                      </span>
                      Avg. First Response
                    </span>
                    <span className="text-lg font-extrabold text-white">
                      <AnimatedCounter value={4} suffix="h" />
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[85%] animate-pulse rounded-full bg-gradient-to-r from-[#72A9E2] to-[#9CC1EA]" />
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-white/5 px-4 py-3">
                  <Globe className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#72A9E2]" />
                  <p className="text-xs leading-relaxed text-[#AFC6E8]">
                    All times shown in IST (India Standard Time). Typical first response within 4
                    business hours.
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── DOCUMENTATION BAND ── */}
      <section className="bg-[#E8F1FC] px-5 py-14 md:px-6 md:py-16">
        <AnimateOnScroll className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[#073571] sm:text-3xl">
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
              className="rounded-full border border-[#72A9E2] bg-white px-6 py-3 text-sm font-semibold text-[#72A9E2] transition-all hover:bg-[#72A9E2]/5 hover:scale-[1.03] active:scale-[0.97]"
            >
              Documentation
            </a>
            <a
              href="#"
              className="rounded-full bg-[#4A82BE] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0B2A57] hover:scale-[1.03] active:scale-[0.97]"
            >
              Support Portal
            </a>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <Footer variant="contact" />
    </div>
  );
}
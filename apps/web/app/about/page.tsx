import type { Metadata } from "next";
import Image from "next/image";
import { BarChart3, ShieldCheck, Lock, Users, Sparkles, Zap, Globe } from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { AnimatedBar } from "@/components/animated-bar";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "About EduOS: Modernizing the Digital Campus",
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
    year: "2030",
    title: "Mission 2030",
    description: "EduOS aims to positively impact 1 million students worldwide through meaningful educational intelligence.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F6FAFD] font-[family-name:var(--font-display)] text-[#073571]">
      <Navbar active="About Us" />

      {/* ── HERO ── */}
      <section className="relative h-[calc(100vh-73px)] w-full overflow-hidden bg-[#052247]">
        <HeroFloat delay={100} className="absolute inset-0">
          <Image
            src="/about-hero.jpg"
            alt="Students and staff collaborating in a modern campus library"
            fill
            priority
            quality={100}
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
                Beyond the School ERP
              </span>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
                Building the Future of Student Intelligence
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 md:mt-6 md:text-lg">
                EduOS is an institutional operating system designed to bridge the gap
                between administrative complexity and educational excellence. We provide
                the structural backbone for modern learning environments.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-8 flex items-center gap-6 md:mt-10">
                <div className="flex items-baseline gap-2 border-l-2 border-[#72A9E2] pl-3">
                  <span className="text-2xl font-extrabold text-white md:text-3xl">500+</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#AFC6E8]">
                    Institutions
                  </span>
                </div>
                <div className="flex items-baseline gap-2 border-l-2 border-[#72A9E2] pl-3">
                  <span className="text-2xl font-extrabold text-white md:text-3xl">1M</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#AFC6E8]">
                    Students by 2030
                  </span>
                </div>
              </div>
            </HeroReveal>
          </div>
        </div>
      </section>

      {/* ── MISSION & PRINCIPLES ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 pb-20 pt-6 md:px-6 md:pb-28">
        <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 animate-drift rounded-full bg-[#72A9E2]/10 blur-[100px]" />
        <div
          className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56 animate-drift rounded-full bg-[#C3983C]/10 blur-3xl"
          style={{ animationDelay: "3.5s" }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
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

        <div className="relative mx-auto mt-14 flex max-w-7xl flex-col gap-4 lg:gap-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            {/* Precision Intelligence */}
            {/* Precision Intelligence */}
            <AnimateOnScroll
              delay={0}
              className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#72A9E2]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-8 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/10 transition-transform duration-300 group-hover:scale-105">
                <BarChart3 className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#073571] lg:text-2xl">
                Precision Intelligence
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 lg:text-base">
                We believe data should be actionable, not overwhelming. Our analytics
                suite translates raw academic data into strategic insights for
                institutional growth.
              </p>

              {/* 👇 THIS is the block you're asking about — replace the old bar chart with it here */}
              <div className="mt-6 flex h-40 items-end gap-3 rounded-xl bg-[#EEF4FB] p-5">
                {[40, 55, 38, 68, 52].map((h, i) => (
                  <AnimatedBar
                    key={i}
                    orientation="vertical"
                    targetPercent={h}
                    delay={i * 120}
                    duration={900}
                    className="flex-1 rounded-t-md bg-[#72A9E2]"
                    style={{ opacity: 0.45 + i * 0.14 }}
                  />
                ))}
              </div>
    

            </AnimateOnScroll>

            {/* Enterprise Trust */}
            <AnimateOnScroll
              delay={150}
              className="group flex flex-col rounded-2xl bg-[#073571] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-[#72A9E2]/20 lg:col-span-4 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:scale-105">
                <ShieldCheck className="h-5 w-5 text-white" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-white lg:text-2xl">Enterprise Trust</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#AFC6E8] lg:text-base">
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
              className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[#72A9E2]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-4 lg:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/10 transition-transform duration-300 group-hover:scale-105">
                <Users className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <h3 className="mt-5 text-xl font-bold text-[#073571] lg:text-2xl">Collaboration</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                Breaking silos between departments with a unified interface.
              </p>
            </AnimateOnScroll>

            {/* Global Scalability */}
            <AnimateOnScroll
              delay={150}
              className="group rounded-2xl bg-[#E8F1FC] p-5 sm:p-6 transition-all duration-300 ease-out hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-8 lg:p-7"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-sm">
                  <h3 className="text-xl font-bold text-[#073571] lg:text-2xl">Global Scalability</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                    From small private schools to national university systems, EduOS
                    scales with your ambition without compromising performance.
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1 rounded-xl bg-white px-6 py-5 text-center shadow-sm sm:flex-none sm:min-w-[140px]">
                    <p className="text-xl font-extrabold text-[#073571]">99.9%</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">Uptime</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-white px-6 py-5 text-center shadow-sm sm:flex-none sm:min-w-[140px]">
                    <p className="text-xl font-extrabold text-[#073571]">24/7</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">Support</p>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── THE REASON WHY WE CREATED EDUOS ── */}
      <section className="bg-[#F6FAFD] px-5 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <span className="inline-block rounded-full bg-[#EEF4FB] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
              Vision 2035: Reimagining the Future of Learning
            </span>
          </AnimateOnScroll>
          <AnimateOnScroll delay={100}>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
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

        <div className="mx-auto mt-14 grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-16">
          {/* Image with floating accent badge */}
          <AnimateOnScroll from="left" delay={0} className="relative">
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
            <div className="absolute -bottom-6 -right-4 flex animate-float items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40 sm:-right-6">
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#073571]">
                <Sparkles className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#073571]">Built for Educators</p>
                <p className="text-xs text-slate-500">By people who lived the problem</p>
              </div>
            </div>
          </AnimateOnScroll>

          {/* Connected reasons list */}
          <div>
            <div className="relative">
              <div className="pointer-events-none absolute bottom-4 left-6 top-4 w-px bg-slate-200" />
              <div className="flex flex-col gap-6">
                {[
                  {
                    icon: Zap,
                    title: "Streamlining Operations",
                    description:
                      "We recognized that educators were spending more time on spreadsheets than on students. EduOS was built to automate the administrative friction that slows down institutional progress.",
                  },
                  {
                    icon: Globe,
                    title: "Modernizing the Digital Campus",
                    description:
                      "Our mission is to provide a unified digital infrastructure that scales with the evolving needs of global education, ensuring every institution has access to enterprise-grade precision.",
                  },
                ].map((reason, i) => (
                  <AnimateOnScroll key={reason.title} from="right" delay={i * 150}>
                    <div className="group relative flex gap-5">
                      <span className="relative z-10 grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[#073571] shadow-md shadow-slate-300/40 ring-4 ring-[#F6FAFD] transition-transform duration-300 group-hover:scale-110">
                        <reason.icon className="h-5 w-5 text-[#72A9E2]" />
                      </span>
                      <div className="flex-1 rounded-2xl border border-transparent p-1 transition-all duration-300 group-hover:border-slate-200 group-hover:bg-white group-hover:p-5 group-hover:shadow-lg group-hover:shadow-slate-300/30">
                        <h3 className="text-xl font-bold text-[#073571] lg:text-2xl">{reason.title}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
                          {reason.description}
                        </p>
                      </div>
                    </div>
                  </AnimateOnScroll>
                ))}
              </div>
            </div>

            <AnimateOnScroll delay={300}>
              <a
                href="#mission"
                className="mt-8 inline-flex items-center justify-center rounded-full bg-[#073571] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#073571]/15 transition-all hover:bg-[#052247] hover:scale-[1.03] active:scale-[0.97]"
              >
                Learn More About Our Mission
              </a>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── THE EVOLUTION OF EDUOS (TIMELINE) ── */}
      <section className="bg-[#E8F1FC] px-5 py-20 md:px-6 md:py-28">
        <AnimateOnScroll delay={0} className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
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
                    <span className="absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#073571] text-xs font-bold text-white shadow-md">
                      {item.year}
                    </span>
                    <h3 className="pt-1.5 text-base font-bold text-[#073571]">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {item.description}
                    </p>
                  </div>

                  {/* Tablet/Desktop: alternating sides around the center line */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:py-8">
                    <div className={isLeft ? "text-right" : ""}>
                      {isLeft && (
                        <>
                          <h3 className="text-base font-bold text-[#073571]">{item.title}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            {item.description}
                          </p>
                        </>
                      )}
                    </div>
                    <span className="relative z-10 grid h-14 w-14 flex-shrink-0 place-items-center rounded-full bg-[#073571] text-sm font-bold text-white shadow-md">
                      {item.year}
                    </span>
                    <div>
                      {!isLeft && (
                        <>
                          <h3 className="text-base font-bold text-[#073571]">{item.title}</h3>
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
      <section id="cta" className="bg-[#F6FAFD] px-5 pb-16 pt-4 md:px-6 md:pb-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0C2A57] to-[#041B3D] px-6 py-14 text-center md:px-12 md:py-20">
            <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px] animate-glow-pulse rounded-full bg-[#72A9E2]/20 blur-[100px]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Ready to Modernize Your Campus?
              </h2>
              <p className="mt-4 text-sm text-[#AFC6E8] md:text-lg">
                Join the growing network of elite institutions leveraging EduOS to
                drive academic outcomes through technological precision.
              </p>
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <a
                  href="mailto:admin@wnradvisory.com?subject=Request%20a%20Demo"
                  className="w-full rounded-full border border-white/10 bg-[#041B3D] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[#02132E] hover:scale-[1.03] active:scale-[0.97] sm:w-auto"
                >
                  Request a Demo
                </a>
                <a
                  href="/eduos-brochure.pdf"
                  className="w-full rounded-full border border-white/30 bg-white/5 px-8 py-3 text-sm font-semibold text-[#AFC6E8] transition-all hover:bg-white/10 hover:scale-[1.03] active:scale-[0.97] sm:w-auto"
                >
                  Download Brochure
                </a>
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <Footer variant="about" />
    </div>
  );
}
import type { Metadata } from "next";
import Image from "next/image";
import {
  Sparkles,
  Heart,
  ShieldCheck,
  Users,
  TrendingUp,
  Lightbulb,
  Compass,
  Target,
  Rocket,
  Layers,
} from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { AnimatedCounter } from "@/components/animated-counter";
import { HeroReveal, HeroFloat } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FloatingOrb } from "@/components/floating-orb";
import { TiltCard } from "@/components/tilt-card";
import { ParallaxLayer } from "@/components/parallax-layer";
import { GradientText } from "@/components/gradient-text";
import { GradientBorder } from "@/components/gradient-border";
import { ConnectionLine } from "@/components/connection-line";
import { StoryTimeline, type StoryMilestone } from "@/components/story-timeline";
import { ValueCarousel, type CarouselItem } from "@/components/value-carousel";

export const metadata: Metadata = {
  title: "About EduOS: A WnR Advisory Initiative",
  description:
    "EduOS was founded on a simple belief: every student has the potential to succeed when they are understood, encouraged, and guided in the right direction.",
  alternates: {
    // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
    canonical: "https://eduos.com/about",
  },
};

// NEW
const STORY_MILESTONES: StoryMilestone[] = [
  {
    icon: <Layers className="h-4 w-4 text-[#72A9E2] sm:h-5 sm:w-5" />,
    eyebrow: "Every Day",
    title: "Schools Generate Valuable Information",
    description:
      "Students create stories of perseverance, curiosity, improvement, leadership, creativity, and resilience.",
  },
  {
    icon: <Target className="h-4 w-4 text-[#72A9E2] sm:h-5 sm:w-5" />,
    eyebrow: "The Problem",
    title: "Opportunities Were Being Missed",
    description:
      "Much of this information remains scattered across registers, spreadsheets, examination records, and disconnected systems.",
  },
  {
    icon: <Lightbulb className="h-4 w-4 text-[#72A9E2] sm:h-5 sm:w-5" />,
    eyebrow: "Our Goal",
    title: "Turning Information into Understanding",
    description:
      "We set out to help educators recognise strengths earlier, identify learning needs sooner, and make informed decisions that support every learner's growth.",
  },
  {
    icon: <Sparkles className="h-4 w-4 text-[#72A9E2] sm:h-5 sm:w-5" />,
    eyebrow: "The Belief",
    title: "A Greater Opportunity to Reach Full Potential",
    description:
      "When schools understand students better, students gain a greater opportunity to realise their full potential.",
  },
];

// NEW
const VALUES: CarouselItem[] = [
  {
    icon: <Heart className="h-6 w-6 text-[#72A9E2]" />,
    title: "Student First",
    description:
      "Every decision begins with one question: will this improve the educational experience of students?",
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-[#72A9E2]" />,
    title: "Trust Through Responsibility",
    description:
      "Student information is handled with integrity, transparency, and respect. Trust is earned through responsible action.",
  },
  {
    icon: <Users className="h-6 w-6 text-[#72A9E2]" />,
    title: "Empower Educators",
    description:
      "Technology should reduce administrative burden and allow teachers to focus on what matters most: inspiring and mentoring students.",
  },
  {
    icon: <TrendingUp className="h-6 w-6 text-[#72A9E2]" />,
    title: "Continuous Growth",
    description:
      "Education is a lifelong journey. Our platform is built to evolve alongside students, schools, and the changing needs of education.",
  },
  {
    icon: <Lightbulb className="h-6 w-6 text-[#72A9E2]" />,
    title: "Innovation with Purpose",
    description:
      "We embrace technology not because it is new, but because it creates meaningful value for schools and learners.",
  },
];

const ROADMAP = [
  {
    year: "2027",
    title: "Building Strong Foundations",
    focus: "Digital transformation for schools",
    description:
      "Expanding EduOS across partner schools with a unified platform for academics, administration, and communication, backed by robust privacy and security practices.",
    students: 50000,
  },
  {
    year: "2028",
    title: "Intelligent Insights for Better Decisions",
    focus: "Turning information into understanding",
    description:
      "Introducing AI-assisted educational insights and personalised progress reports that highlight strengths, growth areas, and learning trends for every student.",
    students: 250000,
  },
  {
    year: "2029",
    title: "A Connected Learning Journey",
    focus: "Continuity across educational transitions",
    description:
      "Expanding student portfolios with achievements and interests, and introducing personalised learning pathways to help schools identify students who need support or enrichment.",
    students: 600000,
  },
  {
    year: "2030",
    title: "Empowering One Million Students",
    focus: "Creating a lasting educational impact",
    description:
      "Achieving our mission of supporting one million students and building one of India's most trusted student intelligence ecosystems.",
    students: 1000000,
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
          <div className="absolute inset-0 bg-gradient-to-r from-[#052247] via-[#052247]/80 to-transparent sm:via-[#052247]/70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#052247]/50 via-transparent to-transparent" />
        </HeroFloat>

        <ParallaxLayer speed={0.08} className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72">
          <FloatingOrb animation="glow-pulse" className="inset-0 h-72 w-72 bg-[#72A9E2]/10" />
        </ParallaxLayer>

        <div className="relative flex h-full items-center px-6 sm:px-10 md:px-14 lg:px-16 xl:px-20">
          <div className="max-w-xl">
            <HeroReveal delay={100}>
              <span className="inline-block rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#AFC6E8] backdrop-blur-sm md:text-xs">
                A WnR Advisory Initiative
              </span>
            </HeroReveal>
            <HeroReveal delay={200}>
              <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl lg:text-5xl">
                Education is not about managing schools. It is about
                empowering students.
              </h1>
            </HeroReveal>
            <HeroReveal delay={350}>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80 md:mt-6 md:text-lg">
                EduOS was founded on a simple yet powerful belief: every
                student has the potential to succeed when they are
                understood, encouraged, and guided in the right direction.
              </p>
            </HeroReveal>
            <HeroReveal delay={500}>
              <div className="mt-8 flex items-center gap-6 md:mt-10">
                <div className="flex items-baseline gap-2 border-l-2 border-[#72A9E2] pl-3">
                  <span className="text-2xl font-extrabold text-white md:text-3xl">2027</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#AFC6E8]">
                    Foundations Launch
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

      {/* ── WHY EDUOS EXISTS (premium showcase, redesigned) ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 md:px-6 md:py-24">
        <ParallaxLayer speed={0.1} className="pointer-events-none absolute -left-20 top-10 h-64 w-64">
          <FloatingOrb animation="drift" className="inset-0 h-64 w-64 bg-[#72A9E2]/10" />
        </ParallaxLayer>
        <ParallaxLayer speed={-0.06} className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56">
          <FloatingOrb animation="drift" delayMs={3500} className="inset-0 h-56 w-56 bg-[#C3983C]/10" blurPx={80} />
        </ParallaxLayer>

        <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-16">
          {/* Illustration showcase */}
          <AnimateOnScroll from="left" delay={0} className="relative order-2 lg:order-1">
            <TiltCard className="relative" maxTilt={5} scale={1.01}>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40">
                {/* NOTE: placeholder illustration path — swap for the final asset once it's in /public */}
                <Image
                  src="/about-eduOS.jpg"
                  alt="Illustration of a student's unique abilities, aspirations, and talents being recognised"
                  fill
                  quality={100}
                  sizes="(min-width: 1024px) 50vw, (min-width: 640px) 85vw, 100vw"
                  className="object-cover p-6"
                />
              </div>
            </TiltCard>
            <div
              className="absolute -bottom-6 left-1/3 flex animate-float items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40"
              style={{ animationDelay: "0.6s" }}
            >
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-[#073571]">
                <Sparkles className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#073571]">Guided</p>
                <p className="text-xs text-slate-500">In the right direction</p>
              </div>
            </div>
          </AnimateOnScroll>

          <div className="order-1 lg:order-2">
            <AnimateOnScroll from="right" delay={0}>
              <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
                Why EduOS Exists
              </span>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
                Bridging the gap between administration and understanding
              </h2>
            </AnimateOnScroll>
            <AnimateOnScroll from="right" delay={120}>
              <p className="mt-5 text-sm leading-relaxed text-slate-600 lg:text-base">
                While schools have embraced technology to digitise
                administration, the true purpose of education extends far
                beyond attendance registers, examinations, and report cards.
                Every student carries a unique combination of abilities,
                aspirations, challenges, and talents that deserve to be
                recognised and nurtured.
              </p>
            </AnimateOnScroll>
            <AnimateOnScroll from="right" delay={220}>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 lg:text-base">
                We are building an ecosystem where technology serves
                education with purpose: helping schools understand learners
                better, enabling teachers with meaningful insights,
                strengthening collaboration with parents, and empowering
                students to discover their own strengths.
              </p>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ── A WING OF WNR ADVISORY (spotlight, redesigned) ── */}
     <section className="relative overflow-hidden bg-[#F6FAFD] px-5 py-16 md:px-6 md:py-24">
        <div className="relative z-0 mx-auto max-w-7xl">
          {/* Background layer and main card now share one AnimateOnScroll wrapper, so they
              reveal together as a single composition. AnimateOnScroll locks opacity/transform
              permanently after its first trigger, so once revealed both pieces — including the
              stacked-card background — remain visible for the rest of the page's lifetime. */}
          <AnimateOnScroll from="scale" className="relative">
            <GradientBorder
              spin={false}
              blurPx={2}
              className="pointer-events-none absolute inset-0 -z-10 rotate-6 translate-x-4 translate-y-4 opacity-90 shadow-2xl shadow-[#041B3D]/40 sm:translate-x-5 sm:translate-y-5"
              innerClassName="h-full w-full bg-gradient-to-br from-[#72A9E2]/25 via-[#073571]/40 to-[#C3983C]/20"
            >
              <div className="h-full w-full" />
            </GradientBorder>

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0C2A57] via-[#073571] to-[#041B3D] px-6 py-14 shadow-2xl shadow-[#041B3D]/40 sm:px-10 md:px-14 md:py-20">
              <p
                aria-hidden
                className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 select-none whitespace-nowrap text-[9rem] font-extrabold leading-none tracking-tight text-white/[0.04] lg:block"
              >
                WISDOM &amp; RESULTS
              </p>

              {/* Ambient decoration */}
              <ParallaxLayer speed={0.08} className="pointer-events-none absolute -right-10 -top-16 h-72 w-72">
                <FloatingOrb animation="glow-pulse" className="inset-0 h-72 w-72 bg-[#72A9E2]/25" blurPx={120} />
              </ParallaxLayer>
              <ParallaxLayer speed={-0.05} className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64">
                <FloatingOrb animation="drift" delayMs={2000} className="inset-0 h-64 w-64 bg-[#C3983C]/15" blurPx={100} />
              </ParallaxLayer>
              <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />

              <div className="relative grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
                <div>
                  <HeroReveal delay={0}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#C3983C]/40 bg-[#C3983C]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#E8C883] backdrop-blur-sm animate-ring-glow md:text-xs">
                      <Compass className="h-3.5 w-3.5" />A Wing of WnR Advisory
                    </span>
                  </HeroReveal>
                  <HeroReveal delay={80}>
                    <div className="mt-5">
                      <ConnectionLine from="WnR Advisory" to="EduOS" />
                    </div>
                  </HeroReveal>
                  <HeroReveal delay={160}>
                    <h2 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                      <GradientText>Wisdom and Results</GradientText>
                    </h2>
                  </HeroReveal>
                  <HeroReveal delay={240}>
                    <p className="mt-5 text-sm leading-relaxed text-[#AFC6E8] md:text-base">
                      EduOS is an education initiative developed by WnR
                      Advisory, a consulting and technology firm focused on
                      creating practical, human-centred digital solutions for
                      organisations. At WnR Advisory, our philosophy is
                      reflected in our name: Wisdom and Results.
                    </p>
                  </HeroReveal>
                  <HeroReveal delay={320}>
                    <p className="mt-4 text-sm leading-relaxed text-[#AFC6E8] md:text-base">
                      Drawing on our experience in digital transformation, data
                      strategy, and technology consulting, we established EduOS
                      with a single purpose: to apply these capabilities where
                      they can make one of the greatest long-term differences,
                      education.
                    </p>
                  </HeroReveal>
                </div>

                {/* Glassmorphic pillar card, interactive 3D tilt */}
                <HeroFloat delay={250}>
                  <TiltCard maxTilt={6} glowColor="rgba(195,152,60,0.25)">
                    <div className="relative rounded-2xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur-xl shadow-2xl shadow-black/20 sm:p-9">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="border-r border-white/10 pr-6">
                          <p className="text-3xl font-extrabold text-white sm:text-4xl">Wisdom</p>
                          <p className="mt-2 text-xs leading-relaxed text-[#AFC6E8]">
                            Meaningful technology that simplifies complexity and
                            supports better decisions.
                          </p>
                        </div>
                        <div>
                          <p className="text-3xl font-extrabold text-white sm:text-4xl">Results</p>
                          <p className="mt-2 text-xs leading-relaxed text-[#AFC6E8]">
                            Practical, human-centred solutions built to create
                            measurable impact.
                          </p>
                        </div>
                      </div>
                      <div className="mt-7 flex items-center gap-3 border-t border-white/10 pt-6">
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-white/10">
                          <Rocket className="h-5 w-5 text-[#C3983C]" />
                        </span>
                        <p className="text-xs font-medium text-white/80">
                          Beyond administration, towards truly student-centred
                          learning.
                        </p>
                      </div>
                    </div>
                  </TiltCard>
                </HeroFloat>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
      
      {/* ── OUR STORY (interactive timeline, redesigned) ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 md:px-6 md:py-24">
        <ParallaxLayer speed={0.07} className="pointer-events-none absolute -right-20 top-0 h-72 w-72">
          <FloatingOrb animation="drift" className="inset-0 h-72 w-72 bg-[#72A9E2]/10" />
        </ParallaxLayer>

        <div className="relative mx-auto max-w-3xl text-center">
          <AnimateOnScroll delay={0}>
            <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
              Our Story
            </span>
          </AnimateOnScroll>
          <AnimateOnScroll delay={100}>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl lg:text-5xl">
              Why We Started EduOS
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={200}>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Schools generate valuable information every day. Here is how
              that observation became EduOS.
            </p>
          </AnimateOnScroll>
        </div>

        <div className="relative mt-16">
          <StoryTimeline milestones={STORY_MILESTONES} />
        </div>
      </section>

      {/* ── PURPOSE, MISSION & VISION ── */}
      <section className="bg-[#F6FAFD] px-5 py-16 md:px-6 md:py-24">
        <AnimateOnScroll delay={0} className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
            Our Purpose, Mission &amp; Vision
          </h2>
        </AnimateOnScroll>

        <div className="mx-auto mt-14 grid max-w-7xl gap-5 lg:grid-cols-12 lg:gap-6">
          {/* Mission — emphasized, spans wider, interactive tilt */}
          <AnimateOnScroll delay={0} className="lg:col-span-7">
            <TiltCard maxTilt={4} glowColor="rgba(114,169,226,0.18)" className="h-full">
              <div className="group flex h-full flex-col justify-between rounded-2xl bg-[#073571] p-6 sm:p-8 transition-shadow duration-300 ease-out hover:shadow-lg hover:shadow-[#72A9E2]/20">
                <div>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 transition-transform duration-300 group-hover:scale-105">
                    <Rocket className="h-5 w-5 text-[#C3983C]" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-white lg:text-2xl">Our Mission</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#AFC6E8] lg:text-base">
                    To empower <span className="font-bold text-white">1 million students</span> by
                    2030 by helping schools, teachers, and parents understand
                    every learner beyond marks, enabling each student to
                    discover their strengths and reach their fullest
                    potential.
                  </p>
                </div>
                <div className="mt-8 flex items-baseline gap-2 border-t border-white/10 pt-6">
                  <AnimatedCounter value={1000000} suffix="+" className="text-3xl font-extrabold text-white sm:text-4xl" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#AFC6E8]">
                    Students Empowered by 2030
                  </span>
                </div>
              </div>
            </TiltCard>
          </AnimateOnScroll>

          {/* Purpose */}
          <AnimateOnScroll
            delay={100}
            className="group rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 transition-all duration-300 ease-out hover:scale-[1.02] hover:border-[#72A9E2]/30 hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#72A9E2]/10 transition-transform duration-300 group-hover:scale-105">
              <Compass className="h-5 w-5 text-[#72A9E2]" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-[#073571] lg:text-2xl">Our Purpose</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 lg:text-base">
              To build an educational ecosystem where every student is known,
              every teacher is empowered, every parent is engaged, and every
              school is equipped to make informed decisions that improve
              learning outcomes.
            </p>
          </AnimateOnScroll>

          {/* Vision */}
          <AnimateOnScroll
            delay={200}
            className="group rounded-2xl bg-[#E8F1FC] p-6 sm:p-8 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-300/30 lg:col-span-12"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white transition-transform duration-300 group-hover:scale-105">
                <Sparkles className="h-5 w-5 text-[#72A9E2]" />
              </span>
              <div>
                <h3 className="text-xl font-bold text-[#073571] lg:text-2xl">Our Vision</h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 lg:text-base">
                  To create the world's most trusted student intelligence
                  ecosystem, where every learner's educational journey is
                  understood, supported, and celebrated from the first day of
                  school through graduation.
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── WHAT GUIDES US (interactive carousel, redesigned) ── */}
      <section className="relative overflow-hidden bg-[#EEF4FB] px-5 py-16 md:px-6 md:py-24">
        <ParallaxLayer speed={-0.06} className="pointer-events-none absolute -left-16 bottom-0 h-60 w-60">
          <FloatingOrb animation="drift" className="inset-0 h-60 w-60 bg-[#C3983C]/10" blurPx={90} />
        </ParallaxLayer>

       <AnimateOnScroll delay={0} className="relative mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
            What Guides Us
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
            Our Core Values
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
            These values are more than words on a page. They shape every
            decision we make, from the features we build to the way we
            support schools, teachers, and families, keeping EduOS focused on
            what matters most: the student.
          </p>
        </AnimateOnScroll>

        <div className="relative mx-auto mt-14 max-w-7xl">
          <ValueCarousel items={VALUES} />
        </div>
      </section>

      {/* ── ROADMAP (kept, year made a focal point) ── */}
      <section className="relative overflow-hidden bg-[#E8F1FC] px-5 py-20 md:px-6 md:py-28">
        <ParallaxLayer speed={0.05} className="pointer-events-none absolute right-0 top-0 h-72 w-72">
          <FloatingOrb animation="glow-pulse" className="inset-0 h-72 w-72 bg-[#72A9E2]/10" blurPx={110} />
        </ParallaxLayer>

        <AnimateOnScroll delay={0} className="relative mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
            Building the Future of Student-Centred Education
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-[#073571] sm:text-4xl">
            The EduOS Roadmap
          </h2>
          <p className="mt-4 text-sm text-slate-600 md:text-base">
            Our roadmap reflects a long-term commitment to creating
            meaningful value for schools while steadily expanding the
            capabilities available to students, parents, and educators.
          </p>
        </AnimateOnScroll>

        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="relative flex flex-col gap-10 sm:gap-0">
            {/* Scoped to this block only (not the "Beyond 2030" copy below),
                so the dotted line ends exactly at the last roadmap item. */}
            <div className="absolute left-[18px] top-0 h-full border-l-2 border-dotted border-slate-400/60 sm:hidden" />
            <div className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 border-l-2 border-dotted border-slate-400/60 sm:block" />
            {ROADMAP.map((item, i) => {
              const isLeft = i % 2 === 0;
              const body = (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#72A9E2]">{item.focus}</p>
                  <h3 className="mt-1 text-base font-bold text-[#073571]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
                  <div className="mt-3 inline-flex items-baseline gap-1.5">
                    <AnimatedCounter value={item.students} suffix="+" className="text-lg font-extrabold text-[#073571]" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">students</span>
                  </div>
                </>
              );
              // Focal, gently "breathing" year badge: pulsing glow ring + shimmering gradient numerals.
              const yearBadge = (sizeClass: string) => (
                <span
                  className={`relative z-10 grid flex-shrink-0 place-items-center rounded-full bg-[#073571] font-bold text-white shadow-md animate-ring-glow ${sizeClass}`}
                >
                  <GradientText>{item.year}</GradientText>
                </span>
              );
              return (
                <AnimateOnScroll key={item.year} delay={i * 80} from={isLeft ? "left" : "right"}>
                  {/* Mobile */}
                  <div className="relative pl-14 sm:hidden">
                    <span className="absolute left-0 top-0">{yearBadge("h-9 w-9 text-[11px]")}</span>
                    {body}
                  </div>

                  {/* Tablet/Desktop */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:py-8">
                    <div className={isLeft ? "text-right" : ""}>{isLeft && body}</div>
                    {yearBadge("h-14 w-14 text-sm")}
                    <div>{!isLeft && body}</div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>

          <AnimateOnScroll delay={ROADMAP.length * 80} className="relative mt-14 text-center">
            <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#72A9E2] md:text-xs">
              Beyond 2030
            </span>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              Our ambition extends beyond a number. We envision EduOS
              becoming a lifelong educational companion, supporting learners
              through every stage of their academic journey while helping
              institutions make informed, compassionate, and impactful
              decisions.
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ── CLOSING STATEMENT / CTA ── */}
      <section id="cta" className="bg-[#F6FAFD] px-5 pb-16 pt-4 md:px-6 md:pb-24">
        <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0C2A57] to-[#041B3D] px-6 py-14 text-center md:px-12 md:py-20">
            <ParallaxLayer speed={0.06} className="pointer-events-none absolute right-0 top-0 h-[300px] w-[400px]">
              <FloatingOrb animation="glow-pulse" className="inset-0 h-[300px] w-[400px] bg-[#72A9E2]/20" />
            </ParallaxLayer>
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Empowering Every Student. Enabling Every School. Inspiring
                Every Future.
              </h2>
              <p className="mt-4 text-sm text-[#AFC6E8] md:text-lg">
                Together with educators, parents, and institutions, we are
                creating a future where every learner receives the support
                they deserve.
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
              <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-[#AFC6E8]/70">
                A WnR Advisory Initiative
              </p>
            </div>
          </div>
        </AnimateOnScroll>
      </section>

      {/* ── FOOTER ── */}
      <Footer variant="about" />
    </div>
  );
}
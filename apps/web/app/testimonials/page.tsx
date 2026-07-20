import type { Metadata } from "next";
import Image from "next/image";
import { Star, Mail, Phone, MapPin } from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { HeroReveal } from "@/components/hero-animations";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
    title: "Testimonials — Trusted by Leaders in Global Education | EduOS",
    description:
        "See how principals and IT directors are transforming their digital campuses with EduOS management systems.",
    alternates: {
        // NOTE: placeholder domain — replace once the real EduOS domain is confirmed.
        canonical: "https://eduos.com/testimonials",
    },
};

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

const STATS = [
    { value: "98%", label: "Director Satisfaction Rate" },
    { value: "500+", label: "Institutions Worldwide" },
    { value: "24/7", label: "Premium Support Coverage" },
];

const TESTIMONIALS = [
    {
        name: "Marcus Thorne",
        role: "IT Director, St. Jude's Collegiate",
        quote:
            "As an IT Director, I appreciate the security and scalability. EduOS integrates seamlessly with our existing SSO and LMS.",
        avatar: "/testimonials/marcus-thorne.jpg",
    },
    {
        name: "Elena Rodriguez",
        role: "Operations Manager, Oakwood Primary",
        quote:
            "The reporting tools are a game changer for board presentations. Complex data is now visual and easy to understand.",
        avatar: "/testimonials/elena-rodriguez.jpg",
    },
    {
        name: "Robert Chen",
        role: "Superintendent, District 12 Schools",
        quote:
            "Deployment was incredibly fast. We were up and running across three campuses in under two weeks.",
        avatar: "/testimonials/robert-chen.jpg",
    },
];

const JOIN_AVATARS = [
    "/testimonials/join-avatar-1.jpg",
    "/testimonials/join-avatar-2.jpg",
    "/testimonials/join-avatar-3.jpg",
];

const FOOTER_SOLUTIONS = ["School ERP", "Student Info System", "LMS Integration", "Finance Management"];

const FOOTER_COMPANY = [
    { label: "About Us", href: "/about" },
    { label: "Careers", href: "#" },
    { label: "Press Kit", href: "#" },
    { label: "Blog", href: "#" },
];

const FOOTER_LEGAL = [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Policy", href: "#" },
    { label: "Support Center", href: "#" },
];

function StarRow({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`${className} fill-[#F5A623] text-[#F5A623]`} />
            ))}
        </div>
    );
}

const CARD_HOVER =
    "transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-300/40";

export default function TestimonialsPage() {
    return (
        <div className="min-h-screen overflow-x-clip bg-[#F6F9FB] font-[family-name:var(--font-display)] text-[#0D1B2A]">
            <Navbar active="Testimonials" />

            {/* ── HERO ── */}
            <section className="relative overflow-hidden bg-[#EEF3F8] px-5 py-16 md:px-6 md:py-20 lg:py-24">
                <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[#2B6CB0]/10 blur-[120px]" />
                <div className="relative mx-auto max-w-2xl text-center">
                    <HeroReveal delay={100}>
                        <span className="inline-block rounded-full bg-[#2B6CB0]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#2B6CB0] md:text-xs">
                            Client Success
                        </span>
                    </HeroReveal>
                    <HeroReveal delay={200}>
                        <h1 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
                            Trusted by Leaders in Global Education
                        </h1>
                    </HeroReveal>
                    <HeroReveal delay={350}>
                        <p className="mt-4 text-base leading-relaxed text-slate-600 md:mt-6 md:text-lg">
                            See how principals and IT directors are transforming their digital campuses
                            with EduOS management systems.
                        </p>
                    </HeroReveal>
                </div>
            </section>

            {/* ── FEATURED TESTIMONIAL + STATS + GRID ── */}
            <section className="px-5 py-16 md:px-6 md:py-20">
                <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:gap-6">
                    {/* Featured quote + stats */}
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
                        <AnimateOnScroll delay={0} className="lg:col-span-8">
                            <div
                                className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:p-10 ${CARD_HOVER}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-5 top-0 select-none text-[120px] font-black leading-none text-slate-100 lg:right-6 lg:text-[150px]"
                                >
                                    &rdquo;
                                </span>
                                <div className="relative">
                                    <StarRow className="h-5 w-5" />
                                    <p className="mt-5 text-lg font-medium italic leading-relaxed text-[#0D1B2A] lg:text-xl">
                                        &ldquo;The transition to EduOS was the single best decision for our
                                        administrative workflow in a decade. Data accuracy has improved by 40%,
                                        and our teachers finally have a tool that supports, rather than hinders,
                                        their daily tasks.&rdquo;
                                    </p>
                                    <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-6">
                                        <span className="relative block h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
                                            <Image
                                                src="/testimonials/sarah-jenkins.jpg"
                                                alt="Dr. Sarah Jenkins"
                                                fill
                                                sizes="48px"
                                                className="object-cover"
                                            />
                                        </span>
                                        <div>
                                            <p className="text-base font-bold text-[#0D1B2A]">Dr. Sarah Jenkins</p>
                                            <p className="text-sm font-medium text-[#2B6CB0]">
                                                Principal, Westview International Academy
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll delay={150} className="lg:col-span-4">
                            <div
                                className={`flex h-full flex-col justify-center gap-7 rounded-2xl bg-[#0D1B2A] p-6 sm:p-7 lg:p-8 ${CARD_HOVER}`}
                            >
                                {STATS.map((stat) => (
                                    <div key={stat.label}>
                                        <p className="text-4xl font-extrabold text-white lg:text-5xl">{stat.value}</p>
                                        <p className="mt-1.5 text-sm text-[#B9CBDF]">{stat.label}</p>
                                    </div>
                                ))}
                            </div>
                        </AnimateOnScroll>
                    </div>

                    {/* 3-column testimonial grid */}
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                        {TESTIMONIALS.map((t, i) => (
                            <AnimateOnScroll key={t.name} delay={i * 150}>
                                <div className={`h-full rounded-2xl border border-slate-200 bg-white p-6 ${CARD_HOVER}`}>
                                    <StarRow />
                                    <p className="mt-4 text-sm italic leading-relaxed text-slate-700 lg:text-base">
                                        &ldquo;{t.quote}&rdquo;
                                    </p>
                                    <div className="mt-5 flex items-center gap-3">
                                        <span className="relative block h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
                                            <Image src={t.avatar} alt={t.name} fill sizes="40px" className="object-cover" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-bold text-[#0D1B2A]">{t.name}</p>
                                            <p className="text-xs font-medium text-[#2B6CB0]">{t.role}</p>
                                        </div>
                                    </div>
                                </div>
                            </AnimateOnScroll>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ── */}
            <section id="cta" className="px-5 pb-16 md:px-6 md:pb-24">
                <AnimateOnScroll from="scale" className="mx-auto max-w-7xl">
                    <div className="relative overflow-hidden rounded-3xl bg-[#DEE9FB] px-6 py-14 text-center md:px-12 md:py-20">
                        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#2B6CB0]/10" />
                        <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-[#2B6CB0]/10" />
                        <div className="relative mx-auto max-w-2xl">
                            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-[#0D1B2A] sm:text-4xl lg:text-5xl">
                                Ready to Modernize Your Institution?
                            </h2>
                            <p className="mt-4 text-sm text-slate-600 md:text-lg">
                                Join 500+ schools that have revolutionized their administrative processes
                                and improved student outcomes with EduOS.
                            </p>
                            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                                <a
                                    href="mailto:balaji.p2prhel@gmail.com?subject=Request%20a%20Demo"
                                    className="w-full rounded-full bg-[#0D1B2A] px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0D1B2A]/15 transition-all duration-300 hover:scale-[1.03] hover:bg-[#16283b] active:scale-[0.97] sm:w-auto"
                                >
                                    Request a Demo
                                </a>
                                <a
                                    href="#"
                                    className="w-full rounded-full border border-[#2B6CB0]/40 bg-white px-8 py-3 text-sm font-semibold text-[#2B6CB0] transition-all duration-300 hover:scale-[1.03] hover:bg-[#EEF3F8] active:scale-[0.97] sm:w-auto"
                                >
                                    View Pricing
                                </a>
                            </div>
                            <div className="mt-8 flex items-center justify-center gap-3">
                                <div className="flex -space-x-2">
                                    {JOIN_AVATARS.map((src, i) => (
                                        <span
                                            key={src}
                                            className="relative block h-8 w-8 overflow-hidden rounded-full border-2 border-white bg-slate-200"
                                        >
                                            <Image src={src} alt="" fill sizes="32px" className="object-cover" />
                                        </span>
                                    ))}
                                </div>
                                <p className="text-sm font-semibold text-[#2B6CB0]">Join 500+ Schools</p>
                            </div>
                        </div>
                    </div>
                </AnimateOnScroll>
            </section>

            {/* ── FOOTER (Testimonials-specific — not the shared footer) ── */}
            <footer className="bg-[#0D1B2A] px-5 pb-8 pt-14 md:px-6 md:pt-16">
                <div className="mx-auto max-w-7xl">
                    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <LogoMark className="h-7 w-7" />
                                <span className="text-lg font-bold text-white">EduOS</span>
                            </div>
                            <p className="mt-4 text-sm leading-relaxed text-[#8FA3BC]">
                                Empowering educational leaders with structured information management
                                systems for the next generation of learners.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-[#F5A623]">Solutions</h4>
                            <ul className="mt-4 space-y-3">
                                {FOOTER_SOLUTIONS.map((label) => (
                                    <li key={label}>
                                        <a href="#" className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                                            {label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-[#F5A623]">Company</h4>
                            <ul className="mt-4 space-y-3">
                                {FOOTER_COMPANY.map((link) => (
                                    <li key={link.label}>
                                        <a href={link.href} className="text-sm text-[#8FA3BC] transition-colors hover:text-white">
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-[#F5A623]">Contact</h4>
                            <ul className="mt-4 space-y-3">
                                <li>
                                    <a
                                        href="mailto:hello@eduos.tech"
                                        className="flex items-center gap-2 text-sm text-[#8FA3BC] transition-colors hover:text-white"
                                    >
                                        <Mail className="h-4 w-4 flex-shrink-0" />
                                        hello@eduos.tech
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="tel:+18883386799"
                                        className="flex items-center gap-2 text-sm text-[#8FA3BC] transition-colors hover:text-white"
                                    >
                                        <Phone className="h-4 w-4 flex-shrink-0" />
                                        +1 (888) EDU-OS-99
                                    </a>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-[#8FA3BC]">
                                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                    500 Campus Way, Silicon Valley, CA
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#8FA3BC] sm:flex-row">
                        <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
                        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                            {FOOTER_LEGAL.map((link) => (
                                <a key={link.label} href={link.href} className="transition-colors hover:text-white">
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
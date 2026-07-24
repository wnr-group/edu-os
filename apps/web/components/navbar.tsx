"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, Sparkles } from "lucide-react";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Intelligence Framework", href: "/ai-intelligence", highlight: true },
  { label: "Features", href: "/features" },
  { label: "How EduOS Works", href: "/how-it-works" },
  { label: "Contact Us", href: "/contact" },
];

function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-lg ${className}`}>
      <Image
        src="/logo-mark.png"
        alt="EduOS logo"
        fill
        sizes="40px"
        className="object-contain"
      />
    </span>
  );
}

export function Navbar({ active = "Home" }: { active?: string }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-shadow duration-300">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight text-[#073571]">EduOS</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={
                link.label === active
                  ? "flex items-center gap-1 border-b-2 border-[#72A9E2] pb-1 text-sm font-semibold text-[#72A9E2]"
                  : `relative flex items-center gap-1.5 text-sm transition-colors duration-300 after:absolute after:-bottom-1 after:left-0 after:h-[1.5px] after:w-0 after:bg-[#72A9E2] after:transition-all after:duration-300 hover:after:w-full ${
                      link.highlight
                        ? "font-semibold text-[#A87D2E] hover:text-[#8a6a2f]"
                        : "text-slate-600 hover:text-[#72A9E2]"
                    }`
              }
            >
              {link.highlight && <Sparkles className="h-3.5 w-3.5" />}
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop right actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="/login"
            className="text-sm font-semibold text-[#72A9E2] transition-colors hover:text-[#4A82BE]"
          >
            Login
          </a>
          <a
            href="/contact"
            className="rounded-full bg-[#073571] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.03] hover:bg-[#052247] active:scale-[0.97]"
          >
            Book Demo
          </a>
        </div>

        {/* Mobile / tablet: hamburger drawer, no JS required */}
        <div className="flex items-center gap-2 lg:hidden">
          <a
            href="/contact"
            className="rounded-full bg-[#073571] px-4 py-2 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#052247]"
          >
            Book Demo
          </a>
          <details className="group relative">
            <summary className="grid h-9 w-9 list-none cursor-pointer place-items-center rounded-full border border-slate-200 text-[#073571] transition-colors duration-300 [&::-webkit-details-marker]:hidden">
              <Menu className="h-5 w-5 transition-transform duration-300 group-open:hidden" />
              <X className="hidden h-5 w-5 transition-transform duration-300 group-open:block" />
            </summary>

            <div className="absolute right-0 top-full mt-3 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-[fade-in-up_200ms_ease-out]">
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={
                      link.label === active
                        ? "flex items-center gap-1.5 rounded-lg bg-[#E8F1FC] px-3 py-2 text-sm font-semibold text-[#72A9E2]"
                        : `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50 ${
                            link.highlight ? "font-semibold text-[#A87D2E]" : "text-slate-600 hover:text-[#72A9E2]"
                          }`
                    }
                  >
                    {link.highlight && <Sparkles className="h-3.5 w-3.5" />}
                    {link.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <a
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-[#72A9E2] transition-colors hover:bg-slate-50"
                >
                  Login
                </a>
              </div>
            </div>
          </details>
        </div>
      </div>
    </nav>
  );
}
import Image from "next/image";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Testimonials", href: "/testimonials" },
  { label: "Contact Us", href: "/contact" },
];

function LogoMark({ className = "h-11 w-11" }: { className?: string }) {
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

export function Navbar({ active = "Home" }: { active?: string }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight text-[#0D1B2A]">EduOS</span>
        </div>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={
                link.label === active
                  ? "border-b-2 border-[#2B6CB0] pb-1 text-sm font-semibold text-[#2B6CB0]"
                  : "relative text-sm text-slate-600 transition-colors duration-300 hover:text-[#2B6CB0] after:absolute after:-bottom-1 after:left-0 after:h-[1.5px] after:w-0 after:bg-[#2B6CB0] after:transition-all after:duration-300 hover:after:w-full"
              }
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop right actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="/login"
            className="text-sm font-semibold text-[#2B6CB0] transition-colors hover:text-[#1d4e80]"
          >
            Login
          </a>
          <a
            href="#cta"
            className="rounded-full bg-[#0D1B2A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#16283b] hover:scale-[1.03] active:scale-[0.97]"
          >
            Get Started
          </a>
        </div>

        {/* Mobile / tablet: hamburger drawer, no JS required */}
        <div className="flex items-center gap-2 lg:hidden">
          <a
            href="#cta"
            className="rounded-full bg-[#0D1B2A] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#16283b]"
          >
            Get Started
          </a>
          <details className="group relative">
            <summary className="grid h-9 w-9 list-none cursor-pointer place-items-center rounded-full border border-slate-200 text-[#0D1B2A] [&::-webkit-details-marker]:hidden">
              <Menu className="h-5 w-5 group-open:hidden" />
              <X className="hidden h-5 w-5 group-open:block" />
            </summary>

            <div className="absolute right-0 top-full mt-3 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-[fade-in-up_200ms_ease-out]">
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className={
                      link.label === active
                        ? "rounded-lg bg-[#EAF1F8] px-3 py-2 text-sm font-semibold text-[#2B6CB0]"
                        : "rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#2B6CB0]"
                    }
                  >
                    {link.label}
                  </a>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <a
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-[#2B6CB0] transition-colors hover:bg-slate-50"
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
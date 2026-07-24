import Image from "next/image";
import Link from "next/link";
import { Globe, Mail, MessageCircle, Rss, GraduationCap } from "lucide-react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";

const CONTACT = {
  email: "admin@wnradvisory.com",
  whatsapp: "https://wa.me/919789471572",
  linkedin: "https://www.linkedin.com/company/wnrgroup",
  instagram: "https://www.instagram.com/wnr__group",
};

function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`grid flex-shrink-0 place-items-center rounded-lg bg-[#0C2A57] ${className}`}>
      <GraduationCap className="h-[60%] w-[60%] text-[#72A9E2]" />
    </span>
  );
}

// lucide-react no longer ships brand/social icons (Twitter, LinkedIn, etc.),
// so these are small local placeholders matching the h-4 w-4 icon sizing
// used across the footer.
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

function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069Zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324Zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
    </svg>
  );
}

export type FooterVariant =
  | "home"
  | "about"
  | "how-it-works"
  | "contact"
  | "legal";

type FooterContentMap = Record<
  Exclude<FooterVariant, "legal">,
  {
    tagline: string;
    columns: {
      heading: string;
      links: {
        label: string;
        href: string;
      }[];
    }[];
  }
>;

// NOTE: each variant intentionally preserves the distinct column set each
// page already shipped with (per-page footer content, not a single reused
// footer) — only the visual chrome is now shared.
const FOOTER_CONTENT: FooterContentMap = {
  home: {
    tagline:
      "EduOS is an AI-powered Student Intelligence Platform helping schools understand every learner, not just administer them.",
    columns: [
      {
        heading: "Product",
        links: [
          { label: "Features", href: "/features" },
          { label: "AI Intelligence", href: "/ai-intelligence" },
          { label: "Pricing", href: "#" },
          { label: "Security", href: "#" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "How EduOS Works", href: "/how-it-works" },
          { label: "Contact Us", href: "/contact" },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Documentation", href: "#" },
          { label: "Blog", href: "#" },
          { label: "Support Center", href: "#" },
          { label: "Webinars", href: "#" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "#" },
          { label: "Cookie Policy", href: "#" },
        ],
      },
    ],
  },
  about: {
    tagline: "The intelligence layer for the next century of learning: enterprise-grade, human-centred.",
    columns: [
      {
        heading: "Product",
        links: [
          { label: "Features", href: "/features" },
          { label: "AI Intelligence", href: "/ai-intelligence" },
          { label: "Pricing", href: "#" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Newsroom", href: "#" },
          { label: "Careers", href: "#" },
          { label: "Partners", href: "#" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "#" },
          { label: "Cookie Policy", href: "#" },
          { label: "Support Center", href: "#" },
        ],
      },
    ],
  },
  "how-it-works": {
    tagline: "Empowering institutions with modern, secure, and intuitive student intelligence since 2018.",
    columns: [
      {
        heading: "Product",
        links: [
          { label: "Features", href: "/features" },
          { label: "AI Intelligence", href: "/ai-intelligence" },
          { label: "Pricing", href: "#" },
          { label: "Security", href: "#" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Blog", href: "#" },
          { label: "Careers", href: "#" },
          { label: "Contact", href: "/contact" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "#" },
          { label: "Cookie Policy", href: "#" },
          { label: "Support Center", href: "#" },
        ],
      },
    ],
  },
  contact: {
    tagline: "Ready to build every student's success story? We'd love to hear from your school.",
    columns: [
      {
        heading: "Product",
        links: [
          { label: "Platform", href: "/features" },
          { label: "AI Intelligence", href: "/ai-intelligence" },
          { label: "Enterprise", href: "#" },
          { label: "Security", href: "#" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About Us", href: "/about" },
          { label: "Careers", href: "#" },
          { label: "Blog", href: "#" },
          { label: "Contact Us", href: "/contact" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "#" },
          { label: "Cookie Policy", href: "#" },
          { label: "Support Center", href: "#" },
        ],
      },
    ],
  },
};

export function Footer({ variant = "home" }: { variant?: FooterVariant }) {
  if (variant === "legal") {
    return (
      <footer className="border-t border-white/10 bg-[#073571] px-5 py-8 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-[#AFC6E8] md:flex-row">
          <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/" className="transition-colors hover:text-white">
              &larr; Back to EduOS.com
            </Link>
            <div className="flex items-center gap-4">
              <a
                href={CONTACT.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
              >
                <LinkedInIcon />
              </a>
              <a
                href={CONTACT.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
              >
                <InstagramIcon />
              </a>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  const content = FOOTER_CONTENT[variant];
  const showWhatsappBottomRow = variant === "home" || variant === "contact";
  const showLegacySocialColumn = variant === "about";
  const showX = variant === "how-it-works";

  return (
    <footer className="bg-[#073571] px-5 pb-8 pt-14 md:px-6 md:pt-16">
      <div className="mx-auto max-w-7xl">
        <AnimateOnScroll delay={0}>
          <div
            className={`grid grid-cols-1 gap-10 sm:grid-cols-2 ${
              content.columns.length >= 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"
            }`}
          >
            <div>
              <Link href="/" className="flex items-center gap-2">
                <LogoMark />
                <span className="text-base font-bold text-white">EduOS</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#AFC6E8]">{content.tagline}</p>
              {showLegacySocialColumn && (
                <div className="mt-5 flex items-center gap-3">
                  <a
                    href={CONTACT.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-[#AFC6E8] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <a
                    href="/rss.xml"
                    aria-label="RSS feed"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-[#AFC6E8] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
                  >
                    <Rss className="h-4 w-4" />
                  </a>
                </div>
              )}
            </div>

            {content.columns.map((col) => (
              <div key={col.heading}>
                <h4 className="text-sm font-bold text-white">{col.heading}</h4>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-[#AFC6E8] transition-colors hover:text-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </AnimateOnScroll>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#AFC6E8] md:flex-row">
          <p>© {new Date().getFullYear()} EduOS Management Systems. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a
              href="/"
              aria-label="Website"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            >
              <Globe className="h-4 w-4" />
            </a>
            <a
              href={`mailto:${CONTACT.email}`}
              aria-label="Email"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            >
              <Mail className="h-4 w-4" />
            </a>
            {showWhatsappBottomRow && (
              <a
                href={CONTACT.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
            <a
              href={CONTACT.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            >
              <LinkedInIcon />
            </a>
            <a
              href={CONTACT.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
            >
              <InstagramIcon />
            </a>
            {showX && (
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="transition-all duration-300 hover:-translate-y-0.5 hover:text-white"
              >
                <XIcon />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
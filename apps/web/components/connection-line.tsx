import Image from "next/image";

interface ConnectionLineProps {
  /** Accessible label for the left-hand logo (e.g. "WnR Advisory"). */
  from: string;
  /** Accessible label for the right-hand logo (e.g. "EduOS"). */
  to: string;
  className?: string;
}

/**
 * Two logo badges joined by a line with a traveling highlight — a
 * lightweight visual for "X is connected to / part of Y" relationships.
 * NOTE: both sides currently use the same placeholder mark
 * (/public/logo-mark.png) — swap in the final WnR and EduOS logo assets
 * once they're available.
 */
export function ConnectionLine({ from, to, className }: ConnectionLineProps) {
  return (
    <div className={`flex items-center gap-3 sm:gap-4 ${className ?? ""}`}>
      {/* WnR — no fill behind the mark, just the glowing outline */}
      <span
        className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-white/20 shadow-[0_0_16px_-4px_rgba(255,255,255,0.25)] sm:h-16 sm:w-16"
        title={from}
      >
        <Image src="/WnR-logo.jpg" alt={from} fill sizes="64px" className="object-cover" />
      </span>

      <div className="relative h-px min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-white/15">
        <span className="absolute inset-y-0 w-10 animate-dash-travel bg-gradient-to-r from-transparent via-[#C3983C] to-transparent" />
      </div>

      {/* EduOS — grayish-white fill so the mark stays visible against the navy card
          (its current colorway is too close to the card background otherwise) */}
      <span
        className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-[#C3983C]/40 bg-slate-100 shadow-[0_0_16px_-4px_rgba(195,152,60,0.4)] sm:h-16 sm:w-16"
        title={to}
      >
        <Image src="/logo-mark.png" alt={to} fill sizes="64px" className="object-cover" />
      </span>
    </div>
  );
}
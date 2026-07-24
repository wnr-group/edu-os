import { cn } from "@/lib/utils";

// Explicit static class map — Tailwind's JIT scanner needs literal class
// strings present in source, so this can't be built with a template literal.
const ANIMATION_CLASS: Record<"float" | "float-slow" | "drift" | "glow-pulse", string> = {
  float: "animate-float",
  "float-slow": "animate-float-slow",
  drift: "animate-drift",
  "glow-pulse": "animate-glow-pulse",
};

interface FloatingOrbProps {
  /** Positioning + size + color, e.g. "-left-20 top-10 h-64 w-64 bg-[#72A9E2]/10" */
  className?: string;
  animation?: keyof typeof ANIMATION_CLASS;
  delayMs?: number;
  blurPx?: number;
}

/**
 * A single ambient, blurred, softly-animated circle used as layered
 * background decoration. Centralizes the pattern that was previously
 * duplicated inline across every section (absolute + blur + animate-drift).
 */
export function FloatingOrb({
  className,
  animation = "drift",
  delayMs = 0,
  blurPx = 100,
}: FloatingOrbProps) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full", ANIMATION_CLASS[animation], className)}
      style={{ animationDelay: `${delayMs}ms`, filter: `blur(${blurPx}px)` }}
    />
  );
}
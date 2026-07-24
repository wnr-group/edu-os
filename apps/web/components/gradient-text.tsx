import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  /** CSS gradient stops, left to right. */
  colors?: string[];
}

/**
 * Slowly-shifting gradient fill for headline text or focal numerals.
 * Pure CSS (background-position animation) — no JS needed.
 */
export function GradientText({
  children,
  className,
  colors = ["#AFC6E8", "#C3983C", "#72A9E2", "#C3983C", "#AFC6E8"],
}: GradientTextProps) {
  return (
    <span
      className={cn("animate-gradient-x bg-[length:250%_auto] bg-clip-text text-transparent", className)}
      style={{ backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})` }}
    >
      {children}
    </span>
  );
}
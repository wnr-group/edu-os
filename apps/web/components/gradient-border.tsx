import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GradientBorderProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  borderRadiusClass?: string;
  /** Set to false for a static gradient layer — e.g. when reused as a still background decoration instead of an animated ring. */
  spin?: boolean;
  /** Optional blur applied to the gradient layer itself, useful when reused as a soft offset backdrop. */
  blurPx?: number;
}

/**
 * Wraps content in a conic-gradient border. By default it slowly rotates
 * (used for the page's most important spotlight panel); set `spin={false}`
 * to reuse it as a still, layered background decoration instead.
 */
export function GradientBorder({
  children,
  className,
  innerClassName,
  borderRadiusClass = "rounded-3xl",
  spin = true,
  blurPx = 0,
}: GradientBorderProps) {
  return (
    <div className={cn("relative p-[2px]", borderRadiusClass, className)}>
      <div
        aria-hidden
        className={cn("absolute inset-0 opacity-80", spin && "animate-spin-slow", borderRadiusClass)}
        style={{
          background: "conic-gradient(from 0deg, #72A9E2, #C3983C, #073571, #72A9E2)",
          filter: blurPx ? `blur(${blurPx}px)` : undefined,
        }}
      />
      <div className={cn("relative", borderRadiusClass, innerClassName)}>{children}</div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

interface AnimatedBarProps {
  /** Final size as a percentage (0–100) of the bar's track. */
  targetPercent: number;
  orientation?: "horizontal" | "vertical";
  delay?: number;
  duration?: number;
  /** Classes for the filled bar itself (color, rounding, flex sizing, etc). */
  className?: string;
  /** Extra inline styles merged in, e.g. per-bar opacity. */
  style?: CSSProperties;
}

// Scroll-triggered bar/progress fill. Starts at 0 and grows to targetPercent
// once its track enters the viewport, instead of rendering pre-filled.
export function AnimatedBar({
  targetPercent,
  orientation = "horizontal",
  delay = 0,
  duration = 1000,
  className = "",
  style = {},
}: AnimatedBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setGrown(true);
      return;
    }

    // Observe the parent track, not this element itself. On first paint this
    // element already has width/height 0 (grown starts false), and a
    // zero-area target is unreliable for IntersectionObserver — browsers
    // commonly report isIntersecting: false for a degenerate rect regardless
    // of its actual position, so the callback that flips `grown` to true
    // never fires and the bar stays stuck at 0%. The parent track always has
    // real, stable dimensions, so observing it fixes triggering reliably.
    const target = el.parentElement ?? el;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGrown(true);
          observer.unobserve(target);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const sizeStyle: CSSProperties =
    orientation === "horizontal"
      ? { width: grown ? `${targetPercent}%` : "0%" }
      : { height: grown ? `${targetPercent}%` : "0%" };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...sizeStyle,
        ...style,
        transitionProperty: orientation === "horizontal" ? "width" : "height",
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${delay}ms`,
      }}
    />
  );
}
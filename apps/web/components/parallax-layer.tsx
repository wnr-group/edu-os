"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ParallaxLayerProps {
  children: ReactNode;
  className?: string;
  /** Positive moves down slower than scroll, negative moves opposite direction. */
  speed?: number;
}

/**
 * Subtle scroll-linked vertical drift, used sparingly on decorative
 * background layers (never on primary content) for a sense of depth.
 * Uses rAF-throttled scroll listener; skipped under prefers-reduced-motion.
 */
export function ParallaxLayer({ children, className, speed = 0.12 }: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;
    function update() {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const offset = (rect.top - window.innerHeight / 2) * speed;
      node.style.transform = `translateY(${offset}px)`;
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
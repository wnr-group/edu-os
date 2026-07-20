"use client";

import { useEffect, useState, type ReactNode } from "react";

interface HeroRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function HeroReveal({ children, delay = 0, className = "" }: HeroRevealProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={className}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(20px)",
        transition: `opacity 700ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms, transform 700ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function HeroFloat({ children, delay = 0, className = "" }: HeroRevealProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={className}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(40px) scale(0.96)",
        transition: `opacity 900ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms, transform 900ms cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
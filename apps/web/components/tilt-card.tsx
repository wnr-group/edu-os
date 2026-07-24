"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees applied on each axis. */
  maxTilt?: number;
  /** Show a radial spotlight that follows the cursor. */
  glow?: boolean;
  glowColor?: string;
  scale?: number;
}

/**
 * Wraps content in a subtle 3D tilt that follows the cursor, plus an
 * optional mouse-follow spotlight. Used for premium "product showcase"
 * cards (illustration panels, the WnR glass card, KPI-style highlights).
 * Respects prefers-reduced-motion by disabling the transform entirely.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 7,
  glow = true,
  glowColor = "rgba(255,255,255,0.18)",
  scale = 1.015,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - py) * maxTilt * 2;

    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)";
    setHovering(false);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleMouseLeave}
      className={cn("relative transition-transform duration-300 ease-out will-change-transform", className)}
      style={{ transformStyle: "preserve-3d" }}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: hovering ? 1 : 0,
            background: `radial-gradient(circle at var(--mx, 50%) var(--my, 50%), ${glowColor}, transparent 45%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}
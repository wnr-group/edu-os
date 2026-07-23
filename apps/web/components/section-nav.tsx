"use client";

import { useEffect, useRef, useState } from "react";

export interface SectionNavItem {
  id: string;
  label: string;
}

export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [visible, setVisible] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  // Reveal the sub-nav once the hero has scrolled past.
  useEffect(() => {
    const heroEl = document.getElementById("hero");
    if (!heroEl) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(heroEl);
    return () => observer.disconnect();
  }, []);

  // Track which section is currently in view to highlight the matching pill.
  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibleEntry) setActiveId(visibleEntry.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the active pill scrolled into view within the horizontal rail (mobile).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const activeEl = rail.querySelector<HTMLElement>(`[data-id="${activeId}"]`);
    activeEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  return (
    <div
      className={`sticky top-[73px] z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-all duration-500 ease-out ${visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
        }`}
    >
      <div
        ref={railRef}
        className="mx-auto flex w-full justify-center overflow-x-auto px-5 py-2.5 [scrollbar-width:none] md:px-6 md:py-3 [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-fit items-center gap-1.5">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                data-id={item.id}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-300 md:text-[13px] ${isActive
                    ? "bg-[#073571] text-white shadow-sm"
                    : "text-slate-500 hover:bg-[#EEF4FB] hover:text-[#073571]"
                  }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
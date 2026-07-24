"use client";

import type { ReactNode } from "react";
import { AnimateOnScroll } from "@/components/animate-on-scroll";
import { AnimatedBar } from "@/components/animated-bar";

export interface StoryMilestone {
  /** Pass a pre-rendered icon element, e.g. `<Layers className="h-4 w-4 sm:h-5 sm:w-5 text-[#72A9E2]" />`.
   *  Must be a rendered ReactNode (not a bare component reference) so it can
   *  cross the Server → Client Component boundary safely. */
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}

/**
 * Alternating, scroll-revealed narrative timeline with a connector line
 * that animates in as the section enters view. Mirrors the layout pattern
 * already used by the roadmap timeline (mobile: single column with an
 * absolute badge; desktop: 3-column grid alternating left/right).
 */
export function StoryTimeline({ milestones }: { milestones: StoryMilestone[] }) {
  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Static base track */}
      <div className="absolute left-[19px] top-0 h-full w-px bg-slate-200 sm:left-1/2 sm:-translate-x-1/2" />
      {/* Animated fill that grows down the track as the section is revealed */}
      <div className="absolute left-[19px] top-0 h-full w-px sm:left-1/2 sm:-translate-x-1/2">
        <AnimatedBar orientation="vertical" targetPercent={100} duration={1400} className="w-px bg-[#72A9E2]" />
      </div>

      <div className="relative flex flex-col gap-10 sm:gap-0">
        {milestones.map((milestone, i) => {
          const isLeft = i % 2 === 0;
          const content = (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#72A9E2]">{milestone.eyebrow}</p>
              <h3 className="mt-1 text-lg font-bold text-[#073571] sm:text-xl">{milestone.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{milestone.description}</p>
            </>
          );
          return (
            <AnimateOnScroll key={milestone.title} delay={i * 100} from={isLeft ? "left" : "right"}>
              {/* Mobile */}
              <div className="relative pl-14 sm:hidden">
                <span className="absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full bg-[#073571] shadow-md ring-4 ring-[#EEF4FB]">
                  {milestone.icon}
                </span>
                {content}
              </div>

              {/* Tablet/Desktop */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6 sm:py-7">
                <div className={isLeft ? "text-right" : ""}>{isLeft && content}</div>
                <span className="relative z-10 grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-[#073571] shadow-md shadow-slate-300/40 ring-4 ring-[#EEF4FB] transition-transform duration-300 hover:scale-110">
                  {milestone.icon}
                </span>
                <div>{!isLeft && content}</div>
              </div>
            </AnimateOnScroll>
          );
        })}
      </div>
    </div>
  );
}
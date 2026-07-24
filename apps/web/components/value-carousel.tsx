"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CarouselItem {
    /** Pass a pre-rendered icon element, e.g. `<Heart className="h-6 w-6 text-[#72A9E2]" />`. */
    icon: ReactNode;
    title: string;
    description: string;
}
interface ValueCarouselProps {
    items: CarouselItem[];
    autoPlayMs?: number;
    /** How long to stay paused after a manual interaction before resuming. */
    resumeAfterMs?: number;
}

/**
 * Premium auto-rotating showcase carousel: active card centered and full
 * scale, neighbors partially visible and scaled down, with prev/next
 * buttons and dot navigation. Autoplay pauses on hover and on manual
 * navigation, then resumes after a short delay. Respects
 * prefers-reduced-motion by disabling autoplay entirely.
 */
export function ValueCarousel({ items, autoPlayMs = 4500, resumeAfterMs = 6000 }: ValueCarouselProps) {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const resumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const count = items.length;

    const goTo = useCallback((index: number) => setActive(((index % count) + count) % count), [count]);

    useEffect(() => {
        if (paused) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const id = setInterval(() => setActive((i) => (i + 1) % count), autoPlayMs);
        return () => clearInterval(id);
    }, [paused, autoPlayMs, count]);

    useEffect(() => {
        return () => {
            if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
        };
    }, []);

    function pauseThenResume() {
        setPaused(true);
        if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
        resumeTimeout.current = setTimeout(() => setPaused(false), resumeAfterMs);
    }

    function handlePrev() {
        goTo(active - 1);
        pauseThenResume();
    }
    function handleNext() {
        goTo(active + 1);
        pauseThenResume();
    }
    function handleDot(i: number) {
        goTo(i);
        pauseThenResume();
    }

    return (
        <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            <div className="relative mx-auto h-[300px] max-w-3xl">
                {items.map((item, i) => {
                    let offset = i - active;
                    if (offset > count / 2) offset -= count;
                    if (offset < -count / 2) offset += count;

                    const isActive = offset === 0;
                    const abs = Math.abs(offset);
                    const translate = offset * 46;
                    const scale = isActive ? 1 : abs === 1 ? 0.85 : 0.72;
                    const opacity = abs > 1 ? 0 : isActive ? 1 : 0.4;

                    return (
                        <div
                            key={item.title}
                            aria-hidden={!isActive}
                            className="absolute inset-0 flex items-center justify-center px-4 transition-all duration-500 ease-out"
                            style={{
                                transform: `translateX(${translate}%) scale(${scale})`,
                                opacity,
                                zIndex: 10 - abs,
                                pointerEvents: isActive ? "auto" : "none",
                            }}
                        >
                            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-300/40 transition-shadow duration-300 hover:shadow-2xl sm:p-8">
                
                                <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#72A9E2]/10">
                                    {item.icon}
                                </span>
                                <h3 className="mt-5 text-xl font-bold text-[#073571]">{item.title}</h3>
                                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 flex items-center justify-center gap-6">
                <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous value"
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-[#073571] transition-all duration-200 hover:scale-110 hover:border-[#72A9E2] hover:text-[#72A9E2] active:scale-95"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-2">
                    {items.map((item, i) => (
                        <button
                            key={item.title}
                            type="button"
                            onClick={() => handleDot(i)}
                            aria-label={`Go to ${item.title}`}
                            className={cn(
                                "h-2 rounded-full transition-all duration-300",
                                i === active ? "w-6 bg-[#073571]" : "w-2 bg-slate-300 hover:bg-slate-400"
                            )}
                        />
                    ))}
                </div>

                <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next value"
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-[#073571] transition-all duration-200 hover:scale-110 hover:border-[#72A9E2] hover:text-[#72A9E2] active:scale-95"
                >
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
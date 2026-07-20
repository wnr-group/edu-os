"use client";

import { cn } from "@/lib/utils";

export interface SectionOption {
  id: string;
  name: string;
  className: string;
  classOrder: number;
}

interface SectionSwitcherProps {
  sections: SectionOption[];
  activeSectionId: string | null;
  userRole: string;
  exitUrl?: string;
  /** "dark" (default) fits a dark sidebar/drawer background; "light" fits a white one. */
  variant?: "dark" | "light";
}

function getParentDomain(): string {
  const hostname = window.location.hostname;
  if (hostname.includes("lvh.me")) return ".lvh.me";
  if (hostname.includes("balajierp.com")) return ".balajierp.com";
  return "";
}

function setActiveSectionCookie(sectionId: string): void {
  const domain = getParentDomain();
  const maxAge = 60 * 60 * 8;
  document.cookie = `active_section=${sectionId}; path=/; domain=${domain}; max-age=${maxAge}; samesite=lax`;
}

function clearActiveSectionCookie(): void {
  const domain = getParentDomain();
  document.cookie = `active_section=; path=/; domain=${domain}; max-age=0; samesite=lax`;
}

export function SectionSwitcher({
  sections,
  activeSectionId,
  userRole,
  exitUrl,
  variant = "dark",
}: SectionSwitcherProps) {
  const isTeacher = userRole === "teacher";
  const isLight = variant === "light";

  if (sections.length === 0) {
    if (isTeacher) {
      return (
        <div className="px-4 py-3">
          <p className={cn("text-xs", isLight ? "text-slate-400" : "text-white/50")}>
            No sections assigned
          </p>
        </div>
      );
    }
    return null;
  }

  // Group sections by class, sorted by classOrder then className
  const classMap = new Map<string, { order: number; sections: SectionOption[] }>();
  for (const section of sections) {
    const existing = classMap.get(section.className);
    if (existing) {
      existing.sections.push(section);
    } else {
      classMap.set(section.className, {
        order: section.classOrder,
        sections: [section],
      });
    }
  }

  const sortedClasses = Array.from(classMap.entries()).sort(
    ([, a], [, b]) => a.order - b.order
  );

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sectionId = e.target.value;
    if (!sectionId) return;
    setActiveSectionCookie(sectionId);
    window.location.href = "/teacher/dashboard";
  }

  function handleExit() {
    clearActiveSectionCookie();
    window.location.href = exitUrl ?? "/";
  }

  const exitLabel = userRole === "principal" ? "← Back to Principal" : "← Back to Admin";

  return (
    <div className="px-3 py-2 space-y-1.5">
      <select
        value={activeSectionId ?? ""}
        onChange={handleChange}
        className={cn(
          "w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2",
          isLight
            ? "border-slate-200 bg-white text-slate-700 focus:ring-blue-200"
            : "border-white/20 bg-white/10 text-white focus:ring-white/30"
        )}
      >
        <option value="" disabled className={isLight ? undefined : "bg-gray-900 text-white"}>
          Select section…
        </option>
        {sortedClasses.map(([className, group]) => (
          <optgroup key={className} label={className}>
            {group.sections.map((section) => (
              <option
                key={section.id}
                value={section.id}
                className={isLight ? undefined : "bg-gray-900 text-white"}
              >
                {section.className} – Section {section.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {exitUrl && activeSectionId && !isTeacher && (
        <button
          type="button"
          onClick={handleExit}
          className={cn(
            "block min-h-[28px] w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
            isLight ? "text-amber-600 hover:bg-amber-50" : "text-amber-300 hover:bg-white/[0.08]"
          )}
        >
          {exitLabel}
        </button>
      )}
    </div>
  );
}

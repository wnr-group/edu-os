"use client";

import { usePathname } from "next/navigation";
import { ChevronRight, Bell } from "lucide-react";
import { CommandSearch } from "@/components/command-search";

interface TopBarProps {
  userName: string;
  userRole: string;
  brandColor?: string;
  yearSwitcher?: React.ReactNode;
  /** CommandSearch queries school-scoped data and defaults its route
   * prefix to /admin — neither applies outside a school context (e.g.
   * Platform Admin). Set to false there instead of showing a search box
   * that returns nothing meaningful. */
  showSearch?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  school_admin: "School Admin",
  teacher: "Teacher",
  principal: "Principal",
  super_admin: "Platform Admin",
};

export function formatSegment(segment: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(segment)) {
    return "Detail";
  }
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TopBar({ userName, userRole, brandColor, yearSwitcher, showSearch = true }: TopBarProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatarBg = brandColor ?? "#4f46e5";

  return (
    <header className="hidden h-14 shrink-0 items-center justify-between border-b bg-white px-6 lg:flex">
      <nav className="flex items-center gap-1.5 text-sm">
        {segments.length === 0 ? (
          <span className="font-semibold text-foreground">Dashboard</span>
        ) : (
          segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-border" />}
              <span
                className={
                  i === segments.length - 1
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground/60"
                }
              >
                {formatSegment(seg)}
              </span>
            </span>
          ))
        )}
      </nav>
      {yearSwitcher && (
        <div className="flex items-center">{yearSwitcher}</div>
      )}
      <div className="flex items-center gap-4">
        {showSearch && <CommandSearch userRole={userRole} />}
        <button className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Bell className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-none text-foreground">
              {userName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ROLE_LABELS[userRole] ?? userRole}
            </p>
          </div>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: avatarBg }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
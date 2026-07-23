"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, School, GraduationCap, Users, BookOpen,
  Calendar, ClipboardList, DollarSign, Megaphone, Settings,
  Clock, FileText, MessageSquare, UserCheck,
  Building2, BarChart3, Shield, Upload, LogOut, Image, Tag,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Schools: Building2,
  Classes: School,
  Subjects: BookOpen,
  Teachers: Users,
  Students: GraduationCap,
  Timetable: Clock,
  Academics: Calendar,
  Syllabus: Upload,
  Fees: DollarSign,
  "Fee Types": Tag,
  Announcements: Megaphone,
  Settings: Settings,
  Reports: BarChart3,
  "Report Cards": FileText,
  Discipline: Shield,
  Attendance: UserCheck,
  Homework: ClipboardList,
  Results: FileText,
  Feedback: MessageSquare,
  Gallery: Image,
};

export interface NavItem {
  label: string;
  href: string;
}

interface SidebarProps {
  title: string;
  /** Flat nav list — one item per page, each with its own icon. */
  items?: NavItem[];
  brandColor?: string; // hex color from school's primary_color
  userName?: string;
  userRole?: string;
  /** Shown in the avatar dropdown when the current role has a Settings page. */
  settingsHref?: string;
  sectionSwitcher?: React.ReactNode;
}

export const ROLE_LABELS: Record<string, string> = {
  school_admin: "School Admin",
  teacher: "Teacher",
  principal: "Principal",
  super_admin: "Platform Admin",
};

/**
 * Darken a hex color by mixing with black.
 * factor: 0 = original, 1 = pure black
 */
export function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

/**
 * Lighten a hex color by mixing with white.
 * factor: 0 = original, 1 = pure white
 */
export function lighten(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

const RLABEL =
  "whitespace-nowrap opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:translate-x-0";

/**
 * Collapsed 78px icon rail that expands to 240px on hover/focus to reveal
 * labels — the original navigation pattern, unchanged. Renders as an
 * absolutely-positioned overlay inside a fixed-width slot so expansion
 * never reflows the page content.
 *
 * Internal layout: brand pinned at top, the flat nav list fills and
 * scrolls the middle if it overflows, and the user/logout block is pinned
 * at the bottom — so the page itself never scrolls because of the
 * sidebar, only the nav region does when needed. No search here — the top
 * nav already has one; the mobile drawer (a separate component) keeps its
 * own, since mobile has no top nav.
 */
export function Sidebar({
  title,
  items,
  brandColor,
  userName,
  userRole,
  settingsHref,
  sectionSwitcher,
}: SidebarProps) {
  const pathname = usePathname();

  const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const accent = isValidHex ? brandColor : "#1d4ed8";
  const activeBg = isValidHex ? lighten(brandColor, 0.93) : "#eff4ff";

  return (
    <div className="relative hidden h-full w-[78px] shrink-0 lg:block">
      <aside
        className="group absolute inset-y-0 left-0 z-40 flex w-[78px] flex-col justify-between overflow-hidden rounded-[20px] bg-white py-3 shadow-[0_4px_20px_rgba(29,78,216,.09)] transition-[width,box-shadow] duration-200 ease-in-out hover:w-60 hover:shadow-[0_12px_40px_rgba(29,78,216,.18)] has-[:focus-visible]:w-60 has-[:focus-visible]:shadow-[0_12px_40px_rgba(29,78,216,.18)]"
      >
        <div className="flex shrink-0 flex-col">
          <div className="mx-[13px] mb-1 flex items-center gap-[13px] pb-1 pl-[5px] pr-[15px] transition-[padding-left] duration-200 ease-in-out group-hover:pl-[15px] group-has-[:focus-visible]:pl-[15px]">
            <div
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px]"
              style={{ backgroundColor: accent }}
            >
              <GraduationCap className="h-[16px] w-[16px] text-white" />
            </div>
            <span className={cn(RLABEL, "text-base font-bold tracking-[-0.3px] text-slate-900")}>
              {title}
            </span>
          </div>

         {sectionSwitcher && (
            <>
              <div className="mx-[13px] border-t border-[#eef0f3]" />
              <div className={cn(RLABEL, "shrink-0")}>{sectionSwitcher}</div>
            </>
          )}
          <div className="mx-[13px] border-t border-[#eef0f3]" />
        </div>

        {/* Only this region scrolls — the rail itself never grows past its
           parent's height, so the sidebar never causes page-level scroll. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-2">
          {(items ?? []).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = ICON_MAP[item.label] ?? LayoutDashboard;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative mx-[13px] flex h-[46px] items-center gap-[14px] rounded-[14px] px-[15px] transition-colors",
                  !isActive && "hover:bg-slate-50"
                )}
                style={{ backgroundColor: isActive ? activeBg : "transparent" }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-[11px] bottom-[11px] w-[3px] rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                )}
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
                  <Icon className="h-[21px] w-[21px]" style={{ color: isActive ? accent : "#94a3b8" }} />
                </span>
                <span
                  className={cn(RLABEL, "text-[14.5px]")}
                  style={{ color: isActive ? accent : "#475569", fontWeight: isActive ? 600 : 500 }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-[13px] mt-1 shrink-0 border-t border-[#eef0f3] pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-[13px] rounded-[14px] py-1.5 pl-[7px] pr-[15px] outline-none transition-[padding-left] duration-200 ease-in-out group-hover:pl-[15px] group-has-[:focus-visible]:pl-[15px] hover:bg-slate-50">
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                {(userName ?? "").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className={cn(RLABEL, "min-w-0 flex-1 text-left leading-tight")}>
                <p className="truncate text-[13.5px] font-semibold text-slate-900">{userName}</p>
                <p className="truncate text-xs text-slate-400">
                  {ROLE_LABELS[userRole ?? ""] ?? userRole}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-sm font-semibold text-foreground">{userName}</DropdownMenuLabel>
                <DropdownMenuLabel className="-mt-1.5">{ROLE_LABELS[userRole ?? ""] ?? userRole}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {settingsHref && (
                  <DropdownMenuItem render={<Link href={settingsHref} />}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </div>
  );
}
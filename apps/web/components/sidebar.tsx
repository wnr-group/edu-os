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
  items: NavItem[];
  brandColor?: string; // hex color from school's primary_color
  userName?: string;
  userRole?: string;
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

export function Sidebar({ title, items, brandColor, userName, userRole, sectionSwitcher }: SidebarProps) {
  const pathname = usePathname();

  // Generate sidebar colors from brand color, or fall back to indigo
  const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const sidebarBg = isValidHex ? darken(brandColor, 0.8) : "#1e1b4b";
  const logoBg = isValidHex ? brandColor : "#4f46e5";
  const dividerColor = isValidHex ? "rgba(255,255,255,0.12)" : "#3730a380";
  // Inactive text: use white with good opacity for readability on any dark bg
  const inactiveText = "rgba(255,255,255,0.6)";

  return (
    <aside
      className="hidden h-full w-60 shrink-0 flex-col text-white lg:flex"
      style={{ backgroundColor: sidebarBg }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: logoBg }}
        >
          <GraduationCap className="h-[18px] w-[18px] text-white" />
        </div>
        <span className="text-sm font-semibold tracking-wide text-white/90">
          {title}
        </span>
      </div>
      <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
      {sectionSwitcher}
      {sectionSwitcher && (
        <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = ICON_MAP[item.label] ?? LayoutDashboard;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "bg-white/15 text-white"
                  : "hover:bg-white/[0.08] hover:text-white"
              )}
              style={!isActive ? { color: inactiveText } : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
      <div className="px-3 py-3 space-y-0.5">
        {userName && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: logoBg }}
            >
              {userName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white/90">{userName}</p>
              <p className="truncate text-[11px] text-white/50">
                {ROLE_LABELS[userRole ?? ""] ?? userRole}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.08] hover:text-white"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
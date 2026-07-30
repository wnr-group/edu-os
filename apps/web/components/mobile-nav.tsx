"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutGrid, LayoutDashboard, GraduationCap, LogOut } from "lucide-react";
import { ICON_MAP, ROLE_LABELS, lighten } from "@/components/sidebar";
import type { NavItem } from "@/lib/nav-config";
import { formatSegment } from "@/components/top-bar";
import { createClient } from "@/lib/supabase";
import { CommandSearch } from "@/components/command-search";

interface MobileNavProps {
  title: string;
  items: NavItem[];
  brandColor?: string;
  userName?: string;
  userRole?: string;
  sectionSwitcher?: React.ReactNode;
  /** CommandSearch queries school-scoped data — set to false outside a
   * school context (e.g. Platform Admin), same as TopBar's showSearch. */
  showSearch?: boolean;
}

/**
 * Mobile-only navigation: top bar (hamburger + page title), a slide-out
 * drawer with the full flat nav (reuses Sidebar's icon map/colors so the
 * two never drift apart), and a bottom tab bar with the first 3 nav items
 * + "More" (opens the same drawer). Hidden at `lg` and above, where the
 * `TopBar` takes over.
 */
export function MobileNav({
  title,
  items,
  brandColor,
  userName,
  userRole,
  sectionSwitcher,
  showSearch = true,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  const pageTitle = segments.length > 0 ? formatSegment(segments[segments.length - 1]) : "Dashboard";

  const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const accent = isValidHex ? brandColor : "#1d4ed8";
  const activeBg = isValidHex ? lighten(brandColor, 0.93) : "#eff4ff";
  const dividerColor = "#eef0f3";
  const inactiveText = "#475569";
  const inactiveIcon = "#94a3b8";

  const bottomItems = items.slice(0, 3);

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-white px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="-ml-1.5 rounded-lg p-1.5 text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold text-foreground">{pageTitle}</span>
        {showSearch ? <CommandSearch userRole={userRole ?? ""} iconOnly /> : <span className="w-8" />}
      </header>

      {/* Slide-out drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col rounded-r-[20px] bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: accent }}>
                  <GraduationCap className="h-[18px] w-[18px] text-white" />
                </div>
                <span className="text-sm font-bold tracking-[-0.2px] text-slate-900">{title}</span>
              </div>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
            {sectionSwitcher}
            {sectionSwitcher && <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />}
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = ICON_MAP[item.label] ?? LayoutDashboard;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={"relative flex items-center gap-[14px] rounded-[14px] px-[15px] py-2.5 text-[14.5px] transition-colors " + (!isActive ? "hover:bg-slate-50" : "")}
                    style={{
                      backgroundColor: isActive ? activeBg : "transparent",
                      color: isActive ? accent : inactiveText,
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-[9px] bottom-[9px] w-[3px] rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    )}
                    <Icon className="h-[21px] w-[21px] shrink-0" style={{ color: isActive ? accent : inactiveIcon }} />
                    <span className="flex-1">{item.label}</span>
                    {!!item.badge && (
                      <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
            <div className="space-y-0.5 px-3 py-3">
              {userName && (
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {userName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-900">{userName}</p>
                    <p className="truncate text-[11px] text-slate-400">{ROLE_LABELS[userRole ?? ""] ?? userRole}</p>
                  </div>
                </div>
              )}
              <button
                onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4 shrink-0" style={{ color: inactiveIcon }} />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] items-stretch border-t bg-white lg:hidden">
        {bottomItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = ICON_MAP[item.label] ?? LayoutDashboard;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]"
              style={{ color: isActive ? accent : inactiveIcon }}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]"
          style={{ color: inactiveIcon }}
        >
          <LayoutGrid className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
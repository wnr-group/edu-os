"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Bell, LayoutGrid, LayoutDashboard, LogOut } from "lucide-react";
import { ICON_MAP, ROLE_LABELS, darken } from "@/components/sidebar";
import type { NavItem } from "@/components/sidebar";
import { formatSegment } from "@/components/top-bar";
import { createClient } from "@/lib/supabase";

interface MobileNavProps {
  title: string;
  items: NavItem[];
  brandColor?: string;
  userName?: string;
  userRole?: string;
  sectionSwitcher?: React.ReactNode;
  notificationCount?: number;
  showNotifications?: boolean;
}

/**
 * Mobile-only navigation: top bar (hamburger + page title + notifications),
 * a slide-out drawer with the full nav (reuses Sidebar's icon map/colors so
 * the two never drift apart), and a bottom tab bar with the first 3 nav
 * items + "More" (opens the same drawer). Hidden at `lg` and above, where
 * `Sidebar`/`TopBar` take over.
 */
export function MobileNav({
  title,
  items,
  brandColor,
  userName,
  userRole,
  sectionSwitcher,
  notificationCount = 0,
  showNotifications = true,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  const pageTitle = segments.length > 0 ? formatSegment(segments[segments.length - 1]) : "Dashboard";

  const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const sidebarBg = isValidHex ? darken(brandColor, 0.8) : "#1e1b4b";
  const logoBg = isValidHex ? brandColor : "#4f46e5";
  const dividerColor = isValidHex ? "rgba(255,255,255,0.12)" : "#3730a380";
  const inactiveText = "rgba(255,255,255,0.6)";

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
        {showNotifications ? (
          <button
            type="button"
            aria-label="Notifications"
            className="relative -mr-1.5 rounded-lg p-1.5 text-muted-foreground"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
                {notificationCount}
              </span>
            )}
          </button>
        ) : (
          <span className="w-8" />
        )}
      </header>

      {/* Slide-out drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-0 flex h-full w-64 flex-col text-white shadow-xl"
            style={{ backgroundColor: sidebarBg }}
          >
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: logoBg }}>
                  <LayoutDashboard className="h-[18px] w-[18px] text-white" />
                </div>
                <span className="text-sm font-semibold tracking-wide text-white/90">{title}</span>
              </div>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />
            {sectionSwitcher}
            {sectionSwitcher && <div className="mx-4 border-t" style={{ borderColor: dividerColor }} />}
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = ICON_MAP[item.label] ?? LayoutDashboard;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 " +
                      (isActive ? "bg-white/15 text-white" : "hover:bg-white/[0.08] hover:text-white")
                    }
                    style={!isActive ? { color: inactiveText } : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
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
                    style={{ backgroundColor: logoBg }}
                  >
                    {userName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white/90">{userName}</p>
                    <p className="truncate text-[11px] text-white/50">{ROLE_LABELS[userRole ?? ""] ?? userRole}</p>
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
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
        >
          <LayoutGrid className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
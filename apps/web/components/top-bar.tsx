"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, Settings, LogOut, GraduationCap } from "lucide-react";
import { CommandSearch } from "@/components/command-search";
import { NotificationBell } from "@/components/notification-bell";
import { createClient } from "@/lib/supabase";
import { formatSegment } from "@/lib/format-segment";
import type { NavItem, NavSection } from "@/lib/nav-config";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export { formatSegment };

interface TopBarProps {
  /** App/school name shown next to the logo mark. */
  title?: string;
  /** Where the logo links to — defaults to "/". */
  logoHref?: string;
  userName: string;
  userRole: string;
  brandColor?: string;
  /** Section selector, moved here from the (now removed) desktop sidebar. */
  sectionSwitcher?: React.ReactNode;
  yearSwitcher?: React.ReactNode;
  showSearch?: boolean;
  frequentItems?: NavItem[];
  moreSections?: NavSection[];
  settingsHref?: string;
  /** Role-scoped route to the full notification center (proxy.ts enforces every role stays under its own prefix, so this can't be a single shared path). Omit to hide the bell entirely (e.g. platform-admin domains, which have no notifications). */
  notificationsHref?: string;
}

const ROLE_LABELS: Record<string, string> = {
  school_admin: "School Admin",
  teacher: "Teacher",
  principal: "Principal",
  super_admin: "Platform Admin",
};

function NavLink({ item, isActive, accent }: { item: NavItem; isActive: boolean; accent: string }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className="group relative flex items-center gap-1.5 px-1 py-1.5 text-sm transition-colors"
      style={{ color: isActive ? accent : "#475569", fontWeight: isActive ? 600 : 500 }}
    >
      {item.label}
      {!!item.badge && (
        <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
      )}
      {isActive && (
        <span
          className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left animate-nav-underline rounded-full"
          style={{ backgroundColor: accent }}
        />
      )}
      {!isActive && (
        <span className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left scale-x-0 rounded-full bg-slate-300 transition-transform duration-300 ease-out group-hover:scale-x-100" />
      )}
    </Link>
  );
}

export function TopBar({
  title = "EduOS",
  logoHref = "/",
  userName,
  userRole,
  brandColor,
  sectionSwitcher,
  yearSwitcher,
  showSearch = true,
  frequentItems,
  moreSections,
  settingsHref,
  notificationsHref,
}: TopBarProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const accent = isValidHex ? brandColor : "#1d4ed8";

  const hasFrequent = !!frequentItems && frequentItems.length > 0;
  const sections = moreSections ?? [];
  const hasMore = sections.some((s) => s.items.length > 0);
  const moreActive = sections.some((s) =>
    s.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
  );

  return (
    <header className="hidden h-14 shrink-0 items-center gap-5 border-b bg-white px-6 lg:flex">
      {/* 1. App logo/icon — name is hidden by default and only reveals as a
         tooltip on hover or click/focus, so "Demo School" etc. doesn't take
         up permanent space in the bar. */}
      <Link
        href={logoHref}
        aria-label={title}
        className="group relative flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: accent }}
        >
          <GraduationCap className="h-4 w-4 text-white" />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
        >
          {title}
        </span>
      </Link>

      <div className="h-6 w-px shrink-0 bg-border" />

      {/* 2 & 3. Frequent nav items + "More" dropdown (falls back to a breadcrumb
         when no nav config applies, e.g. Platform Admin without frequentItems) */}
      {hasFrequent ? (
        <nav className="flex shrink-0 items-center gap-6">
          {frequentItems!.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return <NavLink key={item.href} item={item} isActive={isActive} accent={accent} />;
          })}

          {hasMore && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="group relative flex shrink-0 items-center gap-1 px-1 py-1.5 text-sm outline-none"
                style={{ color: moreActive ? accent : "#475569", fontWeight: moreActive ? 600 : 500 }}
              >
                More
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[popup-open]:rotate-180" />
                {sections.some((s) => s.items.some((i) => !!i.badge)) && (
                  <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-[#F59E0B]" />
                )}
                {moreActive && (
                  <span
                    className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left animate-nav-underline rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                )}
                {!moreActive && (
                  <span className="absolute inset-x-0 -bottom-[5px] h-[2px] origin-left scale-x-0 rounded-full bg-slate-300 transition-transform duration-300 ease-out group-hover:scale-x-100" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {sections.map((section, i) => (
                  <DropdownMenuGroup key={section.key}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                    {section.items.map((item) => (
                      <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                        <span className="flex-1">{item.label}</span>
                        {!!item.badge && (
                          <span className="rounded-full bg-[#FDF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{item.badge}</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      ) : (
        <nav className="flex shrink-0 items-center gap-1.5 text-sm">
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
      )}

      {/* 4. Section selector — moved here from the desktop sidebar */}
      {sectionSwitcher && <div className="flex shrink-0 items-center">{sectionSwitcher}</div>}

      {/* 5, 6, 7. Academic year selector, global search, user profile */}
      <div className="ml-auto flex shrink-0 items-center gap-4">
        {yearSwitcher && <div className="flex items-center">{yearSwitcher}</div>}

        {showSearch && <CommandSearch userRole={userRole} />}

        {notificationsHref && <NotificationBell centerHref={notificationsHref} />}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: brandColor ?? accent }}
            >
              {initials}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-sm font-semibold text-foreground">{userName}</DropdownMenuLabel>
              <DropdownMenuLabel className="-mt-1.5">{ROLE_LABELS[userRole] ?? userRole}</DropdownMenuLabel>
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
    </header>
  );
}
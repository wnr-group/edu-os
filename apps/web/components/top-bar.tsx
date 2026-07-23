"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, Settings, LogOut } from "lucide-react";
import { CommandSearch } from "@/components/command-search";
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
  userName: string;
  userRole: string;
  brandColor?: string;
  yearSwitcher?: React.ReactNode;
  showSearch?: boolean;
  frequentItems?: NavItem[];
  moreSections?: NavSection[];
  settingsHref?: string;
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
      className="group relative flex items-center px-1 py-1.5 text-sm transition-colors"
      style={{ color: isActive ? accent : "#475569", fontWeight: isActive ? 600 : 500 }}
    >
      {item.label}
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
  userName,
  userRole,
  brandColor,
  yearSwitcher,
  showSearch = true,
  frequentItems,
  moreSections,
  settingsHref,
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
    <header className="hidden h-14 shrink-0 items-center justify-between border-b bg-white px-6 lg:flex">
      {hasFrequent ? (
        <nav className="flex items-center gap-6">
          {frequentItems!.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return <NavLink key={item.href} item={item} isActive={isActive} accent={accent} />;
          })}

          {hasMore && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="group relative flex items-center gap-1 px-1 py-1.5 text-sm outline-none"
                style={{ color: moreActive ? accent : "#475569", fontWeight: moreActive ? 600 : 500 }}
              >
                More
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[popup-open]:rotate-180" />
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
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      ) : (
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
      )}

      {yearSwitcher && (
        <div className="flex items-center">{yearSwitcher}</div>
      )}

      <div className="flex items-center gap-4">
        {showSearch && <CommandSearch userRole={userRole} />}

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: brandColor ?? "#4f46e5" }}
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
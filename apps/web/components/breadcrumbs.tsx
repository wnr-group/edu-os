"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { formatSegment } from "@/lib/format-segment";

interface BreadcrumbsProps {
  /** Where the leading "Dashboard" crumb points — the current role's dashboard. */
  homeHref: string;
}

export function Breadcrumbs({ homeHref }: BreadcrumbsProps) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean); // e.g. ["admin", "students", "123"]

  // segments[0] is always the role folder ("admin"/"teacher"/"principal") —
  // it has no standalone page of its own (that's exactly why clicking it
  // 404'd before), so it's represented by a fixed "Dashboard" crumb instead
  // of its raw, capitalized segment name.
  const rest = segments.slice(1);
  // If the current page IS the dashboard (".../dashboard" with nothing
  // after it), don't repeat it — "Dashboard" alone is the current page.
  const trail = rest.length === 1 && rest[0] === "dashboard" ? [] : rest;

  const crumbs = trail.map((seg, i) => ({
    label: formatSegment(seg),
    href: "/" + segments.slice(0, i + 2).join("/"),
  }));

  const isDashboardCurrent = crumbs.length === 0;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {isDashboardCurrent ? (
        <span className="font-semibold text-foreground">Dashboard</span>
      ) : (
        <Link href={homeHref} className="text-muted-foreground/70 transition-colors hover:text-foreground">
          Dashboard
        </Link>
      )}

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-border" />
            {isLast ? (
              <span className="font-semibold text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
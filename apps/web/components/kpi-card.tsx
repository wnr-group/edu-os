import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  iconBg?: string;
  iconColor?: string;
  href?: string;
  className?: string;
}

/**
 * Clickable stat card with contextual nav — formalizes the icon-chip +
 * value/label pattern already used inline on the admin and platform-admin
 * dashboards, and adds the "make every KPI card clickable" requirement.
 * Use alongside (not instead of) the plain `StatCard` — pages that only
 * need a bare label/value (via `PageHeader`'s `stats` prop) keep using that.
 */
export function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  href,
  className,
}: KpiCardProps) {
  const content = (
    <>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconBg, iconColor)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-foreground truncate">{value}</p>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground/80 truncate">{sublabel}</p>}
      </div>
    </>
  );

  const baseClass = cn(
    "flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200",
    href && "hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className
  );

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {content}
      </Link>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-4", className)}>{children}</div>;
}
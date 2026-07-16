import type { LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { cn } from "@/lib/utils";

interface StatItem {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sublabel?: string;
  href?: string;
  iconBg?: string;
  iconColor?: string;
}

interface DashboardTemplateProps {
  title: string;
  description?: string;
  stats?: StatItem[];
  chart: React.ReactNode;
  overview?: React.ReactNode;
  alerts?: React.ReactNode;
  activity?: React.ReactNode;
  topUsers?: React.ReactNode;
  quickActions?: React.ReactNode;
}

/**
 * Foundation layout for every dashboard. Hierarchy matches the reference
 * doc: Summary KPIs → Analytics (chart) → Operational info (overview) →
 * Activities & quick actions (sidebar). The sidebar column sits after the
 * main column in source order, so it drops below on mobile in the same
 * order without any breakpoint-specific reordering.
 *
 * Slots are plain ReactNode — pass existing chart components
 * (`<FeeCollectionChart .../>`, etc.) or a `DashboardWidget` below
 * directly; this component only owns the grid, not the widgets.
 */
export function DashboardTemplate({
  title,
  description,
  stats,
  chart,
  overview,
  alerts,
  activity,
  topUsers,
  quickActions,
}: DashboardTemplateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>

      {stats && stats.length > 0 && (
        <KpiGrid>
          {stats.map((s) => (
            <KpiCard key={s.label} {...s} />
          ))}
        </KpiGrid>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {chart}
          {overview}
        </div>
        <div className="min-w-0 space-y-6">
          {alerts}
          {activity}
          {topUsers}
          {quickActions}
        </div>
      </div>
    </div>
  );
}

interface DashboardWidgetProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Convenience Card wrapper for dashboard slots (System Alerts, Recent
 * Activity, Top Active Users, Quick Actions, ...). Optional — pass any
 * Card-based content instead if a slot needs something custom.
 */
export function DashboardWidget({ title, action, className, children }: DashboardWidgetProps) {
  return (
    <Card className={cn("animate-fade-in-up", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
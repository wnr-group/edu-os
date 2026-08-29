import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface DetailTab {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

interface DetailPageTemplateProps {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: React.ReactNode;
  badge?: { label: string; variant?: BadgeVariant };
  actions?: React.ReactNode;
  /** Extra content rendered above the tab strip (e.g. a profile card / edit form) */
  header?: React.ReactNode;
  tabs: DetailTab[];
  activeTab: string;
  /**
   * "link" (default) renders each tab as `${basePath}?tab=key` — matches
   * the server-rendered pattern already used on the student detail page.
   * "state" renders buttons and calls `onTabChange` — for pages that want
   * client-side switching instead. Caller owns `activeTab` either way.
   */
  tabMode?: "link" | "state";
  onTabChange?: (key: string) => void;
  basePath?: string;
}

export function DetailPageTemplate({
  backHref,
  backLabel = "Back",
  title,
  subtitle,
  badge,
  actions,
  header,
  tabs,
  activeTab,
  tabMode = "link",
  onTabChange,
  basePath,
}: DetailPageTemplateProps) {
  const activeContent = tabs.find((t) => t.key === activeTab)?.content ?? tabs[0]?.content;

  return (
    <div className="space-y-6">
      <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {backLabel}
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
            {badge && <Badge variant={badge.variant ?? "secondary"}>{badge.label}</Badge>}
          </div>
          {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {header}

      {tabs.length > 0 && (
        <div>
          <div className="flex gap-1 overflow-x-auto overscroll-x-contain border-b border-border">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              const tabClassName = cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              );
              if (tabMode === "state") {
                return (
                  <button key={tab.key} type="button" onClick={() => onTabChange?.(tab.key)} className={tabClassName}>
                    {tab.label}
                  </button>
                );
              }
              return (
                <Link key={tab.key} href={`${basePath ?? ""}?tab=${tab.key}`} className={tabClassName}>
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <div className="pt-6">{activeContent}</div>
        </div>
      )}
    </div>
  );
}
import { StatCard } from "@/components/stat-card";

interface StatItem {
  label: string;
  value: string | number;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  stats?: StatItem[];
}

export function PageHeader({ title, description, action, stats }: PageHeaderProps) {
  return (
    <div className="mb-8 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0 sm:ml-4">{action}</div>}
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}
    </div>
  );
}

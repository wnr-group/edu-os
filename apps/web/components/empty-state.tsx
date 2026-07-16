import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateVariant = "empty" | "no-results" | "error";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  variant?: EmptyStateVariant;
}

const VARIANT_CHIP: Record<EmptyStateVariant, string> = {
  empty: "bg-muted text-muted-foreground",
  "no-results": "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

export function EmptyState({ icon: Icon, title, description, action, variant = "empty" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-white py-16 text-center animate-fade-in-up">
      <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", VARIANT_CHIP[variant])}>
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
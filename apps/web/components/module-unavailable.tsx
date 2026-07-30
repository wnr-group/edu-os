import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export function ModuleUnavailable({ module }: { module: string }) {
  return (
    <EmptyState
      icon={ShieldOff}
      title="Module unavailable"
      description={`${module} has been disabled for your school. Contact your school administrator if you believe this is a mistake.`}
    />
  );
}
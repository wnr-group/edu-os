"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar, MapPin, BookOpen, TrendingUp, CalendarClock, GraduationCap,
  FileText, Clock, CreditCard, Link2, Megaphone, Image as ImageIcon,
  MessageSquare, ShieldAlert, Sparkles, ClipboardCheck, Lock, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FEATURE_REGISTRY, type FeatureKey, type FeatureDef } from "@erp/shared";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { RazorpayGatewayPanel } from "./razorpay-gateway-panel";

interface GatewayConfig {
  key_id: string | null;
  mode: "test" | "live" | null;
  status: "configured" | "unconfigured";
  account_name: string | null;
}

interface Props {
  schoolId: string;
  featuresEnabled: Partial<Record<FeatureKey, boolean>>;
  paymentGateway: GatewayConfig;
}

const CATEGORY_ORDER: FeatureDef["category"][] = [
  "Academics",
  "Operations",
  "Finance",
  "Communication",
  "Intelligence",
];

const ICONS: Partial<Record<FeatureKey, LucideIcon>> = {
  attendance: Calendar,
  attendance_geo: MapPin,
  homework: BookOpen,
  exams: TrendingUp,
  exam_schedule: CalendarClock,
  report_cards: FileText,
  syllabus: BookOpen,
  timetable: Clock,
  admissions: GraduationCap,
  kyc_documents: FileText,
  leave: ClipboardCheck,
  testing: ClipboardCheck,
  fees: CreditCard,
  online_payments: Link2,
  announcements: Megaphone,
  gallery: ImageIcon,
  feedback: MessageSquare,
  discipline: ShieldAlert,
  insights: Sparkles,
};

// Structural modules are intentionally NOT in the feature registry (always
// on, never toggleable — see packages/shared/src/features/registry.ts).
// Rendered here as static, informational rows to match the console mockup.
const CORE_MODULES = [
  { label: "Students & Enrollment", description: "Student records, classes, sections — the backbone every module reads." },
  { label: "Teachers & Staff", description: "Staff accounts, roles and section assignments." },
];

const REGISTRY_ENTRIES = Object.values(FEATURE_REGISTRY);

export function ModulesTab({ schoolId, featuresEnabled, paymentGateway }: Props) {
  const router = useRouter();
  const [features, setFeatures] = useState<Partial<Record<FeatureKey, boolean>>>(featuresEnabled);
  const [pendingKey, setPendingKey] = useState<FeatureKey | null>(null);
  const [query, setQuery] = useState("");

  const isOn = (key: FeatureKey) => features[key] === true;

  const enabledCount = REGISTRY_ENTRIES.filter((f) => isOn(f.key)).length;
  const totalCount = REGISTRY_ENTRIES.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGISTRY_ENTRIES;
    return REGISTRY_ENTRIES.filter((f) => f.label.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: filtered.filter((f) => f.category === category),
      })).filter((group) => group.items.length > 0),
    [filtered]
  );

  async function handleToggle(feature: FeatureDef, next: boolean) {
    if (next && feature.dependsOn?.some((dep) => !isOn(dep))) {
      const missing = feature.dependsOn
        .filter((dep) => !isOn(dep))
        .map((dep) => FEATURE_REGISTRY[dep]?.label ?? dep)
        .join(", ");
      toast.error(`Turn on ${missing} first — ${feature.label} depends on it.`);
      return;
    }

    const previous = features;
    const updated = { ...features, [feature.key]: next };
    setFeatures(updated);
    setPendingKey(feature.key);

    try {
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features_enabled: updated }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to update module");
      }
      toast.success(`${feature.label} turned ${next ? "on" : "off"}`);
      router.refresh();
    } catch (err) {
      setFeatures(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update module");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800">Modules</h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {enabledCount} of {totalCount} enabled
          </span>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Turning a module off hides it from this school immediately and blocks its data writes.
          Every change is written to the audit log.
        </p>
      </div>

      {!query && (
        <div className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Core · structural, always on
          </p>
          <div className="divide-y">
            {CORE_MODULES.map((mod) => (
              <div key={mod.label} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{mod.label}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        <Lock className="h-3 w-3" /> Always on
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{mod.description}</p>
                  </div>
                </div>
                <Switch defaultChecked disabled />
              </div>
            ))}
          </div>
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.category} className="mb-6 last:mb-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.category}
          </p>
          <div className="divide-y">
            {group.items.map((feature) => {
                const Icon = ICONS[feature.key] ?? Sparkles;
                const on = isOn(feature.key);
                const blockedDeps = feature.dependsOn?.filter((dep) => !isOn(dep)) ?? [];
                return (
                  <div key={feature.key}>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-gray-900">{feature.label}</span>
                            {feature.status === "new" && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                NEW
                              </span>
                            )}
                            {blockedDeps.length > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                <Link2 className="h-3 w-3" />
                                Uses {blockedDeps.map((d) => FEATURE_REGISTRY[d]?.label ?? d).join(", ")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={on}
                        disabled={pendingKey === feature.key}
                        onCheckedChange={(next: boolean) => handleToggle(feature, next)}
                      />
                    </div>
                    {feature.key === "online_payments" && on && (
                      <RazorpayGatewayPanel schoolId={schoolId} gateway={paymentGateway} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
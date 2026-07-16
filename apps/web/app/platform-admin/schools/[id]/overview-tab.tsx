"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shield, UserCheck, Users, GraduationCap, Contact } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard, KpiGrid } from "@/components/kpi-card";

interface School {
  id: string;
  name: string;
  domain: string;
  primary_color: string;
  contact_email: string;
  app_store_url: string | null;
  play_store_url: string | null;
}

interface RoleCounts {
  school_admin: number;
  principal: number;
  teacher: number;
  student: number;
  parent: number;
}

interface Props {
  school: School;
  roleCounts: RoleCounts;
}

const ROLE_LABELS: { key: keyof RoleCounts; label: string; icon: LucideIcon }[] = [
  { key: "school_admin", label: "Admins", icon: Shield },
  { key: "principal", label: "Principals", icon: UserCheck },
  { key: "teacher", label: "Teachers", icon: Users },
  { key: "student", label: "Students", icon: GraduationCap },
  { key: "parent", label: "Parents", icon: Contact },
];

export function OverviewTab({ school, roleCounts }: Props) {
  const router = useRouter();
  const [name, setName] = useState(school.name);
  const [domain, setDomain] = useState(school.domain);
  const [primaryColor, setPrimaryColor] = useState(school.primary_color);
  const [contactEmail, setContactEmail] = useState(school.contact_email);
  const [appStoreUrl, setAppStoreUrl] = useState(school.app_store_url ?? "");
  const [playStoreUrl, setPlayStoreUrl] = useState(school.play_store_url ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain,
          primary_color: primaryColor,
          contact_email: contactEmail,
          app_store_url: appStoreUrl || null,
          play_store_url: playStoreUrl || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to save");
      }
      toast.success("School info updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Role count stats */}
      <KpiGrid className="sm:grid-cols-3 lg:grid-cols-5">
        {ROLE_LABELS.map(({ key, label, icon }) => (
          <KpiCard key={key} icon={icon} label={label} value={roleCounts[key]} />
        ))}
      </KpiGrid>

      {/* Editable form */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-gray-800">School Info</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="school-name">Name</Label>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="School name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="school-domain">Domain</Label>
            <Input
              id="school-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. myschool"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="school-email">Contact Email</Label>
            <Input
              id="school-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="admin@school.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="school-color">Primary Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor || "#6366f1"}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
              />
              <Input
                id="school-color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#6366f1"
                className="flex-1"
              />
            </div>
          </div>
        </div>

        <div className="col-span-full mt-2 border-t pt-4">
          <p className="mb-3 text-sm font-medium text-gray-700">Mobile App Links</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-store">App Store URL (iOS)</Label>
              <Input
                id="app-store"
                value={appStoreUrl}
                onChange={(e) => setAppStoreUrl(e.target.value)}
                placeholder="https://apps.apple.com/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="play-store">Play Store URL (Android)</Label>
              <Input
                id="play-store"
                value={playStoreUrl}
                onChange={(e) => setPlayStoreUrl(e.target.value)}
                placeholder="https://play.google.com/..."
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
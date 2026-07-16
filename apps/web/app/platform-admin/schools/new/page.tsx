"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NewSchoolPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [contactEmail, setContactEmail] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .insert({ name, domain, primary_color: primaryColor, contact_email: contactEmail, app_store_url: appStoreUrl || null, play_store_url: playStoreUrl || null })
      .select()
      .single();

    if (schoolError || !school) {
      setError(schoolError?.message ?? "Failed to create school");
      setLoading(false);
      return;
    }

    toast.success("School created. Now invite users from the school detail page.");
    router.push(`/platform-admin/schools/${school.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-in-up">
      <Link href="/platform-admin/schools" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Schools
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New School</CardTitle>
          <CardDescription>Set up a school workspace. You can invite users once it's created.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <p className="rounded-md bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="school-name">School Name</Label>
                <Input id="school-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-domain">Web Domain</Label>
                <Input id="school-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="school2.lvh.me" required />
                <p className="text-xs text-muted-foreground">Use a *.lvh.me domain for local development.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-color">Primary Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="school-color"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-8 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                  />
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#2563EB" className="flex-1" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-email">School Contact Email</Label>
                <Input id="school-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-5">
              <div>
                <p className="text-sm font-semibold text-foreground">Mobile App Links</p>
                <p className="text-xs text-muted-foreground">Optional — shown on the app download page.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="app-store-url">App Store URL (iOS)</Label>
                <Input id="app-store-url" value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} placeholder="https://apps.apple.com/..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="play-store-url">Play Store URL (Android)</Label>
                <Input id="play-store-url" value={playStoreUrl} onChange={(e) => setPlayStoreUrl(e.target.value)} placeholder="https://play.google.com/..." />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Create School"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
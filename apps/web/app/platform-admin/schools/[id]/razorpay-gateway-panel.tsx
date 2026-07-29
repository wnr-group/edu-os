"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface GatewayConfig {
  key_id: string | null;
  mode: "test" | "live" | null;
  status: "configured" | "unconfigured";
  account_name: string | null;
}

export function RazorpayGatewayPanel({
  schoolId,
  gateway: initialGateway,
}: {
  schoolId: string;
  gateway: GatewayConfig;
}) {
  const router = useRouter();
  const [gateway, setGateway] = useState(initialGateway);
  const [keyId, setKeyId] = useState(gateway.key_id ?? "");
  const [accountName, setAccountName] = useState(gateway.account_name ?? "");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [replacingKeySecret, setReplacingKeySecret] = useState(gateway.status !== "configured");
  const [replacingWebhookSecret, setReplacingWebhookSecret] = useState(gateway.status !== "configured");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const derivedMode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/payments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key_id: keyId || undefined,
          account_name: accountName || undefined,
          key_secret: replacingKeySecret && keySecret ? keySecret : undefined,
          webhook_secret: replacingWebhookSecret && webhookSecret ? webhookSecret : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save gateway");
      setGateway(data);
      setKeySecret("");
      setWebhookSecret("");
      setReplacingKeySecret(false);
      setReplacingWebhookSecret(false);
      toast.success("Gateway saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save gateway");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/payments/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key_id: keyId || undefined,
          key_secret: keySecret || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    } catch {
      toast.error("Could not reach the test endpoint");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-gray-900">Razorpay gateway</h3>
        {gateway.status === "configured" ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Connected</span>
        ) : (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Not connected</span>
        )}
        {derivedMode && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${derivedMode === "live" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
            {derivedMode === "live" ? "Live mode" : "Test mode"}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="key_id">Key ID *</Label>
          <Input id="key_id" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_..." className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">
            Public key. Mode is detected from the prefix — <span className="font-medium">rzp_test_</span> = test (no real money), <span className="font-medium">rzp_live_</span> = live.
          </p>
        </div>

        <div>
          <Label htmlFor="key_secret">Key Secret *</Label>
          {replacingKeySecret ? (
            <Input id="key_secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="Enter key secret" className="mt-1" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Input value="••••••••••" disabled className="font-mono" />
              <Button type="button" variant="outline" size="sm" onClick={() => setReplacingKeySecret(true)}>Replace</Button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Stored encrypted · shown masked once saved.</p>
        </div>

        <div>
          <Label htmlFor="webhook_secret">Webhook Secret *</Label>
          {replacingWebhookSecret ? (
            <Input id="webhook_secret" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Enter webhook secret" className="mt-1" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Input value="••••••••••" disabled className="font-mono" />
              <Button type="button" variant="outline" size="sm" onClick={() => setReplacingWebhookSecret(true)}>Replace</Button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Verifies Razorpay webhook signatures.</p>
        </div>

        <div>
          <Label htmlFor="account_name">Account / display name</Label>
          <Input id="account_name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Demo School" className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">Shown to parents on the payment sheet.</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border bg-white px-4 py-3 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Secrets are stored in the encrypted vault and used only server-side in the payment functions — never sent to the browser or returned by the API.</p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !keyId}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || !keyId}>
          {saving ? "Saving…" : "Save gateway"}
        </Button>
      </div>
    </div>
  );
}
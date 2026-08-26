"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteTeacherFormProps {
  schoolId: string;
  onSuccess?: () => void;
}

export function InviteTeacherForm({ schoolId, onSuccess }: InviteTeacherFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{10}$/.test(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: `+91${phone}`,
        fullName: name.trim(),
        email: email.trim() || undefined,
        schoolId,
        role: "teacher",
        extraInserts: [{ table: "teacher_profiles", data: { school_id: schoolId } }],
      }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg ?? "Failed to add teacher");
      toast.error(msg ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    setName("");
    setPhone("");
    setEmail("");
    setLoading(false);
    toast.success("Teacher added successfully.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-1">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold">Full Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold">Mobile Number</Label>
          <div className="flex overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring/50">
            <span className="flex items-center bg-muted px-3 text-sm text-muted-foreground font-medium">+91</span>
            <Input
              type="tel"
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              required
              className="rounded-none border-0 focus-visible:ring-0"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-semibold">
          Email Address <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
        </Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? "Adding…" : "Add Teacher"}
        </Button>
      </div>
    </form>
  );
}

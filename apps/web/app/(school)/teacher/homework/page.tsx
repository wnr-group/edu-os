// app/(school)/admin/announcements/create-announcement-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const TARGET_OPTIONS = [
  { value: "school", label: "School (Everyone)" },
  { value: "students", label: "Students" },
  { value: "teachers", label: "Teachers" },
];

export function CreateAnnouncementForm({
  schoolId,
  createdBy,
  onSuccess,
}: {
  schoolId: string;
  createdBy: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState("school");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("announcements").insert({
      school_id: schoolId, title, content, target_type: targetType, created_by: createdBy,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || "Could not post announcement.");
      return;
    }

    setTitle(""); setContent(""); setTargetType("school");
    toast.success("Announcement sent.");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
      <div>
        <Label>Target</Label>
        <NativeSelect
          options={TARGET_OPTIONS}
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="w-full"
        />
      </div>
      <div>
        <Label>Content</Label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Posting…" : "Post Announcement"}</Button>
    </form>
  );
}
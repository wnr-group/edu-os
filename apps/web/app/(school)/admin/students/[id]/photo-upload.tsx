"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Camera } from "lucide-react";

interface Props {
  studentId: string;
  studentName: string;
  photoUrl: string | null;
}

export function PhotoUpload({ studentId, studentName, photoUrl }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [isPending, setIsPending] = useState(false);

  const initials = studentName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }

    // Optimistic preview
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setIsPending(true);

    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${studentId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("student-photos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error(uploadError.message);
      URL.revokeObjectURL(localUrl);
      setPreview(photoUrl);
      setIsPending(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("student-photos")
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Students are data records, not auth users (no profiles row) — their
    // photo lives directly on student_profiles.photo_url.
    const { error: dbError } = await supabase
      .from("student_profiles")
      .update({ photo_url: publicUrl })
      .eq("id", studentId);

    if (dbError) {
      toast.error(dbError.message);
      URL.revokeObjectURL(localUrl);
      setPreview(photoUrl);
      setIsPending(false);
      return;
    }

    toast.success("Photo updated.");
    URL.revokeObjectURL(localUrl);
    setIsPending(false);
    router.refresh();
  }

  return (
    <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        disabled={isPending}
      />
      <div className="relative h-20 w-20 rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center">
        {preview ? (
          <Image
            src={preview}
            alt={studentName}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="text-2xl font-bold text-emerald-600">{initials}</span>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
          <Camera className="h-6 w-6 text-white" />
        </div>
        {isPending && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

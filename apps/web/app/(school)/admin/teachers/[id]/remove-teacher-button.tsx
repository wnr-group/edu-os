"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function RemoveTeacherButton({
  teacherId,
  schoolId,
  teacherName,
}: {
  teacherId: string;
  schoolId: string;
  teacherName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    try {
      const res = await fetch("/api/teachers/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, schoolId }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error ?? "Failed to remove teacher.");
        setLoading(false);
        return;
      }

      toast.success(`${teacherName || "Teacher"} has been removed.`);
      setOpen(false);
      router.push("/admin/teachers");
      router.refresh();
    } catch {
      toast.error("Something went wrong while removing teacher.");
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold"
      >
        <Trash2 className="h-4 w-4 mr-1.5" /> Remove Teacher
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-lg">Remove Teacher</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground">
              Are you sure you want to remove <b className="text-foreground">{teacherName || "this teacher"}</b> from school teaching staff?
              <br /><br />
              This will deactivate their teaching access for this school. Existing class logs, marks, and attendance history will be preserved.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={loading}>
              {loading ? "Removing…" : "Confirm Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

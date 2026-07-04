"use client";
import { ActionDialog } from "@/components/action-dialog";
import { AddClassForm } from "./add-class-form";
import { AddSectionForm } from "./add-section-form";

export function AddClassDialog({ schoolId }: { schoolId: string }) {
  return (
    <ActionDialog trigger="+ Add Class" title="Add Class">
      {(onSuccess) => <AddClassForm schoolId={schoolId} onSuccess={onSuccess} />}
    </ActionDialog>
  );
}

export function AddSectionDialog({
  schoolId,
  classes,
  academicYearId,
}: {
  schoolId: string;
  classes: { id: string; name: string }[];
  academicYearId: string;
}) {
  return (
    <ActionDialog trigger="+ Add Section" title="Add Section">
      {(onSuccess) => (
        <AddSectionForm
          schoolId={schoolId}
          classes={classes}
          academicYearId={academicYearId}
          onSuccess={onSuccess}
        />
      )}
    </ActionDialog>
  );
}

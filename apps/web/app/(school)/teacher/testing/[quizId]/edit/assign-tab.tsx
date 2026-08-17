import { Users } from "lucide-react";

export function AssignTab({ sectionLabel, studentCount }: { sectionLabel: string; studentCount: number }) {
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{studentCount} students will see this quiz</p>
          <p className="text-xs text-muted-foreground">{sectionLabel}</p>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Quizzes are assigned to the whole section they were created for — this happens automatically when you publish.
        Targeting individual students (for retakes or make-up quizzes) isn&rsquo;t available yet.
      </div>
    </div>
  );
}

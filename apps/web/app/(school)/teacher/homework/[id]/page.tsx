import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RosterReview } from "./roster-review";

export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: hw } = await supabase
    .from("homework")
    .select("id, title, due_date, section_id, subject:subjects(name)")
    .eq("id", id)
    .maybeSingle();
  if (!hw) notFound();

  const subject = hw.subject as unknown as { name: string } | null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href="/teacher/homework"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Homework
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{hw.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subject?.name ?? "—"} · due {hw.due_date ? new Date(hw.due_date).toLocaleDateString() : "—"}
        </p>
      </div>

      <RosterReview homeworkId={hw.id} sectionId={hw.section_id} />
    </div>
  );
}
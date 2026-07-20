"use client";
import { Megaphone } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";
import { CreateAnnouncementDialog } from "./create-announcement-dialog";

interface AnnouncementRow {
  id: string;
  title: string;
  target_type: string;
  date: string;
  created_at: string;
}

export function AnnouncementsTable({
  rows,
  schoolId,
  userId,
  headerAction,
  stats,
}: {
  rows: AnnouncementRow[];
  schoolId: string;
  userId: string;
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<AnnouncementRow>
      title="Announcements"
      description="Broadcast messages to students, teachers, or everyone."
      headerAction={headerAction}
      stats={stats}
      data={rows}
      columns={[
        { header: "Title", accessor: "title" },
        { header: "Target", accessor: "target_type" },
        { header: "Date", accessor: "date" },
      ]}
      searchKeys={["title"]}
      searchPlaceholder="Search by title…"
      filters={[
        {
          label: "All Targets",
          options: [
            { label: "School", value: "school" },
            { label: "Students", value: "students" },
            { label: "Teachers", value: "teachers" },
          ],
          filterFn: (row: AnnouncementRow, value: string) => row.target_type === value,
        },
      ]}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate font-medium text-foreground">{row.title}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {row.target_type}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{row.date}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Post your first announcement to reach your school community."
          action={
            <CreateAnnouncementDialog schoolId={schoolId} createdBy={userId} />
          }
        />
      }
    />
  );
}
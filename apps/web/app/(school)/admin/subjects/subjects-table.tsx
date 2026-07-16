"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddSubjectDialog } from "./add-subject-dialog";
import { toast } from "sonner";

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  class_name: string;
}

interface ClassItem {
  id: string;
  name: string;
}

interface ClassFilterOption {
  value: string;
  label: string;
}

export function SubjectsTable({
  rows,
  classFilterOptions,
  schoolId,
  classesData,
  headerAction,
  stats,
}: {
  rows: SubjectRow[];
  classFilterOptions: ClassFilterOption[];
  schoolId: string;
  classesData: ClassItem[];
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  const router = useRouter();
  const [editSubject, setEditSubject] = useState<SubjectRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit(row: SubjectRow) {
    setEditSubject(row);
    setEditName(row.name);
    setEditCode(row.code === "—" ? "" : row.code);
  }

  async function handleEditSave() {
    if (!editSubject || !editName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("subjects")
      .update({ name: editName.trim(), code: editCode.trim() || null })
      .eq("id", editSubject.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Subject updated.");
    setEditSubject(null);
    router.refresh();
  }

  async function deleteSubject(row: SubjectRow) {
    if (!confirm(`Delete "${row.name}" from ${row.class_name}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("subjects").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${row.name}" deleted from ${row.class_name}.`);
    router.refresh();
  }

  return (
    <>
      <ListPageTemplate<SubjectRow>
        title="Subjects"
        description="Manage subjects taught in each class."
        headerAction={headerAction}
        stats={stats}
        data={rows}
        columns={[
          { header: "Subject", accessor: "name" },
          { header: "Code", accessor: "code" },
          { header: "Class", accessor: "class_name" },
        ]}
        searchKeys={["name", "code"]}
        searchPlaceholder="Search subjects..."
        filters={
          classFilterOptions.length > 0
            ? [
                {
                  label: "All Classes",
                  options: classFilterOptions,
                  filterFn: (row: SubjectRow, value: string) =>
                    row.class_name === value,
                },
              ]
            : []
        }
        renderActions={(row) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(row)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => deleteSubject(row)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        renderMobileCard={(row) => (
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.code !== "—" ? `${row.code} · ` : ""}{row.class_name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openEdit(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteSubject(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
        emptyState={
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Add subjects so teachers can assign homework and enter marks."
            action={<AddSubjectDialog schoolId={schoolId} classes={classesData} />}
          />
        }
      />

      {/* Edit subject dialog */}
      <Dialog open={!!editSubject} onOpenChange={(open) => { if (!open) setEditSubject(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Subject — {editSubject?.class_name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Subject Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code (optional)</Label>
              <Input
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                placeholder="e.g. MAT"
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { School, GripVertical, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
  order: number;
}

interface SectionRow {
  id: string;
  class_name: string;
  section_name: string;
  class_teacher_id: string;
}

interface TeacherOption {
  value: string;
  label: string;
}

// Sentinel value so the "clear class teacher" option is selectable
// (NativeSelect disables its empty-string placeholder option).
const UNASSIGNED = "__none__";

// ─── Sortable Classes List ───

export function ClassesDataTable({
  classes,
  schoolId,
}: {
  classes: ClassRow[];
  schoolId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(() =>
    [...classes].sort((a, b) => a.order - b.order)
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [editClass, setEditClass] = useState<ClassRow | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Sync when server data changes
  if (classes.length !== items.length || classes.some((c, i) => {
    const sorted = [...classes].sort((a, b) => a.order - b.order);
    return sorted[i]?.id !== items[i]?.id;
  })) {
    setItems([...classes].sort((a, b) => a.order - b.order));
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    // Make drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== overId) setOverId(id);
  }

  function handleDragLeave() {
    setOverId(null);
  }

  async function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setOverId(null);

    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }

    const fromIdx = items.findIndex((c) => c.id === dragId);
    const toIdx = items.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    // Reorder locally
    const newItems = [...items];
    const [moved] = newItems.splice(fromIdx, 1);
    newItems.splice(toIdx, 0, moved);

    // Assign new sequential order values
    const updates = newItems.map((item, i) => ({
      id: item.id,
      order: i + 1,
    }));

    setItems(newItems.map((item, i) => ({ ...item, order: i + 1 })));
    setDragId(null);

    // Persist to DB
    const supabase = createClient();
    await Promise.all(
      updates.map((u) =>
        supabase.from("classes").update({ order: u.order }).eq("id", u.id)
      )
    );
    router.refresh();
  }

  function handleDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  function openEdit(row: ClassRow) {
    setEditClass(row);
    setEditName(row.name);
  }

  async function handleEditSave() {
    if (!editClass || !editName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("classes")
      .update({ name: editName.trim() })
      .eq("id", editClass.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Class renamed.");
    setEditClass(null);
    router.refresh();
  }

  async function deleteClass(row: ClassRow) {
    if (!confirm(
      `Delete "${row.name}"?\n\nThis will also delete all associated:\n• Sections\n• Subjects\n• Student assignments\n• Timetable entries\n• Syllabus entries\n• Fee line items\n\nThis cannot be undone.`
    )) return;

    const supabase = createClient();

    // Get section IDs for this class (needed for timetable cleanup)
    const { data: classSections } = await supabase
      .from("sections")
      .select("id")
      .eq("class_id", row.id);
    const sectionIds = (classSections ?? []).map((s) => s.id);

    // Delete non-cascading associations first
    const cleanups = [
      supabase.from("student_enrollments").delete().eq("class_id", row.id),
      supabase.from("syllabus").delete().eq("class_id", row.id),
      supabase.from("fee_line_items").delete().eq("class_id", row.id),
    ];
    // Timetable references section_id, not class_id
    if (sectionIds.length > 0) {
      cleanups.push(supabase.from("timetable").delete().in("section_id", sectionIds));
    }
    await Promise.all(cleanups);

    // Delete the class — sections + subjects cascade automatically
    const { error } = await supabase.from("classes").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${row.name}" and all associations deleted.`);
    router.refresh();
  }

  const filtered = search
    ? items.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={School}
        title="No classes yet"
        description="Use Quick Setup above to create classes."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classes..."
            className="pl-9"
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Sortable list */}
        <div className="overflow-hidden rounded-lg border bg-white">
          {filtered.map((row) => (
            <div
              key={row.id}
              draggable={!search}
              onDragStart={(e) => handleDragStart(e, row.id)}
              onDragOver={(e) => handleDragOver(e, row.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, row.id)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 border-b px-4 py-2.5 last:border-0 transition-colors ${
                dragId === row.id ? "opacity-40" : ""
              } ${
                overId === row.id && dragId !== row.id
                  ? "border-t-2 border-t-indigo-500 bg-indigo-50"
                  : "hover:bg-gray-50"
              }`}
            >
              {/* Drag handle */}
              {!search && (
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing" />
              )}

              {/* Order badge */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-500">
                {row.order}
              </span>

              {/* Name */}
              <span className="flex-1 text-sm font-medium text-gray-900">{row.name}</span>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteClass(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit class dialog */}
      <Dialog open={!!editClass} onOpenChange={(open) => { if (!open) setEditClass(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Class</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Class Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                autoFocus
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

// ─── Sections Table ───

export function SectionsDataTable({
  sectionRows,
  schoolId,
  academicYearId,
  teachers,
  classes,
  headerAction,
}: {
  sectionRows: SectionRow[];
  schoolId: string;
  academicYearId: string;
  teachers: TeacherOption[];
  classes: { id: string; name: string }[];
  headerAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [editSection, setEditSection] = useState<SectionRow | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(sectionRows.map((s) => [s.id, s.class_teacher_id]))
  );
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);

  async function handleClassTeacherChange(sectionId: string, teacherId: string) {
    if (!academicYearId) {
      toast.error("No active academic year. Set one up under Academics first.");
      return;
    }
    const previous = assignments[sectionId] ?? "";
    setAssignments((a) => ({ ...a, [sectionId]: teacherId }));
    setSavingTeacher(sectionId);
    const supabase = createClient();

    const { error } = teacherId
      ? await supabase.from("section_assignments").upsert(
          {
            section_id: sectionId,
            academic_year_id: academicYearId,
            class_teacher_id: teacherId,
            school_id: schoolId,
          },
          { onConflict: "section_id,academic_year_id" }
        )
      : await supabase
          .from("section_assignments")
          .delete()
          .eq("section_id", sectionId)
          .eq("academic_year_id", academicYearId);

    setSavingTeacher(null);
    if (error) {
      setAssignments((a) => ({ ...a, [sectionId]: previous }));
      toast.error(error.message);
      return;
    }
    toast.success(teacherId ? "Class teacher assigned." : "Class teacher cleared.");
    router.refresh();
  }

  function openEdit(row: SectionRow) {
    setEditSection(row);
    setEditSectionName(row.section_name);
  }

  async function handleEditSave() {
    if (!editSection || !editSectionName.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("sections")
      .update({ name: editSectionName.trim() })
      .eq("id", editSection.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Section renamed.");
    setEditSection(null);
    router.refresh();
  }

  async function deleteSection(row: SectionRow) {
    if (!confirm(`Delete section "${row.section_name}" from ${row.class_name}?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("sections").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Section "${row.section_name}" deleted.`);
    router.refresh();
  }

  return (
    <>
      <ListPageTemplate<SectionRow>
        title="Sections"
        description="Assign sections to classes."
        headerAction={headerAction}
        data={sectionRows}
        columns={[
          { header: "Class", accessor: "class_name" },
          { header: "Section", accessor: "section_name" },
          {
            header: "Class Teacher",
            accessor: (row) => (
              <NativeSelect
                className="max-w-[200px]"
                options={[
                  { value: UNASSIGNED, label: "— No class teacher —" },
                  ...teachers,
                ]}
                value={assignments[row.id] || UNASSIGNED}
                disabled={savingTeacher === row.id}
                onChange={(e) =>
                  handleClassTeacherChange(
                    row.id,
                    e.target.value === UNASSIGNED ? "" : e.target.value
                  )
                }
              />
            ),
          },
        ]}
        searchKeys={["class_name", "section_name"]}
        searchPlaceholder="Search sections..."
        renderActions={(row) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(row)}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => deleteSection(row)}
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
                <p className="font-medium text-foreground">{row.class_name} – Section {row.section_name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openEdit(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteSection(row)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <NativeSelect
                className="w-full"
                options={[
                  { value: UNASSIGNED, label: "— No class teacher —" },
                  ...teachers,
                ]}
                value={assignments[row.id] || UNASSIGNED}
                disabled={savingTeacher === row.id}
                onChange={(e) =>
                  handleClassTeacherChange(
                    row.id,
                    e.target.value === UNASSIGNED ? "" : e.target.value
                  )
                }
              />
            </div>
          </div>
        )}
        emptyState={
          <EmptyState
            icon={School}
            title="No sections yet"
            description="Add sections after creating classes."
          />
        }
      />

      {/* Edit section dialog */}
      <Dialog open={!!editSection} onOpenChange={(open) => { if (!open) setEditSection(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Section — {editSection?.class_name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-1.5">
              <Label>Section Name</Label>
              <Input
                value={editSectionName}
                onChange={(e) => setEditSectionName(e.target.value)}
                required
                autoFocus
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
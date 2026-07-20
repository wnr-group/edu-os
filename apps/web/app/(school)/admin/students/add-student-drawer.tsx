"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { avatarColor, initialsOf } from "@/lib/student-avatar";

interface ClassOption {
  id: string;
  name: string;
}
interface SectionOption {
  id: string;
  name: string;
}

const emptyForm = {
  name: "",
  email: "",
  admission: "",
  roll: "",
  classId: "",
  sectionId: "",
  gender: "",
  dob: "",
  parentName: "",
  parentPhone: "",
};

export function AddStudentDrawer({
  schoolId,
  academicYearId,
  classes,
  open,
  onClose,
}: {
  schoolId: string;
  academicYearId: string;
  classes: ClassOption[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setSections([]);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!form.classId || !academicYearId) {
      setSections([]);
      return;
    }
    const supabase = createClient();
    supabase
      .from("sections")
      .select("id, name")
      .eq("class_id", form.classId)
      .eq("academic_year_id", academicYearId)
      .order("name")
      .then(({ data, error: err }) => {
        if (!err) {
          setSections(data ?? []);
          setForm((f) => ({ ...f, sectionId: "" }));
        }
      });
  }, [form.classId, academicYearId]);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Full name is required.");
    if (!form.classId) return setError("Class is required.");
    if (!form.sectionId) return setError("Section is required.");
    if (!form.parentPhone.trim()) return setError("Parent phone is required.");

    setLoading(true);
    try {
      const supabase = createClient();

      const resp = await fetch("/api/students/resolve-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.parentPhone,
          schoolId,
          parentName: form.parentName,
          studentName: form.name,
        }),
      });
      const resolveJson = await resp.json();
      if (!resp.ok) {
        setError(resolveJson.error ?? "Failed to resolve parent.");
        return;
      }
      const parentProfileId: string = resolveJson.parentProfileId;

      const { data: sp, error: spErr } = await supabase
        .from("student_profiles")
        .insert({
          school_id: schoolId,
          full_name: form.name,
          email: form.email || null,
          admission_number: form.admission || null,
          date_of_birth: form.dob || null,
          gender: form.gender || null,
          parent_profile_id: parentProfileId,
        })
        .select("id")
        .single();

      if (spErr || !sp) {
        setError(spErr?.message ?? "Failed to create student.");
        return;
      }

      const { error: enrollErr } = await supabase.from("student_enrollments").insert({
        student_profile_id: sp.id,
        academic_year_id: academicYearId,
        school_id: schoolId,
        class_id: form.classId,
        section_id: form.sectionId,
        roll_number: form.roll || null,
        is_active: true,
      });

      if (enrollErr) {
        setError(enrollErr.message);
        await supabase.from("student_profiles").delete().eq("id", sp.id);
        return;
      }

      toast.success("Student added.");
      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted) return null;

  const previewMeta = [
    classes.find((c) => c.id === form.classId)?.name,
    sections.find((s) => s.id === form.sectionId)?.name ? `Section ${sections.find((s) => s.id === form.sectionId)?.name}` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "No class assigned yet";

  const av = avatarColor(form.name || "?");

  return createPortal(
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-slate-900/45" />
      <form onSubmit={handleSave} autoComplete="off" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <div className="text-lg font-bold text-foreground">Add a new student</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Create a single enrollment record. Required fields are marked with *.
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
              style={{ background: av.bg, color: av.fg }}
            >
              {initialsOf(form.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-foreground">{form.name || "New student"}</div>
              <div className="text-xs text-muted-foreground">{previewMeta}</div>
            </div>
          </div>

          <div className="mb-3 text-xs font-bold tracking-wide text-muted-foreground">STUDENT DETAILS</div>
          <div className="grid grid-cols-2 gap-3.5">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Full name *</label>
              <Input name="student_name" autoComplete="off" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Aarav Sharma" />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
              <Input type="email" name="student_email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="student@demo.edu" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Admission no</label>
              <Input name="admission_number" autoComplete="off" value={form.admission} onChange={(e) => set("admission", e.target.value)} placeholder="ADM2026-0047" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Roll no</label>
              <Input name="roll_number" autoComplete="off" value={form.roll} onChange={(e) => set("roll", e.target.value)} placeholder="1A-12" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Class *</label>
              <NativeSelect
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
                value={form.classId}
                onChange={(e) => set("classId", e.target.value)}
                placeholder="Select class"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Section *</label>
              <NativeSelect
                options={sections.map((s) => ({ value: s.id, label: s.name }))}
                value={form.sectionId}
                onChange={(e) => set("sectionId", e.target.value)}
                placeholder="Select section"
                disabled={!form.classId}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Gender</label>
              <NativeSelect
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                  { value: "other", label: "Other" },
                ]}
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
                placeholder="Select gender"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date of birth</label>
              <Input type="date" name="date_of_birth" autoComplete="off" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </div>
          </div>

          <div className="mb-3 mt-6 text-xs font-bold tracking-wide text-muted-foreground">PARENT / GUARDIAN</div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Parent name</label>
              <Input name="parent_name" autoComplete="off" value={form.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="e.g. Ramesh Sharma" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Parent phone *</label>
              <Input type="tel" name="parent_phone" autoComplete="tel" value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2.5 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save student"}
          </Button>
        </div>
      </form>
    </>,
    document.body
  );
}

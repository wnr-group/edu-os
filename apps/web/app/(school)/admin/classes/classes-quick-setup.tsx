"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, X, Info } from "lucide-react";

const PRESET_CLASSES = [
  "LKG", "UKG",
  "1", "2", "3", "4", "5",
  "6", "7", "8", "9", "10",
  "11", "12",
];

const PRESET_SECTIONS = ["A", "B", "C", "D", "E"];

export function ClassesQuickSetup({ schoolId, academicYearId, onAfterCreate }: { schoolId: string; academicYearId: string; onAfterCreate?: () => void }) {
  const router = useRouter();
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [customClasses, setCustomClasses] = useState<string[]>([]);
  const [customClassInput, setCustomClassInput] = useState("");
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(["A", "B"]));
  const [customSections, setCustomSections] = useState<string[]>([]);
  const [customSectionInput, setCustomSectionInput] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleClass(name: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleSection(name: string) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustomClass() {
    const name = customClassInput.trim();
    if (!name || customClasses.includes(name) || selectedClasses.has(name)) return;
    setCustomClasses((prev) => [...prev, name]);
    setSelectedClasses((prev) => new Set([...prev, name]));
    setCustomClassInput("");
  }

  function removeCustomClass(name: string) {
    setCustomClasses((prev) => prev.filter((c) => c !== name));
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

  function addCustomSection() {
    const name = customSectionInput.trim();
    if (!name || customSections.includes(name) || selectedSections.has(name)) return;
    setCustomSections((prev) => [...prev, name]);
    setSelectedSections((prev) => new Set([...prev, name]));
    setCustomSectionInput("");
  }

  function removeCustomSection(name: string) {
    setCustomSections((prev) => prev.filter((s) => s !== name));
    setSelectedSections((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

  const allClasses = [...PRESET_CLASSES.filter((c) => selectedClasses.has(c)), ...customClasses.filter((c) => selectedClasses.has(c))];
  const allSections = [...PRESET_SECTIONS.filter((s) => selectedSections.has(s)), ...customSections.filter((s) => selectedSections.has(s))];
  const totalCombinations = allClasses.length * allSections.length;

  async function handleCreate() {
    if (allClasses.length === 0) {
      toast.error("Select at least one class.");
      return;
    }
    if (allSections.length === 0) {
      toast.error("Select at least one section.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Get current max order to continue from
    const { data: maxRow } = await supabase
      .from("classes")
      .select("order")
      .eq("school_id", schoolId)
      .order("order", { ascending: false })
      .limit(1)
      .single();
    const startOrder = (maxRow?.order ?? 0) + 1;

    // Create classes with order
    const classRows = allClasses.map((name, i) => ({
      school_id: schoolId,
      name,
      order: startOrder + i,
    }));

    const { data: createdClasses, error: classError } = await supabase
      .from("classes")
      .insert(classRows)
      .select("id, name");

    if (classError) {
      toast.error(classError.message);
      setLoading(false);
      return;
    }

    // Create sections for each class
    const sectionRows = (createdClasses ?? []).flatMap((cls) =>
      allSections.map((sectionName) => ({
        school_id: schoolId,
        class_id: cls.id,
        name: sectionName,
        academic_year_id: academicYearId,
      }))
    );

    if (sectionRows.length > 0) {
      const { error: sectionError } = await supabase
        .from("sections")
        .insert(sectionRows);

      if (sectionError) {
        toast.error("Classes created but sections failed: " + sectionError.message);
        setLoading(false);
        router.refresh();
        return;
      }
    }

    setLoading(false);
    toast.success(`Created ${allClasses.length} classes × ${allSections.length} sections = ${totalCombinations} total.`);
    setSelectedClasses(new Set());
    setCustomClasses([]);
    setSelectedSections(new Set(["A", "B"]));
    setCustomSections([]);
    router.refresh();
    onAfterCreate?.();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Quick Setup</h2>
        <p className="mt-1 text-sm text-muted-foreground">Create classes and sections in a few clicks.</p>
      </div>

      {/* Classes | Sections per Class — two individually-boxed cards, side by side on desktop */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Classes box */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-foreground">Classes</p>
          <p className="mb-3 text-xs text-muted-foreground">Select or add classes</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_CLASSES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggleClass(name)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedClasses.has(name)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-border bg-white text-foreground hover:border-muted-foreground/40"
                }`}
              >
                {name}
              </button>
            ))}
            {customClasses.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => removeCustomClass(name)}
                className="flex items-center gap-1 rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                {name} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={customClassInput}
              onChange={(e) => setCustomClassInput(e.target.value)}
              placeholder="Custom class name..."
              className="flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomClass(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addCustomClass}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Sections per Class box */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-foreground">Sections per Class</p>
          <p className="mb-3 text-xs text-muted-foreground">Select or add sections</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_SECTIONS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggleSection(name)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSections.has(name)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-border bg-white text-foreground hover:border-muted-foreground/40"
                }`}
              >
                {name}
              </button>
            ))}
            {customSections.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => removeCustomSection(name)}
                className="flex items-center gap-1 rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                {name} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={customSectionInput}
              onChange={(e) => setCustomSectionInput(e.target.value)}
              placeholder="Custom section name..."
              className="flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSection(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addCustomSection}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Info banner + Create */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-indigo-500" />
          {allClasses.length > 0 && allSections.length > 0 ? (
            <span>
              <span className="font-semibold text-foreground">{allClasses.length}</span> classes ×{" "}
              <span className="font-semibold text-foreground">{allSections.length}</span> sections ={" "}
              <span className="font-semibold text-foreground">{totalCombinations}</span> total
            </span>
          ) : (
            "Select classes and sections above to create them all at once"
          )}
        </p>
        <Button
          onClick={handleCreate}
          disabled={loading || allClasses.length === 0 || allSections.length === 0}
          className="shrink-0"
        >
          {loading ? "Creating…" : "Create All"}
        </Button>
      </div>
    </div>
  );
}
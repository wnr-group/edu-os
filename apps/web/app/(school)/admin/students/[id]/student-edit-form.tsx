"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string }

interface Props {
  studentId: string;
  enrollmentId: string | null;
  schoolId: string;
  initialName: string;
  initialEmail: string;
  initialRoll: string;
  initialAdmission: string;
  initialParentPhone: string;
  initialDateOfBirth: string;
  initialParentName: string;
  initialGender: string;
  initialClassId: string;
  initialSectionId: string;
  classes: ClassOption[];
}

export function StudentEditForm({
  studentId,
  enrollmentId,
  schoolId,
  initialName,
  initialEmail,
  initialRoll,
  initialAdmission,
  initialParentPhone,
  initialDateOfBirth,
  initialParentName,
  initialGender,
  initialClassId,
  initialSectionId,
  classes,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [roll, setRoll] = useState(initialRoll);
  const [admission, setAdmission] = useState(initialAdmission);
  const [parentPhone, setParentPhone] = useState(initialParentPhone);
  const [dateOfBirth, setDateOfBirth] = useState(initialDateOfBirth);
  const [parentName, setParentName] = useState(initialParentName);
  const [gender, setGender] = useState(initialGender);
  const [classId, setClassId] = useState(initialClassId);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) return;
    const supabase = createClient();
    supabase
      .from("sections")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .then(({ data }) => {
        setSections(data ?? []);
      });
  }, [classId, schoolId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();

      // Update name/email on profiles via secure RPC
      const { data: sp } = await supabase
        .from("student_profiles")
        .select("profile_id")
        .eq("id", studentId)
        .single();

      if (sp?.profile_id) {
        const { error: profileErr } = await supabase.rpc("update_student_profile_identity", {
          p_profile_id: sp.profile_id,
          p_full_name: name,
          p_email: email || null,
        });
        if (profileErr) { toast.error(profileErr.message); return; }
      }

      // Resolve the parent identity by phone (find-or-create + parent role),
      // then link the student to it. The parent's phone/name live on their
      // profile/auth identity — not on the student row.
      if (!parentPhone.trim()) { toast.error("Parent phone is required."); return; }
      const resp = await fetch("/api/students/resolve-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parentPhone, schoolId, parentName, studentName: name }),
      });
      const resolveJson = await resp.json();
      if (!resp.ok) { toast.error(resolveJson.error ?? "Failed to resolve parent."); return; }
      const parentProfileId: string = resolveJson.parentProfileId;

      // Update student_profiles fields
      const { error: spErr } = await supabase
        .from("student_profiles")
        .update({
          admission_number: admission || null,
          date_of_birth: dateOfBirth || null,
          gender: gender || null,
          parent_profile_id: parentProfileId,
        })
        .eq("id", studentId);
      if (spErr) { toast.error(spErr.message); return; }

      // Update class/section/roll on the enrollment row
      if (enrollmentId) {
        const { error: enrErr } = await supabase
          .from("student_enrollments")
          .update({
            roll_number: roll || null,
            class_id: classId || null,
            section_id: sectionId || null,
          })
          .eq("id", enrollmentId);
        if (enrErr) { toast.error(enrErr.message); return; }
      }

      toast.success("Student profile updated.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
      <div><Label>Full Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label>Roll Number</Label><Input value={roll} onChange={(e) => setRoll(e.target.value)} /></div>
      <div><Label>Admission Number</Label><Input value={admission} onChange={(e) => setAdmission(e.target.value)} /></div>
      <div className="col-span-2"><Label>Parent Phone *</Label><Input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+91 98765 43210" /></div>
      <div className="col-span-2">
        <Label>Parent / Guardian Name</Label>
        <Input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="e.g. RAMESH A" />
      </div>
      <div>
        <Label>Date of Birth</Label>
        <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
      </div>
      <div>
        <Label>Gender</Label>
        <NativeSelect
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
          ]}
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          placeholder="Select gender"
        />
      </div>
      <div>
        <Label>Class</Label>
        <NativeSelect
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}
          placeholder="Select class"
        />
      </div>
      <div>
        <Label>Section</Label>
        <NativeSelect
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          placeholder="Select section"
          disabled={!classId}
        />
      </div>
      <div className="col-span-2">
        <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save Changes"}</Button>
      </div>
    </form>
  );
}

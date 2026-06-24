import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import { SectionSwitcher } from "../../components/SectionSwitcher";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SkeletonCard } from "../../components/Skeleton";
import { PickerModal, SelectRow, PickerOption } from "../../components/PickerModal";
import { loadTeacherHomework, uploadAttachment, notifyAssigned, TeacherHomeworkItem } from "../../lib/homework";
import { useKeyboardHeight } from "../../lib/useKeyboardHeight";

type Tab = "homework" | "results";

interface ResultItem { id: string; student_name: string; subject: string; marks_obtained: number; max_marks: number; grade: string }

interface TeacherContext {
  userId: string;
  schoolId: string;
  sectionId: string;
  classId: string;
  sectionName: string;
}

function gradeFromMarks(marks: number, max: number): string {
  const pct = (marks / max) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "F";
}

function computeRanks(items: ResultItem[]): { id: string; student_name: string; totalObtained: number; totalMax: number; grade: string; rank: number }[] {
  const studentAgg: Record<string, { student_name: string; totalObtained: number; totalMax: number; id: string }> = {};
  for (const r of items) {
    if (!studentAgg[r.student_name]) {
      studentAgg[r.student_name] = { student_name: r.student_name, totalObtained: 0, totalMax: 0, id: r.id };
    }
    studentAgg[r.student_name].totalObtained += r.marks_obtained;
    studentAgg[r.student_name].totalMax += r.max_marks;
  }
  const sorted = Object.values(studentAgg).sort((a, b) => b.totalObtained - a.totalObtained);
  let rank = 1;
  return sorted.map((s, i) => {
    if (i > 0 && sorted[i - 1].totalObtained > s.totalObtained) rank = i + 1;
    return { ...s, rank, grade: gradeFromMarks(s.totalObtained, s.totalMax) };
  });
}

export default function TeacherClasses() {
  const theme = useTheme();
  const router = useRouter();
  const { activeSection, userId, schoolId, ready } = useTeacherContext();
  const kbHeight = useKeyboardHeight();
  const [tab, setTab] = useState<Tab>("homework");

  const [homework, setHomework] = useState<TeacherHomeworkItem[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ctx is derived from shared context — kept for backward compat with submit fns
  const ctx: TeacherContext | null = activeSection
    ? { userId, schoolId, sectionId: activeSection.id, classId: activeSection.classId, sectionName: activeSection.label }
    : null;

  // Subject options loaded from DB
  const [subjectOptions, setSubjectOptions] = useState<PickerOption[]>([]);
  // Student options for the teacher's class
  const [studentOptions, setStudentOptions] = useState<PickerOption[]>([]);
  // Exam options for results
  const [examOptions, setExamOptions] = useState<PickerOption[]>([]);

  // Add Homework form
  const [showAddHW, setShowAddHW] = useState(false);
  const [hwForm, setHWForm] = useState({ title: "", subjectId: "", subjectLabel: "", description: "", dueDate: new Date() });
  const [showHWSubjectPicker, setShowHWSubjectPicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [savingHW, setSavingHW] = useState(false);
  const [hwAttachments, setHWAttachments] = useState<{ uri: string; name: string; mimeType: string; size: number }[]>([]);

  // Add Result form
  const [showAddResult, setShowAddResult] = useState(false);
  const [resForm, setResForm] = useState({ studentId: "", studentLabel: "", subjectId: "", subjectLabel: "", examId: "", examLabel: "", marks: "", maxMarks: "100" });
  const [showResStudentPicker, setShowResStudentPicker] = useState(false);
  const [showResSubjectPicker, setShowResSubjectPicker] = useState(false);
  const [showResExamPicker, setShowResExamPicker] = useState(false);
  const [savingRes, setSavingRes] = useState(false);

  useEffect(() => {
    if (!ready) return;
    loadAll();
  }, [activeSection?.id, ready]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [activeSection?.id, ready]);

  async function loadAll() {
    setLoading(true);
    if (!activeSection || !userId || !schoolId) { setLoading(false); return; }

    const sectionId = activeSection.id;
    const classId = activeSection.classId;

    // Load subjects, students, exams, homework in parallel
    const [subjectsRes, studentsRes, examsRes, hwItems] = await Promise.all([
      supabase.from("subjects").select("id, name").eq("class_id", classId).eq("school_id", schoolId).order("name"),
      supabase.from("student_enrollments").select("student_profile_id, student_profiles(id, full_name)").eq("section_id", sectionId).eq("is_active", true).order("student_profile_id"),
      supabase.from("exams").select("id, name").eq("school_id", schoolId).order("start_date", { ascending: false }).limit(10),
      loadTeacherHomework(sectionId, userId),
    ]);

    // Fetch results only for students in this section
    const studentIds = (studentsRes.data ?? []).map((s: any) => s.student_profiles?.id).filter(Boolean);
    const resultsRes = studentIds.length > 0
      ? await supabase.from("exam_results").select("id, marks_obtained, max_marks, grade, subjects(name), student_profiles!student_id(full_name)").in("student_id", studentIds).eq("school_id", schoolId).order("created_at", { ascending: false })
      : { data: [] };

    setSubjectOptions((subjectsRes.data ?? []).map((s: any) => ({ label: s.name, value: s.id })));
    setStudentOptions((studentsRes.data ?? []).map((s: any) => ({ label: s.student_profiles?.full_name ?? "Student", value: s.student_profiles?.id ?? "" })).filter((o: any) => o.value));
    setExamOptions((examsRes.data ?? []).map((e: any) => ({ label: e.name, value: e.id })));

    setHomework(hwItems);
    setResults((resultsRes.data ?? []).map((r: any) => ({
      id: r.id,
      student_name: r.student_profiles?.full_name ?? "Student",
      subject: r.subjects?.name ?? "—",
      marks_obtained: r.marks_obtained ?? 0,
      max_marks: r.max_marks ?? 100,
      grade: r.grade ?? "—",
    })));
    setLoading(false);
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > 2 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 2MB."); return; }
    setHWAttachments((p) => [...p, { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", size: a.size ?? 0 }]);
  }

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > 2 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 2MB."); return; }
    const name = a.fileName ?? `photo-${Date.now()}.jpg`;
    setHWAttachments((p) => [...p, { uri: a.uri, name, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0 }]);
  }

  async function submitHomework() {
    if (!hwForm.title.trim()) { Alert.alert("Missing", "Please enter a title."); return; }
    if (!hwForm.subjectId) { Alert.alert("Missing", "Please select a subject."); return; }
    if (!ctx?.sectionId) { Alert.alert("Error", "No class assigned to you."); return; }
    setSavingHW(true);
    const { data: created, error } = await supabase.from("homework").insert({
      title: hwForm.title.trim(),
      description: hwForm.description.trim() || null,
      due_date: hwForm.dueDate.toISOString().split("T")[0],
      subject_id: hwForm.subjectId,
      teacher_id: ctx.userId,
      section_id: ctx.sectionId,
      class_id: ctx.classId,
      school_id: ctx.schoolId,
    }).select("id").single();
    setSavingHW(false);
    if (error || !created) { Alert.alert("Error", error?.message ?? "Could not save"); return; }

    // Upload attachments (sequential; small files).
    for (const f of hwAttachments) {
      const up = await uploadAttachment(ctx.schoolId, created.id, f);
      if (up.error) Alert.alert("Attachment failed", `${f.name}: ${up.error}`);
    }
    // Notify parents (best-effort).
    notifyAssigned(created.id);

    setShowAddHW(false);
    setHWForm({ title: "", subjectId: "", subjectLabel: "", description: "", dueDate: new Date() });
    setHWAttachments([]);
    loadAll();
  }

  async function submitResult() {
    const marks = parseFloat(resForm.marks);
    const maxMarks = parseFloat(resForm.maxMarks);
    if (!resForm.studentId) { Alert.alert("Missing", "Please select a student."); return; }
    if (!resForm.subjectId) { Alert.alert("Missing", "Please select a subject."); return; }
    if (!resForm.examId) { Alert.alert("Missing", "Please select an exam."); return; }
    if (isNaN(marks) || marks < 0) { Alert.alert("Invalid", "Enter a valid marks value."); return; }
    if (marks > maxMarks) { Alert.alert("Invalid", "Marks cannot exceed max marks."); return; }
    if (!ctx) return;
    setSavingRes(true);
    const grade = gradeFromMarks(marks, maxMarks);
    const { error } = await supabase.from("exam_results").upsert({
      school_id: ctx.schoolId,
      exam_id: resForm.examId,
      student_id: resForm.studentId,
      subject_id: resForm.subjectId,
      marks_obtained: marks,
      max_marks: maxMarks,
      grade,
      teacher_id: ctx.userId,
    }, { onConflict: "exam_id,student_id,subject_id" });
    setSavingRes(false);
    if (error) { Alert.alert("Error", error.message); return; }
    setShowAddResult(false);
    setResForm({ studentId: "", studentLabel: "", subjectId: "", subjectLabel: "", examId: "", examLabel: "", marks: "", maxMarks: "100" });
    loadAll();
  }

  const gradeColor = (g: string) => {
    if (g.startsWith("A")) return "#10B981";
    if (g.startsWith("B")) return theme.primary;
    if (g.startsWith("C")) return "#F59E0B";
    return "#EF4444";
  };

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Classes</Text>
          {ctx?.sectionName ? (
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 2 }}>{ctx.sectionName}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => tab === "homework" ? setShowAddHW(true) : setShowAddResult(true)}
          style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <SectionSwitcher />

      {/* Tab switcher */}
      <View style={{ flexDirection: "row", marginHorizontal: 20, marginBottom: 16, backgroundColor: theme.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: theme.border }}>
        {(["homework", "results"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: tab === t ? theme.primary : "transparent", alignItems: "center" }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: tab === t ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? [0,1,2].map(i => <SkeletonCard key={i} />) :
          tab === "homework" ? (
            homework.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
                <Ionicons name="book-outline" size={40} color={theme.textMuted} />
                <Text style={{ fontFamily: "Inter_500Medium", color: theme.textMuted, fontSize: 14 }}>No homework assigned yet</Text>
                <TouchableOpacity onPress={() => setShowAddHW(true)} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.primary }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14 }}>Add First Assignment</Text>
                </TouchableOpacity>
              </View>
            ) : homework.map((h) => {
              const isOverdue = new Date(h.due_date) < new Date();
              return (
                <TouchableOpacity
                  key={h.id}
                  activeOpacity={0.85}
                  onPress={() => router.push({
                    pathname: "/(teacher)/homework/[homeworkId]",
                    params: { homeworkId: h.id, sectionId: activeSection!.id, title: h.title },
                  })}
                  style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + "18", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="book-outline" size={20} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{h.title}</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      {h.subject} · {h.doneCount}/{h.totalCount} done
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: isOverdue ? "#EF4444" : theme.textMuted }}>
                      {isOverdue ? "Overdue" : `Due ${new Date(h.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            results.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
                <Ionicons name="trophy-outline" size={40} color={theme.textMuted} />
                <Text style={{ fontFamily: "Inter_500Medium", color: theme.textMuted, fontSize: 14 }}>No results entered yet</Text>
                <TouchableOpacity onPress={() => setShowAddResult(true)} style={{ marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.primary }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14 }}>Enter First Result</Text>
                </TouchableOpacity>
              </View>
            ) : (() => {
              const ranked = computeRanks(results);
              const RANK_COLORS: Record<number, string> = { 1: "#F59E0B", 2: "#9CA3AF", 3: "#B45309" };
              return (
                <View style={{ gap: 8 }}>
                  {ranked.map((r) => (
                    <View key={r.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={{
                        width: 40, height: 40, borderRadius: 12,
                        backgroundColor: (RANK_COLORS[r.rank] ?? theme.primary) + "18",
                        alignItems: "center", justifyContent: "center"
                      }}>
                        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: RANK_COLORS[r.rank] ?? theme.primary }}>
                          {r.rank <= 3 ? (["🥇","🥈","🥉"])[r.rank - 1] : `#${r.rank}`}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{r.student_name}</Text>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>Grade {r.grade}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>{r.totalObtained}/{r.totalMax}</Text>
                    </View>
                  ))}
                </View>
              );
            })()
          )
        }
      </ScrollView>

      {/* ── Add Homework Sheet ─────────────────────────────────── */}
      <Modal visible={showAddHW} transparent animationType="slide" onRequestClose={() => setShowAddHW(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowAddHW(false)} style={{ flex: 1 }} />
          <ScrollView style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }} contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 36 + kbHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Assign Homework</Text>
              <TouchableOpacity onPress={() => setShowAddHW(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Title</Text>
              <TextInput
                style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
                placeholder="e.g. Chapter 7 Exercises"
                placeholderTextColor={theme.textMuted}
                value={hwForm.title}
                onChangeText={(v) => setHWForm(p => ({ ...p, title: v }))}
              />
            </View>

            {/* Subject dropdown */}
            <SelectRow
              label="Subject"
              displayValue={hwForm.subjectLabel}
              placeholder="Select subject"
              onPress={() => setShowHWSubjectPicker(true)}
            />

            {/* Due date */}
            <SelectRow
              label="Due Date"
              displayValue={hwForm.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              placeholder="Select due date"
              onPress={() => setShowDueDatePicker(true)}
            />

            {/* Description */}
            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Description (optional)</Text>
              <TextInput
                style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, minHeight: 72, textAlignVertical: "top" }}
                placeholder="Instructions or notes for students…"
                placeholderTextColor={theme.textMuted}
                multiline
                value={hwForm.description}
                onChangeText={(v) => setHWForm(p => ({ ...p, description: v }))}
              />
            </View>

            {/* Attachments */}
            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Attachments (optional, ≤2MB each)</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={pickDocument} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}>
                  <Ionicons name="document-outline" size={18} color={theme.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>DOC / PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickImage} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}>
                  <Ionicons name="image-outline" size={18} color={theme.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Photo</Text>
                </TouchableOpacity>
              </View>
              {hwAttachments.map((f, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <Ionicons name="attach" size={16} color={theme.textMuted} />
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }} numberOfLines={1}>{f.name}</Text>
                  <TouchableOpacity onPress={() => setHWAttachments((p) => p.filter((_, j) => j !== i))}>
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <PrimaryButton label="Assign Homework" onPress={submitHomework} loading={savingHW} />
          </ScrollView>
        </View>
      </Modal>

      {/* ── Add Result Sheet ───────────────────────────────────── */}
      <Modal visible={showAddResult} transparent animationType="slide" onRequestClose={() => setShowAddResult(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowAddResult(false)} style={{ flex: 1 }} />
          <ScrollView style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }} contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 36 + kbHeight }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Enter Result</Text>
              <TouchableOpacity onPress={() => setShowAddResult(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <SelectRow label="Student" displayValue={resForm.studentLabel} placeholder="Select student" onPress={() => setShowResStudentPicker(true)} />
            <SelectRow label="Subject" displayValue={resForm.subjectLabel} placeholder="Select subject" onPress={() => setShowResSubjectPicker(true)} />
            <SelectRow label="Exam / Term" displayValue={resForm.examLabel} placeholder="Select exam" onPress={() => setShowResExamPicker(true)} />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Marks Obtained</Text>
                <TextInput
                  style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary, textAlign: "center" }}
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={resForm.marks}
                  onChangeText={(v) => setResForm(p => ({ ...p, marks: v }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Max Marks</Text>
                <TextInput
                  style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary, textAlign: "center" }}
                  placeholder="100"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={resForm.maxMarks}
                  onChangeText={(v) => setResForm(p => ({ ...p, maxMarks: v }))}
                />
              </View>
            </View>

            {resForm.marks && !isNaN(parseFloat(resForm.marks)) && (
              <View style={{ backgroundColor: gradeColor(gradeFromMarks(parseFloat(resForm.marks), parseFloat(resForm.maxMarks) || 100)) + "18", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>Calculated grade:</Text>
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: gradeColor(gradeFromMarks(parseFloat(resForm.marks), parseFloat(resForm.maxMarks) || 100)) }}>
                  {gradeFromMarks(parseFloat(resForm.marks), parseFloat(resForm.maxMarks) || 100)}
                </Text>
              </View>
            )}

            <PrimaryButton label="Save Result" onPress={submitResult} loading={savingRes} />
          </ScrollView>
        </View>
      </Modal>

      {/* Pickers */}
      <PickerModal visible={showHWSubjectPicker} title="Select Subject" options={subjectOptions} value={hwForm.subjectId}
        onSelect={(v, l) => setHWForm(p => ({ ...p, subjectId: v, subjectLabel: l }))} onClose={() => setShowHWSubjectPicker(false)} />
      <PickerModal visible={showResStudentPicker} title="Select Student" options={studentOptions} value={resForm.studentId}
        onSelect={(v, l) => setResForm(p => ({ ...p, studentId: v, studentLabel: l }))} onClose={() => setShowResStudentPicker(false)} />
      <PickerModal visible={showResSubjectPicker} title="Select Subject" options={subjectOptions} value={resForm.subjectId}
        onSelect={(v, l) => setResForm(p => ({ ...p, subjectId: v, subjectLabel: l }))} onClose={() => setShowResSubjectPicker(false)} />
      <PickerModal visible={showResExamPicker} title="Select Exam" options={examOptions} value={resForm.examId}
        onSelect={(v, l) => setResForm(p => ({ ...p, examId: v, examLabel: l }))} onClose={() => setShowResExamPicker(false)} />
      <PickerModal
        visible={showDueDatePicker}
        title="Due Date"
        options={Array.from({ length: 30 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() + i + 1);
          return { label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" }), value: d.toISOString() };
        })}
        value={hwForm.dueDate.toISOString()}
        onSelect={(v) => setHWForm(p => ({ ...p, dueDate: new Date(v) }))}
        onClose={() => setShowDueDatePicker(false)}
      />
    </SafeAreaView>
  );
}

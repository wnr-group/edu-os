import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import { SectionSwitcher } from "../../components/SectionSwitcher";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SkeletonCard } from "../../components/Skeleton";
import { PickerModal, SelectRow, PickerOption } from "../../components/PickerModal";
import { useKeyboardHeight } from "../../lib/useKeyboardHeight";

type DisciplineCategory = "behavioral" | "academic" | "attendance";
type DisciplineSeverity = "verbal" | "written" | "suspension";

interface DisciplineRecord {
  id: string;
  student_name: string;
  incident_date: string;
  description: string;
  severity: DisciplineSeverity;
  category: DisciplineCategory;
}

const CATEGORY_OPTIONS: PickerOption[] = [
  { label: "Behavioral", value: "behavioral" },
  { label: "Academic", value: "academic" },
  { label: "Attendance", value: "attendance" },
];

const SEVERITY_OPTIONS: PickerOption[] = [
  { label: "Verbal Warning", value: "verbal" },
  { label: "Written Warning", value: "written" },
  { label: "Suspension", value: "suspension" },
];

const SEVERITY_COLORS: Record<DisciplineSeverity, string> = {
  verbal: "#F59E0B",
  written: "#EF4444",
  suspension: "#7C3AED",
};

const CATEGORY_ICONS: Record<DisciplineCategory, "person-outline" | "book-outline" | "time-outline"> = {
  behavioral: "person-outline",
  academic: "book-outline",
  attendance: "time-outline",
};

export default function TeacherDiscipline() {
  const theme = useTheme();
  const { activeSection, userId, schoolId, ready } = useTeacherContext();
  const kbHeight = useKeyboardHeight();
  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    studentId: "", studentLabel: "",
    category: "" as DisciplineCategory | "",
    categoryLabel: "",
    severity: "" as DisciplineSeverity | "",
    severityLabel: "",
    description: "",
  });
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSeverityPicker, setShowSeverityPicker] = useState(false);
  const [studentOptions, setStudentOptions] = useState<PickerOption[]>([]);

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
    if (!userId) { setLoading(false); return; }

    const sectionId = activeSection?.id ?? "";

    const studentsRes = sectionId
      ? await supabase.from("student_enrollments").select("student_profile_id, student_profiles(id, full_name)").eq("section_id", sectionId).eq("is_active", true).order("student_profile_id")
      : { data: [] };

    const studentIds = (studentsRes.data ?? []).map((s: any) => s.student_profiles?.id).filter(Boolean);
    const recordsRes = studentIds.length > 0
      ? await supabase
          .from("discipline_records")
          .select("id, created_at, description, severity, category, student_profiles!student_id(full_name)")
          .in("student_id", studentIds)
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(30)
      : { data: [] };

    setStudentOptions((studentsRes.data ?? []).map((s: any) => ({ label: s.student_profiles?.full_name ?? "Student", value: s.student_profiles?.id ?? "" })).filter((o: any) => o.value));
    setRecords((recordsRes.data ?? []).map((r: any) => ({
      id: r.id,
      student_name: r.student_profiles?.full_name ?? "Unknown Student",
      incident_date: r.created_at,
      description: r.description,
      severity: r.severity as DisciplineSeverity,
      category: r.category as DisciplineCategory,
    })));
    setLoading(false);
  }

  async function submitRecord() {
    if (!form.studentId) { Alert.alert("Missing", "Please select a student."); return; }
    if (!form.category) { Alert.alert("Missing", "Please select a category."); return; }
    if (!form.severity) { Alert.alert("Missing", "Please select the action taken."); return; }
    if (!form.description.trim()) { Alert.alert("Missing", "Please describe the incident."); return; }
    if (!userId || !schoolId) return;
    setSaving(true);
    const { error } = await supabase.from("discipline_records").insert({
      school_id: schoolId,
      student_id: form.studentId,
      category: form.category,
      severity: form.severity,
      description: form.description.trim(),
      recorded_by: userId,
    });
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    setShowAdd(false);
    setForm({ studentId: "", studentLabel: "", category: "", categoryLabel: "", severity: "", severityLabel: "", description: "" });
    loadAll();
  }

  const severityBadge = (s: DisciplineSeverity) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: SEVERITY_COLORS[s] + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: SEVERITY_COLORS[s] }} />
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: SEVERITY_COLORS[s], textTransform: "capitalize" }}>{s}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Discipline</Text>
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <SectionSwitcher />

      {/* Records list */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? [0,1,2].map(i => <SkeletonCard key={i} />) :
          records.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 56, gap: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={44} color={theme.textMuted} />
              <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textMuted, fontSize: 15 }}>No incidents recorded</Text>
              <Text style={{ fontFamily: "Inter_400Regular", color: theme.textMuted, fontSize: 13, textAlign: "center" }}>Tap + to log an incident</Text>
            </View>
          ) : records.map((r) => (
            <View key={r.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: SEVERITY_COLORS[r.severity] + "18", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={CATEGORY_ICONS[r.category]} size={18} color={SEVERITY_COLORS[r.severity]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{r.student_name}</Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 2, textTransform: "capitalize" }}>{r.category}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
                  {new Date(r.incident_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 19 }}>{r.description}</Text>
              {severityBadge(r.severity)}
            </View>
          ))
        }
      </ScrollView>

      {/* ── Log Incident Sheet ─────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowAdd(false)} style={{ flex: 1 }} />
          <ScrollView style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" }} contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 36 + kbHeight }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Log Incident</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <SelectRow label="Student" displayValue={form.studentLabel} placeholder="Select student" onPress={() => setShowStudentPicker(true)} />
            <SelectRow label="Category" displayValue={form.categoryLabel} placeholder="Select category" onPress={() => setShowCategoryPicker(true)} />
            <SelectRow label="Action Taken" displayValue={form.severityLabel} placeholder="Select action" onPress={() => setShowSeverityPicker(true)} />

            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Incident Description</Text>
              <TextInput
                style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, minHeight: 88, textAlignVertical: "top" }}
                placeholder="Describe what happened…"
                placeholderTextColor={theme.textMuted}
                multiline
                value={form.description}
                onChangeText={(v) => setForm(p => ({ ...p, description: v }))}
              />
            </View>

            <PrimaryButton label="Log Incident" onPress={submitRecord} loading={saving} />
          </ScrollView>
        </View>
      </Modal>

      {/* Pickers */}
      <PickerModal visible={showStudentPicker} title="Select Student" options={studentOptions} value={form.studentId}
        onSelect={(v, l) => setForm(p => ({ ...p, studentId: v, studentLabel: l }))} onClose={() => setShowStudentPicker(false)} />
      <PickerModal visible={showCategoryPicker} title="Incident Category" options={CATEGORY_OPTIONS} value={form.category}
        onSelect={(v, l) => setForm(p => ({ ...p, category: v as DisciplineCategory, categoryLabel: l }))} onClose={() => setShowCategoryPicker(false)} />
      <PickerModal visible={showSeverityPicker} title="Action Taken" options={SEVERITY_OPTIONS} value={form.severity}
        onSelect={(v, l) => setForm(p => ({ ...p, severity: v as DisciplineSeverity, severityLabel: l }))} onClose={() => setShowSeverityPicker(false)} />
    </SafeAreaView>
  );
}

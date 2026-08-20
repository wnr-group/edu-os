import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import * as Print from "expo-print";
import { StorageAccessFramework, EncodingType, readAsStringAsync, writeAsStringAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { supabase, supabaseUrl } from "../../lib/supabase";
import { useActiveContext } from "../../lib/active-context";
import { useTheme, useFeature } from "../../lib/theme";
import { loadParentHomework, loadParentHomeworkRange, ParentHomeworkItem, ParentHomeworkState } from "../../lib/homework";
import { StatusBadge } from "../../components/StatusBadge";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";

interface SubjectResult {
  id: string;
  subject: string;
  marks_obtained: number;
  max_marks: number;
  grade: string;
}

interface ExamResult {
  examId: string;
  examName: string;
  startDate: string;
  endDate: string;
  academicYear: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  rank: number;
  totalStudents: number;
}
export default function ParentAcademics() {
  const theme = useTheme();
  const examsEnabled = useFeature("exams");
  const homeworkEnabled = useFeature("homework");
  const reportCardsEnabled = useFeature("report_cards");
  const testingEnabled = useFeature("testing");
  const router = useRouter();
  const { studentId: activeStudentId } = useActiveContext();
  const [tab, setTab] = useState<"results" | "homework">("homework");
  const [groupedResults, setGroupedResults] = useState<Record<string, ExamResult[]>>({});
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [homework, setHomework] = useState<ParentHomeworkItem[]>([]);
  const [hwView, setHWView] = useState<"calendar" | "list">("calendar");
  const [rangeHomework, setRangeHomework] = useState<ParentHomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });
  const [studentSectionId, setStudentSectionId] = useState<string | null>(null);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  const [downloadingExamId, setDownloadingExamId] = useState<string | null>(null);

  async function downloadReportCard(examId: string, examName: string) {
    if (!studentProfileId) return;
    setDownloadingExamId(examId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${supabaseUrl}/functions/v1/generate-report-card`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ studentId: studentProfileId, examId }),
        }
      );
      if (!res.ok) throw new Error("Failed to generate report card");
      const html = await res.text();
      const { uri } = await Print.printToFileAsync({ html });
      const fileName = `Report-Card-${examName.replace(/\s+/g, "-")}.pdf`;

      if (Platform.OS === "android") {
        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;
        const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        const newUri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          fileName,
          "application/pdf"
        );
        await writeAsStringAsync(newUri, base64, { encoding: EncodingType.Base64 });
        Alert.alert("Saved", `${fileName} saved successfully`);
      } else {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not download report card");
    } finally {
      setDownloadingExamId(null);
    }
  }

  useEffect(() => { loadData(); }, [activeStudentId]);

  useEffect(() => {
    if (studentSectionId) {
      loadHomeworkForMonth(studentSectionId, calendarMonth.year, calendarMonth.month);
    }
  }, [calendarMonth.year, calendarMonth.month, studentSectionId]);

  useEffect(() => {
    if (studentSectionId && activeStudentId) {
      loadParentHomeworkRange(studentSectionId, activeStudentId).then(setRangeHomework);
    } else {
      setRangeHomework([]);
    }
  }, [studentSectionId, activeStudentId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    if (studentSectionId && activeStudentId) {
      setRangeHomework(await loadParentHomeworkRange(studentSectionId, activeStudentId));
    }
    setRefreshing(false);
  }, [activeStudentId, studentSectionId]);

  async function loadHomeworkForMonth(sectionId: string, year: number, month: number) {
    if (!activeStudentId) { setHomework([]); return; }
    const items = await loadParentHomework(sectionId, activeStudentId, year, month);
    setHomework(items);
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!activeStudentId) {
      setStudentProfileId(null);
      setStudentSectionId(null);
      setGroupedResults({});
      setHomework([]);
      setLoading(false);
      return;
    }

    const { data: sp } = await supabase
      .from("student_profiles")
      .select("id, student_enrollments(section_id)")
      .eq("id", activeStudentId)
      .eq("student_enrollments.is_active", true)
      .maybeSingle();
    const studentId = sp?.id;
    const enrollments = (sp as any)?.student_enrollments;
    const sectionId: string | undefined = Array.isArray(enrollments)
      ? enrollments[0]?.section_id
      : enrollments?.section_id;
    setStudentProfileId(studentId ?? null);
    setStudentSectionId(sectionId ?? null);

    // Fetch this student's exam results with exam + academic year info
    const resultsRes = studentId
      ? await supabase
          .from("exam_results")
          .select("id, marks_obtained, max_marks, grade, exam_id, subjects(name), exams(id, name, start_date, end_date, academic_years(name))")
          .eq("student_id", studentId)
      : { data: [] };

    // Fetch all exam results in same exams (for rank computation)
    const myExamIds = ((resultsRes.data ?? []) as any[])
      .map((r: any) => r.exams?.id ?? r.exam_id)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    const allSectionResultsRes = myExamIds.length > 0
      ? await supabase
          .from("exam_results")
          .select("student_id, exam_id, marks_obtained, grade")
          .in("exam_id", myExamIds)
      : { data: [] };

    // Homework is loaded via loadHomeworkForMonth after sectionId is stored

    // Build per-exam totals + subject counts for all students (for rank)
    const allResults = (allSectionResultsRes.data ?? []) as any[];
    const studentTotals: Record<string, Record<string, number>> = {};
    const studentSubjectCounts: Record<string, Record<string, number>> = {};
    const studentHasFail: Record<string, Record<string, boolean>> = {};
    for (const r of allResults) {
      if (!studentTotals[r.exam_id]) studentTotals[r.exam_id] = {};
      if (!studentSubjectCounts[r.exam_id]) studentSubjectCounts[r.exam_id] = {};
      if (!studentHasFail[r.exam_id]) studentHasFail[r.exam_id] = {};
      studentTotals[r.exam_id][r.student_id] = (studentTotals[r.exam_id][r.student_id] ?? 0) + (r.marks_obtained ?? 0);
      studentSubjectCounts[r.exam_id][r.student_id] = (studentSubjectCounts[r.exam_id][r.student_id] ?? 0) + 1;
      if (r.grade === "F") studentHasFail[r.exam_id][r.student_id] = true;
    }

    // Group this student's results by exam
    const examMap: Record<string, ExamResult> = {};
    for (const r of (resultsRes.data ?? []) as any[]) {
      const examId = r.exams?.id ?? r.exam_id;
      if (!examMap[examId]) {
        examMap[examId] = {
          examId,
          examName: r.exams?.name ?? "—",
          startDate: r.exams?.start_date ?? "",
          endDate: r.exams?.end_date ?? "",
          academicYear: r.exams?.academic_years?.name ?? "—",
          subjects: [],
          totalObtained: 0,
          totalMax: 0,
          rank: 0,
          totalStudents: 0,
        };
      }
      examMap[examId].subjects.push({
        id: r.id,
        subject: r.subjects?.name ?? "—",
        marks_obtained: r.marks_obtained ?? 0,
        max_marks: r.max_marks ?? 100,
        grade: r.grade ?? "—",
      });
      examMap[examId].totalObtained += r.marks_obtained ?? 0;
      examMap[examId].totalMax += r.max_marks ?? 100;
    }

    // Compute rank per exam — exclude failed/absent students
    for (const examId of Object.keys(examMap)) {
      const myStudentId = studentId!;
      const hasFail = studentHasFail[examId]?.[myStudentId] ?? false;
      const myCounts = studentSubjectCounts[examId] ?? {};
      const maxSubjectCount = Math.max(...Object.values(myCounts), 0);
      const mySubjectCount = myCounts[myStudentId] ?? 0;
      const isAbsent = mySubjectCount < maxSubjectCount;

      if (hasFail || isAbsent) {
        examMap[examId].rank = 0; // 0 = no rank
        examMap[examId].totalStudents = Object.keys(studentTotals[examId] ?? {}).length;
        continue;
      }

      // Only rank among eligible students (no fail, not absent)
      const eligibleTotals = Object.entries(studentTotals[examId] ?? {})
        .filter(([sid]) => !(studentHasFail[examId]?.[sid]) && (myCounts[sid] ?? 0) >= maxSubjectCount)
        .map(([, total]) => total);

      const myTotal = examMap[examId].totalObtained;
      examMap[examId].rank = eligibleTotals.filter(t => t > myTotal).length + 1;
      examMap[examId].totalStudents = eligibleTotals.length;
    }

    // Group by academic year
    const grouped: Record<string, ExamResult[]> = {};
    for (const exam of Object.values(examMap)) {
      if (!grouped[exam.academicYear]) grouped[exam.academicYear] = [];
      grouped[exam.academicYear].push(exam);
    }
    setGroupedResults(grouped);

    if (sectionId) {
      await loadHomeworkForMonth(sectionId, new Date().getFullYear(), new Date().getMonth() + 1);
    } else {
      setHomework([]);
    }
    setLoading(false);
  }

  const SUBJECT_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6"];
  const subjectColorMap: Record<string, string> = {};
  let colorIndex = 0;

  const markedDates: Record<string, any> = {};
  for (const hw of homework) {
    if (!subjectColorMap[hw.subject]) {
      subjectColorMap[hw.subject] = SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length];
      colorIndex++;
    }
    if (!markedDates[hw.due_date]) {
      markedDates[hw.due_date] = { dots: [], selected: hw.due_date === selectedDate };
    }
    if (markedDates[hw.due_date].dots.length < 3) {
      markedDates[hw.due_date].dots.push({ color: subjectColorMap[hw.subject] });
    }
  }
  if (markedDates[selectedDate]) {
    markedDates[selectedDate].selected = true;
    markedDates[selectedDate].selectedColor = theme.primary;
    markedDates[selectedDate].selectedTextColor = "#fff";
  } else {
    markedDates[selectedDate] = { selected: true, selectedColor: theme.primary, selectedTextColor: "#fff" };
  }

  const HW_BADGE: Record<ParentHomeworkState, "hw_new" | "hw_viewed" | "hw_done" | "hw_reviewed"> = {
    new: "hw_new", viewed: "hw_viewed", done: "hw_done", reviewed: "hw_reviewed",
  };

  const todayStr = new Date().toLocaleDateString("en-CA");
  const isOverdueNotDone = (h: ParentHomeworkItem) =>
    (h.state === "new" || h.state === "viewed") && h.due_date < todayStr;

  function renderHWCard(h: ParentHomeworkItem, showDueDate: boolean) {
    return (
      <TouchableOpacity
        key={h.id}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: "/(parent)/homework/[homeworkId]", params: { homeworkId: h.id, studentId: activeStudentId } })}
        style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{h.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <View style={{ backgroundColor: (subjectColorMap[h.subject] ?? theme.primary) + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: subjectColorMap[h.subject] ?? theme.primary }}>{h.subject}</Text>
              </View>
              {showDueDate ? (
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: isOverdueNotDone(h) ? "#EF4444" : theme.textMuted }}>
                  Due {new Date(h.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </Text>
              ) : null}
            </View>
          </View>
          <StatusBadge variant={isOverdueNotDone(h) ? "overdue" : HW_BADGE[h.state]} />
        </View>
        {h.description ? (
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{h.description}</Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Academics</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/(parent)/exam-datesheet")}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>Exam datesheet</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </TouchableOpacity>

        {testingEnabled && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/(parent)/testing")}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="document-text-outline" size={18} color={theme.primary} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>Testing</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        {/* Segmented control */}
        <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.border }}>
          {(["homework", "results"] as const).map((t) => (
            <TouchableOpacity key={t} activeOpacity={0.85} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: tab === t ? theme.primary : "transparent", alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: tab === t ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

    {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
        ) : tab === "results" && !examsEnabled ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <Ionicons name="trophy-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
              Results aren't available for your school right now.
            </Text>
          </View>
        ) : tab === "results" ? (
          <View style={{ gap: 16 }}>
            {Object.keys(groupedResults).length === 0 ? (
              <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No results yet</Text>
            ) : Object.entries(groupedResults).map(([year, exams]) => (
              <View key={year}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{year}</Text>
                <View style={{ gap: 10 }}>
                  {exams.map((exam) => {
                    const isExpanded = expandedExamId === exam.examId;
                    return (
                      <TouchableOpacity
                        key={exam.examId}
                        activeOpacity={0.85}
                        onPress={() => setExpandedExamId(isExpanded ? null : exam.examId)}
                        style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{exam.examName}</Text>
                            {exam.startDate ? (
                              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 2 }}>
                                {new Date(exam.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                {exam.endDate ? ` – ${new Date(exam.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        {reportCardsEnabled && (
                              <TouchableOpacity
                                onPress={() => downloadReportCard(exam.examId, exam.examName)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: theme.primary + "15", alignItems: "center", justifyContent: "center" }}
                              >
                                {downloadingExamId === exam.examId ? (
                                  <ActivityIndicator size="small" color={theme.primary} />
                                ) : (
                                  <Ionicons name="download-outline" size={18} color={theme.primary} />
                                )}
                              </TouchableOpacity>
                            )}
                            <View style={{ alignItems: "flex-end", gap: 4 }}>
                              <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.primary }}>{exam.totalObtained}/{exam.totalMax}</Text>
                              {exam.rank > 0 && (
                                <View style={{ backgroundColor: exam.rank <= 3 ? "#F59E0B18" : theme.surfaceRaised, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: exam.rank <= 3 ? "#D97706" : theme.textSecondary }}>
                                    Rank {exam.rank}{exam.totalStudents > 0 ? ` of ${exam.totalStudents}` : ""}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                        {isExpanded && (
                          <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 6 }}>
                            <View style={{ flexDirection: "row" }}>
                              <Text style={{ flex: 3, fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>SUBJECT</Text>
                              <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, textAlign: "center" }}>MARKS</Text>
                              <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, textAlign: "center" }}>GRADE</Text>
                            </View>
                            {exam.subjects.map((s) => (
                              <View key={s.id} style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={{ flex: 3, fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary }}>{s.subject}</Text>
                                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textSecondary, textAlign: "center" }}>{s.marks_obtained}/{s.max_marks}</Text>
                                <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.primary, textAlign: "center" }}>{s.grade}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
    ) : !homeworkEnabled ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <Ionicons name="book-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
              Homework isn't available for your school right now.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Calendar | List toggle */}
            <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: theme.border, alignSelf: "center" }}>
              {(["calendar", "list"] as const).map((v) => (
                <TouchableOpacity key={v} activeOpacity={0.85} onPress={() => setHWView(v)} style={{ paddingVertical: 7, paddingHorizontal: 22, borderRadius: 8, backgroundColor: hwView === v ? theme.primary : "transparent" }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: hwView === v ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {hwView === "calendar" ? (
              <View style={{ gap: 0 }}>
                <Calendar
                  markingType="multi-dot"
                  markedDates={markedDates}
                  onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
                  onMonthChange={(month: { year: number; month: number }) =>
                    setCalendarMonth({ year: month.year, month: month.month })
                  }
                  dayComponent={({ date, state, marking }: any) => {
                    const selected = !!marking?.selected;
                    const disabled = state === "disabled";
                    const isToday = state === "today";
                    const dots = marking?.dots ?? [];
                    return (
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => date && setSelectedDate(date.dateString)}
                        style={{ alignItems: "center", justifyContent: "center", width: 34 }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: selected ? theme.primary : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontFamily: "Inter_400Regular",
                              color: selected
                                ? "#fff"
                                : disabled
                                ? theme.textMuted
                                : isToday
                                ? theme.primary
                                : theme.textPrimary,
                            }}
                          >
                            {date?.day}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 2, height: 5, marginTop: 1 }}>
                          {dots.slice(0, 3).map((d: { color: string }, i: number) => (
                            <View
                              key={i}
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: selected ? "#fff" : d.color,
                              }}
                            />
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  theme={{
                    backgroundColor: theme.surface,
                    calendarBackground: theme.surface,
                    textSectionTitleColor: theme.textMuted,
                    selectedDayBackgroundColor: theme.primary,
                    selectedDayTextColor: "#fff",
                    todayTextColor: theme.primary,
                    dayTextColor: theme.textPrimary,
                    textDisabledColor: theme.textMuted,
                    dotColor: theme.primary,
                    arrowColor: theme.primary,
                    monthTextColor: theme.textPrimary,
                    textMonthFontFamily: "Inter_600SemiBold",
                    textDayFontFamily: "Inter_400Regular",
                    textDayHeaderFontFamily: "Inter_500Medium",
                  }}
                  style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16 }}
                />
                {(() => {
                  const dayHomework = homework.filter(h => h.due_date === selectedDate);
                  return dayHomework.length === 0 ? (
                    <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 24 }}>
                      No homework for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                    </Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 }}>
                        {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                      </Text>
                      {dayHomework.map((h) => renderHWCard(h, false))}
                    </View>
                  );
                })()}
              </View>
            ) : (
              (() => {
                const groups: { key: ParentHomeworkState[]; label: string }[] = [
                  { key: ["new", "viewed"], label: "To Do" },
                  { key: ["done"], label: "Done" },
                  { key: ["reviewed"], label: "Reviewed" },
                ];
                if (rangeHomework.length === 0) {
                  return (
                    <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>
                      No homework in the last or next 30 days
                    </Text>
                  );
                }
                return (
                  <View style={{ gap: 20 }}>
                    {groups.map(({ key, label }) => {
                      const items = rangeHomework
                        .filter(h => key.includes(h.state))
                        .sort((a, b) => a.due_date.localeCompare(b.due_date));
                      if (items.length === 0) return null;
                      return (
                        <View key={label} style={{ gap: 10 }}>
                          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
                            {label} ({items.length})
                          </Text>
                          {items.map((h) => renderHWCard(h, true))}
                        </View>
                      );
                    })}
                  </View>
                );
              })()
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme, useFeature } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import { Skeleton, SkeletonCard } from "../../components/Skeleton";

interface TodayPeriod {
  id: string;
  period: number;
  subject: string;
  className: string;
}

interface DashboardData {
  name: string;
  totalStudents: number;
  hwDueSoon: number;
  homeroomAttendanceDone: boolean;
  openInterventions: number;
  highRiskInterventions: number;
}

export default function TeacherDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { sections, userId, schoolId, ready } = useTeacherContext();
  const insightsEnabled = useFeature("insights");

  const [data, setData] = useState<DashboardData | null>(null);
  const [todayPeriods, setTodayPeriods] = useState<TodayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if (!ready || !userId) return;
    loadDashboard();
  }, [ready, userId, sections.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [ready, userId, sections.length]);

  async function loadDashboard() {
    // DB day: 1=Mon…7=Sun; JS: 0=Sun…6=Sat
    const jsDay = new Date().getDay();
    const dbDay = jsDay === 0 ? 7 : jsDay;

    const homeroom = sections.find((s) => s.isHomeroom) ?? sections[0] ?? null;

    // Get active academic year
    const { data: activeYear } = await supabase
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .maybeSingle();

    let scheduleQuery = supabase
      .from("timetable")
      .select("id, period, subjects(name), sections(id, name, classes(name))")
      .eq("teacher_id", userId)
      .eq("day_of_week", dbDay)
      .order("period");
    if (activeYear?.id) scheduleQuery = scheduleQuery.eq("academic_year_id", activeYear.id);

    const [profileRes, scheduleRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).single(),
      scheduleQuery,
    ]);

    const name = profileRes.data?.full_name ?? "Teacher";

    const periods: TodayPeriod[] = (scheduleRes.data ?? []).map((r: any) => ({
      id: r.id,
      period: r.period,
      subject: r.subjects?.name ?? "—",
      className: r.sections
        ? `${r.sections.classes?.name ?? ""} ${r.sections.name ?? ""}`.trim()
        : "—",
    }));
    setTodayPeriods(periods);

    // Check attendance only for homeroom section
    const homeroomAttendanceDone = homeroom
      ? await supabase
          .from("attendance_records")
          .select("id", { count: "exact", head: true })
          .eq("section_id", homeroom.id)
          .eq("date", today)
          .then(({ count }) => (count ?? 0) > 0)
      : true;

    // Total students across ALL sections teacher is assigned to
    const allSectionIds = sections.map((s) => s.id);
    const totalStudentsRes = allSectionIds.length > 0
      ? await supabase
          .from("student_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .in("section_id", allSectionIds)
      : { count: 0 };

    // Homework due in next 7 days
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const hwRes = await supabase
      .from("homework")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", userId)
      .gte("due_date", today)
      .lte("due_date", nextWeek.toISOString().split("T")[0]);

    // Open interventions count (only query if insights feature is enabled)
    let openInterventionsCount = 0;
    let highRiskCount = 0;

    if (insightsEnabled) {
      const openRes = await supabase
        .from("interventions")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);
      openInterventionsCount = openRes.count ?? 0;

      const highRes = await supabase
        .from("interventions")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"])
        .eq("severity_band", "HIGH");
      highRiskCount = highRes.count ?? 0;
    }

    setData({
      name,
      totalStudents: totalStudentsRes.count ?? 0,
      hwDueSoon: hwRes.count ?? 0,
      homeroomAttendanceDone,
      openInterventions: openInterventionsCount,
      highRiskInterventions: highRiskCount,
    });
    setLoading(false);
  }

  const homeroom = sections.find((s) => s.isHomeroom) ?? sections[0] ?? null;
  const ACCENT_COLORS = [theme.primary, "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 }}>
          {loading ? (
            <Skeleton height={32} width="60%" />
          ) : (
            <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: theme.textPrimary, lineHeight: 34 }}>
              {greeting},{"\n"}{data?.name.split(" ")[0]} 👋
            </Text>
          )}
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 6 }}>
            {dayName}
          </Text>
        </View>

        {/* ── Student Interventions Banner ─────────────────────────── */}
        {!loading && insightsEnabled && (data?.openInterventions ?? 0) > 0 && (
          <TouchableOpacity
            onPress={() => router.push("/(teacher)/interventions" as any)}
            activeOpacity={0.8}
            style={{
              marginHorizontal: 20,
              marginTop: 16,
              backgroundColor: (data?.highRiskInterventions ?? 0) > 0 ? "#EF444415" : theme.primary + "15",
              borderRadius: 14,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: (data?.highRiskInterventions ?? 0) > 0 ? "#EF444430" : theme.primary + "30",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: (data?.highRiskInterventions ?? 0) > 0 ? "#EF4444" : theme.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_600SemiBold",
                    color: (data?.highRiskInterventions ?? 0) > 0 ? "#EF4444" : theme.primary,
                  }}
                >
                  Student Support Action Items
                </Text>
                {(data?.highRiskInterventions ?? 0) > 0 && (
                  <View style={{ backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" }}>
                      {data?.highRiskInterventions} HIGH
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                {data?.openInterventions} student{data?.openInterventions === 1 ? "" : "s"} need attention · Tap to review
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        {/* ── Needs-action banner (homeroom attendance only) ───────── */}
        {!loading && data && !data.homeroomAttendanceDone && homeroom && (
          <TouchableOpacity
            onPress={() => router.push("/(teacher)/attendance")}
            activeOpacity={0.8}
            style={{
              marginHorizontal: 20,
              marginTop: 12,
              backgroundColor: "#EF444418",
              borderRadius: 14,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderWidth: 1,
              borderColor: "#EF444430",
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="alert-circle-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#EF4444" }}>
                Attendance not taken yet
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#EF4444CC", marginTop: 2 }}>
                {homeroom.label} · Tap to mark now
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#EF4444" />
          </TouchableOpacity>
        )}

        {/* ── Cross-section summary ───────────────────────────────── */}
        {!loading && (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => router.push("/(teacher)/interventions" as any)}
              activeOpacity={0.8}
              style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 4 }}
            >
              <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                {data?.openInterventions ?? 0}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                Interventions
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.primary }}>
                Review Support →
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1, gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: "#10B98118", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="calendar-outline" size={16} color="#10B981" />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{todayPeriods.length}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>Today</Text>
                </View>
              </View>
              <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: "#F59E0B18", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="book-outline" size={16} color="#F59E0B" />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{data?.hwDueSoon ?? 0}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>HW this week</Text>
                </View>
              </View>
            </View>
          </View>
        )}
        {loading && (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 20 }}>
            <View style={{ flex: 1 }}><SkeletonCard /></View>
            <View style={{ flex: 1, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
          </View>
        )}

        {/* ── Today's schedule ────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary, marginBottom: 14, letterSpacing: 0.1 }}>
            Today's Schedule
          </Text>

          {loading ? (
            <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
          ) : todayPeriods.length === 0 ? (
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 28, alignItems: "center", gap: 10 }}>
              <Ionicons name="cafe-outline" size={36} color={theme.textMuted} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>No classes today</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Enjoy your free day</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {todayPeriods.map((p, idx) => (
                <View
                  key={p.id}
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: 16,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  {/* Period badge */}
                  <View style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    backgroundColor: ACCENT_COLORS[idx % ACCENT_COLORS.length] + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: ACCENT_COLORS[idx % ACCENT_COLORS.length], letterSpacing: 0.4 }}>
                      P{p.period}
                    </Text>
                  </View>

                  {/* Subject + class */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
                      {p.subject}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      {p.className}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── My sections ─────────────────────────────────────────── */}
        {!loading && sections.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary, marginBottom: 14, letterSpacing: 0.1 }}>
              My Sections
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
              {sections.map((sec, idx) => (
                <View
                  key={sec.id}
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: 16,
                    padding: 16,
                    width: 120,
                    gap: 8,
                    borderTopWidth: 3,
                    borderTopColor: ACCENT_COLORS[idx % ACCENT_COLORS.length],
                  }}
                >
                  <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                    {sec.shortLabel}
                  </Text>
                  {sec.isHomeroom && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="home-outline" size={11} color={theme.textMuted} />
                      <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: theme.textMuted }}>Homeroom</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

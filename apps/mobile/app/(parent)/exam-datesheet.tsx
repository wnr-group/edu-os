import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useActiveContext } from "../../lib/active-context";
import { useTheme } from "../../lib/theme";
import { loadActiveDatesheet, isSlotUpdated, markDatesheetSeen, type ExamDatesheet, type DatesheetSlot } from "../../lib/exam-schedule";
import { SkeletonCard } from "../../components/Skeleton";

export default function ExamDatesheetScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId: activeStudentId } = useActiveContext();
  const [datesheet, setDatesheet] = useState<ExamDatesheet | null>(null);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, [activeStudentId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [activeStudentId]);

  async function load() {
    if (!activeStudentId) { setDatesheet(null); setLoading(false); return; }

    const { data: sp } = await supabase
      .from("student_profiles")
      .select("id, student_enrollments(class_id)")
      .eq("id", activeStudentId)
      .eq("student_enrollments.is_active", true)
      .maybeSingle();
    const classId = (sp as any)?.student_enrollments?.[0]?.class_id
      ?? (sp as any)?.student_enrollments?.class_id;
    if (!classId) { setDatesheet(null); setLoading(false); return; }

    const sheet = await loadActiveDatesheet(classId);
    setDatesheet(sheet);

    if (sheet) {
      const flags = await Promise.all(sheet.slots.map((s) => isSlotUpdated(s)));
      setUpdatedIds(new Set(sheet.slots.filter((_, i) => flags[i]).map((s) => s.id)));
      await markDatesheetSeen(sheet.slots);
    }
    setLoading(false);
  }

  const today = new Date().toLocaleDateString("en-CA");
  const nextPaper = datesheet?.slots.find((s) => s.exam_date >= today) ?? null;

  function daysUntil(dateStr: string): number {
    const d = new Date(dateStr + "T00:00:00");
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 20, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Datesheet</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Academics › Exams</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
        ) : !datesheet ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
            <Ionicons name="calendar-outline" size={36} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center" }}>
              No published datesheet right now.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: theme.primaryLight, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="calendar" size={18} color={theme.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{datesheet.examName}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{datesheet.slots.length} papers</Text>
                </View>
              </View>
              {nextPaper && (
                <View style={{ backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>{daysUntil(nextPaper.exam_date)}d</Text>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: "#fff" }}>TO GO</Text>
                </View>
              )}
            </View>

            {datesheet.slots.map((s, i) => {
              const isNext = nextPaper?.id === s.id;
              const isUpdated = updatedIds.has(s.id);
              const d = new Date(s.exam_date + "T00:00:00");
              return (
                <View key={s.id} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 40, alignItems: "center" }}>
                    <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                      {d.toLocaleDateString("en-IN", { day: "2-digit" })}
                    </Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: theme.textMuted, textTransform: "uppercase" }}>
                      {d.toLocaleDateString("en-IN", { month: "short" })}
                    </Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
                      {d.toLocaleDateString("en-IN", { weekday: "short" })}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1, backgroundColor: theme.surface, borderRadius: 14, padding: 14,
                      borderWidth: isNext ? 1.5 : 0, borderColor: theme.primary,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{s.subject}</Text>
                        {isUpdated && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.warning + "22", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Ionicons name="alert-circle" size={10} color={theme.warning} />
                            <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: theme.warning }}>UPDATED</Text>
                          </View>
                        )}
                      </View>
                      {isNext && (
                        <View style={{ backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" }}>NEXT UP</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="time-outline" size={12} color={theme.textMuted} />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
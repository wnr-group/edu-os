import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useActiveContext } from "../../lib/active-context";
import { useTheme, useFeature } from "../../lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Skeleton } from "../../components/Skeleton";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["S","M","T","W","T","F","S"];

interface AttendanceRecord { date: string; status: "present" | "absent" | "late"; session: "FULL_DAY" | "FN" | "AN" }

export default function ParentAttendance() {
  const theme = useTheme();
  const attendanceEnabled = useFeature("attendance");
  const { studentId: activeStudentId, activeYearId } = useActiveContext();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const selectedYear = new Date().getFullYear();

  useEffect(() => { loadAttendance(); }, [activeStudentId, activeYearId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAttendance();
    setRefreshing(false);
  }, [activeStudentId, activeYearId]);

  async function loadAttendance() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!activeStudentId) { setRecords([]); setLoading(false); return; }
    // Look up the active student
    const { data: sp } = await supabase.from("student_profiles").select("id").eq("id", activeStudentId).maybeSingle();
    const studentId = sp?.id;
    if (!studentId) { setRecords([]); setLoading(false); return; }
    let query = supabase.from("attendance_records").select("date, status, session").eq("student_id", studentId);
    if (activeYearId) query = query.eq("academic_year_id", activeYearId);
    const { data } = await query.order("date");
    setRecords((data as AttendanceRecord[]) ?? []);
    setLoading(false);
  }

  const monthRecords = records.filter((r) => {
    const d = new Date(r.date);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });
  const isPresent = (s: string) => s === "present" || s === "late";
  const presentSessions = monthRecords.filter((r) => isPresent(r.status)).length;
  const totalSessions = monthRecords.length;
  const pct = totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : 0;

  // Group sessions by date for the calendar cell rendering.
  const dayMap: Record<string, AttendanceRecord[]> = {};
  monthRecords.forEach((r) => { (dayMap[r.date] ??= []).push(r); });

  const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const calendarCells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function statusColor(status: string): string {
    if (status === "present") return theme.success;
    if (status === "absent") return theme.danger;
    if (status === "late") return theme.warning;
    return theme.border;
  }

  function cellSessions(day: number | null): AttendanceRecord[] {
    if (!day) return [];
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dayMap[dateStr] ?? [];
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
         <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Attendance</Text>
        {!attendanceEnabled ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <Ionicons name="calendar-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
              Attendance isn't available for your school right now.
            </Text>
          </View>
        ) : (<>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity key={m} activeOpacity={0.85} onPress={() => setSelectedMonth(i)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: selectedMonth === i ? theme.primary : theme.surface, borderWidth: 1, borderColor: selectedMonth === i ? theme.primary : theme.border }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: selectedMonth === i ? "#fff" : theme.textSecondary }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        {loading ? <Skeleton height={100} borderRadius={16} /> : (
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 20, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 }}>
            <Text style={{ fontSize: 48, fontFamily: "Inter_700Bold", color: theme.primary }}>{pct}%</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4 }}>{presentSessions} present · {totalSessions - presentSessions} other · {totalSessions} sessions</Text>
          </View>
        )}
        {loading ? <Skeleton height={220} borderRadius={16} /> : (
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16 }}>
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              {DAY_LABELS.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium", color: theme.textMuted }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarCells.map((day, i) => (
                <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1, padding: 2 }}>
                  {day ? (() => {
                    const sessions = cellSessions(day);
                    const fullDay = sessions.find((s) => s.session === "FULL_DAY");
                    const fn = sessions.find((s) => s.session === "FN");
                    const an = sessions.find((s) => s.session === "AN");
                    if (sessions.length === 0) {
                      return (
                        <View style={{ flex: 1, borderRadius: 6, backgroundColor: theme.border, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, color: theme.textMuted }}>{day}</Text>
                        </View>
                      );
                    }
                    if (fullDay) {
                      return (
                        <View style={{ flex: 1, borderRadius: 6, backgroundColor: statusColor(fullDay.status), alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, color: "#fff" }}>{day}</Text>
                        </View>
                      );
                    }
                    // FN/AN split: left half FN, right half AN.
                    return (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => alert(`FN: ${fn?.status ?? "—"}\nAN: ${an?.status ?? "—"}`)}
                        style={{ flex: 1, borderRadius: 6, overflow: "hidden", flexDirection: "row" }}
                      >
                        <View style={{ flex: 1, backgroundColor: fn ? statusColor(fn.status) : theme.border }} />
                        <View style={{ flex: 1, backgroundColor: an ? statusColor(an.status) : theme.border }} />
                        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, color: "#fff" }}>{day}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })() : null}
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
          {[{ color: theme.success, label: "Present" }, { color: theme.danger, label: "Absent" }, { color: theme.warning, label: "Late" }].map((item) => (
            <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color }} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{item.label}</Text>
            </View>
          ))}
       </View>
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

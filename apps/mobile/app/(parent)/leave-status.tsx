import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { loadMyRequests, cancelLeave, type LeaveRequestItem, type LeaveStatus } from "../../lib/leave";
import { SkeletonCard } from "../../components/Skeleton";

const TYPE_LABEL: Record<string, string> = { sick: "Sick", casual: "Casual", other: "Other" };
const STATUS_STYLE: Record<LeaveStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF3C7", fg: "#B45309", label: "PENDING" },
  approved: { bg: "#D1FAE5", fg: "#047857", label: "APPROVED" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C", label: "REJECTED" },
  cancelled: { bg: "#F3F4F6", fg: "#6B7280", label: "CANCELLED" },
};

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (from === to) return f;
  const t = new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${f}–${t}`;
}
function daysCount(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
}

// Attendance for a leave date is only written to attendance_records once a
// teacher actually marks that day (or retroactively at approval time for
// days already marked) — so a leave range ending today-or-later cannot be
// asserted as already recorded.
function isFullyPast(toDate: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return toDate < today;
}

export default function LeaveStatusScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const student = students.find((s) => s.id === studentId);
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) { setRequests([]); setLoading(false); return; }
    const data = await loadMyRequests(studentId);
    setRequests(data);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function handleCancel(id: string) {
    Alert.alert("Cancel request?", "This will withdraw your leave request.", [
      { text: "No", style: "cancel" },
      { text: "Yes, cancel", style: "destructive", onPress: async () => {
        const { error } = await cancelLeave(id);
        if (error) { Alert.alert("Error", error); return; }
        load();
      }},
    ]);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Leave</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
            {student?.fullName ?? ""} {student?.className ? `· ${student.className}` : ""}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <TouchableOpacity
          onPress={() => router.push("/(parent)/apply-leave")}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14 }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>Apply for leave</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
        ) : requests.length === 0 ? (
          <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No leave requests yet.</Text>
        ) : requests.map((r) => {
          const style = STATUS_STYLE[r.status];
          return (
            <View key={r.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{formatRange(r.fromDate, r.toDate)}</Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                    {TYPE_LABEL[r.leaveType] ?? r.leaveType} · {daysCount(r.fromDate, r.toDate)} day{daysCount(r.fromDate, r.toDate) !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={{ backgroundColor: style.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: style.fg }}>{style.label}</Text>
                </View>
              </View>
              {r.note ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{r.note}</Text> : null}
              {r.status === "approved" && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: isFullyPast(r.toDate) ? theme.success : theme.warning }}>
                  {isFullyPast(r.toDate)
                    ? "✓ Approved — marked Excused"
                    : "✓ Approved — will be marked Excused automatically"}
                </Text>
              )}
              {r.status === "rejected" && r.decisionNote && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>✕ Declined: "{r.decisionNote}"</Text>
              )}
              {r.status === "pending" && (
                <TouchableOpacity onPress={() => handleCancel(r.id)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.danger }}>Cancel request</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
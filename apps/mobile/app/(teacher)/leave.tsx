import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import { SkeletonCard } from "../../components/Skeleton";
import {
  loadSectionLeaveRequests, approveLeave, rejectLeave, notifyLeaveDecided,
  type PendingLeaveItem, type LeaveStatus,
} from "../../lib/leave";

const TYPE_LABEL: Record<string, string> = { sick: "Sick", casual: "Casual", other: "Other" };

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const t = new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return from === to ? f : `${f}–${t}`;
}
function daysCount(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
}

export default function TeacherLeaveInbox() {
  const theme = useTheme();
  const { sections } = useTeacherContext();
  const [tab, setTab] = useState<LeaveStatus>("pending");
  const [items, setItems] = useState<PendingLeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await Promise.all(sections.map((s) => loadSectionLeaveRequests(s.id, tab)));
    setItems(all.flat());
    setLoading(false);
  }, [sections, tab]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function finishDecision(id: string, action: () => Promise<{ error: string | null }>) {
    setBusyId(id);
    const { error } = await action();
    setBusyId(null);
    if (error) { Alert.alert("Error", error); return; }
    notifyLeaveDecided(id);
    load();
  }

  function handleApprove(id: string) {
    finishDecision(id, () => approveLeave(id));
  }

  function handleDecline(id: string) {
    if (Platform.OS === "ios") {
      Alert.prompt("Decline leave", "Optional reason for the parent:", (reason) => {
        finishDecision(id, () => rejectLeave(id, reason ?? ""));
      });
    } else {
      // Alert.prompt is iOS-only — Android gets a confirm-only dialog, no reason text.
      Alert.alert("Decline leave", "Decline this request?", [
        { text: "Cancel", style: "cancel" },
        { text: "Decline", style: "destructive", onPress: () => finishDecision(id, () => rejectLeave(id, "")) },
      ]);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Leave requests</Text>
        <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: theme.border }}>
          {(["pending", "approved", "rejected"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: tab === t ? theme.primary : "transparent", alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: tab === t ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
        ) : items.length === 0 ? (
          <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No {tab} requests.</Text>
        ) : items.map((item) => (
          <View key={item.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{item.studentName}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>Roll {item.rollNumber}</Text>
              </View>
              <View style={{ backgroundColor: theme.danger + "1A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: theme.danger }}>{(TYPE_LABEL[item.leaveType] ?? item.leaveType).toUpperCase()}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="calendar-outline" size={13} color={theme.textMuted} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textMuted }}>
                {formatRange(item.fromDate, item.toDate)} · {daysCount(item.fromDate, item.toDate)} days
              </Text>
            </View>
            {item.note ? (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, backgroundColor: theme.surfaceRaised, borderRadius: 8, padding: 10 }}>{item.note}</Text>
            ) : null}
            {item.status === "pending" && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => handleDecline(item.id)} disabled={busyId === item.id} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: theme.danger }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.danger }}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleApprove(item.id)} disabled={busyId === item.id} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.success }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>{busyId === item.id ? "Approving…" : "Approve"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
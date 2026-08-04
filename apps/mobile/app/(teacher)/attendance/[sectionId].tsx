import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";
import { useTeacherContext } from "../../../lib/teacherContext";
import { Avatar } from "../../../components/Avatar";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { SkeletonCard } from "../../../components/Skeleton";
import { SessionSelector } from "../../../components/SessionSelector";
import {
  AttendanceSession, AttendanceStatus, SectionAttendanceRow, DayStat,
  fetchSectionAttendance, fetchRecentStats, fetchMarkedCount, clearAttendance,
} from "../../../lib/attendance";
import { loadApprovedLeaveForSectionDate } from "../../../lib/leave";
import { sendAbsenceNotification } from "../../../lib/notifications";
import { getActiveGeofences, getAdvisoryPosition, getSubmitPosition, computeAdvisory } from "../../../lib/location";
import type { Advisory, DevicePosition, GeofenceRow } from "../../../lib/location";
import { GeoAdvisoryChip } from "../../../components/GeoAdvisoryChip";

export default function MarkAttendance() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ sectionId: string; session?: string; date?: string }>();
  const sectionId = params.sectionId;
  const date = params.date ?? new Date().toISOString().split("T")[0];
  const { sections, userId, schoolId } = useTeacherContext();
  const section = sections.find((s) => s.id === sectionId) ?? null;

  const [session, setSession] = useState<AttendanceSession>((params.session as AttendanceSession) ?? "FULL_DAY");
  const [rows, setRows] = useState<SectionAttendanceRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | null>>({});
  const [existingMode, setExistingMode] = useState<"FULL_DAY" | "SESSION" | null>(null);
  const [stats, setStats] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState<Record<string, boolean>>({});
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [geofences, setGeofences] = useState<GeofenceRow[]>([]);
  const [isOffCampus, setIsOffCampus] = useState(false);
  const [excusedIds, setExcusedIds] = useState<Set<string>>(new Set());

  const marked = rows.some((r) => r.recordId !== null);

  const load = useCallback(async () => {
    setLoading(true);
    const [roster, count, recent, excused] = await Promise.all([
      fetchSectionAttendance(sectionId, date, session),
      fetchMarkedCount(sectionId, date, session),
      fetchRecentStats(sectionId, 7),
      loadApprovedLeaveForSectionDate(sectionId, date),
    ]);
    setRows(roster);
    setStatuses(Object.fromEntries(roster.map((r) => [r.studentId, r.status])));
    setExistingMode(count.existingMode);
    setStats(recent);
    setExcusedIds(excused);
    setLoading(false);
  }, [sectionId, date, session]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const initializeLocationAsync = async () => {
      const fences = await getActiveGeofences(supabase, schoolId);
      setGeofences(fences);

      // Request location permissions on mount (lazy-load pattern)
      try {
        const Location = await import("expo-location");
        const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
        if (existingStatus !== "granted") {
          await Location.requestForegroundPermissionsAsync();
        }
      } catch {
        // Permission request failed, continue without location
      }

      // Get advisory position (uses cached/last-known position)
      const pos = await getAdvisoryPosition();
      if (pos && fences.length > 0) {
        const result = computeAdvisory(pos.lat, pos.lng, pos.accuracy, fences);
        setAdvisory(result);
        setIsOffCampus(result.status === "outside");
      } else {
        setAdvisory(null);
        setIsOffCampus(false);
      }
    };
    initializeLocationAsync();
  }, [schoolId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  // Mode-lock: disable the granularity not already in use.
  const disabled: Partial<Record<AttendanceSession, string>> = {};
  if (existingMode === "FULL_DAY") {
    disabled.FN = "Marked as full-day for this date";
    disabled.AN = "Marked as full-day for this date";
  } else if (existingMode === "SESSION") {
    disabled.FULL_DAY = "Marked by session (FN/AN) for this date";
  }

  function cycleStatus(studentId: string) {
    if (excusedIds.has(studentId)) return; // locked — approved leave covers this day
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatuses((prev) => {
      const cur = prev[studentId];
      const next: AttendanceStatus =
        cur == null ? "present" : cur === "present" ? "absent" : cur === "absent" ? "late" : "present";
      return { ...prev, [studentId]: next };
    });
  }

  function markAll(status: AttendanceStatus) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatuses((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!excusedIds.has(r.studentId)) next[r.studentId] = status;
      return next;
    });
  }

  const markedCount = rows.filter((r) => statuses[r.studentId] != null).length;

  async function submit() {
    if (!userId || !schoolId) return;
    const markedStudents = rows.filter((r) => statuses[r.studentId] != null);
    if (markedStudents.length === 0) {
      Alert.alert("Nothing to save", "Mark at least one student first.");
      return;
    }

    setSaving(true);
    try {
      // Get current position on submit
      const currentPos = await getSubmitPosition();
      let submitAdvisory: Advisory | null = null;
      let geoSource = "device";

      if (currentPos && geofences.length > 0) {
        submitAdvisory = computeAdvisory(currentPos.lat, currentPos.lng, currentPos.accuracy, geofences);
      } else {
        geoSource = "denied"; // Mark as denied if no position available
      }

      // Prepare records with geo data
      const records = markedStudents.map((r) => ({
        student_id: r.studentId,
        section_id: sectionId,
        school_id: schoolId,
        date,
        session,
        status: statuses[r.studentId] as AttendanceStatus,
        marked_by: userId,
        captured_lat: currentPos?.lat ?? null,
        captured_lng: currentPos?.lng ?? null,
        gps_accuracy_m: currentPos?.accuracy ?? null,
      }));

      const { error } = await supabase
        .from("attendance_records")
        .upsert(records, { onConflict: "student_id,date,session" });

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        await load(); // refresh so recordIds + send icons appear
        if (submitAdvisory?.status === "outside") {
          Alert.alert(
            "Attendance Recorded",
            `Saved ${records.length} records.\n⚠️ Staff member is off-campus — attendance will be flagged for review.`
          );
        } else {
          Alert.alert("Saved", `Attendance recorded for ${records.length} students.`);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function confirmClear() {
    const mode = existingMode;
    if (!mode) return;
    Alert.alert(
      "Clear attendance?",
      "This deletes the saved attendance for this date so you can re-mark. Notifications already sent will not be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear", style: "destructive",
          onPress: async () => {
            const { error } = await clearAttendance(sectionId, date, mode);
            if (error) { Alert.alert("Error", error); return; }
            await load();
          },
        },
      ],
    );
  }

  async function notify(row: SectionAttendanceRow) {
    if (!row.recordId) return;
    setNotifying((p) => ({ ...p, [row.studentId]: true }));
    const result = await sendAbsenceNotification(row.recordId);
    setNotifying((p) => ({ ...p, [row.studentId]: false }));
    if (result === "sent") Alert.alert("Sent", "Parent notified.");
    else if (result === "recorded_no_app") Alert.alert("Recorded", "Saved to parent's inbox (app not installed).");
    else Alert.alert("Failed", "Could not notify. Try again.");
    await load();
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(teacher)/attendance"))}
              hitSlop={10}
              style={{ marginLeft: -4 }}
            >
              <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
              {section?.label ?? "Class"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: marked ? theme.success + "1A" : theme.warning + "1A", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: marked ? theme.success : theme.warning }}>
                {marked ? "Marked" : "Not marked"}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Inter_400Regular" }}>
              {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </Text>
          </View>
          <SessionSelector value={session} onChange={setSession} disabled={disabled} />
          <GeoAdvisoryChip advisory={advisory} />
          {/* Last-7-marked-days strip */}
          {stats.length > 0 && (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end", height: 44 }}>
              {stats.map((d) => (
                <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 3 }}>
                  <View style={{ width: "100%", height: Math.max(4, (d.pct / 100) * 32), borderRadius: 3, backgroundColor: d.pct >= 75 ? theme.success : d.pct >= 50 ? theme.warning : theme.danger }} />
                  <Text style={{ fontSize: 9, color: theme.textMuted }}>{d.pct}%</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => markAll("present")} activeOpacity={0.7} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.success + "1A" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.success }}>All Present</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => markAll("absent")} activeOpacity={0.7} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.danger + "1A" }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.danger }}>All Absent</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {loading ? (
            [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : rows.map((row) => {
            const status = statuses[row.studentId] ?? null;
            const showSend = marked && row.recordId && status === "absent";
            const isExcused = excusedIds.has(row.studentId);
            return (
              <View key={row.studentId} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TouchableOpacity onPress={() => cycleStatus(row.studentId)} activeOpacity={isExcused ? 1 : 0.7} disabled={isExcused} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={row.fullName} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{row.fullName}</Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>Roll #{row.rollNumber}</Text>
                  </View>
                  {isExcused ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.primary + "1A", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Ionicons name="shield-checkmark" size={12} color={theme.primary} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.primary }}>Excused</Text>
                    </View>
                  ) : (
                    <StatusBadge variant={status ?? "unmarked"} />
                  )}
                </TouchableOpacity>
                {showSend ? (
                  !row.hasParent ? (
                    <Ionicons name="person-remove-outline" size={20} color={theme.textMuted} />
                  ) : (
                    <TouchableOpacity disabled={notifying[row.studentId]} onPress={() => notify(row)} style={{ padding: 4 }}>
                      <Ionicons
                        name={row.notifiedAt ? "checkmark-done" : "paper-plane"}
                        size={20}
                        color={row.notifiedAt ? theme.success : theme.primary}
                      />
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            );
          })}
          {marked && existingMode && (
            <TouchableOpacity onPress={confirmClear} style={{ alignItems: "center", paddingVertical: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.danger }}>Clear &amp; re-mark</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {!loading && rows.length > 0 && (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border }}>
            {isOffCampus && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.warning + "1A", borderRadius: 8 }}>
                <Ionicons name="flag" size={16} color={theme.warning} />
                <Text style={{ fontSize: 12, color: theme.warning, fontFamily: "Inter_500Medium", flex: 1 }}>
                  You're outside the campus geofence. Marking still works — this submission is tagged "off-campus" and shows up in the principal's review list. No reason needed.
                </Text>
              </View>
            )}
            <PrimaryButton
              label={isOffCampus ? "Submit (off-campus)" : marked ? "Update Attendance" : `Submit · ${markedCount}/${rows.length} marked`}
              onPress={submit}
              loading={saving}
              style={isOffCampus ? { backgroundColor: theme.warning, opacity: 0.9 } : undefined}
            />
            {isOffCampus && (
              <Text style={{ textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 8 }}>
                Saved &amp; flagged · principal can review later
              </Text>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

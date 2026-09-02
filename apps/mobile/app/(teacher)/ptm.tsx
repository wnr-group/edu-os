import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useFeature } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import {
  loadTeacherMeetings, markPtmStatus, loadOwnFeedback, recordPtmFeedback,
  type TeacherPtmMeetingItem, type TeacherPtmFeedback, type PtmMeetingStatus,
} from "../../lib/ptm";
import { SkeletonCard } from "../../components/Skeleton";

const STATUS_STYLE: Record<PtmMeetingStatus, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "#FEF3C7", fg: "#B45309", label: "SCHEDULED" },
  completed: { bg: "#D1FAE5", fg: "#047857", label: "COMPLETED" },
  cancelled: { bg: "#F3F4F6", fg: "#6B7280", label: "CANCELLED" },
  no_show: { bg: "#FEE2E2", fg: "#B91C1C", label: "NO-SHOW" },
};

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

type Theme = ReturnType<typeof useTheme>;

function RatingPicker({ label, value, onChange, theme }: { label: string; value: number | null; onChange: (v: number | null) => void; theme: Theme }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, textTransform: "uppercase" }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(value === n ? null : n)}
            style={{
              width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center",
              borderWidth: 1.5, borderColor: value === n ? theme.primary : theme.border,
              backgroundColor: value === n ? theme.primary + "18" : "transparent",
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: value === n ? theme.primary : theme.textMuted }}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function TeacherPtmScreen() {
  const theme = useTheme();
  const ptmEnabled = useFeature("ptm");
  const { userId, ready } = useTeacherContext();

  const [tab, setTab] = useState<"scheduled" | "completed" | "cancelled">("scheduled");
  const [meetings, setMeetings] = useState<TeacherPtmMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<TeacherPtmFeedback | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(true);
  const [academicRating, setAcademicRating] = useState<number | null>(null);
  const [behaviorRating, setBehaviorRating] = useState<number | null>(null);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setMeetings([]); setLoading(false); return; }
    try {
      setMeetings(await loadTeacherMeetings(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function toggleExpand(meeting: TeacherPtmMeetingItem) {
    if (expandedId === meeting.id) { setExpandedId(null); return; }
    setExpandedId(meeting.id);
    const canHaveFeedback = meeting.status === "completed" || meeting.status === "no_show";
    if (!canHaveFeedback) return;

    setFeedbackLoading(true);
    try {
      const fb = await loadOwnFeedback(meeting.id);
      setFeedback(fb);
      setSummary(fb?.summary ?? "");
      setVisibleToParent(fb?.visibleToParent ?? true);
      setAcademicRating(fb?.academicRating ?? null);
      setBehaviorRating(fb?.behaviorRating ?? null);
      setFollowUpRequired(fb?.followUpRequired ?? false);
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function handleStatus(id: string, status: "completed" | "no_show") {
    setBusyId(id);
    const { error } = await markPtmStatus(id, status);
    setBusyId(null);
    if (error) { Alert.alert("Error", error); return; }
    load();
  }

  async function handleSaveFeedback(meetingId: string) {
    if (!summary.trim()) { Alert.alert("Summary required", "Add a summary before saving."); return; }
    setSavingFeedback(true);
    const { error } = await recordPtmFeedback(meetingId, {
      summary: summary.trim(),
      visibleToParent,
      internalNotes: feedback?.internalNotes ?? null,
      academicRating,
      behaviorRating,
      followUpRequired,
    });
    setSavingFeedback(false);
    if (error) { Alert.alert("Error", error); return; }
    Alert.alert("Saved", feedback ? "Feedback updated." : "Feedback saved.");
    setFeedback({ summary: summary.trim(), visibleToParent, internalNotes: feedback?.internalNotes ?? null, academicRating, behaviorRating, followUpRequired });
  }

  if (!ptmEnabled) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Ionicons name="people-outline" size={40} color={theme.textMuted} />
        <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 12, textAlign: "center" }}>
          Parent-Teacher Meetings isn't available
        </Text>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 4, textAlign: "center" }}>
          This feature hasn't been turned on for your school yet.
        </Text>
      </SafeAreaView>
    );
  }

  const filtered = meetings
    .filter((m) => (tab === "cancelled" ? m.status === "cancelled" || m.status === "no_show" : m.status === tab))
    .sort((a, b) => (b.scheduledDate + b.startTime).localeCompare(a.scheduledDate + a.startTime));

  const counts = {
    scheduled: meetings.filter((m) => m.status === "scheduled").length,
    completed: meetings.filter((m) => m.status === "completed").length,
    cancelled: meetings.filter((m) => m.status === "cancelled" || m.status === "no_show").length,
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Parent-Teacher Meetings</Text>
        <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: theme.border }}>
          {(["scheduled", "completed", "cancelled"] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: tab === t ? theme.primary : "transparent", alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: tab === t ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>
                {t} ({counts[t]})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
        ) : filtered.length === 0 ? (
          <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No {tab} meetings.</Text>
        ) : (
          filtered.map((m) => {
            const style = STATUS_STYLE[m.status];
            const expanded = expandedId === m.id;
            const canHaveFeedback = m.status === "completed" || m.status === "no_show";
            return (
              <View key={m.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10 }}>
                <TouchableOpacity activeOpacity={canHaveFeedback ? 0.7 : 1} onPress={() => canHaveFeedback && toggleExpand(m)}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{m.studentName}</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                        {m.className}{m.subjectName ? ` · ${m.subjectName}` : ""}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textMuted, marginTop: 4 }}>
                        {formatDate(m.scheduledDate)} · {formatTime(m.startTime)} · {m.durationMinutes} min
                      </Text>
                    </View>
                    <View style={{ backgroundColor: style.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: style.fg }}>{style.label}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <Ionicons name={m.meetingMode === "online" ? "videocam-outline" : "location-outline"} size={13} color={theme.textMuted} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                      {m.location || (m.meetingMode === "online" ? "Online — link to be shared" : "Location not specified")}
                    </Text>
                  </View>
                  {m.status === "cancelled" && m.cancelledReason && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger, marginTop: 6 }}>Cancelled: {m.cancelledReason}</Text>
                  )}
                </TouchableOpacity>

                {m.status === "scheduled" && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => handleStatus(m.id, "no_show")}
                      disabled={busyId === m.id}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: theme.danger }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.danger }}>No-show</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleStatus(m.id, "completed")}
                      disabled={busyId === m.id}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.success }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                        {busyId === m.id ? "Saving…" : "Mark completed"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {expanded && canHaveFeedback && (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12, gap: 12 }}>
                    {feedbackLoading ? (
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Loading feedback…</Text>
                    ) : (
                      <>
                        <View>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                            Summary — shown to parent
                          </Text>
                          <TextInput
                            value={summary}
                            onChangeText={setSummary}
                            multiline
                            numberOfLines={4}
                            placeholder="What was discussed, how the student is doing, any next steps…"
                            placeholderTextColor={theme.textMuted}
                            style={{
                              backgroundColor: theme.surfaceRaised, borderRadius: 10, padding: 12, minHeight: 90,
                              fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary, textAlignVertical: "top",
                            }}
                          />
                        </View>

                        <TouchableOpacity onPress={() => setVisibleToParent((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name={visibleToParent ? "checkbox" : "square-outline"} size={20} color={visibleToParent ? theme.primary : theme.textMuted} />
                          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>Visible to parent</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: "row", gap: 20 }}>
                          <RatingPicker label="Academic" value={academicRating} onChange={setAcademicRating} theme={theme} />
                          <RatingPicker label="Behaviour" value={behaviorRating} onChange={setBehaviorRating} theme={theme} />
                        </View>

                        <TouchableOpacity onPress={() => setFollowUpRequired((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Ionicons name={followUpRequired ? "checkbox" : "square-outline"} size={20} color={followUpRequired ? theme.primary : theme.textMuted} />
                          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>Needs a follow-up meeting</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleSaveFeedback(m.id)}
                          disabled={savingFeedback || !summary.trim()}
                          style={{ alignItems: "center", paddingVertical: 11, borderRadius: 10, backgroundColor: theme.primary, opacity: savingFeedback || !summary.trim() ? 0.5 : 1 }}
                        >
                          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                            {savingFeedback ? "Saving…" : feedback ? "Update feedback" : "Save feedback"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

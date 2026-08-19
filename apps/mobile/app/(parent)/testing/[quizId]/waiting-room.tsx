import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../../lib/theme";
import { useActiveContext } from "../../../../lib/active-context";
import { supabase } from "../../../../lib/supabase";
import {
  loadQuizDetail, QuizDetail, loadLiveQuizState, LiveQuizState, LiveStatus,
  loadMyParticipantStatus, ParticipantStatus, joinLiveQuiz, reportQuizBlocker, BlockerReason,
  loadMyBlockerReport, MyBlockerReport, BlockerStatus,
} from "../../../../lib/testing";
import { SkeletonCard } from "../../../../components/Skeleton";

const BLOCKER_REASONS: { value: BlockerReason; label: string }[] = [
  { value: "connectivity", label: "Poor internet connection" },
  { value: "device", label: "Device problem" },
  { value: "technical", label: "App isn't working" },
  { value: "not_available", label: "Can't join right now" },
  { value: "other", label: "Something else" },
];

export default function ParentLiveWaitingRoom() {
  const theme = useTheme();
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { studentId, students } = useActiveContext();
  const activeStudent = students.find((s) => s.id === studentId);

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [liveState, setLiveState] = useState<LiveQuizState | null>(null);
  const [myStatus, setMyStatus] = useState<ParticipantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showBlockerModal, setShowBlockerModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<BlockerReason | null>(null);
  const [blockerMessage, setBlockerMessage] = useState("");
  const [submittingBlocker, setSubmittingBlocker] = useState(false);
  const [myBlockerReport, setMyBlockerReport] = useState<MyBlockerReport | null>(null);
  const navigatedRef = useRef(false);

  const load = useCallback(async () => {
    if (!quizId || !studentId) return;
    setLoading(true);
    try {
      const [q, live, status, blocker] = await Promise.all([
        loadQuizDetail(quizId),
        loadLiveQuizState(quizId),
        loadMyParticipantStatus(quizId, studentId),
        loadMyBlockerReport(quizId, studentId),
      ]);
      setQuiz(q);
      setLiveState(live);
      setMyStatus(status);
      setMyBlockerReport(blocker);
    } finally {
      setLoading(false);
    }
  }, [quizId, studentId]);

  useEffect(() => { load(); }, [load]);

  // Moves into the timed question flow the moment the host starts —
  // including on first load, if we open this screen after it's already
  // running (late join, if the host allowed it).
  useEffect(() => {
    if (navigatedRef.current) return;
    if (liveState?.liveStatus !== "in_progress") return;
    if (myStatus === "excluded") return;
    const canEnter = myStatus === "joined" || liveState.lateJoinAllowed;
    if (!canEnter) return;
    navigatedRef.current = true;
    router.replace({ pathname: "/(parent)/testing/[quizId]/live-attempt", params: { quizId } });
  }, [liveState?.liveStatus, liveState?.lateJoinAllowed, myStatus, quizId, router]);

  useEffect(() => {
    if (!quizId) return;
    const channel = supabase
      .channel(`waiting-room-${quizId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quizzes", filter: `id=eq.${quizId}` },
        (payload) => {
          const row = payload.new as {
            live_status: LiveStatus | null;
            live_current_question_index: number | null;
            live_question_started_at: string | null;
            live_late_join_allowed: boolean;
          };
          setLiveState({
            liveStatus: row.live_status,
            currentQuestionIndex: row.live_current_question_index,
            questionStartedAt: row.live_question_started_at,
            lateJoinAllowed: row.live_late_join_allowed,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_live_participants", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          const row = payload.new as { student_id: string; status: ParticipantStatus } | undefined;
          if (row && row.student_id === studentId) setMyStatus(row.status);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_blocker_reports", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          const row = payload.new as { id: string; student_id: string; reason: BlockerReason; status: BlockerStatus; reported_at: string } | undefined;
          if (row && row.student_id === studentId) {
            setMyBlockerReport({ id: row.id, reason: row.reason, status: row.status, reportedAt: row.reported_at });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, studentId]);

  async function handleJoin() {
    if (!quizId || !studentId) return;
    setJoining(true);
    const { error } = await joinLiveQuiz(quizId, studentId);
    setJoining(false);
    if (error) {
      Alert.alert("Can't join", error);
      return;
    }
    setMyStatus("joined");
  }

  async function handleSubmitBlocker() {
    if (!quizId || !studentId || !selectedReason) return;
    setSubmittingBlocker(true);
    const { error } = await reportQuizBlocker(quizId, studentId, selectedReason, blockerMessage.trim() || null);
    setSubmittingBlocker(false);
    if (error) {
      Alert.alert("Couldn't send", error);
      return;
    }
    setShowBlockerModal(false);
    // Optimistic — the Realtime subscription above will confirm/replace this
    // with the authoritative row moments later.
    setMyBlockerReport({ id: "pending", reason: selectedReason, status: "open", reportedAt: new Date().toISOString() });
    setSelectedReason(null);
    setBlockerMessage("");
  }

  const joined = myStatus === "joined";
  const excluded = myStatus === "excluded";
  const ended = liveState?.liveStatus === "ended";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>
          Waiting room
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16, flexGrow: 1 }}>
        {loading || !quiz ? (
          <SkeletonCard />
        ) : excluded ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
            <Ionicons name="close-circle-outline" size={40} color={theme.danger} />
            <Text style={{ fontFamily: "Inter_700Bold", color: theme.textPrimary, fontSize: 16 }}>You&rsquo;ve been removed from this session</Text>
            <Text style={{ fontFamily: "Inter_400Regular", color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
              Contact your teacher if you think this is a mistake.
            </Text>
          </View>
        ) : ended ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
            <Ionicons name="checkmark-done-circle-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontFamily: "Inter_700Bold", color: theme.textPrimary, fontSize: 16 }}>This session has ended</Text>
            <TouchableOpacity
              onPress={() => router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } })}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.primary, fontSize: 14 }}>View result</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 20 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: theme.primaryLight, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="radio-outline" size={30} color={theme.primary} />
              </View>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary, textAlign: "center" }}>{quiz.title}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>{quiz.subject}</Text>
              {activeStudent && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{activeStudent.fullName}</Text>
              )}
            </View>

            {joined ? (
              <View style={{ alignItems: "center", gap: 8, backgroundColor: theme.surface, borderRadius: 16, padding: 20 }}>
                <ActivityIndicator color={theme.primary} />
                <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textPrimary, fontSize: 14, marginTop: 6 }}>
                  You&rsquo;re in — waiting for the host to start
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", color: theme.textMuted, fontSize: 12, textAlign: "center" }}>
                  This screen updates automatically the moment the quiz begins.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleJoin}
                disabled={joining}
                style={{ backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", color: "#fff", fontSize: 15 }}>
                  {joining ? "Joining…" : "Join waiting room"}
                </Text>
              </TouchableOpacity>
            )}

            {myBlockerReport ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor: (myBlockerReport.status === "open" ? theme.warning : theme.success) + "1A",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Ionicons
                  name={myBlockerReport.status === "open" ? "time-outline" : "checkmark-circle"}
                  size={16}
                  color={myBlockerReport.status === "open" ? theme.warning : theme.success}
                />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>
                  {myBlockerReport.status === "open"
                    ? "Your teacher has been notified — waiting for a response."
                    : "Acknowledged by your teacher."}
                </Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowBlockerModal(true)} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textSecondary, fontSize: 13 }}>
                  Can&rsquo;t join? Report a problem
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showBlockerModal} transparent animationType="slide" onRequestClose={() => setShowBlockerModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setShowBlockerModal(false)} />
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34, gap: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 3, backgroundColor: theme.border, alignSelf: "center", marginBottom: 12 }} />
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>What&rsquo;s the problem?</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {BLOCKER_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => setSelectedReason(r.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderWidth: 1.5,
                  borderColor: selectedReason === r.value ? theme.primary : theme.border,
                  backgroundColor: selectedReason === r.value ? theme.primaryLight : "transparent",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 1.5,
                    borderColor: selectedReason === r.value ? theme.primary : theme.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selectedReason === r.value && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary }} />}
                </View>
                <Text style={{ fontFamily: "Inter_500Medium", color: theme.textPrimary, fontSize: 14 }}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={blockerMessage}
            onChangeText={setBlockerMessage}
            placeholder="Add a note (optional)"
            placeholderTextColor={theme.textMuted}
            multiline
            style={{
              minHeight: 60,
              marginTop: 12,
              backgroundColor: theme.surfaceRaised,
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: theme.textPrimary,
              textAlignVertical: "top",
            }}
          />
          <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }}>
            <TouchableOpacity
              onPress={() => setShowBlockerModal(false)}
              style={{ flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: 13, paddingVertical: 13, alignItems: "center" }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textPrimary, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmitBlocker}
              disabled={!selectedReason || submittingBlocker}
              style={{
                flex: 1,
                backgroundColor: theme.primary,
                borderRadius: 13,
                paddingVertical: 13,
                alignItems: "center",
                opacity: !selectedReason ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: "Inter_700Bold", color: "#fff", fontSize: 14 }}>{submittingBlocker ? "Sending…" : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

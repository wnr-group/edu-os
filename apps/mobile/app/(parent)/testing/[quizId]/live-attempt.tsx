import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../../lib/theme";
import { useActiveContext } from "../../../../lib/active-context";
import { supabase } from "../../../../lib/supabase";
import { startAttempt, loadLiveCurrentQuestion, LiveQuestion, saveAnswer, LiveStatus, ParticipantStatus } from "../../../../lib/testing";

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ParentLiveAttempt() {
  const theme = useTheme();
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { studentId } = useActiveContext();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [shortText, setShortText] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQuestion = useCallback(async () => {
    if (!quizId || !studentId) return;
    const q = await loadLiveCurrentQuestion(quizId, studentId);
    if (!q) {
      // No current question — the session ended between the waiting room's
      // redirect and this load, or we were excluded. Either way, the result
      // screen is the correct landing spot.
      router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
      return;
    }
    setQuestion(q);
    setSelectedOptionId(null);
    setShortText("");
    setLoading(false);
  }, [quizId, studentId, router]);

  const init = useCallback(async () => {
    if (!quizId || !studentId) return;
    setLoading(true);
    const { attemptId: id, error: startErr } = await startAttempt(quizId, studentId);
    if (startErr || !id) {
      setError(startErr ?? "Could not start this quiz.");
      setLoading(false);
      return;
    }
    setAttemptId(id);
    await loadQuestion();
  }, [quizId, studentId, loadQuestion]);

  useEffect(() => { init(); }, [init]);

  // Display-only countdown — the host's own client is what actually
  // advances the question server-side; this just mirrors the deadline
  // advance_live_question enforces.
  useEffect(() => {
    if (!question) return;
    const deadline = new Date(question.questionStartedAt).getTime() + question.timeLimitSeconds * 1000;
    function tick() {
      setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [question]);

  useEffect(() => {
    if (!quizId || !studentId) return;
    const channel = supabase
      .channel(`live-attempt-${quizId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quizzes", filter: `id=eq.${quizId}` },
        (payload) => {
          const row = payload.new as { live_status: LiveStatus | null };
          if (row.live_status === "ended") {
            router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
            return;
          }
          loadQuestion();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quiz_live_participants", filter: `quiz_id=eq.${quizId}` },
        (payload) => {
          const row = payload.new as { student_id: string; status: ParticipantStatus } | undefined;
          if (row && row.student_id === studentId && row.status === "excluded") {
            router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, studentId, loadQuestion, router]);

  function selectOption(optionId: string) {
    setSelectedOptionId(optionId);
    if (attemptId && question) saveAnswer(attemptId, question.questionId, optionId, null);
  }

  function commitShortText() {
    if (attemptId && question) saveAnswer(attemptId, question.questionId, null, shortText || null);
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textPrimary, fontSize: 15, textAlign: "center" }}>{error}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.primary, fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (loading || !question) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  const timeCritical = (remainingSeconds ?? 0) <= 5;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textMuted }}>Live quiz</Text>
        <View
          style={{
            backgroundColor: (timeCritical ? theme.danger : theme.warning) + "1A",
            borderRadius: 100,
            paddingHorizontal: 11,
            paddingVertical: 5,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="time-outline" size={13} color={timeCritical ? theme.danger : theme.warning} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: timeCritical ? theme.danger : theme.warning }}>
            {formatClock(remainingSeconds ?? 0)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginBottom: 16, lineHeight: 22 }}>
          {question.prompt}
        </Text>

        {question.type === "short_answer" ? (
          <TextInput
            multiline
            value={shortText}
            onChangeText={setShortText}
            onBlur={commitShortText}
            placeholder="Type your answer…"
            placeholderTextColor={theme.textMuted}
            style={{
              minHeight: 100,
              backgroundColor: theme.surface,
              borderRadius: 13,
              borderWidth: 1.5,
              borderColor: theme.border,
              padding: 13,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
              color: theme.textPrimary,
              textAlignVertical: "top",
            }}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {question.options.map((opt, i) => {
              const selected = selectedOptionId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => selectOption(opt.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 11,
                    borderWidth: 1.5,
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.primaryLight : theme.surface,
                    borderRadius: 13,
                    padding: 13,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      backgroundColor: selected ? theme.primary : theme.surfaceRaised,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: selected ? "#fff" : theme.textSecondary }}>
                      {String.fromCharCode(65 + i)}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{opt.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8, backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 12, marginTop: 20 }}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
            Your teacher controls when this question ends — the next one appears automatically.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

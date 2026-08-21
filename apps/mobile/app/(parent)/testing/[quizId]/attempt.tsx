import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../../lib/theme";
import { useActiveContext } from "../../../../lib/active-context";
import {
  startAttempt, loadAttemptTiming, loadAttemptQuestions, saveAnswer, submitAttempt,
  AttemptQuestion,
} from "../../../../lib/testing";

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ParentQuizAttempt() {
  const theme = useTheme();
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { studentId } = useActiveContext();

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, { optionId?: string | null; shortText?: string }>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const submittedRef = useRef(false);

  const init = useCallback(async () => {
    if (!quizId || !studentId) return;
    setLoading(true);
    const { attemptId: id, error } = await startAttempt(quizId, studentId);
    if (error || !id) {
      Alert.alert("Can't start this quiz", error ?? "Unknown error", [{ text: "OK", onPress: () => router.back() }]);
      return;
    }
    setAttemptId(id);
    const [timing, qs] = await Promise.all([loadAttemptTiming(id), loadAttemptQuestions(id)]);
    if (timing && timing.status !== "in_progress") {
      router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
      return;
    }
    if (timing) {
      const dl = Math.min(
        new Date(timing.startedAt).getTime() + timing.durationSeconds * 1000,
        timing.closesAt ? new Date(timing.closesAt).getTime() : Infinity
      );
      setDeadline(dl);
      setRemainingMs(Math.max(0, dl - Date.now()));
    }
    setQuestions(qs);
    setLoading(false);
  }, [quizId, studentId]);

  useEffect(() => { init(); }, [init]);

  const doSubmit = useCallback(async () => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const { error } = await submitAttempt(attemptId);
    setSubmitting(false);
    if (error) {
      Alert.alert("Couldn't submit", error);
      submittedRef.current = false;
      return;
    }
    router.replace({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
  }, [attemptId, quizId]);

  // Countdown; auto-submits once the deadline passes.
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => {
      const left = deadline - Date.now();
      setRemainingMs(Math.max(0, left));
      if (left <= 0) {
        clearInterval(timer);
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, doSubmit]);

  function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], optionId } }));
    if (attemptId) saveAnswer(attemptId, questionId, optionId, null);
  }

  function setShortText(questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], shortText: text } }));
  }

  function commitShortText(questionId: string) {
    if (!attemptId) return;
    const text = answers[questionId]?.shortText ?? "";
    saveAnswer(attemptId, questionId, null, text || null);
  }

  const current = questions[currentIndex];
  const answeredCount = questions.filter((q) => {
    const a = answers[q.questionId];
    return a && (a.optionId || (a.shortText && a.shortText.trim().length > 0));
  }).length;
  const unansweredCount = questions.length - answeredCount;
  const timeCritical = remainingMs < 60000;

  if (loading || !current) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.primary} />
      </SafeAreaView>
    );
  }

  const answer = answers[current.questionId];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textMuted }}>
            Question {currentIndex + 1} of {questions.length}
          </Text>
        </View>
        <View style={{ backgroundColor: (timeCritical ? theme.danger : theme.warning) + "1A", borderRadius: 100, paddingHorizontal: 11, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="time-outline" size={13} color={timeCritical ? theme.danger : theme.warning} />
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: timeCritical ? theme.danger : theme.warning }}>{formatClock(remainingMs)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginBottom: 16, lineHeight: 22 }}>
          {current.prompt}
        </Text>

        {current.type === "short_answer" ? (
          <TextInput
            multiline
            value={answer?.shortText ?? ""}
            onChangeText={(t) => setShortText(current.questionId, t)}
            onBlur={() => commitShortText(current.questionId)}
            placeholder="Type your answer…"
            placeholderTextColor={theme.textMuted}
            style={{ minHeight: 100, backgroundColor: theme.surface, borderRadius: 13, borderWidth: 1.5, borderColor: theme.border, padding: 13, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, textAlignVertical: "top" }}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {current.options.map((opt, i) => {
              const selected = answer?.optionId === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => selectOption(current.questionId, opt.id)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 11,
                    borderWidth: 1.5, borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.primaryLight : theme.surface,
                    borderRadius: 13, padding: 13,
                  }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: selected ? theme.primary : theme.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
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

        <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
          <TouchableOpacity
            disabled={currentIndex === 0}
            onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            style={{ flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: currentIndex === 0 ? 0.4 : 1 }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textPrimary, fontSize: 14 }}>Previous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={currentIndex === questions.length - 1}
            onPress={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: currentIndex === questions.length - 1 ? 0.4 : 1 }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14 }}>Next</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase", marginTop: 20, marginBottom: 8 }}>
          Jump to question
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {questions.map((q, i) => {
            const a = answers[q.questionId];
            const isAnswered = !!(a && (a.optionId || (a.shortText && a.shortText.trim().length > 0)));
            const isCurrent = i === currentIndex;
            return (
              <TouchableOpacity
                key={q.questionId}
                onPress={() => setCurrentIndex(i)}
                style={{
                  width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center",
                  backgroundColor: isCurrent ? theme.primary : isAnswered ? theme.success + "1A" : theme.surfaceRaised,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: isCurrent ? "#fff" : isAnswered ? theme.success : theme.textMuted }}>
                  {i + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ position: "absolute", left: 16, right: 16, bottom: 20 }}>
        <TouchableOpacity
          onPress={() => setShowConfirm(true)}
          style={{ backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 14, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 }}
        >
          <Text style={{ fontFamily: "Inter_700Bold", color: theme.textPrimary, fontSize: 14 }}>Review &amp; submit</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showConfirm} transparent animationType="slide" onRequestClose={() => setShowConfirm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setShowConfirm(false)} />
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 34, gap: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 3, backgroundColor: theme.border, alignSelf: "center", marginBottom: 12 }} />
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Submit quiz?</Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4 }}>
            You&rsquo;ve answered {answeredCount} of {questions.length} questions. Once submitted, answers can&rsquo;t be changed.
          </Text>
          {unansweredCount > 0 && (
            <View style={{ flexDirection: "row", gap: 8, backgroundColor: theme.warning + "1A", borderRadius: 11, padding: 11, marginTop: 10 }}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.warning} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>
                {unansweredCount} question{unansweredCount === 1 ? "" : "s"} unanswered — {unansweredCount === 1 ? "it" : "they"} will be scored as 0.
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 9, marginTop: 16 }}>
            <TouchableOpacity onPress={() => setShowConfirm(false)} style={{ flex: 1, borderWidth: 1.5, borderColor: theme.border, borderRadius: 13, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: theme.textPrimary, fontSize: 14 }}>Go back &amp; review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setShowConfirm(false); doSubmit(); }}
              disabled={submitting}
              style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 13, paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
            >
              {submitting && <ActivityIndicator color="#fff" size="small" />}
              <Text style={{ fontFamily: "Inter_700Bold", color: "#fff", fontSize: 14 }}>Submit now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

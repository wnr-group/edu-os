import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../../lib/theme";
import { useActiveContext } from "../../../../lib/active-context";
import { loadQuizDetail, loadExistingAttempt, QuizDetail } from "../../../../lib/testing";
import { PrimaryButton } from "../../../../components/PrimaryButton";
import { SkeletonCard } from "../../../../components/Skeleton";

function formatWindow(opensAt: string | null, closesAt: string | null): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  if (!opensAt && !closesAt) return "No fixed window";
  return `${opensAt ? fmt(opensAt) : "Now"} – ${closesAt ? fmt(closesAt) : "—"}`;
}

export default function ParentQuizDetails() {
  const theme = useTheme();
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { studentId } = useActiveContext();

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<"in_progress" | "submitted" | "graded" | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!quizId || !studentId) return;
    setLoading(true);
    const [q, a] = await Promise.all([loadQuizDetail(quizId), loadExistingAttempt(quizId, studentId)]);
    setQuiz(q);
    setAttemptStatus(a?.status ?? null);
    setAttemptNumber(a?.attemptNumber ?? 0);
    setLoading(false);
  }, [quizId, studentId]);

  useEffect(() => { load(); }, [load]);

  const durationMinutes = quiz ? Math.round(quiz.durationSeconds / 60) : 0;
  const isFinished = attemptStatus === "submitted" || attemptStatus === "graded";
  const canRetake = isFinished && !!quiz && attemptNumber < quiz.attemptsAllowed;

  function goToResult() {
    router.push({ pathname: "/(parent)/testing/[quizId]/result", params: { quizId } });
  }
  function goToAttempt() {
    if (quiz?.mode === "live") {
      router.push({ pathname: "/(parent)/testing/[quizId]/waiting-room", params: { quizId } });
      return;
    }
    router.push({ pathname: "/(parent)/testing/[quizId]/attempt", params: { quizId } });
  }
  function primaryAction() {
    if (isFinished) goToResult();
    else goToAttempt();
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>Quiz details</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 16 }}>
        {loading || !quiz ? (
          <SkeletonCard />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: theme.success + "1A", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="play-outline" size={22} color={theme.success} />
              </View>
              <View>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{quiz.title}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>{quiz.subject}</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { label: "Questions", value: String(quiz.questionCount) },
                { label: "Marks", value: String(quiz.totalPoints) },
                { label: "Duration", value: `${durationMinutes} min` },
              ].map((s) => (
                <View key={s.label} style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, padding: 10, gap: 2 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>{s.label}</Text>
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{s.value}</Text>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="calendar-outline" size={16} color={theme.textMuted} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>{formatWindow(quiz.opensAt, quiz.closesAt)}</Text>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Instructions</Text>
              {(quiz.mode === "live"
                ? [
                    "Join the waiting room before the host starts — questions appear one at a time, paced by your teacher.",
                    "You can't go back to a previous question once the host moves on.",
                    "Can't join in time? Report a problem from the waiting room and your teacher will be notified.",
                    "Multiple-choice and true/false questions are graded instantly; any short-answer question is graded by the teacher afterwards.",
                  ]
                : [
                    quiz.attemptsAllowed > 1
                      ? `Up to ${quiz.attemptsAllowed} attempts — retaking replaces the result with the new attempt.`
                      : "One attempt only — there's no retry once submitted.",
                    `The ${durationMinutes}-minute timer starts the moment you tap Start, and auto-submits whatever is answered when it hits zero.`,
                    "You can move between questions freely before submitting.",
                    "Multiple-choice and true/false questions are graded instantly; any short-answer question is graded by the teacher afterwards.",
                  ]
              ).map((line, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 5 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: theme.primaryLight, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: theme.primary }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>{line}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 4 }}>
                No negative marking — an unanswered or wrong question simply scores 0.
              </Text>
            </View>

            {quiz.instructions ? (
              <View style={{ backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary }}>{quiz.instructions}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {!loading && quiz && quiz.status === "open" && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 20, gap: 9 }}>
          {canRetake ? (
            <>
              <PrimaryButton label={`Retake quiz (attempt ${attemptNumber + 1} of ${quiz.attemptsAllowed})`} onPress={goToAttempt} />
              <TouchableOpacity onPress={goToResult} style={{ alignItems: "center", paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>View previous result</Text>
              </TouchableOpacity>
            </>
          ) : (
            <PrimaryButton
              label={
                isFinished
                  ? "View result"
                  : attemptStatus === "in_progress"
                    ? "Resume quiz"
                    : quiz.mode === "live"
                      ? "Join waiting room"
                      : "Start quiz"
              }
              onPress={primaryAction}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../../lib/theme";
import { useActiveContext } from "../../../../lib/active-context";
import { loadResult, loadReview, QuizResultData, ReviewQuestion } from "../../../../lib/testing";
import { SkeletonCard } from "../../../../components/Skeleton";

type PerformanceTier = "excellent" | "average" | "low";

function performanceTier(percentage: number): PerformanceTier {
  if (percentage >= 71) return "excellent";
  if (percentage >= 41) return "average";
  return "low";
}

function performanceMessage(percentage: number): string {
  if (percentage === 100) return "Perfect score! Every question correct.";
  if (percentage >= 71) return "Great work — that's a strong score!";
  if (percentage >= 41) return "Good effort. A bit more practice will help.";
  return "Keep practicing — you'll do better next time.";
}

const TIER_ICON: Record<PerformanceTier, keyof typeof Ionicons.glyphMap> = {
  excellent: "trophy",
  average: "trending-up",
  low: "book-outline",
};

export default function ParentQuizResult() {
  const theme = useTheme();
  const router = useRouter();
  const { quizId } = useLocalSearchParams<{ quizId: string }>();
  const { studentId, students } = useActiveContext();
  const activeStudent = students.find((s) => s.id === studentId);

  const [result, setResult] = useState<QuizResultData | null>(null);
  const [review, setReview] = useState<ReviewQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!quizId || !studentId) return;
    setLoading(true);
    const r = await loadResult(quizId, studentId);
    setResult(r);
    if (r && r.status === "graded" && r.showAnswersAfterClose) {
      setReview(await loadReview(r.attemptId));
    }
    setLoading(false);
  }, [quizId, studentId]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.navigate("/(parent)/testing")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Result</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
        {loading ? (
          <SkeletonCard />
        ) : !result ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
            <Ionicons name="document-text-outline" size={36} color={theme.textMuted} />
            <Text style={{ fontFamily: "Inter_500Medium", color: theme.textMuted }}>No attempt found.</Text>
          </View>
        ) : (
          <>
            {(() => {
              const tier = result.fullyGraded ? performanceTier(result.percentage) : null;
              const tierColor = tier ? { excellent: theme.success, average: theme.warning, low: theme.danger }[tier] : theme.info;
              return (
                <View style={{ alignItems: "center", paddingVertical: 8, gap: 6 }}>
                  <View style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: theme.surface, borderWidth: 8, borderColor: tierColor + "33", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                      {result.status === "submitted" && !result.fullyGraded ? "…" : `${result.totalPoints}/${result.maxPoints}`}
                    </Text>
                    <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>Score</Text>
                  </View>

                  {!result.fullyGraded ? (
                    <View style={{ backgroundColor: theme.warning + "1A", borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.warning, textTransform: "uppercase" }}>Grading in progress</Text>
                    </View>
                  ) : (
                    <>
                      {result.passed !== null && (
                        <View style={{ backgroundColor: (result.passed ? theme.success : theme.danger) + "1A", borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: result.passed ? theme.success : theme.danger, textTransform: "uppercase" }}>
                            {result.passed ? "Passed" : "Not passed"}
                          </Text>
                        </View>
                      )}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Ionicons name={TIER_ICON[tier!]} size={16} color={tierColor} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: tierColor, textAlign: "center" }}>
                          {performanceMessage(result.percentage)}
                        </Text>
                      </View>
                    </>
                  )}

                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.textPrimary, marginTop: 6 }}>
                    {result.fullyGraded ? `${Math.round(result.percentage)}%` : "Some questions still need teacher grading"}
                  </Text>
                  {activeStudent && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{activeStudent.fullName}</Text>
                  )}
                </View>
              );
            })()}

            {review && review.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>Answer review</Text>
                {review.map((r) => (
                  <View key={r.questionId} style={{ backgroundColor: theme.surface, borderRadius: 13, padding: 13, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: (r.isCorrect ? theme.success : theme.danger) + "1A", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={r.isCorrect ? "checkmark" : "close"} size={13} color={r.isCorrect ? theme.success : theme.danger} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{r.prompt}</Text>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.textMuted }}>{r.pointsAwarded ?? 0}/{r.points}</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, paddingLeft: 31 }}>
                      Answered <Text style={{ fontFamily: "Inter_700Bold", color: r.isCorrect ? theme.success : theme.danger }}>{r.selectedText ?? "—"}</Text>
                      {!r.isCorrect && r.correctText ? (
                        <>
                          {" "}· correct answer was <Text style={{ fontFamily: "Inter_700Bold", color: theme.success }}>{r.correctText}</Text>
                        </>
                      ) : null}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {result.fullyGraded && !result.showAnswersAfterClose && (
              <View style={{ flexDirection: "row", gap: 8, backgroundColor: theme.surfaceRaised, borderRadius: 12, padding: 12 }}>
                <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                  Your teacher hasn&rsquo;t enabled answer review for this quiz — only the score is shown.
                </Text>
              </View>
            )}

            {result.quizStatus === "open" && result.attemptNumber < result.attemptsAllowed && (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/(parent)/testing/[quizId]/attempt", params: { quizId } })}
                style={{ alignItems: "center", paddingVertical: 10, borderWidth: 1.5, borderColor: theme.border, borderRadius: 13 }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.primary }}>
                  Retake quiz (attempt {result.attemptNumber + 1} of {result.attemptsAllowed})
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

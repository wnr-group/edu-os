import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, useFeature } from "../../../lib/theme";
import { useActiveContext } from "../../../lib/active-context";
import { loadQuizzesForChild, ParentQuizListItem } from "../../../lib/testing";
import { SkeletonCard } from "../../../components/Skeleton";
import { QuizStatusPill, QuizPillVariant } from "../../../components/QuizStatusPill";

type Tab = "available" | "upcoming" | "completed";

function tabOf(q: ParentQuizListItem): Tab {
  if (q.status === "scheduled") return "upcoming";
  if (q.attemptStatus === "submitted" || q.attemptStatus === "graded" || q.status === "closed") return "completed";
  return "available";
}

function pillOf(q: ParentQuizListItem): QuizPillVariant {
  if (q.attemptStatus === "graded") return "graded";
  if (q.attemptStatus === "submitted") return "submitted";
  if (q.attemptStatus === "in_progress") return "in_progress";
  if (q.status === "scheduled") return "upcoming";
  if (q.status === "closed") return "closed";
  return "open";
}

function formatWindow(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const diffMs = new Date(closesAt).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours >= 24) return `Closes in ${Math.floor(hours / 24)}d`;
  if (hours > 0) return `Closes in ${hours}h ${mins}m`;
  return `Closes in ${mins}m`;
}

export default function ParentTestingList() {
  const theme = useTheme();
  const router = useRouter();
  const testingEnabled = useFeature("testing");
  const { studentId, students } = useActiveContext();
  const activeStudent = students.find((s) => s.id === studentId);

  const [tab, setTab] = useState<Tab>("available");
  const [quizzes, setQuizzes] = useState<ParentQuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) {
      setQuizzes([]);
      setLoading(false);
      return;
    }
    setError(false);
    try {
      setQuizzes(await loadQuizzesForChild(studentId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const counts: Record<Tab, number> = { available: 0, upcoming: 0, completed: 0 };
  for (const q of quizzes) counts[tabOf(q)]++;
  const filtered = quizzes.filter((q) => tabOf(q) === tab);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Testing</Text>
          {activeStudent && (
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{activeStudent.fullName}</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!testingEnabled ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <Ionicons name="lock-closed-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
              Testing isn&rsquo;t turned on for your school yet.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", backgroundColor: theme.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: theme.border }}>
              {(["available", "upcoming", "completed"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  activeOpacity={0.85}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: tab === t ? theme.primary : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: tab === t ? "#fff" : theme.textSecondary, textTransform: "capitalize" }}>
                    {t} {counts[t] > 0 ? `(${counts[t]})` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <View style={{ gap: 10 }}><SkeletonCard /><SkeletonCard /></View>
            ) : error ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
                <Ionicons name="wifi-outline" size={36} color={theme.textMuted} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted }}>Couldn&rsquo;t load quizzes.</Text>
                <TouchableOpacity onPress={load}><Text style={{ color: theme.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Try again</Text></TouchableOpacity>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
                <Ionicons name="document-text-outline" size={36} color={theme.textMuted} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
                  {tab === "available" ? "No quizzes available right now." : tab === "upcoming" ? "No upcoming quizzes." : "No completed quizzes yet."}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filtered.map((q) => {
                  const closesLabel = tab === "available" ? formatWindow(q.closesAt) : null;
                  return (
                    <TouchableOpacity
                      key={q.id}
                      activeOpacity={0.85}
                      onPress={() => router.push({ pathname: "/(parent)/testing/[quizId]", params: { quizId: q.id } })}
                      style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{q.title}</Text>
                          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginTop: 2 }}>
                            {q.subject} · {q.questionCount} questions · {q.totalPoints} marks
                          </Text>
                        </View>
                        <QuizStatusPill variant={pillOf(q)} />
                      </View>
                      {(closesLabel || q.score) && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
                          <Ionicons name={q.score ? "trophy-outline" : "time-outline"} size={14} color={theme.textMuted} />
                          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>
                            {q.score ? `${q.score.total} / ${q.score.max} (${Math.round(q.score.percentage)}%)` : closesLabel}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../../lib/theme";
import { useTeacherContext } from "../../../lib/teacherContext";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { SkeletonCard } from "../../../components/Skeleton";
import {
  loadRoster, loadAttachments, getSignedUrl, reviewStudent, notifyReviewed,
  RosterRow, AttachmentRow, HomeworkRating,
} from "../../../lib/homework";
import { Linking } from "react-native";

const RATING_OPTIONS: { value: HomeworkRating; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "satisfactory", label: "Satisfactory" },
  { value: "needs_improvement", label: "Needs Improvement" },
];

export default function HomeworkDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { homeworkId, sectionId, title } = useLocalSearchParams<{ homeworkId: string; sectionId: string; title: string }>();
  const { activeSection } = useTeacherContext();
  const secId = (sectionId as string) || activeSection?.id || "";

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState<HomeworkRating>("good");
  const [draftComment, setDraftComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState({ done: true, viewed: true, not_started: false });

  const load = useCallback(async () => {
    if (!homeworkId || !secId) return;
    setLoading(true);
    const [r, a] = await Promise.all([loadRoster(homeworkId, secId), loadAttachments(homeworkId)]);
    setRoster(r);
    setAttachments(a);
    setLoading(false);
  }, [homeworkId, secId]);

  useEffect(() => { load(); }, [load]);

  // "Done — needs review" = done & not yet reviewed; reviewed ones still show in done group with their rating.
  const doneRows = roster.filter((r) => r.state === "done");
  const viewedRows = roster.filter((r) => r.state === "viewed");
  const notStartedRows = roster.filter((r) => r.state === "not_started");
  const doneCount = doneRows.length;

  function openReview(row: RosterRow) {
    if (expandedId === row.studentId) { setExpandedId(null); return; }
    setExpandedId(row.studentId);
    setDraftRating(row.rating ?? "good");
    setDraftComment(row.teacherComment ?? "");
  }

  async function saveReview(row: RosterRow) {
    setSaving(true);
    const { error } = await reviewStudent(homeworkId, row.studentId, draftRating, draftComment);
    setSaving(false);
    if (error) { Alert.alert("Error", error); return; }
    notifyReviewed(homeworkId, row.studentId);
    setExpandedId(null);
    load();
  }

  async function openAttachment(path: string) {
    const url = await getSignedUrl(path);
    if (url) Linking.openURL(url);
    else Alert.alert("Error", "Could not open attachment");
  }

  const ratingLabel = (r: HomeworkRating | null) =>
    r === "good" ? "Good" : r === "satisfactory" ? "Satisfactory" : r === "needs_improvement" ? "Needs Improvement" : "";

  function renderRow(row: RosterRow, reviewable: boolean) {
    const expanded = expandedId === row.studentId;
    return (
      <View key={row.studentId} style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8 }}>
        <TouchableOpacity
          activeOpacity={reviewable ? 0.7 : 1}
          onPress={reviewable ? () => openReview(row) : undefined}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{row.fullName}</Text>
          {row.reviewedAt ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.primary }}>{ratingLabel(row.rating)}</Text>
          ) : reviewable ? (
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textMuted} />
          ) : null}
        </TouchableOpacity>

        {expanded && reviewable && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {RATING_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.85}
                  onPress={() => setDraftRating(opt.value)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: draftRating === opt.value ? theme.primary : theme.surfaceRaised,
                    borderWidth: 1, borderColor: draftRating === opt.value ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: draftRating === opt.value ? "#fff" : theme.textSecondary }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{ backgroundColor: theme.surfaceRaised, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, minHeight: 60, textAlignVertical: "top" }}
              placeholder="Comment (optional)…"
              placeholderTextColor={theme.textMuted}
              multiline
              value={draftComment}
              onChangeText={setDraftComment}
            />
            <PrimaryButton label="Save Review" onPress={() => saveReview(row)} loading={saving} />
          </View>
        )}
      </View>
    );
  }

  function GroupHeader({ label, count, k }: { label: string; count: number; k: keyof typeof groupsOpen }) {
    return (
      <TouchableOpacity
        onPress={() => setGroupsOpen((p) => ({ ...p, [k]: !p[k] }))}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 }}
      >
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {label} ({count})
        </Text>
        <Ionicons name={groupsOpen[k] ? "chevron-up" : "chevron-down"} size={16} color={theme.textMuted} />
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header with back */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.navigate("/(teacher)/classes")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>
          {title || "Homework"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
        ) : (
          <>
            {/* Summary bar */}
            <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-around" }}>
              <Summary theme={theme} label="Done" value={`${doneCount}/${roster.length}`} />
              <Summary theme={theme} label="Viewed" value={`${viewedRows.length}`} />
              <Summary theme={theme} label="Not started" value={`${notStartedRows.length}`} />
            </View>

            {/* Attachments */}
            {attachments.length > 0 && (
              <View style={{ marginBottom: 16, gap: 8 }}>
                {attachments.map((a) => (
                  <TouchableOpacity key={a.id} onPress={() => openAttachment(a.fileUrl)} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 12 }}>
                    <Ionicons name="document-attach-outline" size={20} color={theme.primary} />
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }} numberOfLines={1}>{a.fileName}</Text>
                    <Ionicons name="open-outline" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Done — needs review (top, actionable) */}
            <GroupHeader label="Done — tap to review" count={doneRows.length} k="done" />
            {groupsOpen.done && doneRows.map((r) => renderRow(r, true))}

            <GroupHeader label="Viewed (not done)" count={viewedRows.length} k="viewed" />
            {groupsOpen.viewed && viewedRows.map((r) => renderRow(r, false))}

            <GroupHeader label="Not started" count={notStartedRows.length} k="not_started" />
            {groupsOpen.not_started && notStartedRows.map((r) => renderRow(r, false))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ theme, label, value }: { theme: any; label: string; value: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

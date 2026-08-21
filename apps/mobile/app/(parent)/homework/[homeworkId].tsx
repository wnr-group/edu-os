import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../../lib/theme";
import { useActiveContext } from "../../../lib/active-context";
import { PrimaryButton } from "../../../components/PrimaryButton";
import { StatusBadge } from "../../../components/StatusBadge";
import { SkeletonCard } from "../../../components/Skeleton";
import {
  loadStudentStatus, loadAttachments, getSignedUrl, markViewed, markDone, unmarkDone,
  AttachmentRow, ParentHomeworkState, HomeworkRating,
  loadSubmission, submitHomework, PickedFile, HomeworkSubmission,
} from "../../../lib/homework";
import { SCHOOL_ID } from "../../../lib/supabase";

const RATING_LABEL: Record<HomeworkRating, string> = {
  good: "Good", satisfactory: "Satisfactory", needs_improvement: "Needs Improvement",
};
const BADGE: Record<ParentHomeworkState, "hw_new" | "hw_viewed" | "hw_done" | "hw_reviewed"> = {
  new: "hw_new", viewed: "hw_viewed", done: "hw_done", reviewed: "hw_reviewed",
};

export default function ParentHomeworkDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { homeworkId, studentId: paramStudentId } = useLocalSearchParams<{ homeworkId: string; studentId?: string }>();
  const { studentId: activeStudentId } = useActiveContext();
  const studentId = paramStudentId || activeStudentId;

  const [data, setData] = useState<Awaited<ReturnType<typeof loadStudentStatus>>>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [submission, setSubmission] = useState<HomeworkSubmission | null>(null);
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!homeworkId || !studentId) return;
    setLoading(true);
    // Auto-mark viewed on open (idempotent; never downgrades 'done').
    await markViewed(homeworkId, studentId);
    const [d, a, sub] = await Promise.all([
      loadStudentStatus(homeworkId, studentId),
      loadAttachments(homeworkId),
      loadSubmission(homeworkId, studentId),
    ]);
    setData(d);
    setAttachments(a);
    setSubmission(sub);
    setLoading(false);
  }, [homeworkId, studentId]);

  useEffect(() => { load(); }, [load]);

  async function onMarkDone() {
    if (!homeworkId || !studentId) return;
    setBusy(true);
    const { error } = await markDone(homeworkId, studentId);
    setBusy(false);
    if (error) { Alert.alert("Error", error); return; }
    load();
  }

  async function pickSubmissionDocument() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
    setSelectedFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/pdf", size: a.size ?? 0 });
    setUploadState("idle");
    setUploadError(null);
  }

  async function pickSubmissionImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > 5 * 1024 * 1024) { Alert.alert("Too large", "Files must be under 5MB."); return; }
    const name = a.fileName ?? `photo-${Date.now()}.jpg`;
    setSelectedFile({ uri: a.uri, name, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0 });
    setUploadState("idle");
    setUploadError(null);
  }

  async function handleUpload() {
    if (!selectedFile || !studentId) return;
    setUploadState("uploading");
    setUploadError(null);
    const { error } = await submitHomework(SCHOOL_ID, homeworkId, studentId, selectedFile);
    if (error) {
      setUploadState("error");
      setUploadError(error);
      return;
    }
    setUploadState("success");
    setSelectedFile(null);
    const [sub, d] = await Promise.all([
      loadSubmission(homeworkId, studentId),
      loadStudentStatus(homeworkId, studentId),
    ]);
    setSubmission(sub);
    setData(d);
  }

  async function onUndo() {
    if (!homeworkId || !studentId) return;
    setBusy(true);
    const { error } = await unmarkDone(homeworkId, studentId);
    setBusy(false);
    if (error) {
      Alert.alert("Cannot undo", error === "already_reviewed" ? "This homework has already been reviewed by the teacher." : error);
      return;
    }
    load();
  }

  async function openAttachment(path: string) {
    const url = await getSignedUrl(path);
    if (url) Linking.openURL(url); else Alert.alert("Error", "Could not open attachment");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.navigate("/(parent)/academics")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>Homework</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}>
        {loading || !data ? (
          <SkeletonCard />
        ) : (
          <>
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{data.title}</Text>
                <StatusBadge variant={BADGE[data.state]} />
              </View>
              {data.subject ? (
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>{data.subject}</Text>
              ) : null}
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
                Due {new Date(data.dueDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </Text>
              {data.description ? (
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, marginTop: 4 }}>{data.description}</Text>
              ) : null}
            </View>

            {attachments.length > 0 && (
              <View style={{ gap: 8 }}>
                {attachments.map((a) => (
                  <TouchableOpacity key={a.id} onPress={() => openAttachment(a.fileUrl)} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, borderRadius: 12, padding: 12 }}>
                    <Ionicons name="document-attach-outline" size={20} color={theme.primary} />
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }} numberOfLines={1}>{a.fileName}</Text>
                    <Ionicons name="open-outline" size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Teacher feedback (once reviewed) */}
            {data.state === "reviewed" && (
              <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Teacher feedback</Text>
                {data.rating ? (
                  <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.success }}>{RATING_LABEL[data.rating]}</Text>
                ) : null}
                {data.teacherComment ? (
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}>{data.teacherComment}</Text>
                ) : null}
              </View>
            )}

            {/* Action: Mark done / Undo. Hidden if reviewed or if homework file is submitted. */}
            {data.state === "reviewed" || submission ? null : data.state === "done" ? (
              <TouchableOpacity onPress={onUndo} disabled={busy} style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>Undo "Done"</Text>
              </TouchableOpacity>
            ) : (
              <PrimaryButton label="Mark as Done" onPress={onMarkDone} loading={busy} />
            )}

            {studentId && (
              <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10, marginTop: 12 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
                  Submission
                </Text>

                {submission && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                    Submitted: {submission.fileName}
                  </Text>
                )}

                {new Date().toISOString().slice(0, 10) > data.dueDate ? (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>
                    The due date has passed. This homework can no longer be submitted.
                  </Text>
                ) : (
                  <>
                    {selectedFile && (
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                        Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                      </Text>
                    )}

                    {uploadState === "error" && uploadError && (
                      <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>{uploadError}</Text>
                      </View>
                    )}

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={pickSubmissionDocument}
                        disabled={uploadState === "uploading"}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
                      >
                        <Ionicons name="document-outline" size={16} color={theme.primary} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Choose PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={pickSubmissionImage}
                        disabled={uploadState === "uploading"}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border }}
                      >
                        <Ionicons name="image-outline" size={16} color={theme.primary} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Choose Photo</Text>
                      </TouchableOpacity>
                    </View>

                    {selectedFile && (
                      <TouchableOpacity
                        onPress={handleUpload}
                        disabled={uploadState === "uploading"}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.primary, opacity: uploadState === "uploading" ? 0.6 : 1 }}
                      >
                        {uploadState === "uploading" ? (
                          <>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Uploading…</Text>
                          </>
                        ) : (
                          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                            {uploadState === "error" ? "Retry Upload" : "Upload"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

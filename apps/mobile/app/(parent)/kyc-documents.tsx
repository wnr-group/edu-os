// apps/mobile/app/(parent)/kyc-documents.tsx
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { SCHOOL_ID } from "../../lib/supabase";
import { SkeletonCard } from "../../components/Skeleton";
import { loadKycChecklist, uploadKycDocument, getKycSignedUrl, type KycChecklistItem, type KycState, type PickedFile } from "../../lib/kyc";

const STATE_LABEL: Record<KycState, string> = {
  missing: "Missing",
  submitted: "Awaiting review",
  verified: "Verified",
  expiring: "Expiring soon",
  expired: "Expired",
};

function stateColor(theme: ReturnType<typeof useTheme>, state: KycState): string {
  if (state === "verified") return theme.success;
  if (state === "submitted") return theme.info;
  if (state === "expiring") return theme.warning;
  if (state === "expired") return theme.danger;
  return theme.textMuted;
}

export default function KycDocumentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const student = students.find((s) => s.id === studentId);

  const [items, setItems] = useState<KycChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Map<string, PickedFile>>(new Map());
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (id: string) => {
    const { items: loaded, error: loadError } = await loadKycChecklist(id);
    setItems(loaded);
    setError(loadError);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!studentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      load(studentId).finally(() => setLoading(false));
    }, [studentId, load]),
  );

  async function onRefresh() {
    if (!studentId) return;
    setRefreshing(true);
    await load(studentId);
    setRefreshing(false);
  }

  function pickFile(documentTypeId: string) {
    Alert.alert("Select file type", undefined, [
      {
        text: "PDF Document",
        onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true });
          if (res.canceled || !res.assets?.[0]) return;
          const a = res.assets[0];
          if ((a.size ?? 0) > 5 * 1024 * 1024) { Alert.alert("File too large", "Files must be under 5MB."); return; }
          const mime = a.mimeType ?? "application/pdf";
          if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
            Alert.alert("Invalid file type", "Only PDF, JPG, or PNG files are allowed."); return;
          }
          setPendingFiles((prev) => { const next = new Map(prev); next.set(documentTypeId, { uri: a.uri, name: a.name, mimeType: mime, size: a.size ?? 0 }); return next; });
        },
      },
      {
        text: "Photo (JPG/PNG)",
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
          if (res.canceled || !res.assets?.[0]) return;
          const a = res.assets[0];
          if ((a.fileSize ?? 0) > 5 * 1024 * 1024) { Alert.alert("File too large", "Files must be under 5MB."); return; }
          const mime = a.mimeType ?? "image/jpeg";
          if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
            Alert.alert("Invalid file type", "Only PDF, JPG, or PNG files are allowed."); return;
          }
          const name = a.fileName ?? `photo-${Date.now()}.jpg`;
          setPendingFiles((prev) => { const next = new Map(prev); next.set(documentTypeId, { uri: a.uri, name, mimeType: mime, size: a.fileSize ?? 0 }); return next; });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function viewDocument(documentId: string) {
    const { url, error } = await getKycSignedUrl(documentId);
    if (error || !url) { Alert.alert("Could not open document", error ?? "Unknown error"); return; }
    await Linking.openURL(url);
  }

  async function uploadAll() {
    if (!studentId || uploading || pendingFiles.size === 0) return;
    const missingRequired = items.filter(
      (item) => item.isRequired && item.state === "missing" && !pendingFiles.has(item.documentTypeId),
    );
    if (missingRequired.length > 0) {
      Alert.alert("Missing documents", `Please select: ${missingRequired.map((i) => i.documentTypeName).join(", ")}`);
      return;
    }
    setUploading(true);
    try {
      type R = { documentTypeId: string; name: string; success: boolean };
      const results: R[] = [];
      for (const [documentTypeId, file] of pendingFiles.entries()) {
        const name = items.find((i) => i.documentTypeId === documentTypeId)?.documentTypeName ?? documentTypeId;
        const { error } = await uploadKycDocument(SCHOOL_ID, studentId, documentTypeId, file);
        results.push({ documentTypeId, name, success: !error });
      }
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);
      setPendingFiles((prev) => { const next = new Map(prev); succeeded.forEach((r) => next.delete(r.documentTypeId)); return next; });
      await load(studentId);
      if (failed.length === 0) {
        Alert.alert("Success", "All documents uploaded successfully.");
      } else if (succeeded.length > 0) {
        Alert.alert("Partial failure", `${succeeded.length} uploaded, ${failed.length} failed:\n${failed.map((r) => r.name).join(", ")}`);
      } else {
        Alert.alert("Upload failed", `No documents were uploaded:\n${failed.map((r) => r.name).join(", ")}`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>KYC Documents</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
            For {student?.fullName ?? "your child"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!studentId ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="person-outline" size={32} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              No child selected.
            </Text>
          </View>
        ) : loading ? (
          [0, 1, 2].map((i) => <SkeletonCard key={i} />)
        ) : error ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="alert-circle-outline" size={32} color={theme.danger} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              Could not load KYC status. Pull down to retry.
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="document-text-outline" size={32} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              No KYC documents are configured for your school yet.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const pending = pendingFiles.get(item.documentTypeId);
            return (
              <View key={item.documentTypeId} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, flexShrink: 1 }}>
                      {item.documentTypeName}
                    </Text>
                    <View style={{ backgroundColor: item.isRequired ? theme.danger + "1A" : theme.textMuted + "1A", borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: item.isRequired ? theme.danger : theme.textMuted, textTransform: "uppercase" }}>
                        {item.isRequired ? "Required" : "Optional"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: stateColor(theme, item.state) + "1A", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: stateColor(theme, item.state) }}>
                      {STATE_LABEL[item.state]}
                    </Text>
                  </View>
                </View>

                {item.state === "expiring" && item.expiresOn && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.warning }}>Expires {item.expiresOn}</Text>
                )}
                {item.state === "expired" && item.expiresOn && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.danger }}>Expired {item.expiresOn}</Text>
                )}
                {item.state === "verified" && item.verifiedByName && (
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Verified by {item.verifiedByName}</Text>
                )}
                {item.isRejected && item.rejectionReason && (
                  <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>Rejected: "{item.rejectionReason}"</Text>
                  </View>
                )}

                {pending ? (
                  <View style={{ marginTop: 4, gap: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{pending.name}</Text>
                    <TouchableOpacity
                      disabled={uploading}
                      onPress={() => pickFile(item.documentTypeId)}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, opacity: uploading ? 0.5 : 1 }}
                    >
                      <Ionicons name="swap-horizontal-outline" size={16} color={theme.primary} />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : item.fileName ? (
                  <View style={{ marginTop: 4, gap: 6 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{item.fileName}</Text>
                    <TouchableOpacity
                      disabled={uploading}
                      onPress={() => pickFile(item.documentTypeId)}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, opacity: uploading ? 0.5 : 1 }}
                    >
                      <Ionicons name="refresh-outline" size={16} color={theme.primary} />
                      <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Replace</Text>
                    </TouchableOpacity>
                    {item.documentId && item.state !== "missing" && (
                      <TouchableOpacity
                        onPress={() => viewDocument(item.documentId!)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Ionicons name="eye-outline" size={14} color={theme.info} />
                        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.info }}>View document</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    disabled={uploading}
                    onPress={() => pickFile(item.documentTypeId)}
                    style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, opacity: uploading ? 0.5 : 1 }}
                  >
                    <Ionicons name="cloud-upload-outline" size={16} color={theme.primary} />
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Select Image/PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {pendingFiles.size > 0 && (
          <TouchableOpacity
            disabled={uploading}
            onPress={uploadAll}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, backgroundColor: theme.primary, opacity: uploading ? 0.7 : 1 }}
          >
            {uploading && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
              {uploading ? "Uploading…" : `Upload All (${pendingFiles.size})`}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: "row", gap: 10, backgroundColor: theme.info + "12", borderRadius: 12, padding: 14, marginTop: 4 }}>
          <Ionicons name="information-circle-outline" size={18} color={theme.info} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>
            Upload a PDF or photo (max 5MB) for each document. Uploaded documents are reviewed by the school office.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

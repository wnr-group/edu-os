import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { useTeacherContext } from "../../lib/teacherContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SkeletonCard } from "../../components/Skeleton";

type InterventionKind = "attendance" | "academic";
type InterventionStatus = "pending" | "in_progress" | "completed" | "dismissed";
type SeverityBand = "HIGH" | "MED";

interface AcademicEvidence {
  snapshot_id: string;
  is_pinned: boolean;
  subject_name?: string;
  score?: number;
  band?: string;
}

interface InterventionItem {
  id: string;
  student_id: string;
  student_name: string;
  kind: InterventionKind;
  type: string;
  title: string;
  status: InterventionStatus;
  severity_band: SeverityBand;
  due_date: string;
  assigned_via: string;
  assignee_id: string;
  outcome_note?: string;
  dismissal_reason?: string;
  started_at?: string;
  completed_at?: string;
  dismissed_at?: string;
  created_at: string;
  source_snapshot?: {
    factors: Array<{ key?: string; label?: string; detail?: string; value?: unknown; contribution?: number }>;
    recommended_action: string;
    subject_name?: string;
  };
  evidence?: AcademicEvidence[];
  last_parent_notification?: string;
}

export default function TeacherInterventionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { ready } = useTeacherContext();

  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"open" | "completed" | "dismissed" | "all">("open");
  const [kindFilter, setKindFilter] = useState<"all" | "attendance" | "academic">("all");

  // Selected Detail Modal
  const [selectedIntervention, setSelectedIntervention] = useState<InterventionItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Action Modals
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState("");

  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!ready) return;

    loadInterventions(isMounted);

    return () => {
      isMounted = false;
    };
  }, [ready, statusFilter, kindFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInterventions(true);
    setRefreshing(false);
  }, [statusFilter, kindFilter]);

  async function loadInterventions(isMounted = true) {
    try {
      if (isMounted) setLoading(true);

      let query = supabase
        .from("interventions")
        .select(`
          id,
          student_id,
          kind,
          type,
          title,
          status,
          severity_band,
          due_date,
          assigned_via,
          assignee_id,
          outcome_note,
          dismissal_reason,
          started_at,
          completed_at,
          dismissed_at,
          created_at,
          student_profiles (
            id,
            full_name
          ),
          student_risk_snapshots!interventions_source_snapshot_id_fkey (
            factors,
            recommended_action,
            subjects (
              name
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (statusFilter === "open") {
        query = query.in("status", ["pending", "in_progress"]);
      } else if (statusFilter === "completed") {
        query = query.eq("status", "completed");
      } else if (statusFilter === "dismissed") {
        query = query.eq("status", "dismissed");
      }

      if (kindFilter !== "all") {
        query = query.eq("kind", kindFilter);
      }

      const { data, error } = await query;

      if (!isMounted) return;

      if (error) {
        console.error("Error loading interventions:", error);
        Alert.alert("Error", "Could not load interventions.");
        return;
      }

      const items: InterventionItem[] = (data || []).map((row: any) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: row.student_profiles?.full_name ?? "Student",
        kind: row.kind,
        type: row.type,
        title: row.title,
        status: row.status,
        severity_band: row.severity_band,
        due_date: row.due_date,
        assigned_via: row.assigned_via,
        assignee_id: row.assignee_id,
        outcome_note: row.outcome_note,
        dismissal_reason: row.dismissal_reason,
        started_at: row.started_at,
        completed_at: row.completed_at,
        dismissed_at: row.dismissed_at,
        created_at: row.created_at,
        source_snapshot: {
          factors: Array.isArray(row.student_risk_snapshots?.factors)
            ? row.student_risk_snapshots.factors
            : [],
          recommended_action: row.student_risk_snapshots?.recommended_action ?? row.title,
          subject_name: row.student_risk_snapshots?.subjects?.name,
        },
      }));

      setInterventions(items);
    } catch (err) {
      console.error("Unexpected error in loadInterventions:", err);
    } finally {
      if (isMounted) setLoading(false);
    }
  }

  async function openDetail(item: InterventionItem) {
    setSelectedIntervention(item);

    // Fetch sibling academic evidence if academic
    if (item.kind === "academic") {
      const { data: evidenceData } = await supabase
        .from("intervention_academic_evidence")
        .select(`
          snapshot_id,
          is_pinned,
          student_risk_snapshots (
            score,
            band,
            subjects (
              name
            )
          )
        `)
        .eq("intervention_id", item.id);

      const evidence: AcademicEvidence[] = (evidenceData || []).map((e: any) => ({
        snapshot_id: e.snapshot_id,
        is_pinned: e.is_pinned,
        subject_name: e.student_risk_snapshots?.subjects?.name,
        score: e.student_risk_snapshots?.score,
        band: e.student_risk_snapshots?.band,
      }));

      setSelectedIntervention((prev) => (prev ? { ...prev, evidence } : null));
    }

    // Fetch parent notification history
    const { data: notifData } = await supabase
      .from("intervention_parent_notifications")
      .select("sent_at")
      .eq("intervention_id", item.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (notifData?.sent_at) {
      setSelectedIntervention((prev) =>
        prev ? { ...prev, last_parent_notification: notifData.sent_at } : null
      );
    }
  }

  function openNotifyModal() {
    setPendingRequestId(
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      })
    );
    setShowNotifyModal(true);
  }

  async function handleStartIntervention() {
    if (!selectedIntervention) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("start_intervention", {
        p_intervention_id: selectedIntervention.id,
      });

      if (error) throw error;

      Alert.alert("Success", "Intervention is now in progress.");
      setSelectedIntervention((prev) => (prev ? { ...prev, status: "in_progress" } : null));
      await loadInterventions(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to start intervention.";
      Alert.alert("Error", errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCompleteIntervention() {
    if (!selectedIntervention) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("complete_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_outcome_note: outcomeNote.trim() || null,
      });

      if (error) throw error;

      Alert.alert("Success", "Intervention marked as completed.");
      setShowCompleteModal(false);
      setOutcomeNote("");
      setSelectedIntervention((prev) =>
        prev ? { ...prev, status: "completed", outcome_note: outcomeNote } : null
      );
      await loadInterventions(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to complete intervention.";
      Alert.alert("Error", errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDismissIntervention() {
    if (!selectedIntervention) return;
    if (!dismissReason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason for dismissing this intervention.");
      return;
    }
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("dismiss_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_dismissal_reason: dismissReason.trim(),
      });

      if (error) throw error;

      Alert.alert("Success", "Intervention dismissed.");
      setShowDismissModal(false);
      setDismissReason("");
      setSelectedIntervention((prev) =>
        prev ? { ...prev, status: "dismissed", dismissal_reason: dismissReason } : null
      );
      await loadInterventions(true);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to dismiss intervention.";
      Alert.alert("Error", errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleNotifyParent() {
    if (!selectedIntervention || !pendingRequestId) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("notify_parent_for_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_client_request_id: pendingRequestId,
      });

      if (error) throw error;

      Alert.alert("Notification Sent", "Parent has been notified with the safe template notice.");
      setShowNotifyModal(false);
      setSelectedIntervention((prev) =>
        prev ? { ...prev, last_parent_notification: new Date().toISOString() } : null
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to send notification to parent.";
      Alert.alert("Error", errorMsg);
    } finally {
      setActionLoading(false);
    }
  }

  const getDueBadge = (dueDateStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    if (dueDateStr < today) {
      return { label: "Overdue", bg: theme.danger + "1A", text: theme.danger };
    }
    if (dueDateStr === today) {
      return { label: "Due Today", bg: theme.warning + "1A", text: theme.warning };
    }
    return { label: `Due: ${dueDateStr}`, bg: theme.surface, text: theme.textMuted };
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["top"]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                Student Interventions
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                Targeted action items for student support
              </Text>
            </View>
          </View>
        </View>

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { id: "open", label: "Open" },
              { id: "completed", label: "Completed" },
              { id: "dismissed", label: "Dismissed" },
              { id: "all", label: "All" },
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setStatusFilter(tab.id as "open" | "completed" | "dismissed" | "all")}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                      color: active ? "#FFF" : theme.textPrimary,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Kind Filters */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {[
            { id: "all", label: "All Types" },
            { id: "attendance", label: "Attendance" },
            { id: "academic", label: "Academic" },
          ].map((tab) => {
            const active = kindFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setKindFilter(tab.id as "all" | "attendance" | "academic")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: active ? theme.primary + "1A" : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    color: active ? theme.primary : theme.textSecondary,
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : interventions.length === 0 ? (
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
            <Ionicons name="checkmark-circle-outline" size={56} color={theme.success} />
            <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 12 }}>
              No interventions found
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4, textAlign: "center" }}>
              {statusFilter === "open" ? "All student risk items have been resolved or dismissed." : "No matching interventions found."}
            </Text>
          </View>
        ) : (
          interventions.map((item) => {
            const dueBadge = getDueBadge(item.due_date);
            const isHigh = item.severity_band === "HIGH";

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => openDetail(item)}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isHigh && item.status !== "completed" ? theme.danger + "40" : theme.border,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                {/* Header row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
                      {item.student_name}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      {item.kind === "attendance" ? "Attendance Pattern" : `Academic • ${item.source_snapshot?.subject_name ?? "General"}`}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {/* Severity chip */}
                    <View
                      style={{
                        backgroundColor: isHigh ? theme.danger + "1A" : theme.warning + "1A",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontFamily: "Inter_700Bold",
                          color: isHigh ? theme.danger : theme.warning,
                        }}
                      >
                        {item.severity_band}
                      </Text>
                    </View>

                    {/* Status chip */}
                    <View
                      style={{
                        backgroundColor:
                          item.status === "completed"
                            ? theme.success + "1A"
                            : item.status === "dismissed"
                            ? theme.textMuted + "1A"
                            : item.status === "in_progress"
                            ? theme.primary + "1A"
                            : theme.surface,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontFamily: "Inter_600SemiBold",
                          color:
                            item.status === "completed"
                              ? theme.success
                              : item.status === "dismissed"
                              ? theme.textSecondary
                              : item.status === "in_progress"
                              ? theme.primary
                              : theme.textSecondary,
                          textTransform: "capitalize",
                        }}
                      >
                        {item.status.replace("_", " ")}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Title / Action */}
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_500Medium",
                    color: theme.textPrimary,
                    marginTop: 10,
                  }}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>

                {/* Footer */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + "60" }}>
                  <View style={{ backgroundColor: dueBadge.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: dueBadge.text }}>
                      {dueBadge.label}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.primary, marginRight: 4 }}>
                      View Details
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Detail Modal */}
      {selectedIntervention && (
        <Modal
          visible={!!selectedIntervention}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedIntervention(null)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View
              style={{
                backgroundColor: theme.background,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "90%",
                paddingTop: 16,
              }}
            >
              {/* Modal header */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                    {selectedIntervention.student_name}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                    {selectedIntervention.kind === "attendance" ? "Attendance Support" : "Academic Support"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedIntervention(null)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
                {/* Action Recommended */}
                <View style={{ backgroundColor: theme.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textSecondary, textTransform: "uppercase" }}>
                    Recommended Action
                  </Text>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 4 }}>
                    {selectedIntervention.title}
                  </Text>
                </View>

                {/* Evidence / Reason Section */}
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: theme.textPrimary, marginBottom: 8 }}>
                  Why Attention is Needed
                </Text>

                <View style={{ backgroundColor: theme.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}>
                  {selectedIntervention.source_snapshot?.factors && selectedIntervention.source_snapshot.factors.length > 0 ? (
                    selectedIntervention.source_snapshot.factors.map((f, idx) => (
                      <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: idx === (selectedIntervention.source_snapshot?.factors.length ?? 0) - 1 ? 0 : 8 }}>
                        <Ionicons name="alert-circle-outline" size={16} color={theme.primary} style={{ marginRight: 8, marginTop: 2 }} />
                        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary, flex: 1 }}>
                          {f.label ?? f.detail ?? (typeof f === "object" ? JSON.stringify(f) : String(f))}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                      Qualifying pattern detected in recent {selectedIntervention.kind} assessments.
                    </Text>
                  )}

                  {/* Sibling evidence for academic */}
                  {selectedIntervention.evidence && selectedIntervention.evidence.length > 1 && (
                    <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textSecondary, marginBottom: 6 }}>
                        Other Qualifying Subjects:
                      </Text>
                      {selectedIntervention.evidence
                        .filter((e) => !e.is_pinned)
                        .map((e, i) => (
                          <Text key={i} style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textPrimary, marginLeft: 8, marginBottom: 2 }}>
                            • {e.subject_name ?? "Subject"} (Severity: {e.band ?? "HIGH"})
                          </Text>
                        ))}
                    </View>
                  )}
                </View>

                {/* Status & Timing */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
                  <View style={{ flex: 1, marginRight: 8, backgroundColor: theme.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>Status</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 2, textTransform: "capitalize" }}>
                      {selectedIntervention.status.replace("_", " ")}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8, backgroundColor: theme.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: theme.textSecondary }}>Due Date</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 2 }}>
                      {selectedIntervention.due_date}
                    </Text>
                  </View>
                </View>

                {/* Parent Notification History */}
                {selectedIntervention.last_parent_notification && (
                  <View style={{ backgroundColor: theme.success + "10", borderColor: theme.success + "30", borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.success} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.success }}>
                        Parent Notified
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      Sent on {new Date(selectedIntervention.last_parent_notification).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                )}

                {/* Dismissal / Outcome details if closed */}
                {selectedIntervention.dismissal_reason && (
                  <View style={{ backgroundColor: theme.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.danger }}>Dismissal Reason</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary, marginTop: 2 }}>
                      {selectedIntervention.dismissal_reason}
                    </Text>
                  </View>
                )}

                {selectedIntervention.outcome_note && (
                  <View style={{ backgroundColor: theme.surface, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.border, marginBottom: 16 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.success }}>Outcome Note</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary, marginTop: 2 }}>
                      {selectedIntervention.outcome_note}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                {selectedIntervention.status === "pending" && (
                  <View style={{ gap: 10, marginBottom: 24 }}>
                    <PrimaryButton
                      label={actionLoading ? "Starting..." : "Start Intervention"}
                      onPress={handleStartIntervention}
                      disabled={actionLoading}
                    />
                    <TouchableOpacity
                      onPress={openNotifyModal}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.primary,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.primary }}>
                        Notify Parent
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowDismissModal(true)}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.danger }}>
                        Dismiss Intervention
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedIntervention.status === "in_progress" && (
                  <View style={{ gap: 10, marginBottom: 24 }}>
                    <PrimaryButton
                      label="Complete Intervention"
                      onPress={() => setShowCompleteModal(true)}
                      disabled={actionLoading}
                    />
                    <TouchableOpacity
                      onPress={openNotifyModal}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.primary,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.primary }}>
                        Notify Parent
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowDismissModal(true)}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: theme.surface,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.danger }}>
                        Dismiss Intervention
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Dismiss Reason Modal */}
      <Modal visible={showDismissModal} animationType="fade" transparent onRequestClose={() => setShowDismissModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.background, borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
              Dismiss Intervention
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4 }}>
              Please state the reason for dismissing this intervention. This is mandatory for the audit log.
            </Text>

            <TextInput
              placeholder="e.g. Student was ill with doctor note / Transferred / Addressed informally"
              placeholderTextColor={theme.textMuted}
              value={dismissReason}
              onChangeText={setDismissReason}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 12,
                color: theme.textPrimary,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                marginTop: 16,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowDismissModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDismissIntervention}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", backgroundColor: theme.danger }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFF" }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Outcome Modal */}
      <Modal visible={showCompleteModal} animationType="fade" transparent onRequestClose={() => setShowCompleteModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.background, borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
              Complete Intervention
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4 }}>
              Record any notes on the outcome or meeting with parent/student (optional).
            </Text>

            <TextInput
              placeholder="e.g. Discussed with parent, attendance improved, remedial homework assigned."
              placeholderTextColor={theme.textMuted}
              value={outcomeNote}
              onChangeText={setOutcomeNote}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 12,
                color: theme.textPrimary,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                marginTop: 16,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowCompleteModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCompleteIntervention}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", backgroundColor: theme.success }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFF" }}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notify Parent Confirmation Modal */}
      <Modal visible={showNotifyModal} animationType="fade" transparent onRequestClose={() => setShowNotifyModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.background, borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
              Notify Parent
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 4 }}>
              This will send an official notification to the parent.
            </Text>

            {/* Parent Safe Preview */}
            <View style={{ backgroundColor: theme.surface, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: theme.border, marginTop: 14 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textSecondary, textTransform: "uppercase" }}>
                Message Preview
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, marginTop: 4 }}>
                {selectedIntervention?.kind === "attendance" ? "Attendance Notice" : "Academic Notice"}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textPrimary, marginTop: 2 }}>
                {selectedIntervention?.kind === "attendance"
                  ? `Your child ${selectedIntervention?.student_name} has attendance patterns requiring attention. Please contact the school.`
                  : `Your child ${selectedIntervention?.student_name} has academic progress areas requiring attention. Please contact the school.`}
              </Text>
            </View>

            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 10 }}>
              🔒 Internal risk scores, bands, factors, and staff notes are strictly protected and never exposed.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setShowNotifyModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNotifyParent}
                disabled={actionLoading}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", backgroundColor: theme.primary }}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFF" }}>Send Notice</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

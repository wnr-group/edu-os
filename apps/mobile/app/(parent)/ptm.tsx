import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import {
  loadMyMeetings, loadMeetingFeedback, loadAvailableSlots, bookSlot,
  type PtmMeetingItem, type PtmFeedbackData, type PtmMeetingStatus, type PtmAvailableSlot,
} from "../../lib/ptm";
import { SkeletonCard } from "../../components/Skeleton";

const STATUS_STYLE: Record<PtmMeetingStatus, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "#FEF3C7", fg: "#B45309", label: "SCHEDULED" },
  completed: { bg: "#D1FAE5", fg: "#047857", label: "COMPLETED" },
  cancelled: { bg: "#F3F4F6", fg: "#6B7280", label: "CANCELLED" },
  no_show: { bg: "#FEE2E2", fg: "#B91C1C", label: "NO-SHOW" },
};

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

function Stars({ value, color }: { value: number | null; color: string }) {
  if (value === null) return null;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= value ? "star" : "star-outline"} size={12} color={n <= value ? "#F59E0B" : color} />
      ))}
    </View>
  );
}

export default function ParentPtmScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const student = students.find((s) => s.id === studentId);

  const [meetings, setMeetings] = useState<PtmMeetingItem[]>([]);
  const [availableSlots, setAvailableSlots] = useState<PtmAvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  // Collapsed by default — with 24-60 published slots, showing every card
  // up front would make this the tallest thing on the page before the
  // parent has even asked to see it.
  const [slotsExpanded, setSlotsExpanded] = useState(false);
  // Which date sub-groups are expanded, once the outer section is open.
  // null = not yet seeded (availableSlots hasn't loaded). Seeded exactly
  // once, to the earliest upcoming date, by the effect below — after that
  // it's fully user-controlled and untouched by pull-to-refresh reloads.
  const [expandedDates, setExpandedDates] = useState<Set<string> | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<string, PtmFeedbackData | null>>({});
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studentId) { setMeetings([]); setAvailableSlots([]); setLoading(false); return; }
    try {
      const [myMeetings, slots] = await Promise.all([loadMyMeetings(studentId), loadAvailableSlots(studentId)]);
      setMeetings(myMeetings);
      setAvailableSlots(slots);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // availableSlots already arrives sorted by scheduled_date then start_time
  // (loadAvailableSlots' own query order), so grouping in place preserves
  // both the chronological date order and the chronological order of slots
  // within each date — no re-sorting needed here.
  const groupedByDate = useMemo(() => {
    const groups: { date: string; slots: PtmAvailableSlot[] }[] = [];
    for (const slot of availableSlots) {
      const last = groups[groups.length - 1];
      if (last && last.date === slot.scheduledDate) last.slots.push(slot);
      else groups.push({ date: slot.scheduledDate, slots: [slot] });
    }
    return groups;
  }, [availableSlots]);

  // Seed once: the earliest upcoming date starts expanded, every other date
  // starts collapsed. Guarded on `=== null` so a later pull-to-refresh (or
  // the slot list changing after a booking) never re-collapses a date the
  // parent has already opened.
  useEffect(() => {
    if (expandedDates === null && groupedByDate.length > 0) {
      setExpandedDates(new Set([groupedByDate[0].date]));
    }
  }, [expandedDates, groupedByDate]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function confirmBookSlot(slot: PtmAvailableSlot) {
    Alert.alert(
      "Book this slot?",
      `${formatDate(slot.scheduledDate)} at ${formatTime(slot.startTime)} with ${slot.teacherName}${slot.subjectName ? ` (${slot.subjectName})` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Book", onPress: () => handleBookSlot(slot.id) },
      ]
    );
  }

  async function handleBookSlot(slotId: string) {
    setBookingSlotId(slotId);
    const { error } = await bookSlot(slotId, studentId!);
    setBookingSlotId(null);
    if (error) {
      // slot_unavailable — someone else booked it a moment ago. Any other
      // rejection (duplicate_booking_for_date, slot_expired, ...) is also
      // handled generically here rather than special-cased per message,
      // since the RPC's error strings are the single source of truth.
      Alert.alert(
        "Slot unavailable",
        error === "slot_unavailable" ? "This slot is no longer available. Please choose another available time." : error
      );
      load();
      return;
    }
    Alert.alert("Booked", "The meeting has been added to your Upcoming list.");
    load();
  }

  async function toggleExpand(meeting: PtmMeetingItem) {
    if (expandedId === meeting.id) { setExpandedId(null); return; }
    setExpandedId(meeting.id);
    if (meeting.status !== "completed" && meeting.status !== "no_show") return;
    if (feedbackById[meeting.id] !== undefined) return;
    setFeedbackLoading(meeting.id);
    try {
      const fb = await loadMeetingFeedback(meeting.id);
      setFeedbackById((prev) => ({ ...prev, [meeting.id]: fb }));
    } finally {
      setFeedbackLoading(null);
    }
  }

  const upcoming = meetings.filter((m) => m.status === "scheduled");
  const past = meetings.filter((m) => m.status !== "scheduled");

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Parent-Teacher Meetings</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
            {student?.fullName ?? ""} {student?.className ? `· ${student.className}` : ""}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? (
          <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
        ) : (
          <>
            {availableSlots.length > 0 && (() => {
              const openCount = availableSlots.filter((s) => s.status === "open").length;
              const bookedCount = availableSlots.length - openCount;
              return (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setSlotsExpanded((v) => !v)}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.surface, borderRadius: 16, padding: 16 }}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                      PTM Available Slots ({availableSlots.length})
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      {openCount} open · {bookedCount} booked
                    </Text>
                  </View>
                  <Ionicons name={slotsExpanded ? "chevron-up" : "chevron-down"} size={20} color={theme.textMuted} />
                </TouchableOpacity>

                {slotsExpanded && groupedByDate.map((group) => {
                  const dateExpanded = expandedDates?.has(group.date) ?? false;
                  return (
                    <View key={group.date} style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => toggleDate(group.date)}
                        activeOpacity={0.7}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.surfaceRaised, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}
                      >
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
                          {formatDate(group.date)} ({group.slots.length} slot{group.slots.length === 1 ? "" : "s"})
                        </Text>
                        <Ionicons name={dateExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.textMuted} />
                      </TouchableOpacity>

                      {dateExpanded && (
                        <View style={{ gap: 10 }}>
                          {group.slots.map((slot) => {
                            const isOpen = slot.status === "open";
                            return (
                              <View
                                key={slot.id}
                                style={{
                                  backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 10,
                                  borderWidth: 1, borderColor: isOpen ? theme.primary + "33" : theme.border,
                                  opacity: isOpen ? 1 : 0.7,
                                }}
                              >
                                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
                                      {formatTime(slot.startTime)}
                                    </Text>
                                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                                      {slot.subjectName ? `${slot.subjectName} · ` : ""}with {slot.teacherName} · {slot.durationMinutes} min
                                    </Text>
                                  </View>
                                  <View style={{ backgroundColor: isOpen ? theme.primary + "18" : theme.textMuted + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: isOpen ? theme.primary : theme.textMuted }}>
                                      {isOpen ? "OPEN" : "BOOKED"}
                                    </Text>
                                  </View>
                                </View>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <Ionicons name={slot.meetingMode === "online" ? "videocam-outline" : "location-outline"} size={13} color={theme.textMuted} />
                                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                                    {slot.location || (slot.meetingMode === "online" ? "Online — link to be shared" : "Location not specified")}
                                  </Text>
                                </View>
                                {isOpen ? (
                                  <TouchableOpacity
                                    onPress={() => confirmBookSlot(slot)}
                                    disabled={bookingSlotId === slot.id}
                                    style={{ alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.primary, opacity: bookingSlotId === slot.id ? 0.6 : 1 }}
                                  >
                                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                                      {bookingSlotId === slot.id ? "Booking…" : "Book this slot"}
                                    </Text>
                                  </TouchableOpacity>
                                ) : (
                                  // Never names who booked it — this row only
                                  // ever carries a status, no other family's
                                  // identity is exposed here or anywhere in
                                  // this query.
                                  <View style={{ alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>Already booked</Text>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              );
            })()}

            {meetings.length === 0 && availableSlots.length === 0 && (
              <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No meetings yet.</Text>
            )}

            {upcoming.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>Upcoming</Text>
                {upcoming.map((m) => (
                  <MeetingCard key={m.id} meeting={m} theme={theme} />
                ))}
              </View>
            )}

            {past.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>History</Text>
                {past.map((m) => {
                  const expanded = expandedId === m.id;
                  const canHaveFeedback = m.status === "completed" || m.status === "no_show";
                  const feedback = feedbackById[m.id];
                  return (
                    <TouchableOpacity key={m.id} activeOpacity={canHaveFeedback ? 0.7 : 1} onPress={() => canHaveFeedback && toggleExpand(m)}>
                      <MeetingCard meeting={m} theme={theme} />
                      {expanded && canHaveFeedback && (
                        <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginTop: -8, paddingTop: 16, gap: 8 }}>
                          {feedbackLoading === m.id ? (
                            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Loading feedback…</Text>
                          ) : !feedback ? (
                            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textMuted }}>
                              Feedback has not been provided by the teacher yet.
                            </Text>
                          ) : (
                            <>
                              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase" }}>Teacher feedback</Text>
                              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textPrimary, lineHeight: 19 }}>{feedback.summary}</Text>
                              {(feedback.academicRating !== null || feedback.behaviorRating !== null) && (
                                <View style={{ flexDirection: "row", gap: 20, marginTop: 4 }}>
                                  {feedback.academicRating !== null && (
                                    <View style={{ gap: 3 }}>
                                      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>ACADEMIC</Text>
                                      <Stars value={feedback.academicRating} color={theme.textMuted} />
                                    </View>
                                  )}
                                  {feedback.behaviorRating !== null && (
                                    <View style={{ gap: 3 }}>
                                      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: theme.textMuted }}>BEHAVIOUR</Text>
                                      <Stars value={feedback.behaviorRating} color={theme.textMuted} />
                                    </View>
                                  )}
                                </View>
                              )}
                              {feedback.followUpRequired && (
                                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.warning, marginTop: 2 }}>
                                  ⚑ Teacher suggested a follow-up meeting
                                </Text>
                              )}
                            </>
                          )}
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

function MeetingCard({ meeting, theme }: { meeting: PtmMeetingItem; theme: ReturnType<typeof useTheme> }) {
  const style = STATUS_STYLE[meeting.status];
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>
            {formatDate(meeting.scheduledDate)} · {formatTime(meeting.startTime)}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
            {meeting.className}{meeting.subjectName ? ` · ${meeting.subjectName}` : ""} · with {meeting.teacherName}
          </Text>
        </View>
        <View style={{ backgroundColor: style.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: style.fg }}>{style.label}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={meeting.meetingMode === "online" ? "videocam-outline" : "location-outline"} size={13} color={theme.textMuted} />
        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
          {meeting.location || (meeting.meetingMode === "online" ? "Online — link to be shared" : "Location not specified")}
        </Text>
      </View>
      {meeting.status === "cancelled" && meeting.cancelledReason && (
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>Cancelled: {meeting.cancelledReason}</Text>
      )}
    </View>
  );
}

import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { PrimaryButton } from "../../components/PrimaryButton";
import { requestLeave, notifyLeaveRequested, type LeaveType } from "../../lib/leave";

const TYPE_OPTIONS: { value: LeaveType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "sick", label: "Sick", icon: "heart" },
  { value: "casual", label: "Casual", icon: "sunny" },
  { value: "other", label: "Other", icon: "ellipsis-horizontal" },
];

export default function ApplyLeaveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const student = students.find((s) => s.id === studentId);

  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);
  const [type, setType] = useState<LeaveType>("sick");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function formatLabel(d: string | null): string {
    if (!d) return "Select date";
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }
  function daysBetween(): number {
    if (!fromDate || !toDate) return 0;
    return Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1;
  }
  function onPickDate(dateString: string) {
    if (pickerFor === "from") {
      setFromDate(dateString);
      if (toDate && toDate < dateString) setToDate(dateString);
    } else if (pickerFor === "to") {
      setToDate(dateString);
    }
    setPickerFor(null);
  }

  async function handleSubmit() {
    if (!studentId || !fromDate || !toDate) {
      Alert.alert("Missing info", "Please select both dates.");
      return;
    }
    setSubmitting(true);
    const { id, error } = await requestLeave(studentId, fromDate, toDate, type, note);
    setSubmitting(false);
    if (error) {
      Alert.alert("Could not submit", error === "overlapping_leave"
        ? "You already have a pending or approved leave request that overlaps these dates."
        : error);
      return;
    }
     if (id) notifyLeaveRequested(id);
    // Plain 2-arg Alert.alert is reliable cross-platform (including web);
    // the 3-arg buttons+onPress form is not — router.back() now runs
    // unconditionally right after, instead of depending on that callback.
    Alert.alert("Submitted", "Your leave request has been sent for approval.");
    router.back();
  }
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Apply for leave</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>For {student?.fullName ?? "your child"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>From</Text>
            <TouchableOpacity onPress={() => setPickerFor("from")} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border }}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>{formatLabel(fromDate)}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>To</Text>
            <TouchableOpacity onPress={() => setPickerFor("to")} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border }}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>{formatLabel(toDate)}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {fromDate && toDate && (
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.primary }}>
            {daysBetween()} day{daysBetween() !== 1 ? "s" : ""} · full days
          </Text>
        )}

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Reason type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setType(opt.value)}
                style={{
                  flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12,
                  borderWidth: 1.5, borderColor: type === opt.value ? theme.primary : theme.border,
                  backgroundColor: type === opt.value ? theme.primaryLight : theme.surface,
                }}
              >
                <Ionicons name={opt.icon} size={18} color={type === opt.value ? theme.primary : theme.textMuted} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: type === opt.value ? theme.primary : theme.textSecondary }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Note to teacher</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Add any details the teacher should know…"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 10, backgroundColor: theme.success + "15", borderRadius: 12, padding: 14 }}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.success} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>
            Goes to {student?.fullName ?? "your child"}'s class teacher for approval. Applying for past or ongoing dates is
            fine — already-marked days get corrected to Excused once approved.
          </Text>
        </View>
      </ScrollView>

      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
        <PrimaryButton label="Submit request" onPress={handleSubmit} loading={submitting} disabled={!fromDate || !toDate} />
      </View>

      <Modal visible={!!pickerFor} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Select {pickerFor === "from" ? "start" : "end"} date</Text>
              <TouchableOpacity onPress={() => setPickerFor(null)}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Calendar
              onDayPress={(day: { dateString: string }) => onPickDate(day.dateString)}
              minDate={pickerFor === "to" && fromDate ? fromDate : undefined}
              markedDates={{
                ...(fromDate ? { [fromDate]: { selected: true, selectedColor: theme.primary } } : {}),
                ...(toDate ? { [toDate]: { selected: true, selectedColor: theme.primary } } : {}),
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
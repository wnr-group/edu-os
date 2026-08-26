// apps/mobile/app/(parent)/admission-enquiry.tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PickerModal, SelectRow, type PickerOption } from "../../components/PickerModal";
import {
  loadClassesForEnquiry,
  loadMyProfileForPrefill,
  submitAdmissionEnquiry,
  type AdmissionClassOption,
} from "../../lib/admissions";

const GENDER_OPTIONS: { value: "male" | "female" | "other"; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export default function AdmissionEnquiryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const formTsRef = useRef(Date.now());

  const [classes, setClasses] = useState<AdmissionClassOption[]>([]);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [applicantName, setApplicantName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [classAppliedId, setClassAppliedId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [previousSchool, setPreviousSchool] = useState("");
  const [area, setArea] = useState("");
  const [applicantNote, setApplicantNote] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [classOptions, profile] = await Promise.all([loadClassesForEnquiry(), loadMyProfileForPrefill()]);
      setClasses(classOptions);
      setParentName(profile.fullName);
      setParentEmail(profile.email);
      setLoadingClasses(false);
    })();
  }, []);

  const classPickerOptions: PickerOption[] = classes.map((c) => ({ label: c.name, value: c.id }));
  const selectedClassLabel = classes.find((c) => c.id === classAppliedId)?.name ?? "";

  async function handleSubmit() {
    if (!applicantName.trim() || !classAppliedId || !parentName.trim() || !parentPhone.trim()) {
      Alert.alert("Missing info", "Please fill in the applicant's name, class, parent name and parent phone.");
      return;
    }
    setSubmitting(true);
    const result = await submitAdmissionEnquiry(
      {
        applicantName: applicantName.trim(),
        dateOfBirth,
        gender,
        classAppliedId,
        parentName: parentName.trim(),
        parentPhone: parentPhone.trim(),
        parentEmail: parentEmail.trim(),
        previousSchool: previousSchool.trim(),
        area: area.trim(),
        applicantNote: applicantNote.trim(),
      },
      formTsRef.current,
    );
    setSubmitting(false);

    if (result.kind === "success") {
      Alert.alert("Enquiry submitted", `Thank you! Your reference number is ${result.referenceNo}.`);
      router.back();
      return;
    }
    if (result.kind === "payment_required") {
      Alert.alert(
        "Application fee required",
        `Your enquiry (Ref: ${result.referenceNo}) has been received but needs an application fee payment to complete. Paid admission enquiry isn't yet supported in the app — please complete the payment through the school website or contact the school office, quoting this reference number.`,
      );
      router.back();
      return;
    }
    Alert.alert("Could not submit", result.message);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Admission Enquiry</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Applicant name
          </Text>
          <TextInput
            value={applicantName}
            onChangeText={setApplicantName}
            placeholder="Child's full name"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Date of birth (optional)
          </Text>
          <TextInput
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Gender</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setGender(opt.value)}
                style={{
                  flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12,
                  borderWidth: 1.5, borderColor: gender === opt.value ? theme.primary : theme.border,
                  backgroundColor: gender === opt.value ? theme.primaryLight : theme.surface,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: gender === opt.value ? theme.primary : theme.textSecondary }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <SelectRow
          label="Class applied for"
          displayValue={selectedClassLabel}
          placeholder={loadingClasses ? "Loading classes…" : "Select class"}
          onPress={() => !loadingClasses && setClassPickerOpen(true)}
        />

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent name
          </Text>
          <TextInput
            value={parentName}
            onChangeText={setParentName}
            placeholder="Parent/guardian full name"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent phone
          </Text>
          <TextInput
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor={theme.textMuted}
            keyboardType="phone-pad"
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent email (optional)
          </Text>
          <TextInput
            value={parentEmail}
            onChangeText={setParentEmail}
            placeholder="parent@example.com"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Previous school (optional)
          </Text>
          <TextInput
            value={previousSchool}
            onChangeText={setPreviousSchool}
            placeholder="Name of previous school"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Area (optional)
          </Text>
          <TextInput
            value={area}
            onChangeText={setArea}
            placeholder="Locality / area"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Note (optional)
          </Text>
          <TextInput
            value={applicantNote}
            onChangeText={setApplicantNote}
            multiline
            placeholder="Anything else the school should know…"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>
      </ScrollView>

      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
        <PrimaryButton
          label="Submit enquiry"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!applicantName.trim() || !classAppliedId || !parentName.trim() || !parentPhone.trim()}
        />
      </View>

      <PickerModal
        visible={classPickerOpen}
        title="Select class"
        options={classPickerOptions}
        value={classAppliedId}
        onSelect={(value) => setClassAppliedId(value)}
        onClose={() => setClassPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

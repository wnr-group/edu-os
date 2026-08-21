import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { supabase, fixStorageUrl } from "../../lib/supabase";
import { SkeletonCard } from "../../components/Skeleton";

interface CardData {
  studentName: string;
  photoUrl: string | null;
  admissionNumber: string | null;
  rollNumber: string | null;
  className: string;
  sectionName: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolDomain: string | null;
  status: "active" | "revoked";
}

// Same /verify URL scheme as the web admin card, built from the school's own
// domain column (works for local *.lvh.me and production
// *.eduos.wnradvisory.com alike — no hardcoded domain).
//
// lvh.me always resolves to 127.0.0.1, which is a different device on every
// phone — a physical device scanning this QR can never reach it. Locally
// only, swap in EXPO_PUBLIC_WEB_DEV_HOST (set in .env.local, gitignored,
// never set in an eas.json build profile) so the QR is reachable from a
// physical device on the same LAN as the dev machine. Production is
// untouched: the var is never set there, so schools.domain is used as
// fetched, exactly as before.
function qrPayload(schoolDomain: string | null, studentId: string): string {
  if (!schoolDomain) return "";
  const isLocal = schoolDomain.includes("lvh.me") || schoolDomain.includes("localhost");
  const devHost = process.env.EXPO_PUBLIC_WEB_DEV_HOST;
  const host = isLocal && devHost ? devHost : schoolDomain;
  return `${isLocal ? "http" : "https"}://${host}/verify/${studentId}`;
}

export default function ParentIdCard() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const activeStudent = students.find((s) => s.id === studentId);

  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    const { data: student } = await supabase
      .from("student_profiles")
      .select("full_name, photo_url, school_id, admission_number, id_card_status, profile:profiles!profile_id(full_name)")
      .eq("id", studentId)
      .single();
    if (!student) {
      setData(null);
      setLoading(false);
      return;
    }
    const [{ data: school }, { data: enrollment }] = await Promise.all([
      supabase.from("schools").select("name, logo_url, domain").eq("id", student.school_id).single(),
      supabase
        .from("student_enrollments")
        .select("roll_number, class:classes(name), section:sections(name)")
        .eq("student_profile_id", studentId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    const profile = student.profile as unknown as { full_name: string } | null;
    const cls = enrollment?.class as unknown as { name: string } | null;
    const sec = enrollment?.section as unknown as { name: string } | null;
    setData({
      studentName: profile?.full_name || student.full_name || "Student",
      photoUrl: student.photo_url ? fixStorageUrl(student.photo_url) : null,
      admissionNumber: student.admission_number,
      rollNumber: enrollment?.roll_number ?? null,
      className: cls?.name ?? "—",
      sectionName: sec?.name ?? "—",
      schoolName: school?.name ?? "School",
      schoolLogoUrl: school?.logo_url ?? null,
      schoolDomain: school?.domain ?? null,
      status: student.id_card_status as "active" | "revoked",
    });
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const revoked = data?.status === "revoked";

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Student ID Card</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, alignItems: "center" }}>
        {loading ? (
          <SkeletonCard />
        ) : !data ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
            <Ionicons name="card-outline" size={36} color={theme.textMuted} />
            <Text style={{ fontFamily: "Inter_500Medium", color: theme.textMuted }}>No ID card found.</Text>
          </View>
        ) : (
          <View
            style={{
              width: "100%",
              maxWidth: 340,
              marginTop: 12,
              borderRadius: 20,
              overflow: "hidden",
              borderWidth: revoked ? 1.5 : 0,
              borderColor: theme.danger,
              opacity: revoked ? 0.85 : 1,
              backgroundColor: theme.surface,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.primaryLight, paddingHorizontal: 16, paddingVertical: 12 }}>
              {data.schoolLogoUrl && (
                <Image source={{ uri: data.schoolLogoUrl }} style={{ width: 32, height: 32, borderRadius: 6 }} resizeMode="contain" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>{data.schoolName}</Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Student ID Card
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 14, padding: 16 }}>
              {data.photoUrl ? (
                <Image source={{ uri: data.photoUrl }} style={{ width: 76, height: 76, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textMuted }}>
                    {data.studentName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.textPrimary }} numberOfLines={1}>{data.studentName}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                  {data.className} · Section {data.sectionName}
                </Text>
                {data.rollNumber && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>Roll No: {data.rollNumber}</Text>
                )}
                {data.admissionNumber && (
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>Adm No: {data.admissionNumber}</Text>
                )}
              </View>
            </View>

            <View style={{ alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
              <QRCode value={qrPayload(data.schoolDomain, studentId ?? "")} size={110} />
            </View>

            {revoked && (
              <View style={{ backgroundColor: theme.danger + "1A", paddingVertical: 10, alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: theme.danger, letterSpacing: 1 }}>
                  REVOKED — NOT VALID
                </Text>
              </View>
            )}
          </View>
        )}

        {activeStudent && !loading && data && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 }}>
            {revoked ? (
              <Ionicons name="close-circle" size={15} color={theme.danger} />
            ) : (
              <Ionicons name="checkmark-circle" size={15} color={theme.success} />
            )}
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: revoked ? theme.danger : theme.success }}>
              {revoked ? "This card is not currently valid." : "This card is active."}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

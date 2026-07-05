import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Image, RefreshControl } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { supabase, fixStorageUrl, SCHOOL_ID } from "../../lib/supabase";
import { useActiveContext, clearActiveContext } from "../../lib/active-context";
import { useTheme } from "../../lib/theme";
import { ListItem } from "../../components/ListItem";
import { Avatar } from "../../components/Avatar";
import { SectionHeader } from "../../components/SectionHeader";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SkeletonCard } from "../../components/Skeleton";
import { useParentCounts } from "../../lib/parent-counts";

type Section = "menu" | "notifications" | "announcements" | "discipline" | "feedback-teacher" | "feedback-management" | "profile";

export default function ParentMore() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId: activeStudentId, activeYearId } = useActiveContext();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const { unreadNotifications, unseenAnnouncements, refresh: refreshCounts } = useParentCounts();
  const [section, setSection] = useState<Section>("menu");
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; created_at: string; is_read: boolean }[]>([]);
  const [profile, setProfile] = useState<{ full_name: string; email: string } | null>(null);
  const [student, setStudent] = useState<{ name: string; className: string; sectionName: string; rollNumber: string; admissionNumber: string; photoUrl: string | null } | null>(null);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; created_at: string }[]>([]);
  const [discipline, setDiscipline] = useState<{ id: string; incident_date: string; description: string; action_taken: string }[]>([]);
  const [teacherFeedback, setTeacherFeedback] = useState({ subject: "", message: "" });
  const [managementFeedback, setManagementFeedback] = useState({ subject: "", message: "" });
  const [classteacherId, setClassteacherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => { setUploadingPhoto(false); loadProfile(); }, [activeStudentId]);

  // Reset any drilled-in sub-page back to the menu when leaving the tab, so
  // revisiting "More" always lands on the top-level list rather than a stale page.
  useFocusEffect(useCallback(() => () => setSection("menu"), []));

  // Deep-link handling: when a `section` param is passed (e.g. from the dashboard
  // "See all"/announcement rows), open that sub-page, then clear the param so it
  // fires once. Kept separate from the blur-reset above — folding it into the
  // focus effect made clearing the param re-run that effect's cleanup and snap
  // straight back to the menu.
  useEffect(() => {
    if (sectionParam === "announcements") {
      navigate("announcements");
      router.setParams({ section: undefined });
    }
  }, [sectionParam]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (section === "menu" || section === "profile") await loadProfile();
    if (section === "notifications") await loadNotifications();
    if (section === "announcements") await loadAnnouncements();
    if (section === "discipline") await loadDiscipline();
    setRefreshing(false);
  }, [section]);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: prof }, { data: sp }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      activeStudentId
        ? supabase
            .from("student_profiles")
            .select("id, full_name, admission_number, photo_url, student_enrollments(roll_number, sections(id, name, classes(name)))")
            .eq("id", activeStudentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setProfile({ full_name: prof?.full_name ?? "User", email: user.email ?? "" });
    if (sp) {
      const s = sp as any;
      const activeEnrollment = Array.isArray(s.student_enrollments)
        ? s.student_enrollments.find((e: any) => e.sections) ?? s.student_enrollments[0]
        : s.student_enrollments;
      setStudent({
        name: s.full_name ?? "Student",
        className: activeEnrollment?.sections?.classes?.name ?? "",
        sectionName: activeEnrollment?.sections?.name ?? "",
        rollNumber: activeEnrollment?.roll_number ?? "",
        admissionNumber: s.admission_number ?? "",
        photoUrl: s.photo_url ? fixStorageUrl(s.photo_url) : null,
      });
      // Fetch class teacher for feedback routing
      const sectionId = activeEnrollment?.sections?.id ?? null;
      if (sectionId) {
        const { data: sa } = await supabase
          .from("section_assignments")
          .select("class_teacher_id")
          .eq("section_id", sectionId)
          .maybeSingle();
        setClassteacherId(sa?.class_teacher_id ?? null);
      }
    }
  }

  async function loadAnnouncements() {
    setLoading(true);
    const { data } = await supabase.from("announcements").select("id, title, content, created_at").order("created_at", { ascending: false }).limit(20);
    setAnnouncements(data ?? []);
    setLoading(false);
  }

  async function loadNotifications() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNotifications([]); setLoading(false); return; }
    let query = supabase
      .from("notifications")
      .select("id, title, body, created_at, is_read")
      .eq("user_id", user.id);
    // Show alerts for the active child plus school-wide ones (student_id IS NULL).
    if (activeStudentId) query = query.or(`student_id.eq.${activeStudentId},student_id.is.null`);
    const { data } = await query
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(data ?? []);
    // Mark all unread as read.
    const unreadIds = (data ?? []).filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
      await refreshCounts(activeStudentId);
    }
    setLoading(false);
  }

  async function markAnnouncementsSeen() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ announcements_seen_at: new Date().toISOString() }).eq("id", user.id);
    await refreshCounts();
  }

  async function loadDiscipline() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    if (!activeStudentId) { setDiscipline([]); setLoading(false); return; }
    // Look up the active student
    const { data: sp } = await supabase.from("student_profiles").select("id").eq("id", activeStudentId).maybeSingle();
    const studentId = sp?.id;
    if (!studentId) { setDiscipline([]); setLoading(false); return; }
    let query = supabase.from("discipline_records").select("id, created_at, description, severity").eq("student_id", studentId);
    if (activeYearId) query = query.eq("academic_year_id", activeYearId);
    const { data } = await query.order("created_at", { ascending: false });
    setDiscipline((data ?? []).map((r: any) => ({
      id: r.id,
      incident_date: r.created_at,
      description: r.description,
      action_taken: r.severity,
    })));
    setLoading(false);
  }

  async function submitTeacherFeedback() {
    if (!teacherFeedback.subject.trim() || !teacherFeedback.message.trim()) {
      Alert.alert("Required", "Please fill in subject and message."); return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("feedback").insert({
      school_id: SCHOOL_ID,
      from_user_id: user?.id,
      to_role: "teacher",
      to_user_id: classteacherId,
      subject: teacherFeedback.subject.trim(),
      message: teacherFeedback.message.trim(),
      status: "open",
    });
    setTeacherFeedback({ subject: "", message: "" });
    setSubmitting(false);
    setSection("menu");
    Alert.alert("Sent", "Your message has been sent to the teacher.");
  }

  async function submitManagementFeedback() {
    if (!managementFeedback.subject.trim() || !managementFeedback.message.trim()) {
      Alert.alert("Required", "Please fill in subject and message."); return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("feedback").insert([
      {
        school_id: SCHOOL_ID,
        from_user_id: user?.id,
        to_role: "principal",
        to_user_id: null,
        subject: managementFeedback.subject.trim(),
        message: managementFeedback.message.trim(),
        status: "open",
      },
      {
        school_id: SCHOOL_ID,
        from_user_id: user?.id,
        to_role: "school_admin",
        to_user_id: null,
        subject: managementFeedback.subject.trim(),
        message: managementFeedback.message.trim(),
        status: "open",
      },
    ]);
    setManagementFeedback({ subject: "", message: "" });
    setSubmitting(false);
    setSection("menu");
    Alert.alert("Sent", "Your message has been sent to the management.");
  }

  async function handlePhotoUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const rawExt = uri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
      const ext = rawExt === "jpg" ? "jpeg" : rawExt;
      const fileName = `${student?.admissionNumber ?? Date.now()}.${ext}`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!activeStudentId) return;

      const { data: sp } = await supabase
        .from("student_profiles")
        .select("id, school_id")
        .eq("id", activeStudentId)
        .maybeSingle();
      if (!sp) return;

      const byteArray = await new File(uri).bytes();
      const { error: uploadError } = await supabase.storage
        .from("student-photos")
        .upload(`${sp.school_id}/${sp.id}/${fileName}`, byteArray, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("student-photos")
        .getPublicUrl(`${sp.school_id}/${sp.id}/${fileName}`);

      // Append a cache-buster so React Native's Image component doesn't serve a stale version
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("student_profiles")
        .update({ photo_url: publicUrl })
        .eq("id", sp.id);

      if (updateError) throw updateError;

      await loadProfile();
      Alert.alert("Done", "Photo updated successfully.");
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function navigate(s: Section) {
    setSection(s);
    if (s === "notifications") loadNotifications();
    if (s === "announcements") { loadAnnouncements(); markAnnouncementsSeen(); }
    if (s === "discipline") loadDiscipline();
  }

  const sectionTitle: Record<Section, string> = {
    menu: "More",
    notifications: "Notifications",
    announcements: "Announcements",
    discipline: "Discipline Records",
    "feedback-teacher": "Message Teacher",
    "feedback-management": "Contact Management",
    profile: "Profile",
  };

  if (section !== "menu") {
    return (
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 20, gap: 12 }}>
          <TouchableOpacity onPress={() => setSection("menu")}>
            <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{sectionTitle[section]}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {section === "notifications" && (
            loading ? [0,1,2].map(i => <SkeletonCard key={i} />) :
            notifications.length === 0 ? (
              <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No notifications yet</Text>
            ) : notifications.map((n) => (
              <View key={n.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 6, borderLeftWidth: n.is_read ? 0 : 3, borderLeftColor: theme.primary }}>
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{n.title}</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{n.body}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{new Date(n.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
              </View>
            ))
          )}
          {section === "announcements" && (
            loading ? [0,1,2].map(i => <SkeletonCard key={i} />) :
            announcements.map((a) => (
              <View key={a.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}>
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{a.title}</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{a.content}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
              </View>
            ))
          )}
          {section === "discipline" && (
            loading ? [0,1].map(i => <SkeletonCard key={i} />) :
            discipline.length === 0 ? (
              <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 32 }}>No discipline records</Text>
            ) : discipline.map((d) => (
              <View key={d.id} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 8 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textMuted }}>{new Date(d.incident_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textPrimary }}>{d.description}</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.warning }}>Action: {d.action_taken}</Text>
              </View>
            ))
          )}
          {section === "feedback-teacher" && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                Your message will be sent to your child's class teacher.
              </Text>
              <View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Subject</Text>
                <TextInput
                  style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
                  placeholder="e.g. Homework concern"
                  placeholderTextColor={theme.textMuted}
                  value={teacherFeedback.subject}
                  onChangeText={(v) => setTeacherFeedback(p => ({ ...p, subject: v }))}
                />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Message</Text>
                <TextInput
                  style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, minHeight: 120, textAlignVertical: "top" }}
                  placeholder="Write your message..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  value={teacherFeedback.message}
                  onChangeText={(v) => setTeacherFeedback(p => ({ ...p, message: v }))}
                />
              </View>
              <PrimaryButton label="Send to Teacher" onPress={submitTeacherFeedback} loading={submitting} />
            </View>
          )}
          {section === "feedback-management" && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>
                Send a formal message to school management.
              </Text>
              <View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Subject</Text>
                <TextInput
                  style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
                  placeholder="e.g. Fee inquiry"
                  placeholderTextColor={theme.textMuted}
                  value={managementFeedback.subject}
                  onChangeText={(v) => setManagementFeedback(p => ({ ...p, subject: v }))}
                />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.textSecondary, marginBottom: 6 }}>Message</Text>
                <TextInput
                  style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary, minHeight: 120, textAlignVertical: "top" }}
                  placeholder="Write your message..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  value={managementFeedback.message}
                  onChangeText={(v) => setManagementFeedback(p => ({ ...p, message: v }))}
                />
              </View>
              <PrimaryButton label="Send to Management" onPress={submitManagementFeedback} loading={submitting} />
            </View>
          )}
          {section === "profile" && profile && (
            <View style={{ gap: 16 }}>
              {/* Parent account card */}
              <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: "center", gap: 12 }}>
                <Avatar name={profile.full_name} size={72} />
                <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{profile.full_name}</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{profile.email}</Text>
              </View>

              {/* Child / student details card */}
              {student && (
                <View style={{ backgroundColor: theme.surface, borderRadius: 20, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>Student</Text>
                  </View>
                  <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={{ position: "relative" }}>
                      {student.photoUrl ? (
                        <Image source={{ uri: student.photoUrl }} style={{ width: 56, height: 56, borderRadius: 14 }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.primaryLight, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 21, fontFamily: "Inter_600SemiBold", color: theme.primary }}>
                            {student.name.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("")}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={handlePhotoUpload}
                        disabled={uploadingPhoto}
                        activeOpacity={0.7}
                        style={{ position: "absolute", bottom: -2, right: -2, backgroundColor: theme.surface, borderRadius: 10, padding: 5, borderWidth: 1, borderColor: theme.border }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name={uploadingPhoto ? "hourglass-outline" : "camera-outline"} size={14} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{student.name}</Text>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: theme.primary }}>
                        {student.className} {student.sectionName}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 2 }}>
                        {student.rollNumber ? (
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Roll #{student.rollNumber}</Text>
                        ) : null}
                        {student.admissionNumber ? (
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Adm #{student.admissionNumber}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <PrimaryButton label="Sign Out" onPress={async () => { await clearActiveContext(); await supabase.auth.signOut(); }} style={{ backgroundColor: theme.danger }} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>More</Text>
        {profile && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={profile.full_name} size={48} />
            <View>
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{profile.full_name}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{profile.email}</Text>
            </View>
          </View>
        )}
        <View style={{ gap: 8 }}>
          <ListItem
            icon="notifications-outline"
            title="Notifications"
            subtitle={unreadNotifications > 0 ? `${unreadNotifications} unread` : "Alerts & updates"}
            onPress={() => navigate("notifications")}
          />
          <ListItem
            icon="megaphone-outline"
            title="Announcements"
            subtitle={unseenAnnouncements > 0 ? `${unseenAnnouncements} new` : "School news & updates"}
            onPress={() => navigate("announcements")}
          />
          <ListItem icon="warning-outline" title="Discipline Records" subtitle="Incidents & actions" onPress={() => navigate("discipline")} />
          <ListItem icon="chatbubble-outline" title="Message Teacher" subtitle="Connect with your child's class teacher" onPress={() => navigate("feedback-teacher")} />
          <ListItem icon="mail-outline" title="Contact Management" subtitle="Reach out to the principal or admin" onPress={() => navigate("feedback-management")} />
          <ListItem icon="person-circle-outline" title="Profile" subtitle="Account settings" onPress={() => navigate("profile")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

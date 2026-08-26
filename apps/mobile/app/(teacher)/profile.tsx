import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase, SCHOOL_ID } from "../../lib/supabase";
import { clearActiveContext } from "../../lib/active-context";
import { useTheme } from "../../lib/theme";
import { Avatar } from "../../components/Avatar";
import { ListItem } from "../../components/ListItem";
import { PrimaryButton } from "../../components/PrimaryButton";

interface Profile {
  full_name: string;
  email: string;
  school_name: string;
}

export default function TeacherProfile() {
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: prof }, { data: school }] = await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
        supabase.from("schools").select("name").eq("id", SCHOOL_ID).maybeSingle(),
      ]);

      const emailValue = (prof?.email ?? user.email ?? "").trim();

      setProfile({
        full_name: prof?.full_name ?? "Teacher",
        email: emailValue,
        school_name: school?.name ?? "School",
      });
    } catch (err) {
      console.error("Failed to load teacher profile:", err);
    } finally {
      setLoading(false);
    }
  }

  function startEditEmail() {
    setNewEmail(profile?.email ?? "");
    setSaveMsg(null);
    setEditingEmail(true);
  }

  function cancelEditEmail() {
    setEditingEmail(false);
    setSaveMsg(null);
  }

  async function saveEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setSaveMsg({ text: "Email address is required.", isError: true });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setSaveMsg({ text: "Please enter a valid email address.", isError: true });
      return;
    }

    if (trimmed === (profile?.email ?? "").toLowerCase()) {
      setEditingEmail(false);
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSaveMsg({ text: "Authentication session not found. Please log in again.", isError: true });
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ email: trimmed })
        .eq("id", user.id);

      if (error) {
        setSaveMsg({ text: error.message || "Failed to update email. Please try again.", isError: true });
      } else {
        await loadProfile();
        setEditingEmail(false);
        setSaveMsg({ text: "Email updated successfully.", isError: false });
      }
    } catch (err: any) {
      setSaveMsg({ text: err?.message || "An unexpected error occurred while saving.", isError: true });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !profile) {
    return (
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Profile</Text>
        {profile && (
          <>
            <View style={{ backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: "center", gap: 12 }}>
              <Avatar name={profile.full_name} size={80} />
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>{profile.full_name}</Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: profile.email ? theme.textSecondary : theme.textMuted }}>
                {profile.email || "No email address"}
              </Text>
              <View style={{ backgroundColor: theme.primaryLight, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.primary }}>Teacher · {profile.school_name}</Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <ListItem icon="school-outline" title={profile.school_name} subtitle="Your school" />

              {editingEmail ? (
                <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Email address</Text>
                  <TextInput
                    value={newEmail}
                    onChangeText={setNewEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textMuted}
                    editable={!saving}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border ?? "#E5E7EB",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 15,
                      fontFamily: "Inter_400Regular",
                      color: theme.textPrimary,
                      backgroundColor: theme.background,
                    }}
                  />
                  {saveMsg && (
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: saveMsg.isError ? theme.danger : theme.success }}>
                      {saveMsg.text}
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={cancelEditEmail}
                      disabled={saving}
                      style={{ flex: 1, borderWidth: 1, borderColor: theme.border ?? "#E5E7EB", borderRadius: 8, paddingVertical: 10, alignItems: "center", opacity: saving ? 0.6 : 1 }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: theme.textSecondary }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveEmail}
                      disabled={saving}
                      style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", opacity: saving ? 0.7 : 1 }}
                    >
                      {saving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Save</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <ListItem
                      icon="mail-outline"
                      title={profile.email || "Not provided"}
                      subtitle="Email address"
                    />
                  </View>
                  <TouchableOpacity
                    onPress={startEditEmail}
                    style={{ padding: 12 }}
                    hitSlop={8}
                    accessibilityLabel="Edit email address"
                  >
                    <Ionicons name="pencil-outline" size={18} color={theme.primary} />
                  </TouchableOpacity>
                </View>
              )}

              {!editingEmail && saveMsg && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: saveMsg.isError ? theme.danger : theme.success, paddingHorizontal: 4 }}>
                  {saveMsg.text}
                </Text>
              )}
            </View>

            <PrimaryButton label="Sign Out" onPress={async () => { await clearActiveContext(); await supabase.auth.signOut(); }} style={{ backgroundColor: theme.danger }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

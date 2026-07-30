import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useActiveContext, type MobileRole } from "../lib/active-context";

export function ContextSwitcher() {
  const { roles, students, role, studentId, setRole, setStudent } = useActiveContext();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const hasRoleChoice = roles.includes("teacher") && roles.includes("parent");
  const hasStudentChoice = role === "parent" && students.length > 1;

  if (!hasRoleChoice && !hasStudentChoice) return null;

  const activeStudent = students.find((s) => s.id === studentId);
  const label =
    role === "teacher"
      ? "Teacher"
      : `Parent${activeStudent ? ` · ${activeStudent.fullName}` : ""}`;

  function chooseRole(r: MobileRole) {
    setRole(r);
    setOpen(false);
    router.replace(r === "teacher" ? "/(teacher)/dashboard" : "/(parent)/dashboard");
  }

  function chooseStudent(id: string) {
    setStudent(id);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row", alignItems: "center", gap: 6,
          backgroundColor: "#eff6ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        }}
      >
        <Text style={{ color: "#1d4ed8", fontWeight: "600", fontSize: 13 }}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color="#1d4ed8" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Switch context</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {roles.includes("teacher") && (
              <Row
                label="Teacher"
                active={role === "teacher"}
                onPress={() => chooseRole("teacher")}
              />
            )}
            {roles.includes("parent") && (
              <>
                <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 12, marginBottom: 4 }}>PARENT</Text>
                {students.map((s) => (
                  <Row
                    key={s.id}
                    label={s.fullName}
                    active={role === "parent" && studentId === s.id}
                    onPress={() => {
                      if (role !== "parent") setRole("parent");
                      chooseStudent(s.id);
                      router.replace("/(parent)/dashboard");
                    }}
                  />
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Row({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}
    >
      <Text style={{ fontSize: 15, color: active ? "#1d4ed8" : "#111827", fontWeight: active ? "700" : "400" }}>
        {label}
      </Text>
      {active && <Ionicons name="checkmark" size={18} color="#1d4ed8" />}
    </TouchableOpacity>
  );
}

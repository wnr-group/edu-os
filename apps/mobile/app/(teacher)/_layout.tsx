import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme";
import { TeacherContextProvider } from "../../lib/teacherContext";
import { AppBar } from "../../components/AppBar";

export default function TeacherLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <TeacherContextProvider>
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <AppBar />,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, borderTopWidth: 1, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom },
        tabBarLabelStyle: { fontSize: 11, fontFamily: "Inter_500Medium" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="attendance" options={{ title: "Attendance", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="classes" options={{ title: "Classes", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "school" : "school-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="leave" options={{ title: "Leave", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "airplane" : "airplane-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="discipline" options={{ title: "Discipline", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "shield" : "shield-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="ptm" options={{ title: "PTM", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="homework" options={{ href: null }} />
    </Tabs>
    </TeacherContextProvider>
  );
}

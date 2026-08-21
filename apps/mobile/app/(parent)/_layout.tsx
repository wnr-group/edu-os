import { useEffect, useCallback } from "react";
import { Tabs, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme";
import { AppBar } from "../../components/AppBar";
import { ParentCountsProvider, useParentCounts } from "../../lib/parent-counts";
import { useActiveContext } from "../../lib/active-context";

export default function ParentLayout() {
  return (
    <ParentCountsProvider>
      <ParentTabs />
    </ParentCountsProvider>
  );
}

function ParentTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { unreadNotifications, unseenAnnouncements, refresh } = useParentCounts();
  const { studentId } = useActiveContext();
  const totalBadge = unreadNotifications + unseenAnnouncements;
  useEffect(() => { refresh(studentId); }, [refresh, studentId]);
  // Re-fetch whenever the parent area regains focus (covers cold-start session races).
  useFocusEffect(useCallback(() => { refresh(studentId); }, [refresh, studentId]));
  return (
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
      <Tabs.Screen name="academics" options={{ title: "Academics", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "book" : "book-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="fees" options={{ title: "Fees", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarBadge: totalBadge > 0 ? totalBadge : undefined, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="homework" options={{ href: null }} />
      <Tabs.Screen name="apply-leave" options={{ href: null }} />
      <Tabs.Screen name="leave-status" options={{ href: null }} />
      <Tabs.Screen name="exam-datesheet" options={{ href: null }} />
      <Tabs.Screen name="admission-enquiry" options={{ href: null }} />
      <Tabs.Screen name="kyc-documents" options={{ href: null }} />
    </Tabs>
  );
}

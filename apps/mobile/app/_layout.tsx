import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { supabase, SCHOOL_ID } from "../lib/supabase";
import { ThemeProvider } from "../lib/theme";
import { ActiveContextProvider, useActiveContext } from "../lib/active-context";
import { AnimatedSplash } from "../components/AnimatedSplash";
import type { Session } from "@supabase/supabase-js";
import "../global.css";

SplashScreen.preventAutoHideAsync();

async function tryRegisterPush(userId: string) {
  try {
    const { registerForPushNotifications } = await import("../lib/notifications");
    await registerForPushNotifications(userId);
  } catch {}
}

function Gate({
  session,
  initialized,
  children,
}: {
  session: Session | null;
  initialized: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const segments = useSegments();
  const { loading, hasAccess, role } = useActiveContext();

  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
      return;
    }
    if (!session) return;
    if (loading) return;

    if (!hasAccess) {
      if (segments[0] !== "no-access") router.replace("/no-access");
      return;
    }

    const target = role === "teacher" ? "(teacher)" : "(parent)";
    const inWrongGroup =
      (segments[0] === "(teacher)" || segments[0] === "(parent)") && segments[0] !== target;
    const atRoot = segments[0] === undefined;

    if (inAuthGroup || segments[0] === "no-access" || inWrongGroup || atRoot) {
      router.replace(role === "teacher" ? "/(teacher)/dashboard" : "/(parent)/dashboard");
    }
  }, [session, initialized, loading, hasAccess, role, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) tryRegisterPush(session.user.id);
      setInitialized(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) tryRegisterPush(session.user.id);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!fontsLoaded || !initialized) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider schoolId={SCHOOL_ID} session={session}>
        <StatusBar style="dark" />
        <ActiveContextProvider userId={session?.user.id ?? null}>
          <Gate session={session} initialized={initialized}>
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }} />
              {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
            </View>
          </Gate>
        </ActiveContextProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

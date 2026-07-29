import { View, Text, Image, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";
import { ContextSwitcher } from "./ContextSwitcher";

const logoMark = require("../assets/logo-mark.png");

export function AppBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        paddingTop: insets.top + 6,
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />
      <Image
        source={logoMark}
        style={{ width: 32, height: 32 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#1d4ed8" }}>
        EduOS
      </Text>
      <View style={{ flex: 1 }} />
      <ContextSwitcher />
    </View>
  );
}

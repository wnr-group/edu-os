import { useState, useEffect } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity, Image, Linking, Dimensions, StatusBar as RNStatusBar } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInUp, FadeIn, SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { supabase, SCHOOL_ID } from "../../lib/supabase";
import { clearActiveContext } from "../../lib/active-context";

const schoolLogo = require("../../assets/logo-header.png");
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const BRAND = "#1d4ed8";

export default function LoginScreen() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSendOtp() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      Alert.alert("Invalid number", "Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    const fullPhone = `+91${digits}`;

    const { data: allowed, error: checkError } = await supabase.rpc("check_phone_has_access", {
      p_phone: fullPhone,
      p_school_id: SCHOOL_ID,
    });

    if (checkError) {
      setLoading(false);
      Alert.alert("Error", "Could not verify access. Please try again.");
      return;
    }
    if (!allowed) {
      setLoading(false);
      Alert.alert(
        "No access",
        "This number isn't registered with this school. Please contact your school administrator.",
      );
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setStep("otp");
    setResendCooldown(30);
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      Alert.alert("Invalid OTP", "Enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    // Clear any leftover role/student from a previous account before the new session lands.
    await clearActiveContext();
    const { error } = await supabase.auth.verifyOtp({
      phone: `+91${phone.replace(/\D/g, "")}`,
      token: otp,
      type: "sms",
    });
    setLoading(false);
    if (error) {
      Alert.alert("Login failed", "Invalid or expired OTP. Please try again.");
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone.replace(/\D/g, "")}` });
    setLoading(false);
    if (error) Alert.alert("Error", error.message);
    else setResendCooldown(30);
  }

  const phoneReady = phone.replace(/\D/g, "").length === 10;
  const otpReady = otp.length === 6;
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <RNStatusBar barStyle="dark-content" backgroundColor="#eff6ff" translucent={false} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Top branded section */}
          <View style={{
            backgroundColor: "#eff6ff",
            paddingTop: insets.top + 16,
            paddingBottom: 44,
            alignItems: "center",
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
          }}>
            <Animated.View entering={FadeInDown.duration(600).delay(100)} style={{ alignItems: "center" }}>
              <Image
                source={schoolLogo}
                style={{ width: 120, height: 120 }}
                resizeMode="contain"
              />
              <Text style={{ fontSize: 28, fontFamily: "Inter_700Bold", color: "#0D1B2A", marginTop: 14, letterSpacing: -0.5 }}>
                EduOS
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b7280", marginTop: 4 }}>
                One Stop Mobile App Solution
              </Text>
            </Animated.View>
          </View>

          {/* Form section */}
          <Animated.View
            entering={FadeInUp.duration(500).delay(300)}
            style={{ flex: 1, paddingHorizontal: 24, paddingTop: 36 }}
          >
            {step === "phone" ? (
              <Animated.View key="phone-step" entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(200)}>
                <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 6 }}>
                  Welcome
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", marginBottom: 28, lineHeight: 20 }}>
                  Enter your registered mobile number to get started
                </Text>

                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", marginBottom: 8 }}>
                  Mobile Number
                </Text>
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#f9fafb",
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: phone.length > 0 ? BRAND : "#e5e7eb",
                  overflow: "hidden",
                  marginBottom: 24,
                }}>
                  <View style={{ paddingHorizontal: 16, height: 52, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: "#e5e7eb", backgroundColor: "#f3f4f6" }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#374151" }}>+91</Text>
                  </View>
                  <TextInput
                    style={{ flex: 1, height: 52, fontSize: 17, fontFamily: "Inter_500Medium", color: "#111827", paddingHorizontal: 14, letterSpacing: 0.5 }}
                    placeholder="9876 543 210"
                    placeholderTextColor="#c4c9d4"
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoFocus
                  />
                  {phoneReady && (
                    <View style={{ paddingRight: 14 }}>
                      <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={loading || !phoneReady}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: phoneReady ? BRAND : "#c7d2fe",
                    borderRadius: 12,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff" }}>
                    {loading ? "Sending..." : "Send OTP"}
                  </Text>
                  {!loading && <Ionicons name="arrow-forward" size={18} color="#ffffff" />}
                </TouchableOpacity>

              </Animated.View>
            ) : (
              <Animated.View key="otp-step" entering={SlideInRight.duration(300)}>
                <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 6 }}>
                  Verify OTP
                </Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "#6b7280", marginBottom: 4, lineHeight: 20 }}>
                  We sent a 6-digit code to{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: "#111827" }}>+91 {phone}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => { setStep("phone"); setOtp(""); setLoading(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginBottom: 28 }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: BRAND }}>Change number</Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", marginBottom: 8 }}>
                  Enter OTP
                </Text>
                <View style={{
                  backgroundColor: "#f9fafb",
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: otp.length > 0 ? BRAND : "#e5e7eb",
                  marginBottom: 24,
                }}>
                  <TextInput
                    style={{ height: 52, fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827", letterSpacing: 10, textAlign: "center" }}
                    placeholder="• • • • • •"
                    placeholderTextColor="#d1d5db"
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  onPress={handleVerifyOtp}
                  disabled={loading || !otpReady}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: otpReady ? BRAND : "#c7d2fe",
                    borderRadius: 12,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#ffffff" }}>
                    {loading ? "Verifying..." : "Verify & Login"}
                  </Text>
                  {!loading && <Ionicons name="shield-checkmark" size={18} color="#ffffff" />}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resendCooldown > 0}
                  style={{ marginTop: 20, alignItems: "center", paddingVertical: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: resendCooldown > 0 ? "#9ca3af" : BRAND }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Didn't receive? Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </Animated.View>

          {/* Footer */}
          <SafeAreaView edges={["bottom"]} style={{ paddingBottom: 8 }}>
            <TouchableOpacity
              onPress={() => Linking.openURL("mailto:support@eduos.app")}
              style={{ alignItems: "center", paddingVertical: 12 }}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#9ca3af" }}>
                Need help? Contact support
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
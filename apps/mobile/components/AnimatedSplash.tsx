import { useEffect } from "react";
import { View, Image, Text, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const logoMark = require("../assets/logo-mark.png");

interface Props {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: Props) {
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const logoRotate = useSharedValue(-10);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(20);
  const taglineOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Logo enters with spring
    logoOpacity.value = withTiming(1, { duration: 400 });
    logoScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    logoRotate.value = withSpring(0, { damping: 12, stiffness: 80 });

    // Pulse effect
    pulseScale.value = withDelay(600, withSequence(
      withTiming(1.08, { duration: 300, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }),
    ));

    // School name fades up
    textOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    textTranslateY.value = withDelay(500, withSpring(0, { damping: 14, stiffness: 90 }));

    // Tagline
    taglineOpacity.value = withDelay(800, withTiming(1, { duration: 400 }));

    // Fade out and finish
    containerOpacity.value = withDelay(2200, withTiming(0, { duration: 400 }, (finished) => {
      if (finished) runOnJS(onFinish)();
    }));
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { scale: logoScale.value * pulseScale.value },
      { rotate: `${logoRotate.value}deg` },
    ],
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const taglineAnimStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "#ffffff",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        },
        containerAnimStyle,
      ]}
    >
      {/* Subtle background gradient circle */}
      <View style={{
        position: "absolute",
        width: SCREEN_WIDTH * 0.8,
        height: SCREEN_WIDTH * 0.8,
        borderRadius: SCREEN_WIDTH * 0.4,
        backgroundColor: "#f0f7ff",
      }} />

      {/* Logo */}
      <Animated.View style={logoAnimStyle}>
        <Image
          source={logoMark}
          style={{ width: 120, height: 120 }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* School name */}
      <Animated.View style={[textAnimStyle, { marginTop: 20 }]}>
        <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: "#1d4ed8", letterSpacing: -0.5 }}>
          EduOS
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[taglineAnimStyle, { marginTop: 8 }]}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b7280" }}>
          One Stop Mobile App Solution
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

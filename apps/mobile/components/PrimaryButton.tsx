import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from "react-native";
import { useTheme } from "../lib/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  compact?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  color?: string;
}

export function PrimaryButton({ label, onPress, loading, compact, disabled, style, color }: PrimaryButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        {
          backgroundColor: disabled ? theme.textMuted : (color ?? theme.primary),
          borderRadius: 12,
          paddingVertical: compact ? 10 : 16,
          paddingHorizontal: compact ? 20 : 24,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator color="#fff" size="small" />}
      <Text style={{ fontSize: compact ? 13 : 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

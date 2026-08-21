import { View, Text } from "react-native";
import { useTheme } from "../lib/theme";

// Local to Testing — quiz statuses don't map cleanly onto the shared
// StatusBadge's existing variant set, so this stays self-contained rather
// than growing that shared component for one feature. Lives in components/
// (not app/(parent)/testing/) because expo-router treats every non-_layout
// file under app/ as a route — colocating it there registered a stray
// /testing/quiz-status-pill screen.
export type QuizPillVariant = "open" | "upcoming" | "closed" | "in_progress" | "submitted" | "graded" | "pass" | "fail";

const LABELS: Record<QuizPillVariant, string> = {
  open: "Open", upcoming: "Upcoming", closed: "Closed",
  in_progress: "In progress", submitted: "Submitted", graded: "Graded", pass: "Passed", fail: "Not passed",
};

export function QuizStatusPill({ variant }: { variant: QuizPillVariant }) {
  const theme = useTheme();
  const color =
    variant === "open" || variant === "pass" || variant === "graded" ? theme.success :
    variant === "upcoming" || variant === "in_progress" ? theme.warning :
    variant === "submitted" ? theme.info :
    variant === "fail" ? theme.danger :
    theme.textMuted;
  return (
    <View style={{ backgroundColor: color + "1A", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color, textTransform: "uppercase" }}>
        {LABELS[variant]}
      </Text>
    </View>
  );
}

import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Advisory } from "../lib/location";
import { formatDistanceM } from "../lib/location";

const GOOD_BG = "#E7F7F0";
const GOOD_INK = "#0B7A55";
const GOOD_ACCENT = "#10B981";
const WARN_BG = "#FDF3E2";
const WARN_INK = "#9A6408";
const WARN_ACCENT = "#F59E0B";

export function GeoAdvisoryChip({ advisory }: { advisory: Advisory | null }) {
  if (!advisory || advisory.status === "neutral") return null;

  const isInside = advisory.status === "inside";
  const bg = isInside ? GOOD_BG : WARN_BG;
  const ink = isInside ? GOOD_INK : WARN_INK;
  const accent = isInside ? GOOD_ACCENT : WARN_ACCENT;
  const distance = formatDistanceM(advisory.distanceM ?? 0);
  const accuracySuffix = advisory.accuracyM != null ? ` · GPS ±${Math.round(advisory.accuracyM)}m` : "";

  const title = isInside ? `On campus · ${advisory.geofenceName}` : `Off campus · ${distance} away`;
  const subtitle = isInside ? `${distance} from centre${accuracySuffix}` : `Outside all geofences${accuracySuffix}`;
  const pillLabel = isInside ? "VERIFIED" : "FLAGGED";
  const a11yLabel = `${title}. ${subtitle}.`;

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: bg, borderRadius: 14, padding: 12 }}
      accessible
      accessibilityLabel={a11yLabel}
      accessibilityRole="image"
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={isInside ? "location" : "warning"} size={17} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontFamily: "Inter_700Bold", color: ink }}>{title}</Text>
        <Text style={{ fontSize: 11.5, fontFamily: "Inter_400Regular", color: ink, opacity: 0.75, marginTop: 1 }}>
          {subtitle}
        </Text>
      </View>
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: ink, letterSpacing: 0.3 }}>{pillLabel}</Text>
      </View>
    </View>
  );
}

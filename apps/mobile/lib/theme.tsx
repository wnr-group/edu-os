import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "./supabase";

export interface Theme {
  primary: string;
  primaryLight: string;
  surface: string;
  surfaceRaised: string;
  background: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  schoolName: string;
}

const DEFAULT_PRIMARY = "#1d4ed8";

function buildTheme(primary: string, schoolName = ""): Theme {
  return {
    primary,
    primaryLight: primary + "26",
    surface: "#FFFFFF",
    surfaceRaised: "#F8FAFC",
    background: "#F1F5F9",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#3B82F6",
    schoolName,
  };
}

const ThemeContext = createContext<Theme>(buildTheme(DEFAULT_PRIMARY));

// F1 — feature flags. Local union rather than importing FeatureKey from
// @erp/shared, since apps/mobile's package.json wasn't available to confirm
// that dependency exists here. If @erp/shared IS already a mobile dependency,
// swap this for `import type { FeatureKey } from "@erp/shared";` and delete
// this local type — everything below is unaffected either way.
export type FeatureKey =
  | "attendance" | "attendance_geo" | "homework" | "exams" | "exam_schedule"
  | "report_cards" | "syllabus" | "timetable"
  | "admissions" | "kyc_documents" | "leave" | "testing"
  | "fees" | "online_payments"
  | "announcements" | "gallery" | "feedback" | "discipline"
  | "insights";

type FeaturesMap = Partial<Record<FeatureKey, boolean>>;

const FeaturesContext = createContext<FeaturesMap>({});

export function ThemeProvider({
  children,
  schoolId,
}: {
  children: ReactNode;
  schoolId?: string;
}) {
  const [theme, setTheme] = useState<Theme>(buildTheme(DEFAULT_PRIMARY));
  const [features, setFeatures] = useState<FeaturesMap>({});

  useEffect(() => {
    if (!schoolId) return;
    supabase
      .from("schools")
      .select("primary_color, name, features_enabled")
      .eq("id", schoolId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTheme(buildTheme(data.primary_color ?? DEFAULT_PRIMARY, data.name ?? ""));
          setFeatures((data.features_enabled ?? {}) as FeaturesMap);
        }
      });
  }, [schoolId]);

  return (
    <ThemeContext.Provider value={theme}>
      <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>
    </ThemeContext.Provider>
  );
}

/**
 * True only if the key is explicitly `true` in features_enabled — absent/false
 * both resolve to disabled, matching the DB's fail-safe default (feature_enabled()).
 */
export function useFeature(key: FeatureKey): boolean {
  const features = useContext(FeaturesContext);
  return features[key] === true;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

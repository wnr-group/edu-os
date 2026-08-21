import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

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
  session,
}: {
  children: ReactNode;
  schoolId?: string;
  session?: Session | null;
}) {
  const [theme, setTheme] = useState<Theme>(buildTheme(DEFAULT_PRIMARY));
  const [features, setFeatures] = useState<FeaturesMap>({});

  useEffect(() => {
    if (!schoolId || !session) return;
    let cancelled = false;

    // A single failed attempt (cold-start auth/session timing, a transient
    // network blip) must not permanently strand every useFeature() call at
    // its fail-closed default for the rest of the app session — this effect
    // never re-fires on its own since schoolId is a static build-time value.
    // Bounded retry so a real, persistent failure still gives up rather than
    // looping forever.
    async function loadSchool(attempt: number) {
      const { data, error } = await supabase
        .from("schools")
        .select("primary_color, name, features_enabled")
        .eq("id", schoolId)
        .single();

      if (cancelled) return;

      if (data) {
        setTheme(buildTheme(data.primary_color ?? DEFAULT_PRIMARY, data.name ?? ""));
        setFeatures((data.features_enabled ?? {}) as FeaturesMap);
        return;
      }

      if (error && attempt < 3) {
        setTimeout(() => { if (!cancelled) loadSchool(attempt + 1); }, 1000 * (attempt + 1));
      }
    }

    loadSchool(0);
    return () => { cancelled = true; };
  }, [schoolId, session]);

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

"use client";

import { createContext, useContext } from "react";
import type { FeatureKey } from "@erp/shared";

type FeaturesMap = Partial<Record<FeatureKey, boolean>>;

const FeaturesContext = createContext<FeaturesMap>({});

export function FeaturesProvider({
  features,
  children,
}: {
  features: FeaturesMap;
  children: React.ReactNode;
}) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

/**
 * True only if the key is explicitly `true` in features_enabled — absent/false
 * both resolve to disabled, matching the DB's fail-safe default (feature_enabled()).
 */
export function useFeature(key: FeatureKey): boolean {
  const features = useContext(FeaturesContext);
  return features[key] === true;
}
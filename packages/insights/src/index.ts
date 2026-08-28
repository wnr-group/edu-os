/**
 * @eduos/insights - Insights & Interventions V1
 *
 * Pure functions for computing risk scores and performance forecasts
 *
 * NOTE: Canonical implementation lives in supabase/functions/_shared/insights/
 * This package re-exports for testing and workspace compatibility.
 */

export { computeAttendanceRisk } from './attendance-risk';
export { computePerformanceForecast } from './performance-forecast';

export type {
  Band,
  Insight,
  InsightFactor,
  AttendanceRecord,
  AttendanceRiskInput,
  PerformanceInput,
} from './types';

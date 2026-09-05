/**
 * @eduos/insights - Insights & Interventions V1
 *
 * CANONICAL IMPLEMENTATION
 *
 * Pure functions for computing risk scores and performance forecasts.
 * This is the single source of truth used by:
 * - supabase/functions/insights-recompute/ (production Edge Function)
 * - packages/insights/src/ (testing wrapper)
 */

export { computeAttendanceRisk, collapseDailyAttendance } from './attendance-risk.ts';
export { computePerformanceForecast } from './performance-forecast.ts';

export type {
  Band,
  Insight,
  InsightFactor,
  AttendanceRecord,
  AttendanceRiskInput,
  PerformanceInput,
} from './types.ts';

export type { RawAttendanceSessionRecord } from './attendance-risk.ts';

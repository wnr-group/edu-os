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

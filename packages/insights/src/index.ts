/**
 * @eduos/insights - Insights & Interventions V1
 *
 * Pure functions for computing risk scores and performance forecasts
 */

export { computeAttendanceRisk } from './attendance-risk.ts';
export { computePerformanceForecast } from './performance-forecast.ts';

export type {
  Band,
  Insight,
  InsightFactor,
  AttendanceRecord,
  AttendanceRiskInput,
  PerformanceInput,
} from './types.ts';

/**
 * Shared types for Insights & Interventions V1
 */

export type Band = 'LOW' | 'MED' | 'HIGH';

export interface InsightFactor {
  key: string;              // machine key like "rate", "drop", "streak"
  label: string;            // human label like "72% present", "18% drop"
  value: number;            // numeric value
  contribution: number;     // contribution to final score (0..100)
}

export interface Insight {
  score: number;                      // 0..100
  band: Band;
  factors: InsightFactor[];           // mandatory, powers "why" UI
  recommended_action: string;         // from rule table
}

// Attendance Risk Types
export interface AttendanceRecord {
  date: Date;
  status: 'present' | 'absent' | 'excused';
}

export interface AttendanceRiskInput {
  records: AttendanceRecord[];  // last 30 school days
  window?: number;              // default 30
}

// Performance Forecast Types
export interface PerformanceInput {
  examScores: number[];         // percentages 0..100, chronological order
  passMarkCurrent?: number;     // default 35
  passMarkTarget?: number;      // default 50
}

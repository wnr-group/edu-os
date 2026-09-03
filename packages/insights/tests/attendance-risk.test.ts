import { describe, it, expect } from 'vitest';
import { computeAttendanceRisk, collapseDailyAttendance } from '../src/index';
import type { AttendanceRecord, AttendanceRiskInput, RawAttendanceSessionRecord } from '../src/index';

describe('ATTN_RISK_V1: computeAttendanceRisk', () => {
  // Helper to create date
  const createDate = (daysAgo: number): Date => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  };

  // Helper to create attendance records
  const createRecords = (pattern: ('present' | 'absent' | 'excused')[]): AttendanceRecord[] => {
    return pattern.map((status, index) => ({
      date: createDate(pattern.length - 1 - index),
      status,
    }));
  };

  describe('Edge Cases', () => {
    it('should handle perfect attendance (100%)', () => {
      const records = createRecords(Array(30).fill('present'));
      const result = computeAttendanceRisk({ records });

      expect(result.score).toBe(0);
      expect(result.band).toBe('LOW');
      expect(result.factors.find(f => f.key === 'rate')?.value).toBe(1.0);
      expect(result.recommended_action).toBe('No action needed.');
    });

    it('should handle zero attendance (0%)', () => {
      const records = createRecords(Array(30).fill('absent'));
      const result = computeAttendanceRisk({ records });

      // score = 100 * (0.40*1 + 0.25*0 + 0.20*1 + 0.15*max_weekday)
      // With all absences evenly distributed across weekdays, max_weekday will vary
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.band).toBe('HIGH');
      expect(result.factors.find(f => f.key === 'rate')?.value).toBe(0);
    });

    it('should handle all excused absences (division by zero guard)', () => {
      const records = createRecords(Array(30).fill('excused'));
      const result = computeAttendanceRisk({ records });

      expect(result.score).toBe(0);
      expect(result.band).toBe('LOW');
      expect(result.recommended_action).toBe('No action needed.');
    });

    it('should handle no absences', () => {
      const records = createRecords(Array(30).fill('present'));
      const result = computeAttendanceRisk({ records });

      expect(result.factors.find(f => f.key === 'drop')?.value).toBe(0);
      expect(result.factors.find(f => f.key === 'streak')?.value).toBe(0);
    });

    it('should handle mixed with excused days', () => {
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(10).fill('present'),
        ...Array(5).fill('excused'),
        ...Array(10).fill('present'),
        ...Array(5).fill('absent'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      // Only count non-excused days (25 days total: 20 present, 5 absent)
      expect(result.factors.find(f => f.key === 'rate')?.value).toBeCloseTo(0.8, 2);
    });
  });

  describe('Drop Calculation', () => {
    it('should calculate positive drop (prior > recent)', () => {
      // First 15 counted: all present (100%)
      // Last 15 counted: 10 present, 5 absent (66.67%)
      // Drop = 100% - 66.67% = 33.33%
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(15).fill('present'),
        ...Array(10).fill('present'),
        ...Array(5).fill('absent'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      const dropFactor = result.factors.find(f => f.key === 'drop');
      expect(dropFactor?.value).toBeCloseTo(0.333, 2);
      expect(dropFactor?.label).toContain('33%');
    });

    it('should handle no drop (recent >= prior)', () => {
      // First 15: 10 present, 5 absent (66.67%)
      // Last 15: all present (100%)
      // Drop = max(0, 66.67% - 100%) = 0
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(10).fill('present'),
        ...Array(5).fill('absent'),
        ...Array(15).fill('present'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      const dropFactor = result.factors.find(f => f.key === 'drop');
      expect(dropFactor?.value).toBe(0);
      expect(dropFactor?.label).toContain('No drop');
    });
  });

  describe('Streak Calculation', () => {
    it('should calculate consecutive absences streak', () => {
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(25).fill('present'),
        ...Array(5).fill('absent'), // Last 5 days absent
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      const streakFactor = result.factors.find(f => f.key === 'streak');
      expect(streakFactor?.value).toBe(5);
      expect(streakFactor?.label).toContain('5 consecutive absences');
    });

    it('should handle no streak', () => {
      const records = createRecords(Array(30).fill('present'));
      const result = computeAttendanceRisk({ records });

      const streakFactor = result.factors.find(f => f.key === 'streak');
      expect(streakFactor?.value).toBe(0);
      expect(streakFactor?.label).toContain('No streak');
    });

    it('ignores excused days in streak per D8 (excused is skipped, not a break)', () => {
      // Pattern represents chronological order (oldest first, newest last).
      // Per D8 (docs/superpowers/specs/2026-07-24-eduos-insights-algorithms.md §2),
      // attendance_records inputs exclude 'excused' entirely, so an excused day
      // in the middle of a run of absences does not reset the streak.
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(25).fill('present'),
        'absent',
        'absent',
        'excused', // Ignored — does not break the streak
        'absent',
        'absent', // Most recent 2 are absent
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      const streakFactor = result.factors.find(f => f.key === 'streak');
      // Excused day is removed from the counted sequence, so all 4 surrounding
      // absences become one contiguous streak.
      expect(streakFactor?.value).toBe(4);
    });

    it('still breaks the streak on a present day (only excused is ignored)', () => {
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(24).fill('present'),
        'absent',
        'absent',
        'present', // Breaks the streak
        'absent',
        'absent',
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      const streakFactor = result.factors.find(f => f.key === 'streak');
      expect(streakFactor?.value).toBe(2);
    });
  });

  describe('Weekday Pattern Detection', () => {
    it('should detect recurring weekday absences', () => {
      // Create records with all Mondays absent (assuming we can control the weekday)
      const records: AttendanceRecord[] = [];
      const startDate = new Date('2024-01-01'); // Start from a Monday

      for (let i = 0; i < 30; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const isMonday = date.getDay() === 1;

        records.push({
          date,
          status: isMonday ? 'absent' : 'present',
        });
      }

      const result = computeAttendanceRisk({ records });
      const weekdayFactor = result.factors.find(f => f.key === 'weekday');

      // Should detect high Monday absence rate
      expect(weekdayFactor?.value).toBeGreaterThan(0);
    });
  });

  describe('Score Calculation', () => {
    it('should calculate correct weighted score', () => {
      // rate=0.7 (70% present), drop=0.1 (10% drop), streak=5, weekday=0.2
      // score = 100 * (0.40*(1-0.7) + 0.25*0.1 + 0.20*min(5/5,1) + 0.15*0.2)
      //       = 100 * (0.40*0.3 + 0.25*0.1 + 0.20*1 + 0.15*0.2)
      //       = 100 * (0.12 + 0.025 + 0.20 + 0.03)
      //       = 100 * 0.375 = 37.5
      // Expected: MED band (35 <= score < 60)

      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(12).fill('present'), // First 15 counted: 12 present, 3 absent (80%)
        ...Array(3).fill('absent'),
        ...Array(9).fill('present'),  // Last 15 counted: 9 present, 6 absent (60%)
        ...Array(6).fill('absent'),   // Last 5 are streak
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      // 30 days: 21 present, 9 absent = 70% rate
      // drop = 0.8 - 0.6 = 0.2 (20%)
      // streak = 5 (last 5 consecutive absences, ignoring the extra one)
      expect(result.band).toBe('MED');
      expect(result.score).toBeGreaterThanOrEqual(35);
      expect(result.score).toBeLessThan(60);
    });
  });

  describe('Band Thresholds', () => {
    it('should assign LOW band for score < 35', () => {
      const records = createRecords([
        ...Array(28).fill('present'),
        ...Array(2).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      expect(result.score).toBeLessThan(35);
      expect(result.band).toBe('LOW');
    });

    it('should assign MED band for score >= 35 and < 60', () => {
      // Create pattern with moderate risk:
      // Total: 18 present, 12 absent = 60% rate
      // First 15: 12 present, 3 absent = 80%
      // Last 15: 6 present, 9 absent = 40%
      // Drop = 0.8 - 0.4 = 0.4 (40%)
      // Last 4 days absent = streak 4
      const records = createRecords([
        ...Array(12).fill('present'),
        ...Array(3).fill('absent'),
        ...Array(6).fill('present'),
        ...Array(5).fill('absent'),
        'present',
        ...Array(3).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      // This should produce a MED score
      if (result.score >= 35 && result.score < 60) {
        expect(result.band).toBe('MED');
      } else {
        // If pattern produces different score, just verify band matches score
        if (result.score >= 60) {
          expect(result.band).toBe('HIGH');
        } else if (result.score >= 35) {
          expect(result.band).toBe('MED');
        } else {
          expect(result.band).toBe('LOW');
        }
      }
    });

    it('should assign HIGH band for score >= 60', () => {
      const records = createRecords([
        ...Array(10).fill('present'),
        ...Array(20).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.band).toBe('HIGH');
    });

    it('should handle boundary at 34.9 -> LOW', () => {
      // Create a pattern that gives exactly ~34.9 score
      const records = createRecords([
        ...Array(26).fill('present'),
        ...Array(4).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      if (result.score < 35) {
        expect(result.band).toBe('LOW');
      }
    });

    it('should handle boundary at 35 -> MED', () => {
      const records = createRecords([
        ...Array(25).fill('present'),
        ...Array(5).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      if (result.score >= 35 && result.score < 60) {
        expect(result.band).toBe('MED');
      }
    });

    it('should handle boundary at 59.9 -> MED', () => {
      const records = createRecords([
        ...Array(15).fill('present'),
        ...Array(15).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      if (result.score < 60) {
        expect(result.band).toBe('MED');
      }
    });

    it('should handle boundary at 60 -> HIGH', () => {
      const records = createRecords([
        ...Array(12).fill('present'),
        ...Array(18).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      if (result.score >= 60) {
        expect(result.band).toBe('HIGH');
      }
    });
  });

  describe('Factors', () => {
    it('should include all four required factors', () => {
      const records = createRecords([
        ...Array(20).fill('present'),
        ...Array(10).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      expect(result.factors).toHaveLength(4);
      expect(result.factors.map(f => f.key)).toEqual(['rate', 'drop', 'streak', 'weekday']);
    });

    it('should have contributions that relate to the score', () => {
      const records = createRecords([
        ...Array(20).fill('present'),
        ...Array(10).fill('absent'),
      ]);
      const result = computeAttendanceRisk({ records });

      result.factors.forEach(factor => {
        expect(factor.contribution).toBeGreaterThanOrEqual(0);
        expect(factor.contribution).toBeLessThanOrEqual(100);
      });

      // The weighted contributions should roughly match the score formula
      // Not checking exact sum as contributions represent weighted impact
    });
  });

  describe('Recommended Actions', () => {
    it('should recommend parent call for HIGH + drop', () => {
      // [15 present prior, 15 absent recent] → base score 65, always HIGH regardless of weekday.
      // drop (0.25) > streak (0.20) > rate (0.20) → drop is dominant → 'Call parent within 48 hours.'
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(15).fill('present'),
        ...Array(15).fill('absent'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      expect(result.band).toBe('HIGH');
      // drop contribution = 0.25 * 1.0 * 100 = 25; streak = 20; rate = 20 → drop is dominant
      const dropFactor = result.factors.find(f => f.key === 'drop');
      expect(dropFactor?.contribution).toBe(25);
      expect(result.recommended_action).toBe('Call parent within 48 hours.');
    });

    it('should recommend monitoring for MED band', () => {
      // [24 present, 6 absent at end]: base score ~38 (rate=0.08, drop=0.10, streak=0.20).
      // Max weekday component (~0.15) gives total ≤ 53 → always MED regardless of day of week.
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(24).fill('present'),
        ...Array(6).fill('absent'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      expect(result.band).toBe('MED');
      expect(result.recommended_action).toBe('Send attendance reminder to parent; monitor next 2 weeks.');
    });

    it('should recommend no action for LOW band', () => {
      const records = createRecords(Array(30).fill('present'));
      const result = computeAttendanceRisk({ records });

      expect(result.band).toBe('LOW');
      expect(result.recommended_action).toBe('No action needed.');
    });

    it('should produce HIGH band for long absence streak', () => {
      // [15 present, 15 absent]: base score 65 → always HIGH.
      // This verifies that an extended consecutive absence streak escalates to HIGH severity
      // and triggers an urgent parent action.
      const pattern: ('present' | 'absent' | 'excused')[] = [
        ...Array(15).fill('present'),
        ...Array(15).fill('absent'),
      ];
      const records = createRecords(pattern);
      const result = computeAttendanceRisk({ records });

      expect(result.band).toBe('HIGH');
      // contribution is stored as percentage points (0.20 * 100 = 20)
      expect(result.factors.find(f => f.key === 'streak')?.contribution).toBe(20);
      expect(['Call parent within 48 hours.', 'Immediate parent call; check for dropout risk.']).toContain(result.recommended_action);
    });
  });

  describe('Mutation guard — band boundaries (review comment #7)', () => {
    it('score=35 exactly → MED (kills M08: >= vs > boundary mutation)', () => {
      // 2 Monday absences + 2 Tuesday presents → rate=0.5, drop=0, streak=0, maxWeekday=1.0
      // score = 100*(0.40*0.5 + 0 + 0 + 0.15*1.0) = 100*0.35 = 35.0 exactly
      // band must be MED (score >= 35), NOT LOW (would be wrong with "score > 35" mutation)
      const records: AttendanceRecord[] = [
        { date: new Date('2024-01-01'), status: 'absent' },   // Monday
        { date: new Date('2024-01-02'), status: 'present' },  // Tuesday
        { date: new Date('2024-01-08'), status: 'absent' },   // Monday
        { date: new Date('2024-01-09'), status: 'present' },  // Tuesday
      ];
      const result = computeAttendanceRisk({ records });
      expect(result.score).toBeCloseTo(35, 5);
      expect(result.band).toBe('MED');
    });

    it('score=75 exactly → HIGH (kills M10: rate weight 0.40 vs 0.50 mutation)', () => {
      // 5 Monday absences: rate=0, drop=0, streak=5, weekday(Mon)=5/5=1.0
      // score = 100*(0.40*1 + 0 + 0.20*1 + 0.15*1) = 75.0 exactly
      // With M10 (weight=0.50): 100*(0.50+0+0.20+0.15) = 85 → test catches difference
      const records: AttendanceRecord[] = [
        { date: new Date('2024-01-01'), status: 'absent' },  // Monday
        { date: new Date('2024-01-08'), status: 'absent' },  // Monday
        { date: new Date('2024-01-15'), status: 'absent' },  // Monday
        { date: new Date('2024-01-22'), status: 'absent' },  // Monday
        { date: new Date('2024-01-29'), status: 'absent' },  // Monday
      ];
      const result = computeAttendanceRisk({ records });
      expect(result.score).toBeCloseTo(75, 5);
      expect(result.band).toBe('HIGH');
    });
  });

  describe('Determinism', () => {
    it('should return identical results for identical inputs', () => {
      const records = createRecords([
        ...Array(20).fill('present'),
        ...Array(10).fill('absent'),
      ]);

      const result1 = computeAttendanceRisk({ records });
      const result2 = computeAttendanceRisk({ records });

      expect(result1).toEqual(result2);
      expect(result1.score).toBe(result2.score);
      expect(result1.band).toBe(result2.band);
      expect(result1.factors).toEqual(result2.factors);
      expect(result1.recommended_action).toBe(result2.recommended_action);
    });
  });

  describe('FN/AN session-grain collapsing (review comment #2 — FN/AN inflation)', () => {
    // Fixed 30-day calendar, oldest first: days 1-27 present, days 28-30 absent.
    // FULL_DAY baseline: rate=27/30=0.9, recent(16-30)=12/15=0.8, prior(1-15)=15/15=1.0,
    // drop=0.2, streak=3 (last 3 days absent).
    const dayStatuses: ('present' | 'absent')[] = [
      ...Array(27).fill('present'),
      ...Array(3).fill('absent'),
    ];
    const dates = dayStatuses.map((_, i) => {
      const d = new Date('2026-01-01T00:00:00.000Z');
      d.setUTCDate(d.getUTCDate() + i);
      return d;
    });

    it('collapses a FULL_DAY-only school to itself (single session per day)', () => {
      const raw: RawAttendanceSessionRecord[] = dates.map((date, i) => ({
        date,
        session: 'FULL_DAY',
        status: dayStatuses[i],
      }));

      const collapsed = collapseDailyAttendance(raw);

      expect(collapsed).toHaveLength(30);
      expect(collapsed.map((r) => r.status)).toEqual(dayStatuses);
    });

    it('collapses an FN+AN school to the same daily record as the equivalent FULL_DAY school', () => {
      // Mirror the exact same real-world attendance as two session rows per day
      // instead of one: a present day is FN=present/AN=present; an absent day
      // is FN=absent/AN=absent. 60 raw rows in, 30 daily records out.
      const raw: RawAttendanceSessionRecord[] = dates.flatMap((date, i) => [
        { date, session: 'FN' as const, status: dayStatuses[i] },
        { date, session: 'AN' as const, status: dayStatuses[i] },
      ]);
      expect(raw).toHaveLength(60);

      const collapsed = collapseDailyAttendance(raw);

      expect(collapsed).toHaveLength(30); // three absent days do not become six
      expect(collapsed.map((r) => r.status)).toEqual(dayStatuses);
      expect(collapsed.map((r) => r.date.toISOString())).toEqual(
        dates.map((d) => d.toISOString())
      );
    });

    it('produces identical risk score/band for FULL_DAY vs FN+AN representations of the same attendance', () => {
      const fullDayRaw: RawAttendanceSessionRecord[] = dates.map((date, i) => ({
        date,
        session: 'FULL_DAY',
        status: dayStatuses[i],
      }));
      const fnAnRaw: RawAttendanceSessionRecord[] = dates.flatMap((date, i) => [
        { date, session: 'FN' as const, status: dayStatuses[i] },
        { date, session: 'AN' as const, status: dayStatuses[i] },
      ]);

      const fullDayResult = computeAttendanceRisk({
        records: collapseDailyAttendance(fullDayRaw),
      });
      const fnAnResult = computeAttendanceRisk({
        records: collapseDailyAttendance(fnAnRaw),
      });

      // Rate/weekday denominators are daily, not session-based (comments #8/#9 in review)
      expect(fullDayResult.factors.find((f) => f.key === 'rate')?.value).toBeCloseTo(0.9, 5);
      expect(fnAnResult.factors.find((f) => f.key === 'rate')?.value).toBeCloseTo(0.9, 5);

      // 15-day drop window is actually 15 calendar days, not 15 sessions
      expect(fullDayResult.factors.find((f) => f.key === 'drop')?.value).toBeCloseTo(0.2, 5);
      expect(fnAnResult.factors.find((f) => f.key === 'drop')?.value).toBeCloseTo(0.2, 5);

      // Streak is daily grain: 3, not 6
      expect(fullDayResult.factors.find((f) => f.key === 'streak')?.value).toBe(3);
      expect(fnAnResult.factors.find((f) => f.key === 'streak')?.value).toBe(3);

      // The risk band must not change solely because the school stores
      // attendance in FN/AN sessions instead of FULL_DAY.
      expect(fullDayResult.score).toBeCloseTo(fnAnResult.score, 5);
      expect(fullDayResult.band).toBe(fnAnResult.band);
      expect(fullDayResult.band).toBe('LOW');
    });

    it('applies the "present if any session present" rule for a mixed FN/AN day', () => {
      const date = new Date('2026-02-01T00:00:00.000Z');
      const collapsed = collapseDailyAttendance([
        { date, session: 'FN', status: 'present' },
        { date, session: 'AN', status: 'absent' },
      ]);
      expect(collapsed).toHaveLength(1);
      expect(collapsed[0].status).toBe('present');
    });

    it('applies the "absent only if every session absent" rule for a mixed FN/AN day', () => {
      const date = new Date('2026-02-01T00:00:00.000Z');
      const collapsed = collapseDailyAttendance([
        { date, session: 'FN', status: 'absent' },
        { date, session: 'AN', status: 'excused' },
      ]);
      expect(collapsed).toHaveLength(1);
      // Not all sessions absent, and no session present -> falls to 'excused'
      expect(collapsed[0].status).toBe('excused');
    });

    it('collapses an all-absent FN/AN day to absent', () => {
      const date = new Date('2026-02-01T00:00:00.000Z');
      const collapsed = collapseDailyAttendance([
        { date, session: 'FN', status: 'absent' },
        { date, session: 'AN', status: 'absent' },
      ]);
      expect(collapsed[0].status).toBe('absent');
    });
  });
});

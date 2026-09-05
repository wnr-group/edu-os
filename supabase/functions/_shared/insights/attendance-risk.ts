import type { AttendanceRecord, AttendanceRiskInput, Insight, InsightFactor, Band } from './types.ts';

/**
 * Raw per-session attendance row as stored in `attendance_records`.
 * A student-day is represented either by one FULL_DAY row, or by up to two
 * rows (FN and/or AN) — never mixed (enforced by the marking UI).
 */
export interface RawAttendanceSessionRecord {
  date: Date;
  session: 'FULL_DAY' | 'FN' | 'AN';
  status: 'present' | 'absent' | 'excused';
}

/**
 * Collapse session-grain attendance rows (FULL_DAY / FN / AN) into one
 * day-grain AttendanceRecord per date, so ATTN_RISK_V1 — which is specified
 * at day grain — scores FN+AN schools identically to FULL_DAY schools for
 * equivalent real-world attendance.
 *
 * Rule (documented product decision — no prior FN/AN aggregation existed
 * elsewhere in the codebase to follow, so this is the explicit choice made
 * here, matching the day-status precedence used for review comment #2):
 *   1. Any session 'present'        -> day is 'present'
 *   2. Else every session 'absent'  -> day is 'absent'
 *   3. Otherwise (all/partial excused, no present, not all absent)
 *                                    -> day is 'excused'
 * A FULL_DAY row is a single-session day and collapses to its own status
 * under the same rule, so FULL_DAY and FN/AN schools share one code path.
 */
export function collapseDailyAttendance(
  sessionRecords: RawAttendanceSessionRecord[]
): AttendanceRecord[] {
  const byDate = new Map<string, RawAttendanceSessionRecord[]>();
  for (const r of sessionRecords) {
    const key = r.date.toISOString().split('T')[0];
    const list = byDate.get(key);
    if (list) {
      list.push(r);
    } else {
      byDate.set(key, [r]);
    }
  }

  const daily: AttendanceRecord[] = [];
  for (const sessions of byDate.values()) {
    let status: 'present' | 'absent' | 'excused';
    if (sessions.some((s) => s.status === 'present')) {
      status = 'present';
    } else if (sessions.every((s) => s.status === 'absent')) {
      status = 'absent';
    } else {
      status = 'excused';
    }
    daily.push({ date: sessions[0].date, status });
  }

  daily.sort((a, b) => a.date.getTime() - b.date.getTime());
  return daily;
}

/**
 * ATTN_RISK_V1: Compute attendance risk score based on 30-day window
 *
 * Algorithm (from spec §2):
 * - counted_days = records where status != 'excused'
 * - rate = present_days / counted_days
 * - recent = rate over last 15 counted days
 * - prior = rate over the 15 counted days before that
 * - drop = max(0, prior - recent)
 * - streak = current consecutive unexcused absences
 * - weekday = max over weekday W of (absences_on_W / occurrences_of_W)
 * - score = 100 * (0.40*(1-rate) + 0.25*drop + 0.20*min(streak/5,1) + 0.15*weekday)
 * - band = HIGH if score>=60; MED if 35<=score<60; LOW if score<35
 */
export function computeAttendanceRisk(input: AttendanceRiskInput): Insight {
  const { records } = input;

  // Filter out excused absences for counting
  const countedRecords = records.filter(r => r.status !== 'excused');

  // Guard against division by zero
  if (countedRecords.length === 0) {
    return {
      score: 0,
      band: 'LOW',
      factors: [
        { key: 'rate', label: '100% present', value: 1.0, contribution: 0 },
        { key: 'drop', label: 'No drop', value: 0, contribution: 0 },
        { key: 'streak', label: 'No streak', value: 0, contribution: 0 },
        { key: 'weekday', label: 'No pattern', value: 0, contribution: 0 },
      ],
      recommended_action: 'No action needed.',
    };
  }

  // Calculate overall attendance rate
  const presentDays = countedRecords.filter(r => r.status === 'present').length;
  const rate = presentDays / countedRecords.length;

  // Calculate recent and prior rates (15 counted days each)
  const last15 = countedRecords.slice(-15);
  const prior15 = countedRecords.slice(-30, -15);

  const recentRate = last15.length > 0
    ? last15.filter(r => r.status === 'present').length / last15.length
    : rate;
  const priorRate = prior15.length > 0
    ? prior15.filter(r => r.status === 'present').length / prior15.length
    : rate;

  // Calculate drop (max of 0 or prior - recent)
  const drop = Math.max(0, priorRate - recentRate);

  // Calculate current consecutive unexcused absences streak
  // Per D8, 'excused' records are excluded from the engine's inputs entirely, so
  // they are skipped (not counted, not a break) when scanning backwards. Only
  // 'present' breaks the streak.
  let streak = 0;
  for (let i = countedRecords.length - 1; i >= 0; i--) {
    if (countedRecords[i].status === 'absent') {
      streak++;
    } else {
      break; // 'present' breaks the streak; 'excused' was already filtered out
    }
  }

  // Calculate weekday pattern (max absence rate for any weekday)
  const weekdayAbsences: { [key: number]: number } = {};
  const weekdayOccurrences: { [key: number]: number } = {};
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  countedRecords.forEach(record => {
    const dayOfWeek = record.date.getDay();
    weekdayOccurrences[dayOfWeek] = (weekdayOccurrences[dayOfWeek] || 0) + 1;
    if (record.status === 'absent') {
      weekdayAbsences[dayOfWeek] = (weekdayAbsences[dayOfWeek] || 0) + 1;
    }
  });

  let maxWeekdayRate = 0;
  let maxWeekdayName = 'No pattern';
  let maxWeekdayAbsences = 0;

  Object.keys(weekdayOccurrences).forEach(dayStr => {
    const day = parseInt(dayStr);
    const absences = weekdayAbsences[day] || 0;
    const occurrences = weekdayOccurrences[day];
    const weekdayRate = absences / occurrences;

    if (weekdayRate > maxWeekdayRate) {
      maxWeekdayRate = weekdayRate;
      maxWeekdayName = weekdayNames[day];
      maxWeekdayAbsences = absences;
    }
  });

  // Calculate score using weighted formula
  // score = 100 * (0.40*(1-rate) + 0.25*drop + 0.20*min(streak/5,1) + 0.15*weekday)
  const rateComponent = 0.40 * (1 - rate);
  const dropComponent = 0.25 * drop;
  const streakComponent = 0.20 * Math.min(streak / 5, 1);
  const weekdayComponent = 0.15 * maxWeekdayRate;

  const score = 100 * (rateComponent + dropComponent + streakComponent + weekdayComponent);

  // Determine band
  let band: Band;
  if (score >= 60) {
    band = 'HIGH';
  } else if (score >= 35) {
    band = 'MED';
  } else {
    band = 'LOW';
  }

  // Build factors with contributions
  const factors: InsightFactor[] = [
    {
      key: 'rate',
      label: `${Math.round(rate * 100)}% present`,
      value: rate,
      contribution: rateComponent * 100,
    },
    {
      key: 'drop',
      label: drop > 0 ? `${Math.round(drop * 100)}% attendance drop` : 'No drop',
      value: drop,
      contribution: dropComponent * 100,
    },
    {
      key: 'streak',
      label: streak > 0 ? `${streak} consecutive absences` : 'No streak',
      value: streak,
      contribution: streakComponent * 100,
    },
    {
      key: 'weekday',
      label: maxWeekdayRate > 0 ? `Missed ${maxWeekdayAbsences} ${maxWeekdayName}s` : 'No pattern',
      value: maxWeekdayRate,
      contribution: weekdayComponent * 100,
    },
  ];

  // Determine recommended action based on band and dominant factor
  const dominantFactor = factors.reduce((max, f) =>
    f.contribution > max.contribution ? f : max
  );

  let recommended_action: string;

  if (band === 'LOW') {
    recommended_action = 'No action needed.';
  } else if (band === 'MED') {
    recommended_action = 'Send attendance reminder to parent; monitor next 2 weeks.';
  } else {
    // HIGH band - choose action based on dominant factor
    if (dominantFactor.key === 'drop') {
      recommended_action = 'Call parent within 48 hours.';
    } else if (dominantFactor.key === 'weekday') {
      recommended_action = `Discuss recurring ${maxWeekdayName} absence with parent.`;
    } else if (dominantFactor.key === 'streak') {
      recommended_action = 'Immediate parent call; check for dropout risk.';
    } else {
      // Default HIGH action (rate-driven)
      recommended_action = 'Call parent within 48 hours.';
    }
  }

  return {
    score,
    band,
    factors,
    recommended_action,
  };
}

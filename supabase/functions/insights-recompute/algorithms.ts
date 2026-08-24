/**
 * Insights & Interventions V1 Algorithms for Edge Function Runtime
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

export interface AttendanceRecord {
  date: Date;
  status: 'present' | 'absent' | 'excused';
}

export interface AttendanceRiskInput {
  records: AttendanceRecord[];
  window?: number;
}

export interface PerformanceInput {
  examScores: number[];
  passMarkCurrent?: number;
  passMarkTarget?: number;
}

/**
 * ATTN_RISK_V1: Compute attendance risk score based on 30-day window
 */
export function computeAttendanceRisk(input: AttendanceRiskInput): Insight {
  const { records } = input;
  const countedRecords = records.filter(r => r.status !== 'excused');

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

  const presentDays = countedRecords.filter(r => r.status === 'present').length;
  const rate = presentDays / countedRecords.length;

  const last15 = countedRecords.slice(-15);
  const prior15 = countedRecords.slice(-30, -15);

  const recentRate = last15.length > 0
    ? last15.filter(r => r.status === 'present').length / last15.length
    : rate;
  const priorRate = prior15.length > 0
    ? prior15.filter(r => r.status === 'present').length / prior15.length
    : rate;

  const drop = Math.max(0, priorRate - recentRate);

  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === 'absent') {
      streak++;
    } else {
      break;
    }
  }

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

  const rateComponent = 0.40 * (1 - rate);
  const dropComponent = 0.25 * drop;
  const streakComponent = 0.20 * Math.min(streak / 5, 1);
  const weekdayComponent = 0.15 * maxWeekdayRate;

  const rawScore = 100 * (rateComponent + dropComponent + streakComponent + weekdayComponent);
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  let band: Band;
  if (score >= 60) {
    band = 'HIGH';
  } else if (score >= 35) {
    band = 'MED';
  } else {
    band = 'LOW';
  }

  const factors: InsightFactor[] = [
    {
      key: 'rate',
      label: `${Math.round(rate * 100)}% present (${presentDays}/${countedRecords.length} days)`,
      value: rate,
      contribution: Math.round(100 * rateComponent),
    },
    {
      key: 'drop',
      label: drop > 0 ? `${Math.round(drop * 100)}% drop vs prior period` : 'No drop',
      value: drop,
      contribution: Math.round(100 * dropComponent),
    },
    {
      key: 'streak',
      label: streak > 0 ? `${streak} consecutive days absent` : 'No streak',
      value: streak,
      contribution: Math.round(100 * streakComponent),
    },
    {
      key: 'weekday',
      label: maxWeekdayRate > 0 ? `${maxWeekdayName} (${Math.round(maxWeekdayRate * 100)}% absent, ${maxWeekdayAbsences} days)` : 'No weekday pattern',
      value: maxWeekdayRate,
      contribution: Math.round(100 * weekdayComponent),
    },
  ];

  let recommended_action: string;
  if (streak >= 3) {
    recommended_action = 'Call parent to discuss consecutive absences';
  } else if (drop >= 0.15) {
    recommended_action = 'Check in with student regarding recent attendance drop';
  } else if (maxWeekdayRate >= 0.50 && maxWeekdayAbsences >= 2) {
    recommended_action = `Review attendance pattern on ${maxWeekdayName}s`;
  } else if (rate < 0.75) {
    recommended_action = 'Schedule parent meeting to address low attendance';
  } else {
    recommended_action = 'Monitor attendance pattern';
  }

  return {
    score,
    band,
    factors,
    recommended_action,
  };
}

/**
 * PERF_V1: Compute performance forecast score based on chronological exam scores
 */
export function computePerformanceForecast(input: PerformanceInput): Insight {
  const { examScores, passMarkCurrent = 35, passMarkTarget = 50 } = input;

  if (examScores.length === 0) {
    return {
      score: 0,
      band: 'LOW',
      factors: [
        { key: 'insufficient_data', label: 'No exam scores recorded', value: 0, contribution: 0 },
      ],
      recommended_action: 'Record exam scores to enable performance tracking',
    };
  }

  if (examScores.length < 3) {
    const avg = examScores.reduce((sum, score) => sum + score, 0) / examScores.length;
    let band: Band;
    let score: number;

    if (avg < passMarkCurrent) {
      band = 'HIGH';
      score = 75;
    } else if (avg < passMarkTarget) {
      band = 'MED';
      score = 45;
    } else {
      band = 'LOW';
      score = 20;
    }

    return {
      score,
      band,
      factors: [
        {
          key: 'average',
          label: `Average score: ${Math.round(avg)}% (${examScores.length} exam${examScores.length > 1 ? 's' : ''})`,
          value: avg,
          contribution: score,
        },
      ],
      recommended_action: avg < passMarkCurrent
        ? 'Schedule academic review session'
        : 'Monitor ongoing exam performance',
    };
  }

  const n = examScores.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = examScores[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const projectedScore = intercept + slope * (n + 1);

  const mean = sumY / n;
  const variance = examScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const latestScore = examScores[n - 1];

  let rawScore = 0;
  let gapComponent = 0;
  let trendComponent = 0;
  let volatilityComponent = 0;
  let failComponent = 0;

  if (projectedScore < passMarkCurrent) {
    const gap = passMarkCurrent - projectedScore;
    gapComponent = Math.min(40, (gap / passMarkCurrent) * 40);
    rawScore += gapComponent;
  } else if (projectedScore < passMarkTarget) {
    const gap = passMarkTarget - projectedScore;
    gapComponent = Math.min(25, (gap / (passMarkTarget - passMarkCurrent)) * 25);
    rawScore += gapComponent;
  }

  if (slope < 0) {
    trendComponent = Math.min(30, Math.abs(slope) * 5);
    rawScore += trendComponent;
  }

  if (stdDev > 15) {
    volatilityComponent = Math.min(15, ((stdDev - 15) / 15) * 15);
    rawScore += volatilityComponent;
  }

  if (latestScore < passMarkCurrent) {
    failComponent = 15;
    rawScore += failComponent;
  }

  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  let band: Band;
  if (score >= 60) {
    band = 'HIGH';
  } else if (score >= 35) {
    band = 'MED';
  } else {
    band = 'LOW';
  }

  const factors: InsightFactor[] = [
    {
      key: 'projected_score',
      label: `Projected next score: ${Math.round(projectedScore)}%`,
      value: projectedScore,
      contribution: Math.round(gapComponent),
    },
    {
      key: 'trend',
      label: slope < 0 ? `Declining trend (${slope.toFixed(1)}% per exam)` : `Improving/stable trend (+${slope.toFixed(1)}%)`,
      value: slope,
      contribution: Math.round(trendComponent),
    },
    {
      key: 'volatility',
      label: stdDev > 15 ? `High score volatility (std dev ${Math.round(stdDev)})` : 'Stable scores',
      value: stdDev,
      contribution: Math.round(volatilityComponent),
    },
    {
      key: 'latest_score',
      label: `Latest exam score: ${Math.round(latestScore)}%`,
      value: latestScore,
      contribution: Math.round(failComponent),
    },
  ];

  let recommended_action: string;
  if (projectedScore < passMarkCurrent && slope < -2) {
    recommended_action = 'Assign dedicated academic tutor and parent conference';
  } else if (projectedScore < passMarkCurrent) {
    recommended_action = 'Schedule subject revision classes';
  } else if (slope < 0) {
    recommended_action = 'Monitor declining subject trend in next assessment';
  } else {
    recommended_action = 'Continue regular curriculum progression';
  }

  return {
    score,
    band,
    factors,
    recommended_action,
  };
}

import type { PerformanceInput, Insight, InsightFactor, Band } from './types';

/**
 * PERF_V1: Compute performance forecast based on exam score trend
 *
 * Algorithm (from spec §3):
 * - Requires n >= 3 exams; else return label "Insufficient data"
 * - avg = mean(examScores)
 * - slope = least-squares slope over index 1..n
 * - vol = stddev(examScores)
 * - pred = clamp(examScores[n] + slope, 0, 100)
 * - label = "High risk" if pred < passMarkCurrent OR slope < -8
 *         = "Likely to improve" if slope > +5
 *         = "Stable" otherwise
 */
export function computePerformanceForecast(input: PerformanceInput): Insight {
  const {
    examScores,
    passMarkCurrent = 35,
    passMarkTarget = 50,
  } = input;

  // Require at least 3 exams
  if (examScores.length < 3) {
    return {
      score: 0,
      band: 'MED',
      factors: [
        { key: 'avg', label: 'Average: N/A', value: 0, contribution: 0 },
        { key: 'slope', label: 'Trend: N/A', value: 0, contribution: 0 },
        { key: 'vol', label: 'Consistency: N/A', value: 0, contribution: 0 },
        { key: 'pred', label: 'Forecast: N/A', value: 0, contribution: 0 },
      ],
      recommended_action: 'Insufficient data for forecast.',
    };
  }

  // Calculate average
  const avg = examScores.reduce((sum, score) => sum + score, 0) / examScores.length;

  // Calculate least-squares slope
  // slope = Σ((x_i - x_mean) * (y_i - y_mean)) / Σ((x_i - x_mean)^2)
  // where x_i is index (0, 1, 2, ..., n-1) and y_i is exam score
  const n = examScores.length;
  const xMean = (n - 1) / 2; // Mean of indices 0, 1, 2, ..., n-1

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = i - xMean;
    const yDiff = examScores[i] - avg;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Calculate standard deviation
  const variance = examScores.reduce((sum, score) => {
    const diff = score - avg;
    return sum + diff * diff;
  }, 0) / n;
  const vol = Math.sqrt(variance);

  // Calculate prediction (next exam forecast)
  const lastScore = examScores[n - 1];
  const rawPred = lastScore + slope;
  const pred = Math.max(0, Math.min(100, rawPred)); // Clamp to [0, 100]

  // Determine label and band
  let label: string;
  let band: Band;

  if (pred < passMarkCurrent || slope < -8) {
    label = 'High risk';
    band = 'HIGH';
  } else if (slope > 5) {
    label = 'Likely to improve';
    band = 'LOW';
  } else {
    label = 'Stable';
    band = 'MED';
  }

  // Build factors
  // For performance forecast, we don't have explicit weights, so contributions
  // are based on relative importance: pred is most important, slope second, etc.
  const factors: InsightFactor[] = [
    {
      key: 'avg',
      label: `Average: ${Math.round(avg)}%`,
      value: avg,
      contribution: 15, // Informational
    },
    {
      key: 'slope',
      label: `Trend: ${slope >= 0 ? '+' : ''}${slope.toFixed(1)}% per exam`,
      value: slope,
      contribution: 30, // Important for label determination
    },
    {
      key: 'vol',
      label: `Consistency: stddev ${Math.round(vol)}%`,
      value: vol,
      contribution: 10, // Informational
    },
    {
      key: 'pred',
      label: `Forecast: ${Math.round(pred)}%`,
      value: pred,
      contribution: 45, // Most important for label determination
    },
  ];

  // Determine recommended action
  let recommended_action: string;

  if (label === 'High risk') {
    const gap = passMarkTarget - pred;
    const remedial = Math.ceil(gap / 5);
    // Note: subject is not provided in input, use placeholder
    recommended_action = `Conduct ${remedial} remedial classes in subject.`;
  } else if (label === 'Likely to improve') {
    recommended_action = 'Continue current trajectory; monitor progress.';
  } else {
    // Stable
    recommended_action = 'Maintain current study approach; monitor next exam.';
  }

  // Score is based on the prediction relative to pass marks
  // Not explicitly defined in spec, so we'll use a simple mapping
  const score = band === 'HIGH' ? 70 : band === 'MED' ? 40 : 20;

  return {
    score,
    band,
    factors,
    recommended_action,
  };
}

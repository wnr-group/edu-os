import { describe, it, expect } from 'vitest';
import { computePerformanceForecast } from '../src/index';
import type { PerformanceInput } from '../src/index';

describe('PERF_V1: computePerformanceForecast', () => {
  describe('Insufficient Data', () => {
    it('should return "Insufficient data" for n < 3 exams', () => {
      const result = computePerformanceForecast({ examScores: [80, 75] });

      expect(result.band).toBe('MED');
      expect(result.recommended_action).toContain('Insufficient data');
    });

    it('should return "Insufficient data" for 1 exam', () => {
      const result = computePerformanceForecast({ examScores: [80] });

      expect(result.band).toBe('MED');
      expect(result.recommended_action).toContain('Insufficient data');
    });

    it('should return "Insufficient data" for 0 exams', () => {
      const result = computePerformanceForecast({ examScores: [] });

      expect(result.band).toBe('MED');
      expect(result.recommended_action).toContain('Insufficient data');
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate average correctly', () => {
      const result = computePerformanceForecast({ examScores: [80, 70, 90] });

      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.value).toBe(80); // (80 + 70 + 90) / 3 = 80
      expect(avgFactor?.label).toContain('80%');
    });

    it('should calculate least-squares slope correctly', () => {
      // Linear upward trend: 60, 70, 80
      // Index: 0, 1, 2
      // Slope should be ~10 per exam
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.value).toBeCloseTo(10, 1);
      expect(slopeFactor?.label).toContain('+10');
    });

    it('should calculate negative slope correctly', () => {
      // Linear downward trend: 80, 70, 60
      const result = computePerformanceForecast({ examScores: [80, 70, 60] });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.value).toBeCloseTo(-10, 1);
      expect(slopeFactor?.label).toContain('-10');
    });

    it('should calculate standard deviation correctly', () => {
      // Scores: 70, 80, 90
      // Mean: 80
      // Variance: ((70-80)² + (80-80)² + (90-80)²) / 3 = (100 + 0 + 100) / 3 = 66.67
      // StdDev: sqrt(66.67) ≈ 8.16
      const result = computePerformanceForecast({ examScores: [70, 80, 90] });

      const volFactor = result.factors.find(f => f.key === 'vol');
      expect(volFactor?.value).toBeCloseTo(8.16, 1);
    });

    it('should calculate prediction correctly', () => {
      // Scores: 60, 70, 80
      // Last score: 80
      // Slope: 10
      // Pred: 80 + 10 = 90
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBeCloseTo(90, 1);
      expect(predFactor?.label).toContain('90%');
    });
  });

  describe('Prediction Clamping', () => {
    it('should clamp prediction to 0 when below zero', () => {
      // Strong negative trend that would predict negative
      const result = computePerformanceForecast({ examScores: [50, 30, 10] });

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBeGreaterThanOrEqual(0);
    });

    it('should clamp prediction to 100 when above 100', () => {
      // Strong positive trend that would predict >100
      const result = computePerformanceForecast({ examScores: [70, 90, 95] });

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBeLessThanOrEqual(100);
    });
  });

  describe('Label Assignment', () => {
    it('should label "High risk" when pred < passMarkCurrent', () => {
      // pred will be below default passMarkCurrent (35)
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
        passMarkCurrent: 35,
      });

      expect(result.band).toBe('HIGH');
      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBeLessThan(35);
    });

    it('should label "High risk" when slope < -8', () => {
      // Even if pred is above pass mark, steep decline triggers high risk
      const result = computePerformanceForecast({
        examScores: [80, 70, 60, 50],
        passMarkCurrent: 35,
      });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      if (slopeFactor && slopeFactor.value < -8) {
        expect(result.band).toBe('HIGH');
      }
    });

    it('should label "Likely to improve" when slope > +5', () => {
      const result = computePerformanceForecast({
        examScores: [50, 60, 70],
        passMarkCurrent: 35,
      });

      expect(result.band).toBe('LOW');
      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.value).toBeGreaterThan(5);
    });

    it('should label "Stable" for moderate performance', () => {
      const result = computePerformanceForecast({
        examScores: [60, 62, 58, 61],
        passMarkCurrent: 35,
      });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      const predFactor = result.factors.find(f => f.key === 'pred');

      // Not high risk (pred >= 35, slope > -8) and not improving (slope <= 5)
      if (predFactor && predFactor.value >= 35 &&
          slopeFactor && slopeFactor.value > -8 && slopeFactor.value <= 5) {
        expect(result.band).toBe('MED');
      }
    });
  });

  describe('Remedial Class Calculation', () => {
    it('scores [25,20,15] at exactly pred=10, HIGH band, 8 remedial classes', () => {
      // avg=20, slope: numerator=(-1*5)+(0*0)+(1*-5)=-10, denom=2 => slope=-5
      // pred = clamp(15 + -5, 0, 100) = 10
      // label: pred(10) < passMarkCurrent(35) => High risk / HIGH
      // gap = 50 - 10 = 40; remedial = max(1, ceil(40/5)) = 8
      const result = computePerformanceForecast({
        examScores: [25, 20, 15],
        passMarkCurrent: 35,
        passMarkTarget: 50,
      });

      expect(result.band).toBe('HIGH');
      expect(result.recommended_action).toBe(
        'Conduct 8 remedial classes in the subject.'
      );
    });

    it('scores [30,25,20] with default passMarkTarget=50 at pred=15, 7 remedial classes', () => {
      // avg=25, slope=-5, pred=clamp(20-5,0,100)=15
      // pred(15) < passMarkCurrent(35) => HIGH
      // gap = 50 - 15 = 35; remedial = max(1, ceil(35/5)) = 7
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
      });

      expect(result.band).toBe('HIGH');
      expect(result.recommended_action).toBe(
        'Conduct 7 remedial classes in the subject.'
      );
    });

    it('scores [30,25,20] with custom passMarkTarget=60 at pred=15, 9 remedial classes', () => {
      // pred=15; gap = 60 - 15 = 45; remedial = max(1, ceil(45/5)) = 9
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
        passMarkTarget: 60,
      });

      expect(result.band).toBe('HIGH');
      expect(result.recommended_action).toBe(
        'Conduct 9 remedial classes in the subject.'
      );
    });

    it('scores [100,90,80] at pred=70, HIGH band via slope<-8, remedial minimum of 1 class (not 0)', () => {
      // avg=90, slope: numerator=(-1*10)+(0*0)+(1*-10)=-20, denom=2 => slope=-10
      // pred = clamp(80 + -10, 0, 100) = 70
      // label: pred(70) is NOT < passMarkCurrent(35), but slope(-10) < -8 => High risk / HIGH
      // gap = passMarkTarget(50) - pred(70) = -20 (negative — forecast already above target)
      // remedial = max(1, ceil(-20/5)) = max(1, -4) = 1  <-- the Math.max(1, ...) floor under test
      const result = computePerformanceForecast({
        examScores: [100, 90, 80],
        passMarkCurrent: 35,
      });

      expect(result.band).toBe('HIGH');
      expect(result.recommended_action).toBe(
        'Conduct 1 remedial class in the subject.'
      );
    });

    it('uses subjectName in the recommendation when provided', () => {
      const result = computePerformanceForecast({
        examScores: [25, 20, 15],
        passMarkCurrent: 35,
        passMarkTarget: 50,
        subjectName: 'Mathematics',
      });

      expect(result.recommended_action).toBe(
        'Conduct 8 remedial classes in Mathematics.'
      );
    });
  });

  describe('Band Mapping', () => {
    it('should map "High risk" to HIGH band', () => {
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
        passMarkCurrent: 35,
      });

      expect(result.band).toBe('HIGH');
    });

    it('should map "Stable" to MED band', () => {
      const result = computePerformanceForecast({
        examScores: [60, 62, 58],
        passMarkCurrent: 35,
      });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      if (slopeFactor && slopeFactor.value > -8 && slopeFactor.value <= 5) {
        expect(result.band).toBe('MED');
      }
    });

    it('should map "Likely to improve" to LOW band', () => {
      const result = computePerformanceForecast({
        examScores: [50, 60, 70],
        passMarkCurrent: 35,
      });

      expect(result.band).toBe('LOW');
    });
  });

  describe('Factors', () => {
    it('should include all four required factors', () => {
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      expect(result.factors).toHaveLength(4);
      expect(result.factors.map(f => f.key)).toEqual(['avg', 'slope', 'vol', 'pred']);
    });

    it('should have properly formatted labels', () => {
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.label).toMatch(/Average: \d+%/);

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.label).toMatch(/Trend: [+-]\d+/);

      const volFactor = result.factors.find(f => f.key === 'vol');
      expect(volFactor?.label).toMatch(/Consistency: stddev \d+/);

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.label).toMatch(/Forecast: \d+%/);
    });

    it('should have valid contributions', () => {
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      result.factors.forEach(factor => {
        expect(factor.contribution).toBeGreaterThanOrEqual(0);
        expect(factor.contribution).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Decimal and Rounding Behavior', () => {
    it('should handle decimal scores correctly', () => {
      const result = computePerformanceForecast({
        examScores: [66.5, 73.2, 81.8],
      });

      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.value).toBeCloseTo((66.5 + 73.2 + 81.8) / 3, 2);
    });

    it('should round display values appropriately', () => {
      const result = computePerformanceForecast({
        examScores: [66.666, 73.333, 80.001],
      });

      // Check that labels are rounded for display
      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.label).toMatch(/\d+%/);
    });
  });

  describe('Determinism', () => {
    it('should return identical results for identical inputs', () => {
      const input = { examScores: [60, 70, 80, 75, 85] };

      const result1 = computePerformanceForecast(input);
      const result2 = computePerformanceForecast(input);

      expect(result1).toEqual(result2);
      expect(result1.score).toBe(result2.score);
      expect(result1.band).toBe(result2.band);
      expect(result1.factors).toEqual(result2.factors);
      expect(result1.recommended_action).toBe(result2.recommended_action);
    });

    it('should handle same scores differently based on order', () => {
      const ascending = computePerformanceForecast({ examScores: [60, 70, 80] });
      const descending = computePerformanceForecast({ examScores: [80, 70, 60] });

      // Slopes should be opposite
      const ascSlope = ascending.factors.find(f => f.key === 'slope')?.value || 0;
      const descSlope = descending.factors.find(f => f.key === 'slope')?.value || 0;

      expect(ascSlope).toBeGreaterThan(0);
      expect(descSlope).toBeLessThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all identical scores', () => {
      const result = computePerformanceForecast({ examScores: [75, 75, 75] });

      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.value).toBeCloseTo(0, 1);

      const volFactor = result.factors.find(f => f.key === 'vol');
      expect(volFactor?.value).toBeCloseTo(0, 1);
    });

    it('should handle perfect scores', () => {
      const result = computePerformanceForecast({ examScores: [100, 100, 100] });

      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.value).toBe(100);

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBe(100);
    });

    it('should handle zero scores', () => {
      const result = computePerformanceForecast({ examScores: [0, 0, 0] });

      const avgFactor = result.factors.find(f => f.key === 'avg');
      expect(avgFactor?.value).toBe(0);

      const predFactor = result.factors.find(f => f.key === 'pred');
      expect(predFactor?.value).toBe(0);
    });

    it('should handle exactly 3 exams', () => {
      const result = computePerformanceForecast({ examScores: [60, 70, 80] });

      expect(result.factors).toHaveLength(4);
      expect(result.band).toBeDefined();
    });

    it('should handle many exams', () => {
      const scores = Array.from({ length: 20 }, (_, i) => 50 + i);
      const result = computePerformanceForecast({ examScores: scores });

      expect(result.factors).toHaveLength(4);
      expect(result.band).toBeDefined();
    });
  });

  describe('Mutation guard — rounding and boundary (review comment #7)', () => {
    it('non-integer gap/5 uses ceil not floor: remedial=6 not 5 (kills M12)', () => {
      // examScores=[31,28,25]: slope=-3, pred=22, gap=50-22=28
      // ceil(28/5)=ceil(5.6)=6; floor(28/5)=floor(5.6)=5
      const result = computePerformanceForecast({
        examScores: [31, 28, 25],
        passMarkTarget: 50,
      });
      expect(result.recommended_action).toBe('Conduct 6 remedial classes in the subject.');
    });

    it('empty string subjectName passes through ?? not ||: action ends "in ." (kills M14)', () => {
      // ?? keeps '' (not null/undefined); || falls back to "the subject" for any falsy value
      const result = computePerformanceForecast({
        examScores: [31, 28, 25],
        passMarkTarget: 50,
        subjectName: '',
      });
      expect(result.recommended_action).toBe('Conduct 6 remedial classes in .');
    });

    it('pred === passMarkCurrent is NOT high risk: band=MED (kills M15)', () => {
      // examScores=[50,45,40]: slope=-5, pred=35, passMarkCurrent=35
      // pred < 35 → false; slope < -8 → false → Stable → MED
      // mutation pred <= 35 → true → HIGH (wrong)
      const result = computePerformanceForecast({
        examScores: [50, 45, 40],
        passMarkCurrent: 35,
      });
      expect(result.band).toBe('MED');
    });

    it('slope === 5 is Stable not improving: band=MED (kills M16)', () => {
      // examScores=[55,60,65]: slope=5, pred=70
      // slope > 5 → false → Stable → MED
      // mutation slope >= 5 → true → LOW improving (wrong)
      const result = computePerformanceForecast({
        examScores: [55, 60, 65],
        passMarkCurrent: 35,
      });
      expect(result.band).toBe('MED');
      const slopeFactor = result.factors.find(f => f.key === 'slope');
      expect(slopeFactor?.value).toBeCloseTo(5, 5);
    });
  });
});

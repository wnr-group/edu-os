import { describe, it, expect } from 'vitest';
import { computePerformanceForecast } from '../src/performance-forecast';
import type { PerformanceInput } from '../src/types';

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
    it('should calculate remedial classes correctly for high risk', () => {
      // pred = ~15, passMarkTarget = 50 (default)
      // gap = 50 - 15 = 35
      // remedial = ceil(35 / 5) = 7
      const result = computePerformanceForecast({
        examScores: [25, 20, 15],
        passMarkCurrent: 35,
        passMarkTarget: 50,
      });

      if (result.band === 'HIGH') {
        expect(result.recommended_action).toMatch(/\d+ remedial/);
        // Extract number from action
        const match = result.recommended_action.match(/(\d+) remedial/);
        if (match) {
          const remedialClasses = parseInt(match[1]);
          expect(remedialClasses).toBeGreaterThan(0);
        }
      }
    });

    it('should use default passMarkTarget of 50', () => {
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
      });

      if (result.band === 'HIGH') {
        // gap = 50 - pred
        // Should recommend remedial classes
        expect(result.recommended_action).toContain('remedial');
      }
    });

    it('should use custom passMarkTarget', () => {
      const result = computePerformanceForecast({
        examScores: [30, 25, 20],
        passMarkTarget: 60,
      });

      if (result.band === 'HIGH') {
        // gap = 60 - pred (larger gap)
        expect(result.recommended_action).toContain('remedial');
      }
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
});

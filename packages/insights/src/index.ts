/**
 * @eduos/insights - Insights & Interventions V1
 *
 * This package has no algorithm implementation of its own. It re-exports the
 * canonical implementation from supabase/functions/_shared/insights/ so that
 * unit tests exercise the exact code the insights-recompute Edge Function runs
 * in production. Do not add algorithm logic here — edit the canonical source.
 */

export * from '../../../supabase/functions/_shared/insights/attendance-risk.ts';
export * from '../../../supabase/functions/_shared/insights/performance-forecast.ts';
export * from '../../../supabase/functions/_shared/insights/types.ts';

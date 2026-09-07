/**
 * Shared mapping from RPC error codes (raised via `RAISE EXCEPTION 'code'` in
 * Postgres functions, surfaced as `error.message` by supabase-js) to
 * user-facing messages. Single source of truth for web and mobile so both
 * surfaces handle new RPC error codes (e.g. `module_disabled`) consistently.
 */
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You are not authorized to perform this action.",
  invalid_status_transition: "This action is not valid for the current intervention status.",
  intervention_not_found: "Intervention not found — it may have been deleted.",
  cannot_reassign_terminal_intervention: "Completed or dismissed interventions cannot be reassigned.",
  student_has_no_parent: "This student has no linked parent to notify.",
  no_valid_assignee: "No eligible staff member found to assign this intervention.",
  invalid_assignee: "The selected assignee is not eligible for this intervention.",
  dismissal_reason_required: "A dismissal reason is required.",
  // Module-neutral wording — this code is raised by RPCs across several
  // features (leave, KYC, feedback, insights), not just this package's own.
  module_disabled: "This module is switched off for your school.",
  not_pending: "This was already decided. Refresh to see the latest.",
  not_found: "This item no longer exists.",
  invalid_subject: "This record is no longer valid.",
};

/**
 * Resolve a user-facing message for an RPC error.
 *
 * The map lookup is always tried first, regardless of whether `err` is a
 * native `Error` or a plain object — `PostgrestError` (the shape every
 * `supabase.rpc()` failure actually arrives as) extends `Error`, so an
 * earlier version of this function checked `err instanceof Error` before
 * ever consulting `RPC_ERROR_MESSAGES`, which meant a real RPC error whose
 * `.message` *was* a mapped code (`not_pending`, `not_authorized`, ...)
 * still rendered as that raw machine-readable string. Every caller of this
 * function passes a real `PostgrestError`/thrown RPC error, so that branch
 * order silently defeated the whole map for its primary use case.
 *
 * Only once the code isn't in the map do we fall back to a native Error's
 * own `.message` (useful for an arbitrary, non-RPC JS error) or `fallback`.
 * Uses `||` (not `??`) so an empty-string message still falls through to
 * `fallback` instead of rendering blank text.
 */
export function rpcErrorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error
    ? err.message
    : err && typeof err === "object"
      ? (err as { message?: string }).message
      : undefined;
  if (message && RPC_ERROR_MESSAGES[message]) return RPC_ERROR_MESSAGES[message];
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

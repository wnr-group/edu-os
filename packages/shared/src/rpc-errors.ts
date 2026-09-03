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
  module_disabled: "Insights is switched off for this school.",
};

/**
 * Resolve a user-facing message for an RPC error.
 *
 * Uses `||` (not `??`) against the mapped lookup so an empty-string message
 * (`msg === ""`, which is non-nullish) still falls through to `fallback`
 * instead of rendering blank text — that gap previously also meant an
 * unmapped non-empty error code like `module_disabled` was shown to the user
 * as its raw machine-readable string instead of falling back or being mapped.
 */
export function rpcErrorMessage(err: unknown, fallback: string): string {
  // Check instanceof Error first: a native Error is also a plain object with
  // a .message property, so checking the generic object branch first would
  // shadow it and always fall back instead of showing a real Error message.
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object") {
    const msg = (err as { message?: string }).message ?? "";
    return RPC_ERROR_MESSAGES[msg] || fallback;
  }
  return fallback;
}

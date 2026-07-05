import type { SupabaseClient } from "@supabase/supabase-js";

// Privilege order, most privileged first. Used to collapse a user's several
// active roles down to a single "effective" role for web permission checks.
// NOTE: this is the WEB ordering. Mobile deliberately ignores it — mobile only
// cares about teacher/parent (see apps/mobile/lib/active-context.tsx).
const RANK: Record<string, number> = {
  super_admin: 0,
  school_admin: 1,
  principal: 2,
  teacher: 3,
  parent: 4,
  student: 5,
};

export interface ActiveRole {
  role: string;
  school_id: string | null;
}

/** All active role rows for the current user. */
export async function getActiveRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role, school_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  return (data ?? []) as ActiveRole[];
}

/**
 * The caller's most privileged role among `roles`, or null if none.
 * A user with several roles (e.g. school_admin + teacher) resolves to the
 * highest-privilege one so they are never under-permissioned.
 */
export function topRole(roles: ActiveRole[]): string | null {
  let best: string | null = null;
  for (const { role } of roles) {
    if (best === null || (RANK[role] ?? 99) < (RANK[best] ?? 99)) best = role;
  }
  return best;
}

/**
 * True if the caller holds any of `allowed` roles with valid scope:
 *  - super_admin always passes (global, school_id IS NULL).
 *  - any other allowed role must be active for `schoolId` (when provided).
 * Pass schoolId = null to skip the school-binding check (e.g. platform routes).
 */
export function hasAnyRole(
  roles: ActiveRole[],
  allowed: string[],
  schoolId: string | null = null,
): boolean {
  return roles.some((r) => {
    if (!allowed.includes(r.role)) return false;
    if (r.role === "super_admin") return true;
    if (schoolId === null) return true;
    return r.school_id === schoolId;
  });
}

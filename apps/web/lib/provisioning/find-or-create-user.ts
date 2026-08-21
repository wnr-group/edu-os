import type { SupabaseClient } from "@supabase/supabase-js";

export interface FindOrCreateResult {
  userId: string;
  created: boolean;
}

/**
 * One phone = one human. Reuse the existing auth user if the phone already exists,
 * otherwise create it. Does NOT overwrite an existing user's profile name/avatar —
 * the shared profile is owned by the person, not by any one school.
 *
 * @param adminClient a service-role Supabase client
 * @param phone normalized "+91XXXXXXXXXX"
 * @param fullName used only when creating a new user
 */
export async function findOrCreateUserByPhone(
  adminClient: SupabaseClient,
  phone: string,
  fullName: string,
  email?: string,
): Promise<FindOrCreateResult> {
  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existing?.id) {
    if (email?.trim()) {
      await adminClient.from("profiles").update({ email: email.trim() }).eq("id", existing.id);
    }
    return { userId: existing.id, created: false };
  }

  const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !userData?.user) {
    // Race: another request created this phone between our lookup and insert.
    const { data: raced } = await adminClient
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (raced?.id) {
      if (email?.trim()) {
        await adminClient.from("profiles").update({ email: email.trim() }).eq("id", raced.id);
      }
      return { userId: raced.id, created: false };
    }
    throw new Error(createError?.message ?? "Failed to create user");
  }

  // Set the profile name and optional email for the freshly created user.
  const profileUpdates: Record<string, unknown> = { full_name: fullName, phone };
  if (email?.trim()) {
    profileUpdates.email = email.trim();
  }

  await adminClient
    .from("profiles")
    .update(profileUpdates)
    .eq("id", userData.user.id);

  return { userId: userData.user.id, created: true };
}

/**
 * Idempotently attach a role at a school. Safe to call when the role already exists
 * (UNIQUE(user_id, school_id, role)).
 */
export async function attachRole(
  adminClient: SupabaseClient,
  userId: string,
  schoolId: string,
  role: string,
): Promise<void> {
  const { error } = await adminClient
    .from("user_roles")
    .upsert(
      { user_id: userId, school_id: schoolId, role, is_active: true },
      { onConflict: "user_id,school_id,role" },
    );
  if (error) throw new Error(`Failed to assign role: ${error.message}`);
}

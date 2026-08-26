# Parent Admission Enquiry & Parent KYC Documents (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring two Web-only capabilities to the Mobile Parent app — a submit-only Admission Enquiry form and a read-only Parent KYC status/checklist screen — by reusing the existing backend contracts exactly, with one pre-existing security gap closed as a prerequisite.

**Architecture:** Two new hidden mobile routes (`admission-enquiry.tsx`, `kyc-documents.tsx`) reached from the existing More screen, each backed by a thin `lib/*.ts` data module. Admission Enquiry calls the existing `admission-submit` Edge Function unmodified. KYC Documents calls the existing `get_student_kyc_checklist` RPC, which is first patched in a migration to add a caller-authorization check it currently lacks entirely (pre-existing gap, not introduced by this task).

**Tech Stack:** Expo Router (React Native, TypeScript), Supabase (Postgres RPC + Edge Functions), existing `apps/mobile/lib/active-context.tsx` and `apps/mobile/lib/theme.tsx` (`useFeature`) for scoping.

## Global Constraints

- No new parent WRITE path to `kyc_documents`/`kyc-docs` storage — KYC stays strictly read-only for parents.
- No new RLS/read path for `admission_applications` — Admission Enquiry stays strictly submit-only, no status/history view.
- Reuse the existing `admission-submit` Edge Function and `get_student_kyc_checklist` RPC verbatim in contract/shape — do not invent new fields, statuses, or document types.
- No new Razorpay integration for admissions — if the Edge Function response indicates payment is required, show a blocking message; do not attempt checkout.
- Do not touch the pre-existing dirty working tree (`edu-for-india/`, already-modified files, garbled deleted-path entries) — only stage files this plan creates/edits.
- Do not modify `apps/web` files.
- Follow existing mobile conventions exactly: hidden `Tabs.Screen` route (`href: null`) + `router.push` entry from More's menu list (matches `apply-leave`/`leave-status`/`exam-datesheet`), `useFeature("admissions")` / `useFeature("kyc_documents")` gating (matches `disciplineEnabled`/`feedbackEnabled` in `more.tsx`), inline `Alert.alert` validation (no new form library).
- Migration/date-stamped SQL files follow the existing `YYYYMMDDHHMMSS_description.sql` naming and are run locally via `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < <file>` (established convention — confirm the actual container name with `docker ps` before running, in case the local stack differs).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260820000000_kyc_checklist_authorization.sql` | Patches `get_student_kyc_checklist` to add the missing caller-authorization check. Same signature, same response shape. |
| `supabase/tests/kyc_checklist_authorization.test.sql` | Proves: parent reads own child (pass), parent reads unrelated child (denied), unauthenticated caller (denied), staff/teacher continues to work (pass). |
| `apps/mobile/lib/kyc.ts` | Data layer: calls `get_student_kyc_checklist`, ports the exact `deriveState()` logic from `apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx`. |
| `apps/mobile/app/(parent)/kyc-documents.tsx` | Read-only checklist screen for the active child. |
| `apps/mobile/lib/admissions.ts` | Data layer: loads classes for the picker, loads the parent's own profile for prefill, submits to `admission-submit`, maps failure reasons to messages. |
| `apps/mobile/app/(parent)/admission-enquiry.tsx` | Submit-only enquiry form screen. |
| `apps/mobile/app/(parent)/_layout.tsx` | Modify: register the two new hidden routes. |
| `apps/mobile/app/(parent)/more.tsx` | Modify: add two feature-gated `ListItem` entries that `router.push` to the new screens. |

---

### Task 1: Secure `get_student_kyc_checklist` and prove it with SQL tests

**Files:**
- Create: `supabase/migrations/20260820000000_kyc_checklist_authorization.sql`
- Create: `supabase/tests/kyc_checklist_authorization.test.sql`

**Interfaces:**
- Produces: `public.get_student_kyc_checklist(p_student_id uuid)` — same 15-column `RETURNS TABLE` shape as today (`document_type_id, document_type_name, is_required, expires, document_id, file_name, file_type, file_size, status, rejection_reason, expires_on, verified_by_name, verified_at, uploaded_by_name, created_at`). Only its authorization behavior changes: it now returns zero rows for an unauthorized caller instead of every caller's data. `apps/mobile/lib/kyc.ts` (Task 2) consumes this RPC by exactly this name and shape.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260820000000_kyc_checklist_authorization.sql
--
-- get_student_kyc_checklist(p_student_id uuid) is SECURITY DEFINER but has
-- never had a caller-authorization check: any authenticated user could pass
-- any student_id and read that student's KYC checklist (document names,
-- statuses, rejection reasons). This was a latent gap on Web (only called
-- from the admin dashboard, which gated it via UI role checks) that would
-- become exploitable the moment Mobile calls this RPC directly for a parent
-- read path. This migration adds the missing check, reusing the same
-- role/relationship logic already used by kyc_documents_select RLS:
--   - super_admin: full access
--   - the student's own parent (student_profiles.parent_profile_id = auth.uid())
--   - school_admin / principal in the student's school, when the
--     kyc_documents feature is enabled for that school
--   - a teacher who teaches the student (public.teaches_student), when the
--     kyc_documents feature is enabled for that school
-- Everyone else gets zero rows. Response shape and business logic are
-- otherwise byte-for-byte identical to before.

CREATE OR REPLACE FUNCTION public.get_student_kyc_checklist(p_student_id uuid)
RETURNS TABLE (
  document_type_id uuid, document_type_name text, is_required boolean, expires boolean,
  document_id uuid, file_name text, file_type text, file_size integer,
  status public.kyc_doc_status, rejection_reason text, expires_on date,
  verified_by_name text, verified_at timestamptz, uploaded_by_name text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid;
  v_role text;
  v_is_parent boolean := false;
  v_is_staff boolean := false;
  v_authorized boolean := false;
BEGIN
  SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;
  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_role := public.get_my_role();

  IF v_role = 'super_admin' THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = p_student_id AND sp.parent_profile_id = auth.uid()
    ) INTO v_is_parent;

    v_is_staff := (v_role IN ('school_admin', 'principal')) OR public.teaches_student(p_student_id);

    v_authorized := COALESCE(
      public.feature_enabled(v_school_id, 'kyc_documents')
        AND public.get_my_school_id() = v_school_id
        AND (v_is_parent OR v_is_staff),
      false
    );
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dt.id, dt.name, dt.is_required, dt.expires,
    kd.id, kd.file_name, kd.file_type, kd.file_size,
    kd.status, kd.rejection_reason, kd.expires_on,
    vp.full_name, kd.verified_at, up.full_name, kd.created_at
  FROM public.document_types dt
  LEFT JOIN public.kyc_documents kd
    ON kd.document_type_id = dt.id AND kd.subject_id = p_student_id AND kd.subject_type = 'student'
  LEFT JOIN public.profiles vp ON vp.id = kd.verified_by
  LEFT JOIN public.profiles up ON up.id = kd.uploaded_by
  WHERE dt.school_id = v_school_id
    AND dt.subject_type = 'student' AND dt.is_active
  ORDER BY dt.sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_kyc_checklist(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase db reset` (or your project's established local-migration-apply command — confirm which one this repo uses by checking `supabase/config.toml` / existing dev docs before running; do not guess a destructive command).
Expected: migration applies without error; `get_student_kyc_checklist` exists with the new body.

- [ ] **Step 3: Write the security/regression test**

```sql
-- supabase/tests/kyc_checklist_authorization.test.sql
--
-- Security + regression test for the get_student_kyc_checklist RPC hardening
-- (migration 20260820000000_kyc_checklist_authorization.sql). Proves the RPC
-- now enforces caller authorization instead of returning any student's data
-- to any authenticated caller, while staff/teacher access keeps working.
-- Uses local seed's Demo School (aaaaaaaa-...0001):
--   parent aaaaaaaa-...0030 -> student dddddddd-...0001 (Aryan Sharma, Class 8A)
--   parent aaaaaaaa-...0013 (also class teacher of Class 8A / Aryan's section)
--     -> his own children dddddddd-...0010 (Aarav, Class 5A) / dddddddd-...0011 (Diya, Class 8A)
--   school_admin aaaaaaaa-...0011
-- Run: docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql

BEGIN;

-- Seed one required document type (school-wide) and one submitted document
-- for Aryan Sharma so the checklist has a real row to assert against.
-- Inserted as the superuser connection (before any role switch) since
-- neither table has an INSERT policy for any client role — all real writes
-- go through the SECURITY DEFINER KYC RPCs.
INSERT INTO public.document_types (id, school_id, name, is_required, is_active)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Test Birth Certificate', true, true);

INSERT INTO public.kyc_documents (id, school_id, subject_type, subject_id, document_type_id, file_path, file_name, file_size, status, uploaded_by)
VALUES (
  'ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'student',
  'dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
  'kyc/aaaaaaaa-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/eeeeeeee-0000-0000-0000-000000000001-1.pdf',
  'birth-cert.pdf', 12345, 'submitted', 'aaaaaaaa-0000-0000-0000-000000000030'
);

-- ── Case 1: the correct parent CAN read their own child's checklist ────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: parent could not read their own child''s checklist, got % rows (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: parent reads own child''s checklist (1 row)';
END $$;

-- ── Case 2: an unrelated, non-staff parent CANNOT read another child's checklist ──
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);

DO $$
DECLARE v_count int;
BEGIN
  -- aaaaaaaa-...0030 is not dddddddd-...0010's parent and holds no teacher role.
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000010');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: unrelated parent could read another child''s checklist, got % rows (expected 0)', v_count;
  END IF;
  RAISE NOTICE 'PASS: unrelated parent is denied (0 rows)';
END $$;

-- ── Case 3: unauthenticated/anon caller CANNOT execute the function at all ─
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'FAIL: anon role executed get_student_kyc_checklist and got % rows (expected permission denied)', v_count;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon role has no EXECUTE grant on get_student_kyc_checklist';
END $$;

-- ── Case 4: existing staff access (school_admin) keeps working ─────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000011"}', true);

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: school_admin could not read a student''s checklist, got % rows (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: school_admin (existing staff workflow) still reads the checklist (1 row)';
END $$;

-- ── Case 5: existing teacher-of-the-student access keeps working ───────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000013"}', true);

DO $$
DECLARE v_count int;
BEGIN
  -- aaaaaaaa-...0013 is the class teacher of Aryan Sharma's section.
  SELECT count(*) INTO v_count FROM public.get_student_kyc_checklist('dddddddd-0000-0000-0000-000000000001');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: teacher-of-the-student could not read the checklist, got % rows (expected 1)', v_count;
  END IF;
  RAISE NOTICE 'PASS: teacher-of-the-student still reads the checklist (1 row)';
END $$;

ROLLBACK;
```

- [ ] **Step 4: Run the test and confirm every case prints PASS**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql`
Expected output: five `NOTICE:  PASS: ...` lines, no `ERROR:  FAIL: ...` lines. (If the container name differs locally, run `docker ps` first and substitute the actual `supabase_db_*` container name — do not change the test file's committed comment, just the command you run.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820000000_kyc_checklist_authorization.sql supabase/tests/kyc_checklist_authorization.test.sql
git commit -m "fix(kyc): require caller authorization on get_student_kyc_checklist"
```

---

### Task 2: Mobile KYC data layer

**Files:**
- Create: `apps/mobile/lib/kyc.ts`

**Interfaces:**
- Consumes: `supabase.rpc("get_student_kyc_checklist", { p_student_id })` (Task 1's hardened RPC — same shape as before).
- Produces: `export type KycState = "missing" | "submitted" | "verified" | "expiring" | "expired"`; `export interface KycChecklistItem { documentTypeId: string; documentTypeName: string; isRequired: boolean; state: KycState; isRejected: boolean; rejectionReason: string | null; fileName: string | null; expiresOn: string | null; verifiedByName: string | null; uploadedByName: string | null }`; `export async function loadKycChecklist(studentId: string): Promise<{ items: KycChecklistItem[]; error: string | null }>`. Task 3's screen consumes exactly these three exports.

- [ ] **Step 1: Write `apps/mobile/lib/kyc.ts`**

```ts
// apps/mobile/lib/kyc.ts
import { supabase } from "./supabase";

export type KycState = "missing" | "submitted" | "verified" | "expiring" | "expired";

export interface KycChecklistItem {
  documentTypeId: string;
  documentTypeName: string;
  isRequired: boolean;
  state: KycState;
  isRejected: boolean;
  rejectionReason: string | null;
  fileName: string | null;
  expiresOn: string | null;
  verifiedByName: string | null;
  uploadedByName: string | null;
}

interface ChecklistRow {
  document_type_id: string;
  document_type_name: string;
  is_required: boolean;
  expires: boolean;
  document_id: string | null;
  file_name: string | null;
  status: "submitted" | "verified" | "rejected" | "expired" | null;
  rejection_reason: string | null;
  expires_on: string | null;
  verified_by_name: string | null;
  uploaded_by_name: string | null;
}

/**
 * Ported verbatim from deriveState() in
 * apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx — same
 * five states, same rejected-counts-as-missing-until-reupload rule, same
 * 30-day "expiring" window. Do not diverge from the Web logic here.
 */
function deriveState(r: ChecklistRow): KycState {
  if (!r.document_id) return "missing";
  if (r.status === "submitted") return "submitted";
  if (r.status === "rejected") return "missing";
  if (r.status === "verified") {
    if (r.expires_on) {
      const today = new Date().toISOString().slice(0, 10);
      const in30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      if (r.expires_on < today) return "expired";
      if (r.expires_on <= in30d) return "expiring";
    }
    return "verified";
  }
  return "missing";
}

export async function loadKycChecklist(
  studentId: string,
): Promise<{ items: KycChecklistItem[]; error: string | null }> {
  const { data, error } = await supabase.rpc("get_student_kyc_checklist", { p_student_id: studentId });
  if (error) return { items: [], error: error.message };

  const rows = (data ?? []) as ChecklistRow[];
  const items: KycChecklistItem[] = rows.map((r) => ({
    documentTypeId: r.document_type_id,
    documentTypeName: r.document_type_name,
    isRequired: r.is_required,
    state: deriveState(r),
    isRejected: r.status === "rejected",
    rejectionReason: r.rejection_reason,
    fileName: r.file_name,
    expiresOn: r.expires_on,
    verifiedByName: r.verified_by_name,
    uploadedByName: r.uploaded_by_name,
  }));
  return { items, error: null };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors referencing `lib/kyc.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/kyc.ts
git commit -m "feat(mobile): add parent KYC checklist data layer"
```

---

### Task 3: Mobile KYC Documents screen

**Files:**
- Create: `apps/mobile/app/(parent)/kyc-documents.tsx`

**Interfaces:**
- Consumes: `useActiveContext()` → `{ studentId, students }` (`apps/mobile/lib/active-context.tsx`); `loadKycChecklist`, `KycChecklistItem`, `KycState` (Task 2); `useTheme()` (`apps/mobile/lib/theme.tsx`); `PrimaryButton` (unused here, no write actions — screen is read-only); existing components `SkeletonCard` (`apps/mobile/components/Skeleton.tsx`).
- Produces: default-exported `KycDocumentsScreen` component, registered as route `kyc-documents` in Task 6.

- [ ] **Step 1: Write `apps/mobile/app/(parent)/kyc-documents.tsx`**

```tsx
// apps/mobile/app/(parent)/kyc-documents.tsx
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../../lib/theme";
import { useActiveContext } from "../../lib/active-context";
import { SkeletonCard } from "../../components/Skeleton";
import { loadKycChecklist, type KycChecklistItem, type KycState } from "../../lib/kyc";

const STATE_LABEL: Record<KycState, string> = {
  missing: "Missing",
  submitted: "Awaiting review",
  verified: "Verified",
  expiring: "Expiring soon",
  expired: "Expired",
};

function stateColor(theme: ReturnType<typeof useTheme>, state: KycState): string {
  if (state === "verified") return theme.success;
  if (state === "submitted") return theme.info;
  if (state === "expiring") return theme.warning;
  if (state === "expired") return theme.danger;
  return theme.textMuted;
}

export default function KycDocumentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { studentId, students } = useActiveContext();
  const student = students.find((s) => s.id === studentId);

  const [items, setItems] = useState<KycChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const { items: loaded, error: loadError } = await loadKycChecklist(id);
    setItems(loaded);
    setError(loadError);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!studentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      load(studentId).finally(() => setLoading(false));
    }, [studentId, load]),
  );

  async function onRefresh() {
    if (!studentId) return;
    setRefreshing(true);
    await load(studentId);
    setRefreshing(false);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>KYC Documents</Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textMuted }}>
            For {student?.fullName ?? "your child"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!studentId ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="person-outline" size={32} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              No child selected.
            </Text>
          </View>
        ) : loading ? (
          [0, 1, 2].map((i) => <SkeletonCard key={i} />)
        ) : error ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="alert-circle-outline" size={32} color={theme.danger} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              Could not load KYC status. Pull down to retry.
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="document-text-outline" size={32} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 24 }}>
              No KYC documents are configured for your school yet.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View
              key={item.documentTypeId}
              style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, gap: 6 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary, flexShrink: 1 }}>
                    {item.documentTypeName}
                  </Text>
                  <View
                    style={{
                      backgroundColor: item.isRequired ? theme.danger + "1A" : theme.textMuted + "1A",
                      borderRadius: 100,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: item.isRequired ? theme.danger : theme.textMuted, textTransform: "uppercase" }}>
                      {item.isRequired ? "Required" : "Optional"}
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: stateColor(theme, item.state) + "1A", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: stateColor(theme, item.state) }}>
                    {STATE_LABEL[item.state]}
                  </Text>
                </View>
              </View>

              {item.state === "expiring" && item.expiresOn && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.warning }}>Expires {item.expiresOn}</Text>
              )}
              {item.state === "expired" && item.expiresOn && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.danger }}>Expired {item.expiresOn}</Text>
              )}
              {item.fileName && (
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{item.fileName}</Text>
              )}
              {item.state === "verified" && item.verifiedByName && (
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted }}>Verified by {item.verifiedByName}</Text>
              )}
              {item.isRejected && item.rejectionReason && (
                <View style={{ backgroundColor: theme.danger + "12", borderRadius: 8, padding: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: theme.danger }}>
                    Rejected: "{item.rejectionReason}" — please provide this document again at the school office.
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ flexDirection: "row", gap: 10, backgroundColor: theme.info + "12", borderRadius: 12, padding: 14, marginTop: 4 }}>
          <Ionicons name="information-circle-outline" size={18} color={theme.info} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, lineHeight: 18 }}>
            This is a status view only. To submit or update a document, please visit the school office.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors referencing `kyc-documents.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(parent)/kyc-documents.tsx"
git commit -m "feat(mobile): add read-only parent KYC documents screen"
```

---

### Task 4: Mobile Admission Enquiry data layer

**Files:**
- Create: `apps/mobile/lib/admissions.ts`

**Interfaces:**
- Consumes: `supabase`, `supabaseUrl`, `SCHOOL_ID` (`apps/mobile/lib/supabase.ts`); existing `admission-submit` Edge Function contract (`school_id, form_ts, honeypot, applicant_name, date_of_birth, gender, class_applied_id, parent_name, parent_phone, parent_email, previous_school, area, applicant_note` in; `{ ok, reference_no?, reason?, order_id? }` out).
- Produces: `export interface AdmissionClassOption { id: string; name: string }`; `export async function loadClassesForEnquiry(): Promise<AdmissionClassOption[]>`; `export async function loadMyProfileForPrefill(): Promise<{ fullName: string; email: string }>`; `export interface AdmissionEnquiryInput { applicantName: string; dateOfBirth: string; gender: "male" | "female" | "other"; classAppliedId: string; parentName: string; parentPhone: string; parentEmail: string; previousSchool: string; area: string; applicantNote: string }`; `export type AdmissionSubmitResult = { kind: "success"; referenceNo: string } | { kind: "payment_required"; referenceNo: string } | { kind: "error"; message: string }`; `export async function submitAdmissionEnquiry(input: AdmissionEnquiryInput, formTs: number): Promise<AdmissionSubmitResult>`. Task 5's screen consumes exactly these exports.

- [ ] **Step 1: Write `apps/mobile/lib/admissions.ts`**

```ts
// apps/mobile/lib/admissions.ts
import { supabase, supabaseUrl, SCHOOL_ID } from "./supabase";

export interface AdmissionClassOption {
  id: string;
  name: string;
}

export async function loadClassesForEnquiry(): Promise<AdmissionClassOption[]> {
  const { data } = await supabase
    .from("classes")
    .select("id, name, order")
    .eq("school_id", SCHOOL_ID)
    .order("order", { ascending: true });
  return (data ?? []).map((c: any) => ({ id: c.id as string, name: c.name as string }));
}

export async function loadMyProfileForPrefill(): Promise<{ fullName: string; email: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { fullName: "", email: "" };
  const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return { fullName: (prof?.full_name as string) ?? "", email: user.email ?? "" };
}

export interface AdmissionEnquiryInput {
  applicantName: string;
  dateOfBirth: string; // "" if not set
  gender: "male" | "female" | "other";
  classAppliedId: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  previousSchool: string;
  area: string;
  applicantNote: string;
}

export type AdmissionSubmitResult =
  | { kind: "success"; referenceNo: string }
  | { kind: "payment_required"; referenceNo: string }
  | { kind: "error"; message: string };

const REASON_MESSAGES: Record<string, string> = {
  missing_school: "This app isn't linked to a school yet. Please contact the school office.",
  not_found: "Admissions aren't currently open for this school.",
  closed: "Admissions are currently closed for this school.",
  rate_limited: "Too many attempts. Please try again in a little while.",
  invalid_fields: "Please check the required fields and try again.",
  no_academic_year: "Admissions can't be processed right now — no active academic year is configured. Please contact the school office.",
  payments_unavailable: "Online payment isn't available right now. Please try again later or contact the school office.",
  insert_failed: "Something went wrong submitting your enquiry. Please try again.",
  bad_request: "Something went wrong submitting your enquiry. Please try again.",
  network_error: "Couldn't reach the server. Please check your connection and try again.",
};

export function describeAdmissionError(reason: string): string {
  return REASON_MESSAGES[reason] ?? "Something went wrong submitting your enquiry. Please try again.";
}

/**
 * Submits to the existing admission-submit Edge Function verbatim — same
 * field set, same bot-trap fields (honeypot/form_ts), same school_id
 * resolution as apps/web/app/apply/apply-form.tsx. Mobile has no paid-
 * admission checkout: if the response includes order_id (fee required),
 * this returns "payment_required" without attempting Razorpay — the
 * enquiry row already exists server-side (payment_status: "pending") by
 * the time that happens, which the caller must communicate honestly.
 */
export async function submitAdmissionEnquiry(
  input: AdmissionEnquiryInput,
  formTs: number,
): Promise<AdmissionSubmitResult> {
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/admission-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: SCHOOL_ID,
        form_ts: formTs,
        honeypot: "",
        applicant_name: input.applicantName,
        date_of_birth: input.dateOfBirth || undefined,
        gender: input.gender,
        class_applied_id: input.classAppliedId,
        parent_name: input.parentName,
        parent_phone: input.parentPhone,
        parent_email: input.parentEmail || undefined,
        previous_school: input.previousSchool || undefined,
        area: input.area || undefined,
        applicant_note: input.applicantNote || undefined,
      }),
    });
  } catch {
    return { kind: "error", message: describeAdmissionError("network_error") };
  }

  let data: { ok?: boolean; reference_no?: string; reason?: string; order_id?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    return { kind: "error", message: describeAdmissionError("bad_request") };
  }
  if (!data) return { kind: "error", message: describeAdmissionError("bad_request") };

  if (data.ok && data.order_id) {
    return { kind: "payment_required", referenceNo: data.reference_no ?? "" };
  }
  if (data.ok && data.reference_no) {
    return { kind: "success", referenceNo: data.reference_no };
  }
  return { kind: "error", message: describeAdmissionError(data.reason ?? "bad_request") };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors referencing `lib/admissions.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/admissions.ts
git commit -m "feat(mobile): add admission enquiry data layer"
```

---

### Task 5: Mobile Admission Enquiry screen

**Files:**
- Create: `apps/mobile/app/(parent)/admission-enquiry.tsx`

**Interfaces:**
- Consumes: `loadClassesForEnquiry`, `loadMyProfileForPrefill`, `submitAdmissionEnquiry`, `AdmissionClassOption`, `AdmissionEnquiryInput`, `AdmissionSubmitResult` (Task 4); `PrimaryButton` (`apps/mobile/components/PrimaryButton.tsx`); `PickerModal`, `SelectRow`, `PickerOption` (`apps/mobile/components/PickerModal.tsx`); `useTheme()`.
- Produces: default-exported `AdmissionEnquiryScreen`, registered as route `admission-enquiry` in Task 6.

- [ ] **Step 1: Write `apps/mobile/app/(parent)/admission-enquiry.tsx`**

```tsx
// apps/mobile/app/(parent)/admission-enquiry.tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { PrimaryButton } from "../../components/PrimaryButton";
import { PickerModal, SelectRow, type PickerOption } from "../../components/PickerModal";
import {
  loadClassesForEnquiry,
  loadMyProfileForPrefill,
  submitAdmissionEnquiry,
  type AdmissionClassOption,
} from "../../lib/admissions";

const GENDER_OPTIONS: { value: "male" | "female" | "other"; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export default function AdmissionEnquiryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const formTsRef = useRef(Date.now());

  const [classes, setClasses] = useState<AdmissionClassOption[]>([]);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [applicantName, setApplicantName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [classAppliedId, setClassAppliedId] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [previousSchool, setPreviousSchool] = useState("");
  const [area, setArea] = useState("");
  const [applicantNote, setApplicantNote] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [classOptions, profile] = await Promise.all([loadClassesForEnquiry(), loadMyProfileForPrefill()]);
      setClasses(classOptions);
      setParentName(profile.fullName);
      setParentEmail(profile.email);
      setLoadingClasses(false);
    })();
  }, []);

  const classPickerOptions: PickerOption[] = classes.map((c) => ({ label: c.name, value: c.id }));
  const selectedClassLabel = classes.find((c) => c.id === classAppliedId)?.name ?? "";

  async function handleSubmit() {
    if (!applicantName.trim() || !classAppliedId || !parentName.trim() || !parentPhone.trim()) {
      Alert.alert("Missing info", "Please fill in the applicant's name, class, parent name and parent phone.");
      return;
    }
    setSubmitting(true);
    const result = await submitAdmissionEnquiry(
      {
        applicantName: applicantName.trim(),
        dateOfBirth,
        gender,
        classAppliedId,
        parentName: parentName.trim(),
        parentPhone: parentPhone.trim(),
        parentEmail: parentEmail.trim(),
        previousSchool: previousSchool.trim(),
        area: area.trim(),
        applicantNote: applicantNote.trim(),
      },
      formTsRef.current,
    );
    setSubmitting(false);

    if (result.kind === "success") {
      Alert.alert("Enquiry submitted", `Thank you! Your reference number is ${result.referenceNo}.`);
      router.back();
      return;
    }
    if (result.kind === "payment_required") {
      Alert.alert(
        "Application fee required",
        `Your enquiry (Ref: ${result.referenceNo}) has been received but needs an application fee payment to complete. Paid admission enquiry isn't yet supported in the app — please complete the payment through the school website or contact the school office, quoting this reference number.`,
      );
      router.back();
      return;
    }
    Alert.alert("Could not submit", result.message);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Admission Enquiry</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Applicant name
          </Text>
          <TextInput
            value={applicantName}
            onChangeText={setApplicantName}
            placeholder="Child's full name"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Date of birth (optional)
          </Text>
          <TextInput
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Gender</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setGender(opt.value)}
                style={{
                  flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12,
                  borderWidth: 1.5, borderColor: gender === opt.value ? theme.primary : theme.border,
                  backgroundColor: gender === opt.value ? theme.primaryLight : theme.surface,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: gender === opt.value ? theme.primary : theme.textSecondary }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <SelectRow
          label="Class applied for"
          displayValue={selectedClassLabel}
          placeholder={loadingClasses ? "Loading classes…" : "Select class"}
          onPress={() => !loadingClasses && setClassPickerOpen(true)}
        />

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent name
          </Text>
          <TextInput
            value={parentName}
            onChangeText={setParentName}
            placeholder="Parent/guardian full name"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent phone
          </Text>
          <TextInput
            value={parentPhone}
            onChangeText={setParentPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor={theme.textMuted}
            keyboardType="phone-pad"
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Parent email (optional)
          </Text>
          <TextInput
            value={parentEmail}
            onChangeText={setParentEmail}
            placeholder="parent@example.com"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Previous school (optional)
          </Text>
          <TextInput
            value={previousSchool}
            onChangeText={setPreviousSchool}
            placeholder="Name of previous school"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Area (optional)
          </Text>
          <TextInput
            value={area}
            onChangeText={setArea}
            placeholder="Locality / area"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>

        <View>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: theme.textMuted, marginBottom: 6, textTransform: "uppercase" }}>
            Note (optional)
          </Text>
          <TextInput
            value={applicantNote}
            onChangeText={setApplicantNote}
            multiline
            placeholder="Anything else the school should know…"
            placeholderTextColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, minHeight: 90, textAlignVertical: "top", borderWidth: 1, borderColor: theme.border, fontSize: 14, fontFamily: "Inter_400Regular", color: theme.textPrimary }}
          />
        </View>
      </ScrollView>

      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
        <PrimaryButton
          label="Submit enquiry"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!applicantName.trim() || !classAppliedId || !parentName.trim() || !parentPhone.trim()}
        />
      </View>

      <PickerModal
        visible={classPickerOpen}
        title="Select class"
        options={classPickerOptions}
        value={classAppliedId}
        onSelect={(value) => setClassAppliedId(value)}
        onClose={() => setClassPickerOpen(false)}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors referencing `admission-enquiry.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(parent)/admission-enquiry.tsx"
git commit -m "feat(mobile): add parent admission enquiry submission screen"
```

---

### Task 6: Wire up navigation

**Files:**
- Modify: `apps/mobile/app/(parent)/_layout.tsx:43-46`
- Modify: `apps/mobile/app/(parent)/more.tsx:531-539`

**Interfaces:**
- Consumes: route names `admission-enquiry`, `kyc-documents` (Tasks 3 and 5); `useFeature("admissions")`, `useFeature("kyc_documents")` (`apps/mobile/lib/theme.tsx` — both `FeatureKey` values already exist); `useRouter()` (`expo-router`).

- [ ] **Step 1: Register the two hidden routes**

In `apps/mobile/app/(parent)/_layout.tsx`, change:

```tsx
      <Tabs.Screen name="homework" options={{ href: null }} />
      <Tabs.Screen name="apply-leave" options={{ href: null }} />
      <Tabs.Screen name="leave-status" options={{ href: null }} />
      <Tabs.Screen name="exam-datesheet" options={{ href: null }} />
    </Tabs>
```

to:

```tsx
      <Tabs.Screen name="homework" options={{ href: null }} />
      <Tabs.Screen name="apply-leave" options={{ href: null }} />
      <Tabs.Screen name="leave-status" options={{ href: null }} />
      <Tabs.Screen name="exam-datesheet" options={{ href: null }} />
      <Tabs.Screen name="admission-enquiry" options={{ href: null }} />
      <Tabs.Screen name="kyc-documents" options={{ href: null }} />
    </Tabs>
```

- [ ] **Step 2: Add entry points in More**

In `apps/mobile/app/(parent)/more.tsx`, add `useRouter` and the two feature flags to the top of the component (near the existing `feedbackEnabled`/`announcementsEnabled`/`disciplineEnabled` declarations at lines 22-25):

```tsx
  const feedbackEnabled = useFeature("feedback");
  const announcementsEnabled = useFeature("announcements");
  const disciplineEnabled = useFeature("discipline");
  const admissionsEnabled = useFeature("admissions");
  const kycEnabled = useFeature("kyc_documents");
  const router = useRouter();
```

(`useRouter` is imported from `expo-router` — add it to the existing import at line 3: `import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";`.)

Then, in the menu block (lines 531-539), add two entries right after the `disciplineEnabled` block and before `feedbackEnabled`:

```tsx
          {disciplineEnabled && (
            <ListItem icon="warning-outline" title="Discipline Records" subtitle="Incidents & actions" onPress={() => navigate("discipline")} />
          )}
          {admissionsEnabled && (
            <ListItem icon="school-outline" title="Admission Enquiry" subtitle="Enquire about a new admission" onPress={() => router.push("/(parent)/admission-enquiry")} />
          )}
          {kycEnabled && (
            <ListItem icon="document-text-outline" title="KYC Documents" subtitle="View document status" onPress={() => router.push("/(parent)/kyc-documents")} />
          )}
          {feedbackEnabled && (
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no new errors; route names `/(parent)/admission-enquiry` and `/(parent)/kyc-documents` resolve (Expo Router's generated `apps/mobile/.expo/types/router.d.ts` picks up the two new files automatically on next `expo start`/typecheck — do not hand-edit that generated file).

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(parent)/_layout.tsx" "apps/mobile/app/(parent)/more.tsx"
git commit -m "feat(mobile): wire up navigation for admission enquiry and KYC documents"
```

---

### Task 7: Verification pass and evidence-based sign-off

**Files:** none created — this task runs checks and records evidence; touch no source files.

**Interfaces:** none — this task is verification-only.

- [ ] **Step 1: Run the full mobile type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 2: Run the repo-wide lint/type-check**

Run: `pnpm lint && pnpm type-check` (from repo root, per `package.json` scripts)
Expected: exit code 0, no new errors in files touched by this plan.

- [ ] **Step 3: Re-run the KYC authorization SQL test**

Run: `docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/kyc_checklist_authorization.test.sql`
Expected: five `PASS` notices, as in Task 1 Step 4.

- [ ] **Step 4: Re-run existing KYC-adjacent and admission-adjacent Supabase tests to confirm no regression**

Run each existing test that touches shared surface (parent RLS, enrollment filtering):
```bash
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/fee_visibility_isolation.test.sql
docker exec -i supabase_db_plan-2-supabase-auth psql -U postgres -d postgres < supabase/tests/parent_active_enrollment_filter.test.sh
```
Expected: no new failures relative to their pre-existing behavior (these tests are unrelated to this plan's changes but confirm the migration didn't destabilize shared parent-scoping logic).

- [ ] **Step 5: Live verification — start the mobile app and the admin web app side by side**

Run: `pnpm dev` (root) to start web + Supabase functions, and separately `cd apps/mobile && npx expo start` for the mobile app (use the demo seed's parent login, e.g. phone `+919000000009`, for parent `aaaaaaaa-...0030` / student Aryan Sharma).

Manually verify and record actual evidence (screenshots or exact observed behavior) for:
- **KYC-01/02**: More → "KYC Documents" opens and renders the checklist for Aryan Sharma.
- **KYC-03/08**: shown statuses/document types match what `apps/web/app/(school)/admin/students/[id]/student-documents-tab.tsx` shows for the same student when logged in as `school_admin` (aaaaaaaa-...0011); no upload/verify controls exist on the mobile screen.
- **KYC-04**: switch to a parent with a different child and confirm the checklist is correctly scoped to their own child only (no manual RPC misuse needed — this is exercised automatically since the screen only ever calls with `studentId` from `useActiveContext()`).
- **AD-01/02/03/04**: More → "Admission Enquiry" opens, all fields from `apply-form.tsx`/`add-enquiry-drawer.tsx`'s field set are present, required-field validation blocks submission when empty.
- **AD-05/06/07/09**: submit a valid enquiry; confirm in the admin Admissions board (`apps/web/app/(school)/admin/admissions`) that a new `admission_applications` row appears in the "Enquiry" column with the submitted data, correct `school_id`, and `source = 'online'`.
- **AD-11**: submit with the school's admissions closed (toggle via admin settings panel) and confirm the mobile app shows the closed-admissions message, not a false success.
- **Web regression**: submit through the existing `/apply` web form once more and confirm it still works unchanged.
- **PAY-04/05**: if the demo school has `online_payments` + a non-zero `application_fee` enabled, submit and confirm mobile shows the "payment required" message and does not claim success; then check the admin board to confirm the row exists with `payment_status = 'pending'` (matching the honest-reporting requirement) — if the demo school has no fee configured, record this as `NOT VERIFIED — no paid-admission school in local seed data` rather than guessing the behavior.

- [ ] **Step 6: Final diff audit**

Run: `git status` and `git diff --stat` (do not run `git add -A`).
Expected: only the files listed in this plan's File Structure table appear as new/modified; none of the pre-existing dirty-tree entries (`edu-for-india/`, garbled deleted paths, unrelated modified files noted at planning time) were touched.

- [ ] **Step 7: Record the sign-off status**

Based on Steps 1-6's actual output, write the final status as one of:
- **DONE** — every applicable acceptance criterion from the original brief has concrete passing evidence from Steps 1-6.
- **FIXED — QA PENDING** — implementation and automated verification (Steps 1-4, 6) pass, but live manual QA (Step 5) is still outstanding or partially recorded.
- **BLOCKED / NOT VERIFIED** — any step could not be completed (e.g., no local Supabase/Docker environment available, no paid-admission demo school data).

Do not mark DONE on code compiling or screens rendering alone — Step 5's live evidence is required for DONE.

---

## Self-Review Notes

- **Spec coverage:** KYC read-only scope (Task 2-3), Admission submit-only scope (Task 4-5), RPC authorization hardening (Task 1), navigation convention (Task 6), payment-blocking behavior (Task 4/5), prefill behavior (Task 4/5), evidence-based sign-off (Task 7) — all six locked decisions from the interview are covered by a task.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code or an exact command.
- **Type consistency:** `KycChecklistItem`/`KycState` (Task 2) match field-for-field what `kyc-documents.tsx` (Task 3) destructures; `AdmissionEnquiryInput`/`AdmissionSubmitResult`/`AdmissionClassOption` (Task 4) match what `admission-enquiry.tsx` (Task 5) imports and uses.

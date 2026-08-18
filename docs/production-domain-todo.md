# Production domain configuration needed: Demo School

The Digital ID Card QR verification feature (`/verify/[studentId]`) resolves
each school's public verification URL from `schools.domain` — the same
column `proxy.ts` already uses to route every request to the right tenant.
No code hardcodes a domain; this is a data-only gap in production.

**Action needed (production DB only, not done by this change):**

The production "Demo School" row does not have `domain` set to its real
subdomain, so QR codes generated there currently build a URL that won't
resolve. Set it via the existing admin UI:

1. Sign in to production as `super_admin`.
2. Go to `platform-admin/schools/[demo school id]` → **Overview** tab.
3. Set **Domain** to `school1.eduos.wnradvisory.com`.
4. Save.

No SQL, migration, or deploy required — this uses the existing
`PATCH /api/schools/[id]` endpoint that already accepts `domain` as a
writable field. Until this is set, ID cards issued for Demo School in
production will show "Card not found" when their QR is scanned, even though
the feature code itself is fully deployed and working.

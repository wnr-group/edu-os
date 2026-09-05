# Insights & Interventions V1 Implementation Plan (FINAL — audit-hardened)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan ticket-by-ticket (§14). This document is architecture/planning output — implementation has not started. This revision incorporates every P0/P1 finding from the 2026-08-24 Production Readiness Audit; §20 states what remains genuinely unresolved and why implementation cannot start on 100% of tickets until it is answered.

**Goal:** Give EduOS a deterministic, rule-based "who needs attention → why → what to do" workflow: teachers/admins get an Action Queue of staff-assigned interventions generated from existing (not-yet-built) attendance/academic risk evidence, with a strict lifecycle, server-side authorization, resilient nightly processing, idempotent parent notification, and an explicit parent-notify action — reusing existing infrastructure everywhere it exists.

**Architecture:** Supabase Postgres (RLS + `SECURITY DEFINER` RPCs) is the authority; a `pg_cron`-dispatched, **per-school-fanned-out** Edge Function computes nightly risk snapshots and derives interventions from them, with per-student/per-subject failure isolation; Next.js (web) and Expo (mobile) both read/act through the same RPC surface — no client owns business logic. `comms_outbox` is explicitly not built; parent notification reuses the existing `notifications` table + Expo push pattern, hardened with a client-supplied idempotency key so network retries cannot duplicate a send.

**Tech Stack:** Supabase (Postgres, RLS, Edge Functions/Deno, `pg_cron`, `pg_net`), Next.js 16 App Router (`apps/web`), Expo Router + React Native (`apps/mobile`), pnpm/Turborepo monorepo, no ORM (typed `supabase-js` query builder), `zod` for shared schemas, `sonner` for web toasts, Expo push API, `vitest` newly introduced scoped to `packages/insights` only.

## Global Constraints

- Do not modify `ATTN_RISK_V1` or `PERF_V1` math (D19). Interventions consume their output only.
- No new `insights` table — `student_risk_snapshots` is the evidence source (D19).
- No `comms_outbox` in V1 (D19/D20).
- One open intervention per `(student, kind)` — open = `PENDING`/`IN_PROGRESS` (D19).
- HIGH → due today, MEDIUM → due +3 days, LOW → no intervention, server-side, fixed IST timezone constraint (this revision, §6).
- Reuse the existing `insights` feature-flag key — no new flag (D19).
- Parent notification is 100% explicit, staff-triggered, never automatic on any lifecycle event (D20).
- Parent notification never exposes score/band/rule-name/factors/notes/status/reason/assignment (D20).
- Parent notification is idempotent per client-generated request identity — an accidental retry never double-sends; a deliberate "Send again" always can (this revision, §6).
- No new parent tab/screen — message lands in existing More → Notifications (D20).
- Nightly processing must survive one bad student, one bad subject, and one bad school without silently losing the rest of the fleet's run (this revision, §4).
- Every new table: `school_id` + RLS enabled + policies + RLS isolation test, per this repo's own §9 convention (`2026-07-22-eduos-feature-architecture-design.md`).
- Migrations are sequential `20240001NNNNNN_*.sql` early-series or dated `2026MMDD...` late-series — follow existing numbering, never renumber existing files.

---

## 1. Final Architecture

Two phases, unchanged in principle from the prior revision, hardened in execution:

**Phase A — base Insights Engine.** Confirmed via direct repository inspection to not exist: `student_risk_snapshots`, `ATTN_RISK_V1`, `PERF_V1`, `packages/insights` are all spec-only (`docs/superpowers/specs/2026-07-24-eduos-insights-algorithms.md`), zero implementation anywhere. Built first.

**Phase B — Interventions domain.** The actual D19/D20 scope, built on Phase A's output, now with:
- resilient, fanned-out nightly processing (§4) instead of a single monolithic loop,
- an idempotency-keyed Notify Parent RPC (§6) instead of a bare insert,
- an explicitly-flagged (not silently decided) academic multi-subject pinning behavior (§3),
- assignment resolution that skips inactive teachers without touching shared helpers (§5),
- a fixed single-timezone product constraint, formally documented rather than a bare hardcode (§6a),
- an operational runbook for the nightly job (§4, "Operational Recovery"),
- a QA strategy that explicitly labels every check as automated or manual (§12).

```
attendance_records / exam_results (existing)
        │
        ▼
packages/insights (NEW, pure fns, unit-tested with vitest)  ──ATTN_RISK_V1 / PERF_V1──▶ {score,band,factors[],recommended_action}
        │
        ▼
pg_cron "insights-recompute-dispatch" (nightly, lightweight)
        │  queries schools WHERE feature_enabled(school_id,'insights')
        │  for each eligible school: net.http_post → insights-recompute Edge Fn, {school_id, offset:0, limit:1000}
        ▼
insights-recompute Edge Function (ONE INVOCATION = ONE SCHOOL, ONE CHUNK)
        │  pg_advisory_xact_lock(school_id) — prevents overlapping invocations for the same school
        │  per student: try { compute attendance } catch { log to insight_run_failures, continue }
        │               try { compute per-subject academic } catch { log per (student,subject), continue }
        │  upsert student_risk_snapshots (idempotent per school,student,kind,day,subject)
        │  if offset+limit < school's total active students: dispatcher enqueues next chunk
        │  updates insight_runs.status/counters
        ▼
create_intervention_if_qualifying(snapshot_id)  — per qualifying snapshot, same invocation
        │  dedup via partial unique index + constraint-specific exception handling (§3, §7)
        │  assignment resolution SKIPS inactive teachers (§5)
        ▼
interventions (dedup: one open per (student, kind))
        ▼
Teacher/Admin Action Queue (web + mobile)  ── same RPC surface ──
        │  start / complete / dismiss (state machine, server-authorized)
        ▼
[optional, explicit] notify_parent_for_intervention(intervention_id, client_request_id)
        │  idempotent on (intervention_id, client_request_id) — retry-safe, resend-capable
        ▼
notifications + Expo push (existing pipeline)
        ▼
Parent: existing More → Notifications screen (unchanged)
```

## 2. Final Data Model

### 2.1 `student_risk_snapshots` (unchanged from prior revision)

```sql
CREATE TABLE public.student_risk_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('attendance', 'academic')),
  computed_for  DATE NOT NULL,
  score         NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  band          TEXT NOT NULL CHECK (band IN ('LOW', 'MED', 'HIGH')),
  factors       JSONB NOT NULL DEFAULT '[]',
  recommended_action TEXT NOT NULL,
  subject_id    UUID REFERENCES public.subjects(id),
  params_hash   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, kind, computed_for, subject_id)
);
CREATE INDEX idx_risk_snapshots_school_student ON public.student_risk_snapshots(school_id, student_id);
CREATE INDEX idx_risk_snapshots_band ON public.student_risk_snapshots(school_id, band) WHERE band IN ('MED','HIGH');
CREATE INDEX idx_risk_snapshots_computed_for ON public.student_risk_snapshots(computed_for DESC);
```

### 2.2 `insight_runs` (REVISED — now a real operational record, not a start/finish timestamp pair)

```sql
CREATE TABLE public.insight_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  run_date          DATE NOT NULL,                 -- the IST calendar date this run represents (§6a)
  chunk_offset      INT NOT NULL DEFAULT 0,         -- P0-2: which chunk of the school's student list this row covers
  chunk_limit       INT NOT NULL DEFAULT 1000,
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  students_total     INT NOT NULL DEFAULT 0,
  students_processed INT NOT NULL DEFAULT 0,
  students_failed     INT NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  params_hash       TEXT NOT NULL,
  trigger           TEXT NOT NULL DEFAULT 'cron' CHECK (trigger IN ('cron','manual')),
  UNIQUE (school_id, run_date, chunk_offset)          -- P0-1/P0-2: idempotent per school/day/chunk, safe to re-dispatch
);
CREATE INDEX idx_insight_runs_incomplete ON public.insight_runs(run_date) WHERE status != 'completed';
```
**Why this changed from the prior revision:** the earlier design only had `started_at`/`finished_at` on a single fleet-wide run — that cannot express "school X's chunk 2 of 3 failed, chunks 1 and 3 succeeded," which is exactly the granularity P0-1/P0-2 require an operator to see.

### 2.3 `insight_run_failures` (NEW — P0-1's itemized failure log)

```sql
CREATE TABLE public.insight_run_failures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES public.insight_runs(id) ON DELETE CASCADE,
  student_id   UUID REFERENCES public.student_profiles(id) ON DELETE SET NULL,
  kind         TEXT CHECK (kind IN ('attendance', 'academic')),
  subject_id   UUID REFERENCES public.subjects(id),
  error_message TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insight_run_failures_run ON public.insight_run_failures(run_id);
```
One row per failed `(student, kind[, subject])` unit — this is the queryable evidence that "one bad student didn't abort the school" actually held, and gives an operator the exact list of what needs manual attention.

### 2.4 `interventions` (REVISED — `source_snapshot_id` semantics now explicit, §3)

```sql
CREATE TYPE public.intervention_kind AS ENUM ('attendance', 'academic');
CREATE TYPE public.intervention_status AS ENUM ('pending', 'in_progress', 'completed', 'dismissed');
CREATE TYPE public.intervention_type AS ENUM (
  'CONTACT_PARENT', 'DISCUSS_ATTENDANCE_PATTERN', 'MONITOR', 'ASSIGN_ACADEMIC_SUPPORT'
);

CREATE TABLE public.interventions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  kind                public.intervention_kind NOT NULL,
  type                public.intervention_type NOT NULL,
  title               TEXT NOT NULL,
  source_snapshot_id  UUID NOT NULL REFERENCES public.student_risk_snapshots(id),
  -- §3: PINNED AT CREATION. This FK is never updated after INSERT. A later-worsening
  -- sibling subject does NOT repoint this column — see §3 for the full resolved design.
  status              public.intervention_status NOT NULL DEFAULT 'pending',
  severity_band       TEXT NOT NULL CHECK (severity_band IN ('MED','HIGH')),
  assignee_id         UUID NOT NULL REFERENCES auth.users(id),
  assigned_via        TEXT NOT NULL CHECK (assigned_via IN ('class_teacher','admin_fallback','reassigned')),
  due_date            DATE NOT NULL,
  due_date_original    DATE NOT NULL,
  outcome_note        TEXT,
  dismissal_reason    TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  dismissed_at         TIMESTAMPTZ,
  resolved_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_terminal_fields CHECK (
    (status = 'dismissed' AND dismissal_reason IS NOT NULL AND dismissed_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR (status IN ('pending','in_progress'))
  )
);

CREATE UNIQUE INDEX uq_interventions_open_per_student_kind
  ON public.interventions (student_id, kind)
  WHERE status IN ('pending', 'in_progress');
-- P1-6: this is the ONLY unique constraint create_intervention_if_qualifying's
-- exception handler is permitted to swallow — see §7's exact plpgsql pattern.

CREATE INDEX idx_interventions_school_status ON public.interventions(school_id, status);
CREATE INDEX idx_interventions_assignee ON public.interventions(assignee_id, status);
CREATE INDEX idx_interventions_due_date ON public.interventions(due_date) WHERE status IN ('pending','in_progress');
CREATE INDEX idx_interventions_student ON public.interventions(student_id);
```

### 2.5 `intervention_academic_evidence` (NEW — P0-4's resolved design, §3)

```sql
CREATE TABLE public.intervention_academic_evidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  snapshot_id     UUID NOT NULL REFERENCES public.student_risk_snapshots(id),
  is_pinned       BOOLEAN NOT NULL DEFAULT false,  -- true for the one row matching interventions.source_snapshot_id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intervention_id, snapshot_id)
);
CREATE INDEX idx_iae_intervention ON public.intervention_academic_evidence(intervention_id);
```
Purpose: while `source_snapshot_id` stays pinned (§3), a student can still have multiple High-risk subjects, and the teacher needs to see all of them, not just the one that triggered creation. Every recompute that finds an additional (or the same) qualifying subject for a student with an already-open academic intervention inserts a (deduplicated via `UNIQUE`) sibling row here — cheap, append-only, purely additive evidence, never mutates `interventions` itself.

### 2.6 `intervention_parent_notifications` (REVISED — P0-3's idempotency key)

```sql
CREATE TABLE public.intervention_parent_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id   UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL,                  -- P0-3: client-generated, stable across retries of the SAME logical send
  notification_id   UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_by           UUID NOT NULL REFERENCES auth.users(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  push_delivered    BOOLEAN,
  push_error        TEXT,
  UNIQUE (intervention_id, client_request_id)         -- the idempotency guarantee itself
);
CREATE INDEX idx_ipn_intervention ON public.intervention_parent_notifications(intervention_id);
```

### 2.7 Migration ordering (revised, additive to the prior list)

| Order | Contents |
|---|---|
| 1 | `student_risk_snapshots` (§2.1) |
| 2 | `insight_runs` + `insight_run_failures` (§2.2, §2.3) — **revised shape, must be created together** |
| 3 | `interventions` enums/table (§2.4) |
| 4 | `intervention_academic_evidence` (§2.5) — **new** |
| 5 | `intervention_parent_notifications` (§2.6) — **revised shape with `client_request_id`** |
| 6 | RLS policies for all five tables (§7) |
| 7 | RPCs (§6, §7) |

No backfill, additive-only, same rollback strategy as before (drop in reverse order — safe pre-flag-enable).

## 3. Academic Multi-Subject Decision — RESOLVED DESIGN, ONE ITEM STILL PENDING CONFIRMATION

**Investigation, re-done for this revision:** re-read D19 §5 verbatim ("If ANY subject is High Risk, that is sufficient... Do NOT require multiple subjects... UI should identify the affected/weak subject(s)"), re-read the algorithms doc §3 (`PERF_V1`: "Overall = worst-labelled subjects surfaced first" — this is a *display-ordering* statement about a dashboard rollup, not an intervention-lifecycle statement), and re-confirmed no migration/table for this exists anywhere in the repo. **Neither source document specifies whether the triggering evidence pointer should update as the worst subject changes over time.** This is confirmed, not assumed, to be a genuine gap in the source material.

**Resolved design for everything the source material DOES determine:**
- **One academic intervention per student**, not per subject — directly required by D19 §5+§8 read together (dedup is `(student, kind)`, and kind has only two values, `academic` being one of them regardless of how many subjects qualify).
- **Multiple qualifying subjects are represented via `intervention_academic_evidence`** (§2.5) — every subject that is High-risk at any recompute while the intervention is open gets a row; the UI (§9, §10) lists all of them, not just the pinned one.
- **`source_snapshot_id` is pinned at creation** and never updated by later recomputes — this is the one design choice that DOES require product confirmation (below), but a default is specified so implementation is not blocked on it indefinitely.

**The one remaining pending decision:** should `source_snapshot_id` (a) stay pinned to whichever subject triggered creation (this plan's default, chosen for auditability — "why was this intervention created" has one stable, permanent answer even if the academic picture shifts later), or (b) be repointed to the currently-worst subject on every recompute (more "live," but means the original triggering reason is lost from the primary record, recoverable only by log-diving `intervention_academic_evidence`)?

**This plan proceeds with (a), pinned**, as its resolved default, and flags this explicitly in §20 as requiring your confirmation before ticket #5 (create-intervention RPC) is implemented — not because the engineering is blocked (it is fully specified either way, §2.5's evidence table works under both options), but because shipping the wrong default silently would misrepresent "resolved" as "confirmed."

**Dedup interaction:** unchanged — `create_intervention_if_qualifying` still no-ops (via the constraint-specific handler, §7) if an open academic intervention already exists for the student; the difference from the prior revision is that the no-op path now also inserts (or upserts, via the table's own `UNIQUE`) a row into `intervention_academic_evidence` for the newly-qualifying snapshot before returning, so evidence accumulates even though no new intervention is created.

## 4. Final Nightly-Processing Design (P0-1, P0-2 — fully specified, not generic)

**Unit of work:** one Edge Function invocation processes exactly one `(school_id, chunk_offset)` pair — i.e., up to `chunk_limit` students of one school, never a cross-school batch and never an unbounded single-school batch.

**Batch size strategy:** `chunk_limit = 1000` (fixed constant for V1). Rationale: the architecture spec's own sizing (§2 of `2026-07-22-...md`) states schools run 200–2,000 students; 1000 keeps every chunk's worst-case compute (per-school sizing × "tens of ms/student" per that same doc) in the low tens-of-seconds range, comfortably inside default Edge Function execution limits (confirmed via `supabase/config.toml` inspection: no `maxDuration` override exists, so conservative defaults apply and must be respected, not assumed generous).

**Pagination strategy:** the dispatcher (`insights-recompute-dispatch`, a lightweight `pg_cron`-scheduled SQL function, mirroring the existing `exam-reminder-cron` pattern of `net.http_post` calls) queries `student_enrollments` (active year, `is_active=true`) count per eligible school. For a school with `students_total <= 1000`, it dispatches one chunk (`offset=0`). For a school exceeding 1000, it dispatches `ceil(students_total / 1000)` chunks, each a **separate** `net.http_post` call with its own `{school_id, offset, limit}` body — chunks for the same school are independent invocations, not a single function paging internally (this keeps each invocation's own wall-clock bounded regardless of how large a school ever grows).

**Retry strategy:** a chunk's own `insight_runs` row (§2.2, unique on `(school_id, run_date, chunk_offset)`) is created with `status='running'` at the start of the invocation and flipped to `'completed'` at the end. If an invocation crashes/times out entirely (not just a per-student failure, an actual invocation-level failure), its row is left `status='running'` indefinitely — this is the observable "stuck chunk" signal (§4's monitoring below). Retrying is simply **re-invoking the same `{school_id, offset, limit}`** — safe because (a) `student_risk_snapshots` upserts are idempotent per `(school_id, student_id, kind, computed_for, subject_id)`, and (b) `create_intervention_if_qualifying`'s dedup means re-processing already-handled students creates zero duplicate interventions. A second attempt for the same chunk **updates** the existing `insight_runs` row (matched by its unique constraint) rather than inserting a second one — `INSERT ... ON CONFLICT (school_id, run_date, chunk_offset) DO UPDATE SET status='running', started_at=now()`.

**Transaction boundary:** each student's `(attendance snapshot write + intervention check)` and each `(academic subject snapshot write + intervention/evidence check)` is its own transaction (or savepoint within one connection) — **not** one transaction for the whole chunk. This is what makes per-student/per-subject isolation real rather than aspirational: a failure mid-way through student #400 of 1000 cannot roll back students #1–399's already-committed snapshots.

**Failure boundary (P0-1, the core fix):**
```
FOR each active student in this chunk:
  BEGIN  -- savepoint-equivalent: a nested exception boundary, not the outer transaction
    TRY: compute + upsert attendance snapshot; call create_intervention_if_qualifying
    CATCH (any error):
      INSERT INTO insight_run_failures (run_id, student_id, kind, error_message)
      increment insight_runs.students_failed
      CONTINUE to next student  -- never abort the loop
  FOR each subject in this student's active subjects:
    TRY: compute + upsert academic snapshot for this subject; call create_intervention_if_qualifying / evidence insert
    CATCH (any error):
      INSERT INTO insight_run_failures (run_id, student_id, kind, subject_id, error_message)
      increment insight_runs.students_failed  -- (or a separate subject-failure counter; students_failed is a coarse proxy)
      CONTINUE to next subject
  increment insight_runs.students_processed
```
One bad subject cannot abort its student's attendance processing or the student's other subjects. One bad student cannot abort the chunk. One failed chunk cannot abort another chunk (separate invocations) or another school (separate dispatch entirely) — this satisfies every bullet in the audit's P0-1/P0-2 requirement list.

**Timeout strategy:** the 1000-student chunk cap (above) is the primary defense. As a secondary guard, the Edge Function itself tracks elapsed wall-clock time and, if a configurable soft budget (e.g., 100 seconds, leaving headroom under the platform default) is exceeded mid-chunk, it stops processing further students in that chunk, marks `insight_runs.status='completed'` for the students actually processed (a **partial-chunk completion**, distinct from a crash — `students_processed < students_total` on a `'completed'` row is a valid, observable state meaning "ran out of budget, not an error"), and does **not** automatically re-dispatch the remainder — the next night's regular chunking naturally picks up any student who wasn't reached (since chunking is by `offset` into the active-student list, not by "students not yet done today," a soft-budget-truncated chunk means some students simply get processed the next scheduled run instead of today — acceptable staleness, matching the architecture spec's own explicit trade-off: "up to 1-day staleness... fine for risk trends").

**Concurrency strategy:** `pg_advisory_xact_lock(hashtext(school_id::text))` acquired at the start of each invocation's transaction, held for the duration of that chunk's processing. This prevents two overlapping invocations for the *same school* (e.g., a manual "Recompute now" racing the scheduled dispatch) from double-processing simultaneously — wasted compute, not a correctness bug (idempotent upserts would make it harmless either way), but the lock avoids the waste and avoids two processes writing `insight_run_failures` for the same run confusingly. Different schools' invocations never contend with each other (different lock keys, fully parallel).

**Logging:** `insight_runs` (per chunk, §2.2) + `insight_run_failures` (per failed unit, §2.3) are the structured log — consistent with this repo's existing convention of using tables, not an external log aggregator, as the durable record (no structured logger exists anywhere in this codebase, confirmed in the audit).

**Metrics (queryable, not push-based — matching D15's "derive on read" precedent used elsewhere in this repo):**
- Duplicate-suppression rate: qualifying snapshots written vs. new interventions created, per run.
- Failure rate: `SELECT school_id, run_date, students_failed::float / NULLIF(students_total,0) FROM insight_runs`.
- Stuck runs: `SELECT * FROM insight_runs WHERE status='running' AND started_at < now() - interval '30 minutes'`.

**Operational recovery — the runbook (P1-8):**
1. Each morning after the scheduled nightly window, an operator (or, ideally, a scheduled follow-up `pg_cron` check — but per the audit's honest framing, this plan specifies a **manual** daily check during the pilot period, since no alerting infra exists anywhere in this repo to page anyone automatically) runs: `SELECT school_id, run_date, chunk_offset, status, students_total, students_processed, students_failed FROM insight_runs WHERE run_date = CURRENT_DATE AND status != 'completed';`
2. For any row with `status='running'` older than ~30 minutes: the invocation likely crashed. Re-invoke that exact `{school_id, offset, limit}` manually (idempotent per the retry strategy above).
3. For any row with `status='completed'` but `students_failed > 0`: query `insight_run_failures` for that `run_id`, inspect `error_message` per student — these are real data-quality issues (e.g., a student with zero attendance rows) that likely need a data fix, not a re-run.
4. This is documented as an explicit pilot-period manual runbook step (Jira ticket #21/#22, §14), not left implicit — matching the audit's P1-4/P1-8 requirement.

## 5. Final Assignment Design (P1-5 resolved)

**Fix, scoped to this feature only, not touching shared helpers:** `create_intervention_if_qualifying`'s assignee-resolution query (previously just joining `section_assignments.class_teacher_id`) now additionally requires the resolved teacher to hold an **active** role:

```sql
SELECT sa.class_teacher_id INTO v_assignee
FROM public.student_enrollments se
JOIN public.academic_years ay ON ay.id = se.academic_year_id AND ay.status = 'active'
JOIN public.section_assignments sa ON sa.section_id = se.section_id AND sa.academic_year_id = ay.id
JOIN public.user_roles ur ON ur.user_id = sa.class_teacher_id
  AND ur.school_id = p_school_id AND ur.role = 'teacher' AND ur.is_active = true  -- P1-5 fix
WHERE se.student_profile_id = p_student_id AND se.is_active = true;

IF v_assignee IS NULL THEN
  -- fallback: any ACTIVE principal or school_admin (already implicitly required is_active in the original design;
  -- this revision makes it explicit rather than assumed)
  SELECT ur.user_id INTO v_assignee FROM public.user_roles ur
  WHERE ur.school_id = p_school_id AND ur.role IN ('principal','school_admin') AND ur.is_active = true
  ORDER BY ur.role = 'principal' DESC
  LIMIT 1;
END IF;

IF v_assignee IS NULL THEN
  RAISE EXCEPTION 'no_valid_assignee';  -- observable failure, logged to insight_run_failures by the caller, not a silent NULL insert
END IF;
```

**Why this is feature-local, not a fix to `teaches_section()`/`teaches_student()`:** those shared functions are used for *write-scope authorization* (can this teacher currently edit this record), a different concern from *assignment* (who gets a brand-new task). Changing their behavior would silently affect Homework/Discipline/Exam-Results RLS across the whole app — explicitly out of scope and risky to touch as a side effect of this feature. **Recommendation, not action taken here:** file a separate, independent follow-up ticket to evaluate whether `teaches_section()` itself should also filter on `user_roles.is_active`, reviewed on its own merits against its existing call sites.

**Fallback remains deterministic:** principal-before-school_admin ordering is arbitrary but fixed (`ORDER BY role='principal' DESC`), so the same input always resolves to the same assignee — no randomness.

**Reassignment target validation** (§7, `reassign_intervention` RPC) gets the identical `ur.is_active = true` check — a principal cannot reassign to an inactive/departed teacher either.

## 6. Final Notification/Idempotency Design (P0-3 resolved)

**Client-generated request ID:** both web and mobile generate a UUID **once per logical send-intent**, using `crypto.randomUUID()` (web, native browser API, no new dependency) and `expo-crypto`'s `randomUUID()` (mobile — already a transitive dependency of the Expo SDK, confirmed no new package needed). This ID is held in the calling component's state for the lifetime of that specific tap-to-confirm flow.

**RPC signature (revised):**
```sql
notify_parent_for_intervention(p_intervention_id uuid, p_client_request_id uuid) RETURNS uuid
```

**Database storage & uniqueness constraint:** `intervention_parent_notifications.client_request_id` + `UNIQUE(intervention_id, client_request_id)` (§2.6).

**Retry behavior (exact):**
```sql
BEGIN
  INSERT INTO public.intervention_parent_notifications (intervention_id, client_request_id, notification_id, sent_by)
  VALUES (p_intervention_id, p_client_request_id, v_notif_id, auth.uid())
  RETURNING id INTO v_ipn_id;
EXCEPTION WHEN unique_violation THEN
  -- P1-6: check it's THIS constraint, not some unrelated one
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'intervention_parent_notifications_intervention_id_client_re_key' THEN
    -- exact retry of the same logical request: return the ALREADY-EXISTING result, not an error, not a new send
    SELECT notification_id INTO v_notif_id FROM public.intervention_parent_notifications
    WHERE intervention_id = p_intervention_id AND client_request_id = p_client_request_id;
    RETURN v_notif_id;
  ELSE
    RAISE;  -- a genuinely different constraint violation must not be hidden
  END IF;
END;
```
Note: the `notifications` INSERT itself happens **before** this block, inside the same transaction — if the retry hits the `unique_violation` branch, the transaction as a whole still only commits **one** `notifications` row total across both the original and retried call, because the retry's own `notifications` INSERT attempt is rolled back by the exception before reaching the `intervention_parent_notifications` insert... **this requires re-ordering the RPC body**: the `intervention_parent_notifications` insert-with-conflict-check must happen **first** (cheap, no side effect), and the `notifications` row + push trigger only proceed if that first insert actually succeeded (i.e., this is genuinely a new request). Exact ordering:
```sql
-- 1. Claim the idempotency slot FIRST, before any side effect.
INSERT INTO public.intervention_parent_notifications (intervention_id, client_request_id, sent_by)
VALUES (p_intervention_id, p_client_request_id, auth.uid())
ON CONFLICT (intervention_id, client_request_id) DO NOTHING
RETURNING id INTO v_ipn_id;

IF v_ipn_id IS NULL THEN
  -- already claimed by an earlier call with this exact client_request_id — return the prior result, no new send
  SELECT notification_id INTO v_notif_id FROM public.intervention_parent_notifications
  WHERE intervention_id = p_intervention_id AND client_request_id = p_client_request_id;
  RETURN v_notif_id;
END IF;

-- 2. Only now, having claimed the slot, do the actual side effect.
INSERT INTO public.notifications (...) VALUES (...) RETURNING id INTO v_notif_id;
UPDATE public.intervention_parent_notifications SET notification_id = v_notif_id WHERE id = v_ipn_id;
```
This `ON CONFLICT ... DO NOTHING` form is simpler and more correct than the earlier exception-catching sketch — it avoids the ordering hazard entirely and is the pattern this plan finalizes on.

**Response behavior:** both the original call and any retry of the same `client_request_id` return the identical `notification_id` — the client cannot distinguish "this was my first send" from "this was a safe retry of my own send," which is the correct behavior (it shouldn't need to).

**Expiry/window:** **none needed** — uniqueness is scoped to `(intervention_id, client_request_id)` forever, not a rolling time window. A deliberate "Send again" always generates a **fresh** UUID (new logical request), so there is no scenario where a legitimate resend is blocked, and no scenario where an old ID could be reused to accidentally suppress a new, unrelated send.

**Web behavior:** the "Notify Parent" confirm button generates the UUID on first render of the confirmation sheet (not on click), passes it to the RPC call; if the network request itself fails/times out and the UI's own retry logic (or the user re-clicking the *same* still-open confirm dialog) fires again, the same UUID is reused. Closing the sheet and reopening it (a genuinely new user intent) generates a new UUID.

**Mobile behavior:** identical pattern — UUID generated when the Notify Parent sheet mounts, reused across any automatic retry of that same sheet's submit action, regenerated only if the sheet is dismissed and reopened.

**Audit behavior:** `audit_log.metadata` includes `client_request_id` for every notify action, so an investigation can distinguish "the teacher sent this 3 times deliberately" (3 different `client_request_id`s, 3 rows in `intervention_parent_notifications`) from "the network retried and it correctly only sent once" (1 row, but possibly 2+ RPC invocations in the raw request logs).

## 6a. Final Timezone Design (P1-7 resolved — documented product constraint, not a silent hardcode)

**Resolved, not left open:** V1 explicitly commits to a **single fixed timezone, IST (`Asia/Kolkata`), for all schools using this feature**, formalizing an assumption that already exists in the source architecture document (`2026-07-22-eduos-feature-architecture-design.md` §1: "assume per-school single timezone, default IST" is listed as an existing, already-accepted product assumption for the whole platform, not something newly invented for this plan). This is a **documented product constraint for V1**, not an oversight:
- **Due dates**: `v_school_today := (now() AT TIME ZONE 'Asia/Kolkata')::date` — fixed, not read from a `schools` column (none exists).
- **Nightly execution**: the `pg_cron` schedule for `insights-recompute-dispatch` is set in a UTC-equivalent cron expression chosen so it fires safely after IST midnight (e.g., `30 19 * * *` UTC = 01:00 IST), matching the existing convention already used by other cron jobs in this repo (`exam-reminder-cron` etc., all scheduled the same way).
- **"Today"/overdue**: both computed as `(now() AT TIME ZONE 'Asia/Kolkata')::date` consistently everywhere the concept is needed (RPC due-date calc, admin queue's overdue-tag client logic).
- **Notifications**: no timezone sensitivity beyond display timestamps, which already use each user's device-local rendering (standard `created_at TIMESTAMPTZ` behavior, unaffected).
- **Tests**: `.test.sql` fixtures fix `SET TIME ZONE 'Asia/Kolkata'` or use `AT TIME ZONE` explicitly in assertions to avoid CI-runner-timezone flakiness.

**If this product constraint is wrong** (a school genuinely needs a different timezone), the fix is a new `schools.timezone TEXT DEFAULT 'Asia/Kolkata'` column plus threading it through the same call sites above — a contained, well-understood change, deliberately **not** built speculatively for V1 since no evidence of a non-IST school exists anywhere in this repository's data model or docs.

## 7. Final Security/RLS Design (P1-6 incorporated; otherwise unchanged from the audited version, re-verified)

All RLS policies from the prior revision stand as audited (§14.1–§14.5 of the prior document, re-confirmed correct in the audit's §8 Security Review: PASS across RLS, authorization, cross-school isolation, parent isolation, server-side business rules, auditability). The one change is the **constraint-specific** exception handling inside `create_intervention_if_qualifying`, per P1-6:

```sql
BEGIN
  INSERT INTO public.interventions (...) VALUES (...) RETURNING id INTO v_intervention_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'uq_interventions_open_per_student_kind' THEN
    -- expected dedup path (D19 §8): an open intervention already exists, no-op
    SELECT id INTO v_intervention_id FROM public.interventions
    WHERE student_id = p_student_id AND kind = p_kind AND status IN ('pending','in_progress');
    -- §3: still record this snapshot as sibling evidence even though no new intervention was created
    INSERT INTO public.intervention_academic_evidence (intervention_id, snapshot_id)
    VALUES (v_intervention_id, p_snapshot_id) ON CONFLICT DO NOTHING;
  ELSE
    RAISE;  -- any OTHER unique constraint violation is a real bug, must surface, never silently swallowed
  END IF;
END;
```
This is the exact fix for P1-6: a future second unique constraint on `interventions` (however unlikely) can never be silently absorbed by this handler.

Assignment-related RLS is otherwise unaffected — `reassign_intervention`'s target-validation query gets the same `ur.is_active = true` check described in §5.

## 8. Final Teacher Web Design

Unchanged from the prior revision's §17, with these additions:
- The intervention detail panel's academic risk card now renders **all** rows from `intervention_academic_evidence` (joined to their `student_risk_snapshots`), not just the pinned `source_snapshot_id` — labeled "Also flagged: {subject}" for non-pinned siblings, so a teacher sees the full current academic picture even though the intervention's primary record stays pinned to its original trigger (§3).
- Notify Parent's confirm dialog generates and holds the `client_request_id` per §6's web behavior spec.

## 9. Final Teacher Mobile Design

Unchanged from the prior revision's §18, with these additions:
- Same academic-evidence-list rendering as web (§8).
- Notify Parent sheet generates/holds `client_request_id` per §6's mobile behavior spec, using `expo-crypto`.
- Dismiss-reason modal remains the previously-specified real modal (not `Alert.prompt`/`Alert.alert`) — re-confirmed correct in the audit (§10 Mobile Production Review), no change needed.

## 10. Final Admin Design

Unchanged from the prior revision's §19, with the addition that the reassignment teacher-picker **excludes inactive teachers from the list itself** (not just rejects them server-side) — client-side UX improvement layered on top of the server-side enforcement from §5/§7, so an admin never even sees a picker option that would be rejected.

## 11. Final Parent Behavior

Unchanged from the prior revision's §20 — re-confirmed by the audit as correctly designed (zero new screens, verified-compatible `notifications.type` free-text column, correct RLS non-access). No changes required by any P0/P1 finding.

## 12. Final QA Strategy (P1-9 resolved — explicit automated/manual split)

### 12.1 AUTOMATED

| Layer | Tooling | Scope |
|---|---|---|
| Pure-function unit tests | **New**: `vitest`, scoped to `packages/insights` only | `ATTN_RISK_V1`/`PERF_V1` fixture-based tests: boundary attendance %, division-by-zero (zero counted days), `n<3` exam insufficient-data path, decimal/rounding behavior, deterministic repeat-run equality |
| DB/RLS/RPC integration tests | `supabase/tests/*.test.sql`, existing manual `docker exec` convention | All of §13's rows marked "Automated" below |

### 12.2 MANUAL

| Layer | Scope |
|---|---|
| Web click-through | Full lifecycle: queue render, filter/sort, detail, start/complete/dismiss, Notify Parent, admin reassignment |
| Mobile click-through | Same, on both iOS and Android specifically (Android dismiss-reason modal is the one place this repo's own precedent — Leave — got this wrong; must be manually re-verified, not assumed fixed by code review alone) |
| Regression | Attendance marking, Academics/exam-results entry, Leave request/approval, Discipline record creation, parent More→Notifications screen — all manually re-verified unaffected |
| Accessibility | Screen-reader label correctness (VoiceOver/TalkBack), severity-never-color-only — no automated a11y tooling exists in this repo, manual only |
| Nightly-job resilience (P0-1/P0-2) live behavior | Seed a school with one deliberately malformed student record, trigger a manual recompute, manually confirm the school's run still reaches `'completed'` with `students_failed=1` and the rest of the students processed correctly — **this specific check is manual** because simulating an Edge Function's real execution-time/chunking behavior end-to-end is not practically automatable within this repo's existing tooling, though the underlying per-student exception-handling logic itself (§13, TM-01-revised) is automated at the SQL level |

**Every P0 has at least one automated test where technically feasible** (§13 marks each explicitly); the one P0 (nightly-job resilience under *real* execution-time/chunking conditions, as opposed to the per-student exception-handling logic which *is* automated) that remains manual-only is called out above with the specific reason it can't be automated given this repo's current tooling, not silently left uncovered.

## 13. Final Test Matrix (revised — new/changed rows only; all prior rows TM-06 through TM-34 from the audited plan remain valid and are carried forward unchanged except where noted)

| ID | Scenario | Automated / Manual | Expected result |
|---|---|---|---|
| TM-01r | Attendance HIGH creates intervention | **Automated** (`.test.sql`) | Unchanged from prior |
| TM-04r | Dedup: repeated nightly HIGH snapshot | **Automated** | Unchanged from prior |
| TM-06r | Academic: any 1 subject High risk triggers, `source_snapshot_id` pinned | **Automated** | 1 intervention, `source_snapshot_id` = the triggering snapshot; `intervention_academic_evidence` has exactly 1 row, `is_pinned=true` |
| TM-35 | Academic: 2nd subject becomes High risk while intervention open | **Automated** | No new intervention (dedup holds); `intervention_academic_evidence` gains a 2nd row for the new subject; `source_snapshot_id` on `interventions` is **unchanged** (still points to the original subject) |
| TM-36 | Academic: originally-pinned subject recovers, another stays High | **Automated** | `source_snapshot_id` still unchanged (pinned forever per §3); UI-level display (manual check) shows the still-High subject via the evidence table |
| TM-37 | Nightly: one student's computation throws mid-chunk | **Automated** (`.test.sql` simulating the per-student exception boundary at the SQL/RPC level) | `insight_run_failures` gets 1 row; `insight_runs.students_failed=1`, `students_processed` includes all OTHER students in the chunk; run still reaches `status='completed'` |
| TM-38 | Nightly: one subject's computation throws, rest of that student's processing continues | **Automated** | `insight_run_failures` row for that `(student,subject)`; the student's attendance snapshot AND other subjects' snapshots still committed |
| TM-39 | Nightly: same chunk re-invoked after a crash (retry) | **Automated** | `insight_runs` row for that `(school_id,run_date,chunk_offset)` updates in place (no duplicate row, per the `UNIQUE` constraint + `ON CONFLICT DO UPDATE`); no duplicate `student_risk_snapshots`; no duplicate `interventions` |
| TM-40 | Two chunks of the same school dispatched concurrently (advisory lock) | **Automated** | Second invocation blocks/waits on `pg_advisory_xact_lock` until the first completes, rather than double-processing |
| TM-41 | Notify Parent: exact retry with same `client_request_id` | **Automated** | Exactly 1 `notifications` row and 1 `intervention_parent_notifications` row total across both calls; both calls return the same `notification_id` |
| TM-42 | Notify Parent: deliberate "Send again" with a NEW `client_request_id` | **Automated** | 2nd distinct `notifications` row and `intervention_parent_notifications` row created |
| TM-43 | `create_intervention_if_qualifying` unique_violation handler only swallows the dedup constraint | **Automated** | Simulate an unrelated unique violation (e.g., temporarily via a test-only second constraint) and confirm it is NOT swallowed — `RAISE` propagates |
| TM-44 | Assignment skips an inactive class teacher, falls back correctly | **Automated** | `section_assignments.class_teacher_id` points to a teacher with `user_roles.is_active=false` → intervention assigned to principal/school_admin instead, `assigned_via='admin_fallback'` |
| TM-45 | Reassignment target validation rejects an inactive teacher | **Automated** | `reassign_intervention` to an inactive teacher id raises rather than succeeding |
| TM-46 | Timezone: due-date computed correctly across an IST midnight boundary | **Automated** | A snapshot computed at `23:59 IST` vs `00:01 IST` produces due dates one calendar day apart, matching `AT TIME ZONE 'Asia/Kolkata'` semantics exactly |

All other rows from the previously-audited test matrix (TM-02, TM-03, TM-05, TM-07 through TM-34) remain valid and unchanged, and are hereby re-classified per §12's automated/manual split (the great majority are `.test.sql` = Automated; the web/mobile/regression/accessibility rows are Manual).

## 14. Final Jira Breakdown (deltas from the audited plan's §28 — tickets #1–#21 retained, revised/added as follows)

| # | Title | Change from prior revision |
|---|---|---|
| 2 | DB: `student_risk_snapshots` schema | Unchanged |
| 3 | Edge Function: `insights-recompute` **+ dispatcher** | **Substantially expanded**: now explicitly scopes the per-school chunked dispatch (§4), per-student/per-subject exception boundaries, advisory locking, and the revised `insight_runs`/`insight_run_failures` schema. This ticket alone likely warrants splitting into 3 (dispatcher, per-school processor, failure-isolation logic) at sprint-planning time — flagged, not pre-split here, since the right split boundary is an implementation-time call. |
| 4 | DB: `interventions` schema | Unchanged |
| 4b | **NEW** — DB: `intervention_academic_evidence` schema | §2.5, §3 |
| 5 | RPC: `create_intervention_if_qualifying` | **Revised**: constraint-specific exception handling (§7), inactive-teacher-skipping assignment (§5), academic evidence insertion on dedup path (§3) |
| 6 | RPCs: lifecycle transitions | Unchanged, `reassign_intervention` gets the inactive-teacher validation (§5) |
| 7 | RPC + Edge Fn: `notify_parent_for_intervention` | **Revised**: idempotency-key design (§6), `ON CONFLICT DO NOTHING` claim-then-act pattern |
| 7b | **NEW** — Web + mobile: `client_request_id` generation/passing | §6 web/mobile behavior specs; depends on #7 |
| 9 | `.test.sql` suite | **Expanded** to cover TM-35 through TM-46 |
| 20 | Docs: implementation report + D21 | Now must also record the §3 pinned-evidence decision and the §6a timezone product constraint as formal decisions, not just this plan's internal notes |
| 21 | Rollout: pilot school | **Expanded**: now explicitly includes the daily manual runbook check (§4 Operational Recovery) as a defined pilot-period task, not an implied one |
| 22 | **NEW** — Follow-up (separate, non-blocking): evaluate whether `teaches_section()`/`teaches_student()` should filter on `user_roles.is_active` repo-wide | §5's explicit recommendation; independent of this feature's ship date |

## 15. Final Dependency Graph

```
#1 (pure fns + vitest) ──▶ #2 (snapshot schema) ──▶ #3 (recompute dispatcher + per-school processor + failure isolation)
#4 (interventions schema) ──▶ #4b (academic evidence schema) ──▶ #5 (create-intervention RPC, revised)
#3, #5 ──▶ #6 (lifecycle RPCs, revised reassign validation)
#5, #6 ──▶ #7 (notify RPC, idempotency) ──▶ #7b (client-side request-id wiring)
#5, #6 ──▶ #10 (teacher web) ──▶ #11 (web forms + #7b's web half)
#5, #6 ──▶ #12 (teacher mobile) ──▶ #13 (mobile forms + #7b's mobile half)
#6, #10 ──▶ #14 (admin web, incl. inactive-teacher-filtered picker)
#10, #12, #14 ──▶ #15 (flag/nav) ──▶ #16 (states)
all UI ──▶ #17 (manual regression, per §12.2) ──▶ #18 (security) ──▶ #19 (perf, now incl. large-school chunking validation) ──▶ #20 (docs) ──▶ #21 (pilot rollout + runbook)
#22 (teaches_section follow-up) — independent, no blocking edges
```

## 16. Final Implementation Sequence

| Phase | Contents | Gate to next phase |
|---|---|---|
| 0 | **This document's §20 decision confirmed by product** | Cannot proceed to Phase 2 without it |
| 1 | DB: #2, #4, #4b (schema, RLS) | Migrations apply cleanly; RLS default-deny confirmed |
| 1.5 | `vitest` introduced, #1 (pure fns) | Fixture tests pass, matching algorithms-doc mock-ups exactly |
| 2 | #3 (dispatcher + resilient processor) | TM-37 through TM-40 pass locally against a seeded large/malformed dataset |
| 3 | #5, #6, #7, #7b (domain RPCs, idempotency) | TM-41 through TM-46 pass; full `.test.sql` suite green |
| 4 | Web: #10, #11, #14 | Manual click-through, incl. reassignment excluding inactive teachers |
| 5 | Mobile: #12, #13 | Manual click-through, Android dismiss-reason and Notify-Parent flows specifically re-verified |
| 6 | #15, #16 | Flag-off hides everything; all states render |
| 7 | #17, #18, #19 | Manual regression clean; security checklist signed; large-school (1000+ student) chunking timing empirically measured against real Edge Function limits, not just estimated |
| 8 | #20, #21 | Pilot school live; first week's nightly runs manually runbook-checked daily |

Phase 0 is new relative to the prior revision — it did not exist as an explicit gate before this audit.

## 17. Final Rollout Strategy

Unchanged from the prior revision's §31, with one addition: the pilot period's daily manual `insight_runs` check (§4 Operational Recovery) is now a **named, required** rollout activity for at least the first 7 nightly runs, not an implicit assumption.

## 18. Final Rollback Strategy

Unchanged from the prior revision — additive-only migrations, flag-gated activation, immediate and non-destructive rollback by disabling the flag for the pilot school. The revised `insight_runs`/`interventions`/`intervention_academic_evidence`/`intervention_parent_notifications` schemas are all still purely additive relative to the existing database; nothing about this revision changes the rollback safety profile.

## 19. Final Definition of Done

All items from the prior revision's §32 apply, plus:

- [ ] Nightly job survives a deliberately-injected single-student failure without aborting its chunk (TM-37), and a deliberately-injected single-subject failure without aborting its student (TM-38).
- [ ] A crashed/retried chunk does not create duplicate `insight_runs` rows or duplicate downstream data (TM-39).
- [ ] Two concurrent invocations for the same school serialize correctly via the advisory lock (TM-40).
- [ ] Notify Parent: an exact retry never double-sends (TM-41); a deliberate resend always can (TM-42).
- [ ] `create_intervention_if_qualifying`'s exception handler is proven constraint-specific, not a blanket catch (TM-43).
- [ ] Assignment correctly skips inactive teachers and falls back deterministically (TM-44, TM-45).
- [ ] Timezone behavior verified correct across the IST midnight boundary specifically (TM-46).
- [ ] The §3 academic-evidence-pinning decision has been explicitly confirmed by the user (not merely defaulted) before ticket #5 is considered complete.
- [ ] The pilot rollout's daily manual runbook check has been performed for at least 7 consecutive nightly runs with no unresolved `insight_run_failures` rows older than 48 hours.
- [ ] QA sign-off explicitly distinguishes which checks were automated (`.test.sql`/`vitest`) vs. manual, per §12, in the final test report — not presented as a single undifferentiated "tests passed."

## 20. Remaining Unresolved Product Decisions

Exactly **one** genuine product decision remains, per the audit's own instruction not to silently resolve what the source material doesn't determine:

**Should `interventions.source_snapshot_id` stay permanently pinned to the subject that originally triggered an academic intervention (this plan's shipped default), or should it be repointed to track the currently-worst qualifying subject on every recompute while the intervention remains open?**

Neither D19 nor the algorithms specification determines this. This plan ships with **pinned** as the default (§3), fully engineered either way (the `intervention_academic_evidence` table, §2.5, works identically under both options — only `interventions.source_snapshot_id`'s update behavior differs), specifically so that engineering is not blocked waiting on this answer. But per the audit's explicit instruction, this is flagged as requiring your confirmation, not silently decided.

Every other item raised in the audit (P0-1, P0-2, P0-3, P1-5, P1-6, P1-7, P1-8, P1-9) has a fully specified engineering resolution above — none of the remaining items require a product decision to proceed with implementation.

---

## FINAL STATUS

**NOT IMPLEMENTATION READY**

Every P0 and P1 from the audit now has a fully specified engineering resolution in this document — nightly-job resilience, batching, idempotency, inactive-teacher handling, constraint-specific exception handling, the timezone constraint, the operational runbook, and the automated/manual QA split are all concretely designed, not TODOs. If §20's one open question were answered, this plan would be **IMPLEMENTATION READY**.

But it is not answered, and per the explicit instruction governing this audit-hardening pass — "do not silently choose a behavior" for the one thing the source documents genuinely don't determine — this plan cannot honestly claim full implementation-readiness while a real, engineering-independent product decision remains outstanding. This is a **one-question gate**, not a re-opened architecture review: tickets #1, #2, #3, #4, #4b (Phase A and schema work) are unaffected by §20 and can begin immediately; only ticket #5 (`create_intervention_if_qualifying`) and anything downstream of it are blocked until §20 is answered.

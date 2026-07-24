# Edu-OS — Full Feature Architecture Design

> Date: 2026-07-22
> Method: `proyecto26/system-design-skills` reasoning loop
> (Clarify → Estimate → High-level design → Trade-offs → Failure modes → Iterate)
> Scope: architect **every** feature in `Edu_OS - Feature Doc (1).xlsx` on the existing
> multi-tenant Supabase + Next.js + Expo codebase.
>
> **Pro-tip constraint (hard):** No real/LLM AI behind "AI Features." Every AI feature is a
> **deterministic mathematical engine** (statistics + weighted heuristics + rule/template banks).
> Same inputs → same outputs, fully explainable, unit-testable, zero inference cost.

---

## 0. Context — what already exists

The platform is a live multi-tenant school ERP. This design **extends** it; it does not rebuild it.

| Layer | Stack | Notes |
|---|---|---|
| Monorepo | pnpm + turbo | `apps/web` (Next.js App Router), `apps/mobile` (Expo + NativeWind), `packages/{shared,supabase,ui}` |
| Backend | Supabase | Postgres + Row-Level Security, Edge Functions (Deno), `pg_cron`, Vault |
| Tenancy | `schools.features_enabled JSONB` | **Module-toggle scaffolding already present but unenforced** |
| Identity | `user_roles` + RLS scope hook | roles: `super_admin, school_admin, principal, teacher, student, parent` |
| Payments | Razorpay | order create + webhook edge functions |
| Messaging | SMS hook, Expo push, `pg_cron` | reminders, birthday wishes already scheduled |
| Reporting | `generate-report-card` edge fn | HTML template → PDF |

**Existing tables (28):** schools, academic_years, classes, sections, subjects, profiles, user_roles,
student_profiles, teacher_profiles, student_enrollments, section_assignments, attendance_records,
timetable, syllabus, exams, exam_results, report_card_templates, fee_structures, fee_types,
fee_line_items, fee_payments, line_item_payments, payments, announcements, school_gallery,
homework, homework_attachments, homework_status, discipline_records, feedback, notifications,
bonafide_certificates, audit_log.

**Feature-Doc mapping — build vs. extend:**

| Feature-Doc item | Status | Action |
|---|---|---|
| Fee Collection / Receipts / Outstanding | ✅ exists | Reuse; add Fee-Status dashboard rollup |
| Announcements / Gallery | ✅ exists | Reuse |
| Homework (create/submit/feedback/grade) | ✅ exists | Reuse |
| Geo-based attendance tracker | 🟡 attendance exists, no geo | **Extend** |
| Examination Schedule | 🟡 exams exist, no datesheet | **Extend** |
| Online admission + Admission tracking | 🔴 new | **Build** (Module A) |
| KYC document management | 🔴 new | **Build** (Module B) |
| Test (Socrative-style quizzing) | 🔴 new | **Build** (Module C) |
| Leave application/approval/tracking | 🔴 new | **Build** (Module D) |
| Module Toggle (flag-based) | 🟡 column exists, unenforced | **Build enforcement** (Foundation F1) |
| 6 × "AI Features" | 🔴 new | **Build Insights Engine** (Module E) — deterministic |

---

## 1. Clarify — requirements & scope

### Functional
1. **Foundations** — enforce per-school module toggles across DB (RLS/RPC), API, web routing, mobile tabs, plus a super-admin toggle console.
2. **Geo attendance** — teacher marks attendance only inside a school geofence; capture lat/lng, validate radius, flag out-of-bounds.
3. **Exam schedule** — datesheet per exam: subject × date × time-slot × room × invigilator, with conflict detection; publish to students/parents.
4. **Admissions** — public online form (no login) → lead → application pipeline (stages) → convert to enrolled student.
5. **KYC documents** — per-student/parent document vault with types, upload, verify/reject workflow, expiry tracking.
6. **Testing (Socrative-style)** — teacher authors quizzes (MCQ/TF/short), runs **live** (synchronous, shared room code) or **async** (window); auto-grade objective items; live leaderboard.
7. **Leave** — student/parent/teacher submits leave request → approver workflow → calendar + attendance integration.
8. **Insights ("AI")** — 6 deterministic analytics products (see §6).

### Non-functional
- **Multi-tenant isolation** — every new table carries `school_id`; RLS mandatory; no cross-tenant leakage.
- **Explainability** — every insight must show *why* (contributing factors), never a black box.
- **Offline-tolerant mobile** — attendance/quiz answers must survive flaky networks (queue + retry).
- **Determinism** — insights reproducible; recompute is idempotent.
- **Cost** — zero external inference spend; compute must run inside Supabase/Edge budget.
- **Auditability** — sensitive writes (KYC verify, admission convert, leave approve, marks) hit `audit_log`.

### Out of scope (YAGNI, this phase)
- Real ML/LLM inference, proctoring/anti-cheat video, payment gateways beyond Razorpay,
  transport/hostel/library modules, native offline-first sync engine (we use a lightweight queue only),
  timezone plurality (assume per-school single timezone, default IST).

### Assumptions
- Per-school scale is small (hundreds–few-thousand students). The platform is many small tenants,
  not one huge one. This is the single most important sizing fact — it removes sharding, search
  clusters, and streaming from the design.
- India-first: SMS + Razorpay + IST + English/vernacular templates.

---

## 2. Estimate — back-of-the-envelope

| Quantity | Value | Consequence |
|---|---|---|
| Schools (tenants) | 50 → 1,000 | Single Postgres, RLS partitioning by `school_id` is enough |
| Students / school | 200 – 2,000 | Per-tenant queries touch ≤ few-thousand rows |
| Peak concurrent users | school hours, ~5–10% of a school | Low QPS (tens–low-hundreds), not thousands |
| Attendance writes | 1/student/day ≈ ≤2k rows/school/day | Trivial |
| Insight recompute | nightly batch, O(students × subjects) | ~ tens of ms/student of pure arithmetic → seconds/school |
| Live quiz burst | 1 class ≈ 30–60 students answering ~1 q/30s | ≈ 1–2 writes/sec/room — **the only real-time hotspot** |
| Document storage | ~5 docs × 500 KB × students | GBs/tenant → object store + CDN, never in Postgres |

**Reading of the numbers:** the workload is *many small tenants with low QPS*. The only component
with real-time pressure is the **live quiz room** (needs pub/sub). Everything else is comfortably a
request/response CRUD + nightly batch. **We therefore precompute insights nightly and serve snapshots**
rather than computing on read — cheaper, simpler, and freshness of "yesterday" is fine for risk signals.

---

## 3. High-level design

### 3.1 System diagram

```
                 ┌────────────────────────── Clients ──────────────────────────┐
                 │  apps/web (Next.js, admin/teacher)   apps/mobile (Expo)       │
                 │  + PUBLIC admission form (no auth)                            │
                 └───────────────┬──────────────────────────┬───────────────────┘
                                 │ supabase-js (RLS)         │ Realtime (live quiz)
                 ┌───────────────▼──────────────────────────▼───────────────────┐
                 │                      SUPABASE                                  │
                 │  Postgres + RLS   │  Edge Functions (Deno)  │  Realtime pub/sub│
                 │  ┌─────────────┐  │  admissions-notify      │  quiz rooms      │
                 │  │ feature_    │  │  quiz-grade             │                  │
                 │  │ enabled()   │  │  insights-recompute ◄───┼── pg_cron nightly│
                 │  │ RLS guards  │  │  parent-comms-dispatch  │                  │
                 │  └─────────────┘  │  (reuse: sms/push/razorpay/report-card)   │
                 │  Storage buckets: kyc-docs, quiz-media, admission-docs (CDN)   │
                 │  Vault: gateway keys, SMS creds                                │
                 └────────────────────────────────────────────────────────────────┘
```

### 3.2 Package layout (new)

```
packages/
  insights/            # @edu-os/insights — PURE deterministic functions, unit-tested
    src/
      attendance-risk.ts        # §6.1
      performance-forecast.ts   # §6.2
      fee-default-risk.ts       # §6.3
      psychometric.ts           # §6.4  (instrument scoring + norm tables)
      report-analysis.ts        # §6.5
      comms-rules.ts            # §6.6  (trigger → template selection)
      math/                     # regression, ewma, logistic, percentile helpers
      templates/                # message + narrative template banks (data, not code)
  shared/
    src/features/registry.ts    # F1 — canonical feature-key registry + types
```

The insights math lives in a **pure package** (no I/O) so it is trivially unit-testable and can run
in either an Edge Function (batch) or the client (on-demand preview). The Edge Function is a thin
I/O shell: read rows → call pure fn → write snapshot.

### 3.3 API sketch (representative, not exhaustive)

RPCs are `SECURITY DEFINER` Postgres functions guarded by `feature_enabled()` + role checks;
Edge Functions handle batch/external I/O.

```
-- Foundation
feature_enabled(school_id uuid, key text) returns bool          -- SQL, used in RLS + guards

-- Geo attendance
rpc mark_attendance(session_id, records[], lat, lng, accuracy)  -- validates geofence server-side

-- Exam schedule
rpc upsert_exam_slot(exam_id, subject_id, date, start, end, room_id, invigilator_id)
   -> raises on room/invigilator/student clash

-- Admissions (public)
POST edge: admission-submit  (rate-limited, captcha, no auth) -> creates lead
rpc advance_application(app_id, to_stage, note)
rpc convert_application(app_id) -> creates profile+student_profile+enrollment (txn)

-- KYC
rpc request_document(student_id, doc_type)
POST storage: kyc-docs/{school_id}/{student_id}/...  (RLS-scoped)
rpc review_document(doc_id, decision, reason)

-- Testing
rpc create_quiz(...) / add_question(...)
rpc open_quiz_room(quiz_id) -> room_code ; realtime channel `quiz:{room_id}`
rpc submit_answer(attempt_id, question_id, answer)  -> autograde objective
edge: quiz-grade (finalizes attempt, computes score)

-- Leave
rpc submit_leave(subject_type, from, to, reason, attachment?)
rpc decide_leave(leave_id, decision, note) -> on approve, write attendance 'excused'

-- Insights
edge: insights-recompute (cron nightly + manual trigger) -> writes snapshots
rpc get_student_insights(student_id) -> reads latest snapshot (RLS)
```

### 3.4 Data model (new tables — all carry `school_id`, all RLS-guarded)

```
-- Foundation F1: feature registry is code-side; toggles live in schools.features_enabled (JSONB)

-- Geo attendance (extend attendance_records + config)
school_geofences(id, school_id, name, center_lat, center_lng, radius_m, is_active)
attendance_records += captured_lat, captured_lng, gps_accuracy_m, geo_status  -- 'inside'|'outside'|'no_gps'

-- Exam schedule
rooms(id, school_id, name, capacity)
exam_schedule_slots(id, school_id, exam_id, subject_id, section_id, exam_date,
                    start_time, end_time, room_id, invigilator_id)   -- unique guards prevent clashes

-- Admissions
admission_leads(id, school_id, applicant_name, dob, class_applied_id, parent_name,
                parent_phone, parent_email, source, payload JSONB, created_at)
admission_applications(id, school_id, lead_id, stage, assigned_to, score, notes, decided_at)
   stage ENUM: enquiry|application|document_review|test|interview|offered|accepted|rejected|enrolled
admission_stage_events(id, application_id, from_stage, to_stage, actor_id, note, created_at)

-- KYC documents
document_types(id, school_id, name, applies_to, is_required, expiry_tracked)  -- applies_to: student|parent|teacher
documents(id, school_id, subject_type, subject_id, document_type_id, storage_path,
          status, reviewer_id, review_reason, issued_on, expires_on, created_at)
   status ENUM: pending|submitted|verified|rejected|expired

-- Testing
quizzes(id, school_id, created_by, title, subject_id, class_id, mode, time_limit_s,
        opens_at, closes_at, shuffle, status)          -- mode: live|async
quiz_questions(id, quiz_id, school_id, type, prompt, media_path, options JSONB,
               correct JSONB, points, order)           -- type: mcq|multi|tf|short|numeric
quiz_rooms(id, quiz_id, school_id, room_code, host_id, state, current_q, started_at)
quiz_attempts(id, quiz_id, room_id, student_id, school_id, started_at, submitted_at, score, max_score)
quiz_answers(id, attempt_id, question_id, school_id, answer JSONB, is_correct, points_awarded, answered_at)

-- Leave
leave_requests(id, school_id, subject_type, subject_id, requester_id, from_date, to_date,
               reason, attachment_path, status, approver_id, decided_at, decision_note)
   status ENUM: pending|approved|rejected|cancelled

-- Insights (snapshot tables — recomputed, not authored)
insight_runs(id, school_id, kind, started_at, finished_at, rows, params_hash)
student_risk_snapshots(id, school_id, student_id, kind, score, band, factors JSONB,
                       recommended_action, computed_at)   -- kind: attendance|performance|fee_default
psychometric_instruments(id, school_id, code, name, items JSONB, scoring JSONB, norms JSONB)
psychometric_results(id, school_id, student_id, instrument_id, raw JSONB, scored JSONB, profile JSONB, taken_at)
report_analyses(id, school_id, student_id, exam_id, stats JSONB, narrative TEXT, computed_at)
comms_outbox(id, school_id, student_id, trigger, channel, template_id, rendered TEXT,
             status, scheduled_for, sent_at)   -- feeds existing sms/push pipeline
```

---

## 4. Foundations

### F1 — Module Toggle (flag-based)

**The keystone.** Everything else registers against it.

- **Registry** (`packages/shared/src/features/registry.ts`): a typed const map of every toggleable
  module → `{ key, label, category, defaultOn, dependsOn? }`. Single source of truth shared by web,
  mobile, and the super-admin console. Prevents "magic string" drift in `features_enabled`.
- **Enforcement is layered — never trust the client:**
  1. **DB (authoritative):** `feature_enabled(school_id, key)` SQL helper (`STABLE`, reads
     `schools.features_enabled`). RLS policies and `SECURITY DEFINER` RPCs for a module call it, so a
     disabled module rejects writes even if a client is patched.
  2. **API/Edge:** guard clause returns 403 when disabled.
  3. **Web:** middleware + a `useFeature(key)` hook hide routes/nav.
  4. **Mobile:** tab/route registry filters on features fetched at session start.
- **Super-admin console:** toggle grid per school; writes `features_enabled` + `audit_log`.
- **Dependencies:** e.g. `insights.performance` requires `exams`; registry encodes `dependsOn` and the
  console blocks enabling a module whose dependency is off.

**Trade-off (solves / worsens / when-to-change):** JSONB column — *solves*: zero-migration new flags,
one-row read; *worsens*: no FK integrity on keys (mitigated by the code registry as the gate);
*change when*: flags need per-flag audit history or per-plan billing → promote to a `school_modules` table.

---

## 5. Feature modules (build & extend)

Each module: purpose → data → flow → the one non-obvious decision.

### Module A — Admissions (Build)
- **Public form** served by web at `/apply/{school-domain}`, unauthenticated → `admission-submit`
  Edge Function (rate-limit + hCaptcha + honeypot) writes an `admission_lead`. This is the only
  **unauthenticated write** in the system, so it is isolated in an Edge Function with its own throttle,
  never a direct RLS insert.
- **Pipeline**: Kanban of stages; `advance_application` records `admission_stage_events` (full audit).
- **Convert**: `convert_application` runs one transaction → `profiles` + `student_profiles` +
  `student_enrollments`, reusing existing onboarding paths. Idempotent (guarded by `lead_id` uniqueness).
- **Decision:** leads and applications are separate tables — a lead may never become an application;
  keeping them split keeps the funnel analytics clean and avoids nullable-stage soup.

### Module B — KYC Documents (Build)
- `document_types` per school defines required docs per role. A nightly job materializes a per-student
  **checklist** (required − submitted) so admins see completeness at a glance.
- Uploads go to a private `kyc-docs` bucket, path `{school_id}/{subject_id}/...`; Storage RLS mirrors
  table RLS. Files **never** touch Postgres.
- Review workflow: `pending → submitted → verified|rejected`; `expires_on` + nightly job flips to
  `expired` and emits a comms trigger.
- **Decision:** documents are polymorphic (`subject_type` + `subject_id`) rather than three parallel
  tables — one review UI, one RLS pattern; the small cost is no hard FK (validated in the RPC).

### Module C — Testing / Socrative-style (Build) — *the real-time one*
- **Authoring**: quizzes + questions; objective types (`mcq/multi/tf/numeric`) store `correct` for
  autograde; `short` is manual.
- **Live mode**: host opens a `quiz_room` → 6-char `room_code`; students join Supabase **Realtime**
  channel `quiz:{room_id}`. Host advances questions; answers stream to `quiz_answers`; a broadcast
  leaderboard is computed from awarded points. Realtime is used **only** for presence + question-advance
  fan-out; scoring is authoritative in the DB, not the socket.
- **Async mode**: open between `opens_at`/`closes_at`; same tables, no room.
- **Grading**: `submit_answer` autogrades objective items inline (deterministic compare); `quiz-grade`
  Edge Function finalizes the attempt. No AI.
- **Decision:** reuse Supabase Realtime rather than a bespoke WS server — it is the *only* module that
  needs pub/sub and the tenant scale (≤60/room) is trivially within Realtime limits. *Change when* a
  single room exceeds a few hundred concurrent → move to a dedicated channel service.

### Module D — Leave (Build)
- Polymorphic requester (`student|teacher`, parent submits on behalf of student).
- Approver routing by role: student leave → class teacher/principal; teacher leave → principal/admin.
- On **approve**, writes `attendance_records` as `excused` for the range (integration point), and emits
  a comms notification. Overlap with existing attendance is reconciled (approved leave wins).
- **Decision:** leave is a first-class table that *writes into* attendance rather than a flavor of
  attendance — keeps the approval audit trail and lets a rejected request leave no attendance footprint.

### Extend-1 — Geo attendance
- `school_geofences` (center + radius). Mobile captures GPS on mark; `mark_attendance` RPC validates
  Haversine distance server-side and stamps `geo_status`. Out-of-bounds is **recorded, not blocked**
  (flagged for principal review) — hard-blocking punishes weak GPS. Offline: queue locally, submit with
  captured timestamp+coords on reconnect.
- **Decision:** geofence check is server-side (client coords are advisory) so a spoofed client can't
  silently pass; but we soft-flag rather than reject to stay humane to real-world GPS drift.

### Extend-2 — Exam schedule
- `exam_schedule_slots` with DB-level uniqueness + a `check_slot_clash` trigger preventing the same
  room or invigilator double-booked in an overlapping window, and the same section sitting two papers at
  once. Publish flips a flag → students/parents see the datesheet; a `pg_cron` job emits reminders
  (reusing the notification pipeline).

### Extend-3 — Fee Status
- No new storage — a `get_fee_status(school_id, scope)` RPC/view rolls up existing
  `fee_line_items`/`payments` into paid/partial/overdue per student/class, feeding both a dashboard tile
  and the fee-default insight (§6.3).

---

## 6. The Insights Engine — "AI Features" done with math

**Design contract for all six:** a **pure function** `(features) → { score, band, factors[], action }`.
Inputs are plain numbers pulled from existing tables; outputs are a bounded score, a band
(LOW/MED/HIGH or trend label), the **contributing factors with weights** (for the "why"), and a
**recommended action** chosen from a rule table. Nightly `insights-recompute` Edge Function materializes
snapshots; UI reads snapshots; a "Recompute now" button re-runs on demand. Every formula below is
deterministic and unit-tested against fixture students.

> The two mock-ups in the Feature Doc ("18% attendance drop / Missed 6 Mondays / Call parent within 48
> hours" and "Mathematics: High risk … Conduct 3 remedial classes") are exactly this shape — computed
> factors + a rule-selected action. We reproduce them literally.

### 6.1 Attendance Risk Alerts
Over trailing window W (default 30 school days), per student:
```
rate      = present / total
recent    = rate(last 15d) ;  prior = rate(prev 15d)
drop      = max(0, prior − recent)                     # "18% attendance drop"
streak    = current consecutive absences
weekday   = max over weekday of (absences_on_weekday / occurrences)   # "Missed 6 Mondays"
score = 100 * ( 0.40*(1−rate) + 0.25*drop + 0.20*min(streak/5,1) + 0.15*weekday )
band  = HIGH ≥ 60 | MED 35–59 | LOW < 35
```
Factors list = each term's contribution (so UI shows "18% drop", "6 Mondays"). Action from table keyed
on `(band, dominant_factor)` → e.g. HIGH+drop → "Call parent within 48 hours."

### 6.2 Student Performance Prediction
Per subject, ordered exam scores `y[1..n]` (as %):
```
avg    = mean(y)
slope  = least-squares slope of y over exam index      # trend
vol    = stddev(y)
pred   = clamp(y[n] + slope, 0, 100)                   # next-exam estimate
label  = High risk        if pred < pass_mark OR slope < −8
         Likely to improve if slope > +5
         Stable           otherwise
```
Recommended action: pick weakest subject(s) by `pred`; template → "Conduct ⌈gap/remedial_unit⌉ remedial
classes in {subject}." Reproduces the mock-up exactly. (EWMA optional to weight recent exams heavier.)

### 6.3 Fee Defaulter Prediction
Deterministic **logistic** scoring (looks like ML, is a fixed formula):
```
x1 = outstanding_ratio         x2 = past_late_payments (norm)
x3 = avg_days_late (norm)       x4 = partial_payment_freq
x5 = months_since_last_payment (norm)
z  = b0 + Σ bi·xi         (hand-tuned bi, documented & versioned)
p  = 1 / (1 + e^−z)                       # 0..1 "default risk"
band = HIGH ≥ 0.66 | MED 0.33–0.65 | LOW < 0.33
```
Factors = per-term contributions; action table → e.g. HIGH → "Send reminder + schedule counselling call."
Coefficients live in a versioned config (`params_hash` on the run) so results are reproducible & tunable.

### 6.4 Psychometric Test
A **validated instrument** scored by fixed keying — e.g. RIASEC (career interests) or Big-Five.
```
items: Likert 1–5, each keyed to a trait with + / − direction
trait_raw = Σ (keyed responses)
trait_pct = percentile( trait_raw, norm_table[trait] )     # fixed norms table, not learned
profile   = top-k traits + interpretation text from a rule bank
```
Zero inference: the "intelligence" is the psychometric instrument's published scoring key + norms.
`psychometric_instruments` stores items/scoring/norms as data so schools can add instruments without code.

### 6.5 Report Card Analysis
Pure statistics + template NLG:
```
per subject: pct, class_rank, class_percentile, delta_vs_last_term
overall: gpa/percentage, rank, consistency = 1 − normalized_stddev
strengths = subjects in top quartile ; focus = bottom quartile / negative delta
```
Narrative built by **slot-filling templates** selected by computed flags (improving/declining/consistent).
Feeds the existing `generate-report-card` PDF. No generated prose beyond deterministic templates.

### 6.6 Parent Communication System
A **rule + template engine**, not a chatbot:
```
triggers (from other modules/insights): attendance HIGH, fee HIGH, marks drop, achievement, doc expiring
→ select template (by trigger + severity + locale)  → slot-fill (name, numbers, action)
→ dedupe/rate-limit per parent  → enqueue to comms_outbox
→ dispatch via EXISTING send-sms / send-push pipeline (channel by severity/consent)
```
Tone/priority chosen by severity band. Optional light template variation (rotate phrasings) so messages
don't feel robotic — still deterministic per `(student, trigger, day)` seed. This is the glue that turns
every insight above into an action, matching "Call parent within 48 hours."

**Insights trade-off (solves/worsens/when-to-change):** precomputed nightly snapshots — *solves*: instant
reads, cheap, explainable, no inference bill; *worsens*: up-to-1-day staleness (fine for risk trends);
*change when*: a school demands intra-day risk → add an on-demand recompute per student (already the pure
fn, just a synchronous call) or event-triggered recompute on new attendance/marks rows.

---

## 7. Failure modes & resilience

| Component | Failure | Degradation / recovery |
|---|---|---|
| Module toggle | client shows disabled module | DB `feature_enabled()` still rejects writes — no data leak |
| Public admission form | spam/bot flood | Edge throttle + captcha + honeypot; leads quarantined, never direct RLS insert |
| Geo attendance | no/weak GPS | `geo_status='no_gps'`, attendance still recorded, flagged for review (never blocks marking) |
| Live quiz | Realtime drop / reconnect | answers idempotent by `(attempt,question)`; late answers graded server-side; host can re-broadcast current_q; async fallback |
| Live quiz | host disconnects | room state in DB; any host-role can resume the room |
| Insights recompute | job crashes mid-run | `insight_runs` tracks progress; idempotent upsert by `(student,kind,day)`; stale snapshot served until success |
| Comms outbox | SMS provider down | rows stay `queued`; existing pipeline retries; dedupe prevents double-send on replay |
| KYC storage | orphan file / failed upload | table row is source of truth; nightly reconcile flags rows without objects |
| Convert application | partial write | single transaction; `lead_id` uniqueness makes retry idempotent |
| Tenant isolation | RLS gap on a new table | **checklist gate:** no new table merges without an RLS policy test (see §9) |

Single biggest risk = an unguarded new table leaking across tenants → mitigated by a mandatory
per-table RLS test in CI.

---

## 8. Decomposition & sequencing (each = its own spec → plan → build cycle)

1. **F1 Module Toggle foundation** — registry + `feature_enabled()` + guards + super-admin console.
   *(Blocks nothing new but everything registers into it; do first.)*
2. **Extend-1 Geo attendance** + **Extend-2 Exam schedule** + **Extend-3 Fee status** — small, high-value,
   build on existing tables. Parallelizable.
3. **Module D Leave** — self-contained, integrates with attendance.
4. **Module A Admissions** — public surface; do after F1 (needs toggle) — highest new-revenue value.
5. **Module B KYC** — pairs naturally with Admissions (docs collected at admission).
6. **Module C Testing** — largest/real-time; own cycle.
7. **Module E Insights Engine** — last; depends on attendance/exams/fees data existing and F1 flags.
   Build order inside E: pure `@edu-os/insights` package + tests → recompute Edge Fn → snapshots →
   UI cards → comms outbox wiring.

Rationale: foundation first, then cheap extensions to build momentum, then the two new standalone CRUD
modules, then the two heavy modules (real-time testing, insights) last when their data dependencies exist.

---

## 9. Cross-cutting conventions (definition of done per module)
- New table ⇒ `school_id` + RLS enable + policy + **RLS isolation test**.
- New write RPC ⇒ `feature_enabled()` guard + role check + `audit_log` for sensitive ops.
- New module ⇒ entry in feature registry (web nav, mobile tab, super-admin toggle).
- Insight ⇒ pure fn in `@edu-os/insights` + unit tests on fixtures + reproducible `params_hash`.
- Mobile write path ⇒ offline queue + idempotent server key.
- No secrets in client; gateway/SMS creds in Vault.

---

## 10. Key decisions summary

| Decision | Why | Revisit when |
|---|---|---|
| Deterministic math, no LLM | requirement; explainable, free, testable | never (product constraint) |
| Precompute insights nightly | tiny per-tenant scale, cheap reads | intra-day risk demanded |
| JSONB feature flags + code registry | zero-migration flags, typed gate | per-flag billing/audit needed |
| Supabase Realtime for live quiz only | sole pub/sub need, small rooms | rooms > few-hundred concurrent |
| Polymorphic documents/leave | one UI + one RLS pattern | need hard FK / per-type divergence |
| Soft-flag geo violations | humane to real GPS | proven abuse pattern |
| Public admission via isolated Edge Fn | only unauth write, needs throttle | move to managed form service |

---

## 11. Grilling decision log — ticketization (updated live)

Resolved decisions from the `grill-me` pass. Jira tickets reference this section.

**D1 — Ticket system.** Jira, site `w-n-r.atlassian.net` (cloudId `0b18d4fa-22b1-4a4e-8e52-77b7c9a99f65`),
project **ERP** (id `10267`; git history uses `ERP-*` keys). Hierarchy: **one Epic per sub-project → Story/Task
per seam → Subtask**. Every issue description links back to this repo spec (context lives in-repo, tickets refer to it).
Issue types available in ERP: Epic, Story, Task, Feature, Bug, Subtask.

**D2 — Feature-flag shape.** Flat coarse keys, **one boolean per module**, in `schools.features_enabled` JSONB
(no nesting). The registry enumerates **every module — existing AND new** (attendance, fees, homework, exams/results,
timetable, announcements, gallery, discipline, feedback, bonafide, communication/notifications, report-cards +
admissions, kyc_documents, testing, leave, insights, attendance_geo, exam_schedule). Toggle governs the whole platform.

**D3 — Enforcement rollout = option (B).** Register all keys now + super-admin console covers 100% of modules;
existing modules default `ON`; **new modules are DB-enforced (RLS + RPC `feature_enabled()` guard) from birth**;
existing modules are retrofitted behind the gate **incrementally**, each as its own "gate + RLS test" ticket.
No big-bang RLS rewrite.

**D4 — RLS / write-scope conventions (from codebase; tickets MUST follow).**
- Scope comes from transaction-local GUCs set by `scope_pre_request()` (migration 038): helpers
  `get_my_school_id()` and `get_my_role()` (both `STABLE SECURITY DEFINER SET search_path=''`).
- Policy naming: `"<table>_select" | "<table>_insert" | "<table>_update"` (FOR each verb).
- Tenant predicate: `school_id = public.get_my_school_id()`; admin override `public.get_my_role() = 'super_admin'`.
- Teacher write-scoping via SECURITY DEFINER helpers `teaches_section(uuid)`, `teaches_student(uuid)`,
  `teaches_class(uuid)` — derived from the **active** academic year (`section_assignments` homeroom OR `timetable`
  period). New teacher-written tables reuse these, not ad-hoc joins.
- New feature gate helper: `feature_enabled(school_id uuid, key text) RETURNS boolean STABLE SECURITY DEFINER` —
  added as an extra predicate in new modules' `USING`/`WITH CHECK`. New tables: add `school_id`, `ENABLE RLS`,
  the three policies, and an **RLS isolation test** before merge (spec §9).
- Migrations are sequential `20240001NNNNNN_*.sql`; next free index continues the series.

**D5 — Insights params.** Global versioned defaults (weights/thresholds/coefficients in code, `params_hash` per run).
Single per-school override: **pass mark** (`school_insight_params.pass_mark`). **Advisory-only** — insights never
auto-act; Parent-Comms always drafts/queues for staff review, never fires autonomously on a flag.

**D6 — Testing v1 scope.** Both modes (live + async, shared schema). Standalone/formative by default with an
**optional teacher-triggered "push to gradebook"** (creates `exam`+`exam_results` on demand, never automatic).
Objective types auto-graded (mcq/multi/tf/numeric); `short` type is captured and marked pending-manual-grade
(grading UI is a fast-follow ticket).

**D7 — UX-first ticketing.** After grilling yields full feature clarity, produce **Stitch UX screens per module**
(repo already has `stitch-designs/`; Stitch MCP available) as the implementation reference. Jira tickets link BOTH
this spec AND the Stitch screens. Order: grill → Stitch UX → Jira tickets → implement.

**D8 — Leave attendance semantics.** Add `excused` to `attendance_status` enum. Approved leave writes `excused`;
excluded from the attendance-% denominator AND ignored by the attendance-risk engine (§6.1). All attendance
rollups updated to treat `excused` as not-counted. (Per-school "count sanctioned leave toward 75%-rule" variant
is a later toggle, not v1.)

**D9 — Online payments (Razorpay) is a feature flag** (`online_payments`). Flag OFF ⇒ no online-payment UI on
mobile/web AND payment RPCs + `create-razorpay-order`/`razorpay-webhook` Edge Functions reject server-side; fees
recorded offline/manual only. Per-school opt-in.

**D10 — Admissions fee/test.** Optional per-school application fee (default ₹0) via existing Razorpay order+webhook;
application marked `payment_pending` until confirmed when fee > 0, else straight to `enquiry`. Entrance test = manual
score field in v1 (applicants have no login; live-Testing integration is fast-follow). **Dependency:** application
fee > 0 requires `online_payments` ON; if OFF, fee forced to ₹0 / offline, never blocks submission.

**D11 — Psychometric instrument = RIASEC v1** (Holland career codes). Full 48-item bank + scoring/norms in
`2026-07-24-eduos-insights-algorithms.md §1`. Data-driven (`psychometric_instruments`) so Big-Five/Learning-Styles
drop in later without code.

**D12 — KYC:** seeded default document-type set per school (Indian-standard: Birth cert, Aadhaar, TC, marksheet,
photo, etc.), verification by `school_admin`+`principal` only, **bulk verification** (`verify_documents(ids[])` +
multi-select UI).

**D13 — Geo attendance + Exam schedule locked:** teacher marks section (teacher-device GPS); out-of-bounds soft-flagged
not blocked; geofence set by school_admin, default radius 150 m, multi-campus; `no_gps` still saves. Exam schedule:
invigilators from teacher pool, DB clash-detection trigger (room/invigilator/section overlap), publish notifies + re-notify on edit.

**D14 — Per-school Razorpay gateway credentials.** Each school collects into its OWN Razorpay account, so the
`online_payments` module carries a **gateway config**: `key_id` (public — client uses it to open checkout, may live on
`schools`/config), `key_secret` + `webhook_secret` (**secrets → Supabase Vault, encrypted, server-only** in
`create-razorpay-order`/`razorpay-webhook`; NEVER returned to client — API shows masked/write-only) + display name.
**Mode (test/live) is DERIVED from the `key_id` prefix** (`rzp_test_` = sandbox/no real money, `rzp_live_` = real) and
shown as a READ-ONLY badge — NOT an independent toggle (a manual toggle could desync from the actual key). "Going live"
= a guided "Switch to live" flow where the school pastes live keys → Test connection → confirm → Save. Config UI appears
when `online_payments` is ON (platform-admin school detail; same secure component also exposed to school_admin settings).
A "Test connection" server action validates keys. Until configured, online payments show "not configured" and stay
blocked. Handling secret values = Vault only; never plaintext columns, never client.

**D15 — Sub-project #2 UX/flow lock (Geo attendance · Exam schedule · Fee status).** Design grill 2026-07-24;
mockup deliverable = ~5 screens on the surface each module actually lives on (web+mobile). Grounded on the real
current surfaces (geo = fully greenfield, no GPS/RPC anywhere; exam "schedule" today is just `exams.start/end_date`;
no persisted `overdue`, no standalone defaulter view).

*Geo attendance —*
- **Geofence setup** (web, school_admin): interactive **map pin-drop** (Leaflet + OpenStreetMap tiles — free, no
  API key, no cost), search/drop center, drag radius circle, manual lat/lng override, multi-campus list. **Radius
  supports large/multi-building campuses** (numeric input + slider, up to several km — not a small capped slider).
- **Teacher marking** (mobile, extends `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`): **passive geo**, one
  GPS reading captured **at Submit** and stamped on the whole batch (teacher marks the section from one spot). Header
  **chip** resolves `Locating… → On campus ✓ / Off campus ⚠ / No GPS`. **Submit-only** (no on-open capture). Never
  blocks marking. No new step in the daily flow.
- **Off-campus / no-GPS = silent flag** — no reason prompt, no confirm modal. Store `geo_status` (`inside`/`outside`/
  `no_gps`), `gps_accuracy_m`, and measured **distance-from-campus-edge** (so review can tell "500 m off" from "40 m
  past the fence on poor signal").
- **Review** (web): a **dedicated lightweight "Attendance flags" page** — **principal** primary reviewer, school_admin
  also. Nav shows a **badge count only when flags exist** (usually empty — it's an exception stream). Per-submission
  list: teacher, when, distance-off, accuracy, map dot, **✓ Reviewed / dismiss**. Deliberately NOT an action-cockpit
  (no KPIs/impact theater — over-designing an exception log).
- **Offline marking DEFERRED** to its own future sub-project — v1 is online-only (matches today's online-only upsert;
  offline = a whole reliability problem: local queue, replay, dedup vs `(student,date,session)`, conflicts).

*Exam schedule —*
- **v1 = single room + single invigilator per paper, clash-detected. Seating allocation (multi-room, seat maps)
  DEFERRED.** Slot = `(exam_id, class_id, subject_id, exam_date, start_time, end_time, room_id?, invigilator_id?)`;
  room + invigilator optional (can publish a datesheet before filling them). Clash trigger enforces D13's three rules
  (room double-book / invigilator double-book / class two-papers-at-once in overlapping windows).
- **Rooms = minimal new table** (`id, school_id, name, capacity?, is_active`), **add-on-the-fly** from the slot form
  ("+ New room"); no heavyweight rooms-CRUD screen for v1. Capacity captured but **not enforced** (seating deferred).
  Invigilator = **teacher-pool dropdown** (no new entity).
- **Builder** (web, admin): **slot-list + "Add paper" drawer**, filterable/groupable by class; **inline NAMED clash
  errors** ("Room A is booked for Class 8 English, 9:30–11:30"); **read-only calendar preview** toggle for the "does
  this spread look sane" check (no drag-drop calendar editor). Matches the app's table-driven idioms.
- **Publish**: build in **draft** (invisible) → first **Publish** makes live + notifies → later edits mark a slot
  "edited · unpublished change" → **"Publish changes"** sends **one consolidated notification to affected classes only**
  ("Class 6: Term-1 datesheet updated — Maths moved to Dec 11"). **Per-exam** granularity for v1. The pg_cron
  "exam-tomorrow" reminder fires off the *published* datesheet, independent of edit history.
- **Mobile view** = **home-card entry point** (appears only when an exam is published/upcoming — self-dismissing, no
  permanent tab cost) → **nested read-only datesheet** under Academics: chronological papers grouped by exam, each row
  = subject · date+weekday · time (**NO room shown** — see below); **countdown chip** on the next paper; **"updated"
  badge** on changed slots. **Parent-app-only** for v1 (no distinct student login in the mobile route groups).
- **Room is NOT shown on the parent datesheet in v1 (grill follow-up 2026-07-24).** Telling a specific parent their
  child's hall requires a **student→hall mapping**, which is the seating allocation we deferred. A roll-number-range
  split was considered and **rejected**: `roll_number` is `TEXT` and **nullable** in both `student_enrollments` and
  `student_profiles` (no `NOT NULL`), so it can't deterministically key every exam-taker to a room. Likewise **multiple
  rooms per paper** only becomes meaningful once students are split across halls — same deferred seating feature. So v1:
  the **admin builder keeps room + invigilator per paper** (its internal record / primary hall, clash-checked), but the
  **parent view omits room entirely** until a proper **seating sub-project** is built (which will add multi-room,
  per-child hall resolution, and the parent-facing room together, keyed on whatever stable identifier the school then
  standardizes on). Honest > fake: parents get subject/date/time now, never a wrong hall.

*Fee status —*
- **Operational dashboard** (web, admin), NOT a passive report: **collection KPIs** (Total billed · Collected ·
  Outstanding · Collection % · # defaulters; filter by class + fee type) + **defaulter list** (student, class,
  outstanding ₹, days overdue, last payment; sorted by amount/days) + **bulk-select → "Send payment reminder"** via the
  existing SMS/push pipeline (parents are one tap from the Razorpay pay flow) + **light outcome stats** (collected last
  7 days; reminders sent / paid-since). Reminder is **direct-send with confirm** (transactional/operational — NOT
  routed through the D5 draft-review gate that governs *advisory* insight comms). **No predictive scoring here** — the
  "likely to default" risk model is the Insights §6.3 engine, built LAST on top of this.
- **Overdue = derived on read** (`get_fee_status` RPC/view), never persisted: `overdue = outstanding > 0 AND
  due_date < today`; `days_overdue = today − due_date`; a **partial** line can still be overdue. Defaulter list
  **defaults to overdue-only** with an "all outstanding (incl. not-yet-due)" toggle; reminders target the overdue set.
  No new storage, **no nightly status-flip cron** (deriving on read is always correct; a midnight flip is a footgun).
  Existing `pending|partial|paid` unchanged (it means "how much is paid"); overdue is an orthogonal *time* overlay.

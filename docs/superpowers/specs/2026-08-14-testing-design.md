# Testing — Live &amp; Async Quizzes with Auto-Grading (design)

> Grounded on the live codebase (2026-08-14). Companion to the architecture spec
> `2026-07-22-eduos-feature-architecture-design.md` (**D6** — Testing v1 scope, and the Module C sketch in §3.4/§5)
> and the clickable UI prototype `stitch-designs/eduos-v2/testing-quiz-prototype.html`.
> Source for the ERP "Testing" epic + stories.

**This doc amends the master spec's Module C sketch, not just implements it.** D6 fixed the grading rules (both
modes, objective auto-grade, short-answer manual) but the accompanying architecture sketch (§3.4: `quiz_rooms`,
`room_code`, Supabase Realtime, host-advances-questions, live leaderboard) assumed a **teacher-hosted classroom
session** — a screen at the front of the room driving devices in it. That is not the surface this build targets.
See **D-T3** below for why "live" is redefined and Realtime is descoped for v1. If the team wants a synchronized
classroom mode later, that is a distinct future feature, not a v1 requirement.

**Product decision (given, not derived):** no separate Student Web/Mobile app in v1.
- **Teacher (web, existing staff portal):** authors, schedules, assigns, publishes, grades.
- **Parent (mobile, existing parent app):** picks a child, that child's assigned quizzes render, the *parent's
  device* is where the child takes the quiz, results show per child.
- Everything below is written **student-centric** on purpose — `student_id` everywhere, never `parent_id` — so a
  future dedicated Student Portal can read the same tables/RPCs unmodified. This mirrors how `homework_status` and
  `leave_requests` already key on `student_id` even though only parents write to them today.

---

## 1. What already exists that this reuses

- **The exact request/act pattern already exists** — homework (`20240001000048_homework_rpcs.sql`) and leave
  (`20260731104414_leave_rpcs.sql`). Both: `SECURITY DEFINER` RPCs, `SET search_path=''`, a SELECT-only client table
  (writes forced through RPCs, deny-by-default), `is_parent_of_student(uuid)` / `teaches_student(uuid)` /
  `teaches_section(uuid)` for authorization. Testing mirrors this 1:1 for `quiz_attempts` / `quiz_answers`.
- **`feature_enabled(school_id, key)`** (`20260727132543_feature_flags.sql`) — the `testing` key is already reserved
  in `packages/shared/src/features/registry.ts` and seeded `false` for every school. No new flag needed, just
  populate `gatesTables`/`gatesFunctions` once tables exist (plan doc, Task 6).
- **`exam_schedule_slots`** (`20260729104235_exam_schedule.sql`) — the availability-window + publish-state precedent
  (`datesheet_published_at`, draft→published, "edited since publish" dirty flag). Testing's `quizzes.status`
  (`draft → scheduled → open → closed`) follows the same shape.
- **`ActiveContextProvider`** (`apps/mobile/lib/active-context.tsx`) — already resolves which child a parent is
  currently viewing and persists the choice. Testing's mobile screens read the *already-selected* child; the
  "Select child" screen in the prototype is the existing switcher, not new state.
- **Mobile has zero Supabase Realtime usage today** (checked: no `supabase.channel`/`postgres_changes` anywhere in
  `apps/mobile`). This is load-bearing for D-T3.

## 2. Decisions

**D-T1 — Execution surface.** Teacher = web only (authoring/grading is data-dense, matches every other
admin/teacher surface). Parent = mobile only (matches Leave, Homework, Exam Schedule — parents have no web
access in this app at all). No web quiz-taking UI, no student login, in v1.

**D-T2 — Multi-child scoping.** The quiz list is always scoped to **one selected child** — reuse
`ActiveContextProvider`'s existing child selection, don't build new state. Switching child re-queries
`quiz_assignments` against *that child's* active `student_enrollments` row (class_id/section_id), never the parent's
identity. A parent with two children never sees a merged list.

**D-T3 — "Live" = a scheduled single-sitting window, not a synchronized room.** `quizzes.mode` is `async` (open
window, student can start any time before `closes_at`, can be closed and resumed if `attempts_allowed` and time
remain) or `live` (a single fixed `opens_at`/`closes_at` sitting — same mechanics as async, just a tighter window,
typically `duration_seconds` ≈ the window length). **No `quiz_rooms`, no `room_code`, no host-advances-question, no
Supabase Realtime, no live leaderboard in v1.**
Why: (1) mobile has never used Realtime — introducing it for one feature is new operational surface for a v1;
(2) a parent's phone at home isn't a classroom with a natural "host" to advance slides; (3) `exam_schedule_slots`'s
`opens_at`/`closes_at` window already solves "live" for a self-paced, timed, device-per-student model, and ships
with zero new infrastructure. **Revisit when** EduOS builds an actual teacher-hosted classroom mode (screen at the
front of the room, devices in it) — that's a different feature with a different host, not this one.

**D-T4 — Auto-grading scope (reaffirms D6).** `mcq` and `true_false` auto-grade on submit by comparing the
student's `selected_option_id` against `quiz_options.is_correct`, server-side, inside the submit RPC.
`short_answer` always starts `pending_manual_grade` and is graded via a teacher RPC. No AI/LLM grading anywhere
(hard constraint from the master spec's Pro-tip).

**D-T5 — Correct answers are never sent to a client before grading.** RLS is row-level, not column-level, so it
cannot selectively hide `quiz_options.is_correct` on an otherwise-readable row. Resolution: **`quiz_options` (and
`quiz_questions.short_answer_rubric`) get no SELECT policy for parent/student at all** — deny-by-default, same
shape as `homework_status`'s write-deny. The mobile quiz-taking screen calls a `SECURITY DEFINER` RPC
(`get_quiz_for_attempt(p_attempt_id)`) that returns question/option text **with `is_correct` stripped**, reading the
base tables with elevated privilege the client itself never has. After grading, if
`quizzes.show_answers_after_close = true`, a second RPC (`get_quiz_review(p_attempt_id)`) — gated on
`attempt.status = 'graded'` — returns the same shape *with* correctness. Teacher/staff table access is unaffected
(they get normal role-scoped SELECT on `quiz_options`).

**D-T6 — Push to gradebook stays opt-in (reaffirms D6).** A closed, fully-graded quiz can be pushed once, by its
owning teacher, via `push_quiz_to_gradebook(p_quiz_id)` — creates an `exams` row + `exam_results` rows from
`quiz_results`. Never automatic. Rejected server-side if any answer is still `pending_manual_grade`.

**D-T7 — Duplicate/late-attempt handling; the client clock is never trusted.** `quiz_attempts` unique on
`(quiz_id, student_id, attempt_number)`; `quizzes.attempts_allowed` (default 1) caps it. `start_quiz_attempt`
rejects a start after `closes_at` server-side. An attempt still `in_progress` when `closes_at` passes is force-
submitted by a `pg_cron` job calling `force_submit_expired_attempts()` directly (pure DB mutation, no external I/O,
so — unlike the reminder crons — it needs no edge function or Vault secret). The mobile countdown is UX only;
`submit_quiz_attempt` recomputes elapsed time from `started_at` and rejects/truncates if the client is lying.

**D-T8 — Assignment granularity.** `quiz_assignments` targets `class_id` + `section_id` (whole-section — the same
granularity homework and exams already use). Per-student targeting (for retakes/make-up quizzes) is **explicitly
deferred**, not built now — the prototype's Assign tab already documents this as a fast-follow note.

## 3. Data model (names are fixed by product decision — see below)

Student-centric naming, no `parent_*` tables/columns anywhere in quiz participation:

```
quizzes            — id, school_id, academic_year_id, subject_id, class_id, section_id, created_by,
                      title, instructions, mode(async|live), status(draft|scheduled|open|closed),
                      opens_at, closes_at, duration_seconds, attempts_allowed, shuffle_questions,
                      pass_mark_pct, show_answers_after_close, pushed_to_gradebook_at, exam_id
quiz_questions      — id, quiz_id, school_id, type(mcq|true_false|short_answer), prompt, points,
                      order_index, short_answer_rubric
quiz_options        — id, question_id, school_id, option_text, is_correct, order_index
quiz_assignments    — id, quiz_id, school_id, class_id, section_id
quiz_attempts       — id, quiz_id, school_id, student_id, attempt_number, status(in_progress|submitted|graded),
                      started_at, submitted_at, auto_submitted, created_by
quiz_answers        — id, attempt_id, question_id, school_id, selected_option_id, short_answer_text,
                      is_correct, points_awarded, grading_status(auto|pending_manual_grade|manually_graded),
                      graded_by, graded_at
quiz_results        — id, attempt_id, quiz_id, school_id, student_id, total_points, max_points,
                      percentage, passed, fully_graded
```

Full column types, constraints and indexes are in the implementation plan
(`docs/superpowers/plans/2026-08-14-testing-implementation.md`).

## 4. RLS &amp; RPC summary

- Every table carries `school_id`; every policy ANDs `feature_enabled(school_id, 'testing')` (mirrors
  `rls_retrofit_exams.sql`'s shape exactly).
- `quizzes` / `quiz_questions` / `quiz_assignments`: staff SELECT+write (owning teacher, or
  `school_admin`/`principal`), scoped by `teaches_section`. No parent/student SELECT on these tables directly —
  the mobile list/details screens read through a view or RPC scoped to the child's section (never the full quiz
  catalog).
- `quiz_options`: staff SELECT normally; **no parent/student SELECT policy at all** (D-T5) — access only via
  `get_quiz_for_attempt` / `get_quiz_review`.
- `quiz_attempts` / `quiz_answers` / `quiz_results`: **SELECT-only** RLS (parent via `is_parent_of_student`, teacher
  via `teaches_student`, admin/principal school-wide) — identical shape to `leave_requests`. All writes via RPCs:
  `start_quiz_attempt`, `save_quiz_answer`, `submit_quiz_attempt`, `grade_short_answer`, `force_submit_expired_attempts`.
- Sensitive writes (`grade_short_answer`, `publish_quiz`, `push_quiz_to_gradebook`) log to `audit_log`, per the
  master spec's §9 cross-cutting convention.

## 5. Surfaces (→ prototype)

Clickable prototype: `stitch-designs/eduos-v2/testing-quiz-prototype.html` (published as a shareable Artifact this
session). Ten screens:

**Teacher · web** — (1) Quiz list, (2) Quiz builder (Details / Questions / Availability &amp; scoring / Assign /
Preview &amp; publish, one screen with internal tabs — mirrors the admin onboarding wizard's step pattern), (3)
Submissions &amp; results, (4) Student result detail with inline manual grading.

**Parent · mobile** — (5) Select child, (6) Quiz list (Available/Upcoming/Completed, plus Loading/Empty/Unavailable
states), (7) Quiz details/instructions, (8) Take quiz (timer + question navigation + palette), (9) Submit
confirmation (flags unanswered questions), (10) Result (score, pass/fail, optional answer review per D-T5/
`show_answers_after_close`).

## 6. Edge cases

1. Parent force-quits mid-attempt → attempt stays `in_progress`; resuming recomputes remaining time from
   `started_at` server-side, never restarts the countdown from full duration.
2. `closes_at` reached while `in_progress` → cron force-submits whatever was answered (D-T7).
3. Quiz unpublished/deleted while a parent has the list open → it simply disappears next fetch, same as any other
   `feature_enabled`/RLS-gated disappearance elsewhere in the app; no special-case handling needed.
4. Second child mid-attempt while parent switches to child A → switching the active child never touches child B's
   attempt; timers are keyed `(quiz, student)`, not the parent's session.
5. Teacher edits questions after attempts exist → **locked**: `publish_quiz` flips `status` to `scheduled`/`open`,
   and question/option writes are rejected once `status <> 'draft'` (a teacher who needs changes closes the quiz and
   duplicates it — no partial-edit-after-attempts hazard, unlike exam-schedule's "dirty" tracking which is fine to
   *allow* because papers don't have already-submitted answers).
6. Push-to-gradebook attempted while any `quiz_answers.grading_status = 'pending_manual_grade'` → RPC rejects with a
   clear error (D-T6).
7. `testing` flag turned off mid-window → RLS blocks new attempt starts/answers immediately (fail-closed, matches
   every other retrofitted module); an attempt already in progress just errors on next write — acceptable, matches
   existing feature-flag behavior elsewhere in the app.
8. `attempts_allowed &gt; 1` → each attempt gets its own `quiz_attempts` row; `quiz_results` reflects the **latest**
   submitted+graded attempt (simplest semantics; flagged as an open question below if the team wants "best of N"
   instead).

## 7. Open questions for the team (not settled by the user's brief — flag before build)

1. **Retake scoring policy.** Latest attempt wins (assumed above) vs. best-of-N. Changes one line in
   `submit_quiz_attempt`'s `quiz_results` upsert — cheap to decide either way, but needs a decision.
2. **Push-to-gradebook approval.** Currently teacher-only (matches `exams_write` role set: `school_admin`,
   `principal`, `teacher`). Confirm no principal sign-off step is wanted before marks land in the gradebook.
3. **Notifications.** Homework/leave both push a notification on the relevant event (quiz opens, quiz closing soon,
   result graded). Not scoped in the prototype or this doc — worth a decision before Task 6/7 of the implementation
   plan, since it's a small addition once the core RPCs exist (reuse `send-homework-notification`'s single-recipient
   pattern, not homework's fan-out).

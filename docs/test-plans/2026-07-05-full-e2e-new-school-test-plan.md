# Full E2E Test Plan — New School From Scratch

**Date:** 2026-07-05
**Scope:** End-to-end manual walkthrough starting from creating a brand-new school on the platform, provisioning all data (principal, teachers, students/parents, subjects, timetable, fees, exams), then exercising every feature across web (admin / principal / teacher) and mobile (parent / teacher).
**Goal:** Prove a school can go from zero → fully operational, and every user-facing feature works for a freshly created tenant (not just the seeded demo school).

---

## 0. Environment Setup

| Item | Value |
|------|-------|
| Web dev server | `pnpm dev` (Next.js on :3000) |
| Reverse proxy | `pnpm dev:proxy` (Caddy :80 → :3000, needed for clean `lvh.me` hosts) — or run `pnpm dev:full` |
| Supabase | `/Users/dineshlearning/bin/supabase start` (use direct CLI, NOT `npx`) |
| Platform admin URL | `http://core.lvh.me` |
| Marketing/login root | `http://lvh.me` |
| A school's URL | `http://<school-domain>.lvh.me` |
| Test OTP | `123456` for phones `919000000001`–`919000000009` (see `supabase/config.toml`) |
| Mobile | Expo dev build; `SCHOOL_ID` in mobile env must point at the NEW test school |

> **Note on phones:** Only `919000000001`–`...09` have a bypass OTP locally. For a fresh school you'll want to assign these test numbers to the new principal/teachers/parents so you can actually log in. Plan your phone-number allocation before starting (see §2).

**Phone allocation suggestion:**
- `919000000001` — Platform super admin (from seed)
- `919000000002` — New school admin
- `919000000003` — New principal
- `919000000004`, `...05` — Teachers
- `919000000006`, `...07` — Parents (auto-created with students)

**Pre-flight:**
- [ ] `supabase start` healthy, migrations applied
- [ ] `supabase db reset` if you want a clean slate (re-applies seed) — optional; the seed's demo school can coexist with your new test school
- [ ] Web dev + proxy running, `core.lvh.me` loads platform admin
- [ ] Logged-in super_admin session available

---

## Phase 1 — Platform Admin: Create the School

Base: `http://core.lvh.me/platform-admin`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| P1.1 | Platform login | Visit `core.lvh.me`, log in as super_admin (`919000000001`, OTP `123456`) | Lands on `/platform-admin/dashboard`; sees existing schools |
| P1.2 | Create school | `/platform-admin/schools/new` → fill name, **domain** (e.g. `sunrise`), primary color, contact email, store URLs | Redirects to `/platform-admin/schools/[id]`; school appears in list |
| P1.3 | School detail loads | Open the new school | Overview tab shows details + role counts all at 0 (except maybe admin) |
| P1.4 | Domain resolves | Visit `http://sunrise.lvh.me` | Middleware resolves school (no `school-not-found`); shows login |
| P1.5 | Invite school admin | Users tab → invite `919000000002` as `school_admin` | Invite succeeds; user shows under school_admin count |
| P1.6 | Invite principal | Users tab → invite `919000000003` as `principal` | Principal role created |
| P1.7 | Role restriction | Confirm super_admin can assign school_admin/principal/teacher/parent | Assignable roles match `/api/invite-user` rules |
| P1.8 | Active toggle | Toggle school inactive, revisit `sunrise.lvh.me` | Inactive school blocks access; re-enable restores |
| P1.9 | CSV import (optional) | Import tab → download template → import a few students/teachers | Rows imported; visible under counts |

---

## Phase 2 — School Admin: Onboarding Wizard

Base: `http://sunrise.lvh.me` → log in as `919000000002` → should route to `/admin/onboarding`

| # | Test | Steps | Expected |
|---|------|-------|----------|
| P2.1 | Wizard entry | First school-admin login | Onboarding wizard appears (4 steps) |
| P2.2 | Step 1 — Academic Year | Create year "2026-27", start/end dates | Year created and **auto-activated** (status=active) |
| P2.3 | Step 2 — Classes & Sections | Add classes (e.g. Class 1, 2, 3) each with sections A, B | Classes + sections created with order |
| P2.4 | Step 3 — Teachers | Invite `919000000004`, `919000000005` (assign subjects if prompted) | Teacher profiles + roles created |
| P2.5 | Step 4 — Students | Add a few students to Class 1-A / 1-B (individually + CSV) | Students created; **parent profiles auto-created** |
| P2.6 | Wizard completion | Finish wizard | Redirects to `/admin/dashboard` |
| P2.7 | Re-entry guard | Log out/in as admin again | Does NOT force wizard again (goes to dashboard) |

**Verify parent auto-creation:** note the parent phone(s) generated/assigned — you'll need them for mobile login. If the flow assigns real phones, map a test student's parent to `919000000006`.

---

## Phase 3 — School Admin: Complete Configuration

Base: `http://sunrise.lvh.me/admin`

| # | Feature | Route | Test |
|---|---------|-------|------|
| P3.1 | Dashboard | `/admin/dashboard` | Counts reflect data just created; no crash with sparse data |
| P3.2 | Classes mgmt | `/admin/classes` | Add/edit/delete a section; quick-setup bulk create |
| P3.3 | Subjects | `/admin/subjects` | Create subjects (Math, English…), associate with classes |
| P3.4 | Teachers list | `/admin/teachers` + `/admin/teachers/[id]` | View teacher; assign homeroom + subject/section |
| P3.5 | Students list | `/admin/students` | Add student, upload photo, edit; open `/admin/students/[id]` |
| P3.6 | Student tabs | `/admin/students/[id]` | Attendance / Academics / Fees tabs all render |
| P3.7 | Uninstalled tracker | `/admin/students/uninstalled` | Lists students whose parent hasn't installed app |
| P3.8 | Fee types | `/admin/settings/fee-types` | Create fee types (Tuition, Transport) with default amounts |
| P3.9 | Timetable | `/admin/timetable` | Assign teacher×subject to section×day×period; grid renders; conflict blocked |
| P3.10 | Academics/exams | `/admin/academics` | Create an exam (name, dates) for active year |
| P3.11 | Fees push | `/admin/fees` | Push a fee to a class and to an individual student |
| P3.12 | Announcements | `/admin/announcements` | Create announcement (each type: General/Event/Exam/Holiday) |
| P3.13 | Gallery | `/admin/gallery` | Upload image + caption; delete one |
| P3.14 | Discipline | `/admin/discipline` | Log a discipline record for a student |
| P3.15 | Syllabus | `/admin/syllabus` | Upload a syllabus PDF for a subject/class |
| P3.16 | Settings | `/admin/settings` | Edit school name/logo/colors/contact; save persists |
| P3.17 | Reports | `/admin/reports` | Reports render with the new (small) dataset |
| P3.18 | Feedback | `/admin/feedback` | View feedback list (may be empty until parents submit) |

---

## Phase 4 — Teacher (Web)

Base: `http://sunrise.lvh.me` → log in as teacher `919000000004`

| # | Feature | Route | Test |
|---|---------|-------|------|
| P4.1 | Dashboard | `/teacher/dashboard` | Today's periods, attendance status, homework due, homeroom count |
| P4.2 | Mark attendance | `/teacher/attendance/mark` | Mark full-day + session (FN/AN) for assigned section; save toast |
| P4.3 | Attendance history | `/teacher/attendance` | Marked records visible |
| P4.4 | Homework | `/teacher/homework` + `[id]` | Create homework (title, desc, due, subject, section); view roster |
| P4.5 | Results entry | `/teacher/results/[examId]` | Enter marks per student; save |
| P4.6 | Rankings | `/teacher/results/[examId]/rankings` | Rankings + stats compute correctly |
| P4.7 | Students | `/teacher/students` + `[id]` | Roster; individual student detail |
| P4.8 | Discipline | `/teacher/discipline` | Log incident (student, reason, severity) |
| P4.9 | Fees | `/teacher/fees` | View class collection; record offline payment |
| P4.10 | Feedback | `/teacher/feedback` | View + respond to parent feedback |

---

## Phase 5 — Principal (Web)

Base: `http://sunrise.lvh.me` → log in as principal `919000000003`

| # | Feature | Route | Test |
|---|---------|-------|------|
| P5.1 | Dashboard | `/principal/dashboard` | Class attendance, discipline, fees, announcements |
| P5.2 | Students | `/principal/students/[id]` | Read-only student view |
| P5.3 | Discipline | `/principal/discipline` | School-wide discipline records |
| P5.4 | Feedback | `/principal/feedback` | Review + respond |
| P5.5 | Announcements | `/principal/announcements` | View (and create if permitted) |
| P5.6 | Certificates | `/principal/certificates/[studentId]` | View/download certificate |
| P5.7 | Reports | `/principal/reports` | Management reports render |

---

## Phase 6 — Certificates & Report Cards (Admin)

| # | Feature | Route | Test |
|---|---------|-------|------|
| P6.1 | Report card list | `/admin/report-cards` | Lists students; open one |
| P6.2 | Report card detail | `/admin/report-cards/[studentId]` | Shows subjects + grades for the exam's academic year; print/PDF |
| P6.3 | Certificates | `/admin/certificates/[studentId]` | Generate/download certificate; logged via `/api/certificates/log` |

---

## Phase 7 — Mobile: Parent

Point mobile `SCHOOL_ID` at the new school. Log in as parent `919000000006` (OTP `123456`).

| # | Screen | Test |
|---|--------|------|
| P7.1 | Login | Phone + OTP; auto-route to parent tabs; student auto-selected |
| P7.2 | Dashboard | Student card (photo/name/class), attendance %, pending fees, homework today; gallery carousel; latest announcements |
| P7.3 | Announcements nav | "See all" → **More → Announcements** (not just More menu); rows tap to full list w/ press highlight |
| P7.4 | Subpage reset | Open a More sub-page, switch tabs, return → resets to More menu |
| P7.5 | Academics | Report cards / exam results / subject performance — **full history across years** |
| P7.6 | Attendance | Monthly calendar; **active-year only**; % correct |
| P7.7 | Fees | Outstanding + payment history **grouped by year (full history)**; Razorpay pay flow |
| P7.8 | Homework | Open `homework/[id]`; subject/due/desc + submission status |
| P7.9 | Gallery | Shows whatever available (not year-filtered); full-screen zoom |
| P7.10 | Multi-child (if applicable) | Switch student; data updates |
| P7.11 | Logout | Clears session; no stale role/student on next login |

---

## Phase 8 — Mobile: Teacher

Log in as teacher `919000000004` on mobile.

| # | Screen | Test |
|---|--------|------|
| P8.1 | Dashboard | Today's periods, homeroom attendance status, homework due, section stats |
| P8.2 | Attendance overview | `/(teacher)/attendance` — homeroom + subject sections, marked counts |
| P8.3 | Mark section | `/(teacher)/attendance/[sectionId]` — full-day + FN/AN; save |
| P8.4 | Classes | Assigned sections; roster + per-section stats |
| P8.5 | Homework | Create homework; view/mark submissions |
| P8.6 | Discipline | Log incident; **active-year filtered** history |
| P8.7 | Profile | Profile + logout |

---

## Phase 9 — Cross-Cutting & End-of-Year

| # | Test | Expected |
|---|------|----------|
| P9.1 | Fee round-trip | Admin push → parent pays (Razorpay) → payment recorded → admin/teacher see paid status |
| P9.2 | Attendance round-trip | Teacher marks → parent sees same day in mobile calendar |
| P9.3 | Homework round-trip | Teacher assigns → parent sees on dashboard + detail |
| P9.4 | Results round-trip | Teacher enters marks → admin report card → parent academics |
| P9.5 | Announcement round-trip | Admin posts → parent sees in feed + full list |
| P9.6 | Year-scope integrity | New records auto-stamp active year (DB triggers); year-scoped mobile screens (attendance, discipline) only show active year |
| P9.7 | Promote students | `/admin/academics/promote` — bulk promote to next class; enrollments update for new year |
| P9.8 | New year activation | Create + activate a 2nd academic year; verify fees/results still show full history, attendance resets to new active year |

---

## Bug Log

| # | Phase | Severity | Description | Status | Fix commit |
|---|-------|----------|-------------|--------|-----------|
| | | | | | |

## Progress

- Phase 1 (Platform/create school): ▢ 0/9
- Phase 2 (Onboarding wizard): ▢ 0/7
- Phase 3 (Admin config): ▢ 0/18
- Phase 4 (Teacher web): ▢ 0/10
- Phase 5 (Principal web): ▢ 0/7
- Phase 6 (Certificates/report cards): ▢ 0/3
- Phase 7 (Mobile parent): ▢ 0/11
- Phase 8 (Mobile teacher): ▢ 0/7
- Phase 9 (Cross-cutting/EOY): ▢ 0/8

**Total: 0/80**

# Edu-OS Design System — Stitch Reference

> Consolidated from the live codebase so **new module screens match existing UX**.
> Sources: `stitch-designs/mobile-app-design/00-design-brief.md`, web `globals.css` (shadcn tokens),
> web components (`kpi-card`, `data-table`, list/detail templates, sidebar, drawer), mobile NativeWind
> components (`AppBar`, `StatCard`, `ListItem`, `StatusBadge`). Screenshots of live screens in
> `test-screenshots/`. Aesthetic: premium fintech (CRED/Slice) — fast, clean, trustworthy.

## Brand & white-labeling
- **Primary is per-school dynamic** (`--school-color`, default indigo/blue). Design with primary as a
  variable; never hardcode brand into layouts. Default primary `#4F52E4`-ish (web `hsl(239 84% 67%)`);
  mobile brief default `#2563EB`. Use a blue/indigo primary in mockups, note it's swappable.

## Color tokens
| Token | Value | Use |
|---|---|---|
| Primary | `#2563EB` / `hsl(239 84% 67%)` (dynamic) | actions, active nav, emphasis |
| Primary tint | primary @ 15% | selected rows, icon backgrounds |
| Background | `#F1F5F9` (mobile) / `hsl(240 20% 99%)` (web) | app background |
| Surface / Card | `#FFFFFF` | cards, sheets |
| Surface raised | `#F8FAFC` | nested surfaces |
| Text primary | `#0F172A` | headings, body |
| Text secondary | `#64748B` | subtitles |
| Text muted | `#94A3B8` | labels, captions |
| Border | `#E2E8F0` / `hsl(240 6% 90%)` | dividers, card borders |
| Success | `#10B981` | present, paid, verified |
| Warning | `#F59E0B` | pending, partial, at-risk (MED) |
| Danger | `#EF4444` | absent, overdue, HIGH risk, rejected |
| Info | `#3B82F6` | informational badges |

## Typography — Inter
Display 28/Bold · Heading 20/SemiBold · Subheading 16/SemiBold · Body 14/Regular ·
Caption 12/Regular(muted) · Label 11/Medium/UPPERCASE(muted).

## Spacing & radius
Spacing scale 4/8/12/16/20/24/32/40. Radius: cards **16** (mobile) / 8px (web), buttons **12**, chips/badges **pill (100)**, inputs 10. Shadow `0 2px 12px rgba(0,0,0,0.06)`.

## Component library (reuse these — do not invent new primitives)
- **Web:** KPI/stat card, data-table + filterable-data-table, list-page-template, detail-page-template,
  dashboard-template, sidebar + top-bar, page-header, action-dialog (drawer), empty-state, command-search,
  academic-year-switcher, section-switcher, status badge. Layout = **board (list/table) + right-side drawer**
  for detail/edit (per recent ERP-48 refactor).
- **Mobile:** AppBar, StatCard, ListItem (icon+title+subtitle+chevron), StatusBadge (Paid/Pending/Overdue/
  Present/Absent…), PrimaryButton (full & compact), SectionHeader (+"See all"), Avatar (initials fallback),
  PickerModal, ContextSwitcher/SectionSwitcher, Skeleton loaders.
- **Patterns:** empty states with illustration+message+CTA; skeletons while loading; pill status badges;
  bottom-sheet/drawer for actions; role-aware navigation.

## Platforms & audiences
- **Web** = admin/teacher/principal + super-admin console (board+drawer, data-dense).
- **Mobile (Expo)** = parent + teacher (fintech card UX, quick actions, bottom nav).

## New screens to design per module (v1)
- **F1 Module Toggle** (web/super-admin): school list → toggle grid drawer (all module flags incl. `online_payments`).
- **Admissions** (web admin): public apply form; leads/pipeline Kanban board; application detail drawer (stages, fee status, entrance score, convert).
- **KYC** (web admin): document checklist per student/section; upload; review drawer; **bulk-verify** multi-select bar.
- **Testing** (web teacher authoring + mobile student): quiz builder; live host room (question + live leaderboard); async attempt; results.
- **Leave** (mobile submit + web/mobile approver): request form; approver inbox; leave calendar/status.
- **Geo attendance** (mobile teacher): mark-attendance with geo banner (inside/outside/no-gps); (web) geofence config + out-of-bounds review.
- **Exam schedule** (web admin): datesheet grid (subject×date×slot×room×invigilator) with clash warnings; (mobile) published datesheet view.
- **Insights** (web + mobile): student risk cards (attendance/performance/fee) with factors + recommended action
  (reproduce Feature-Doc mock-ups); RIASEC test-taking flow + result profile; report-card analysis panel;
  parent-comms outbox (draft → approve).

Each new screen must visually match the existing screenshots in `test-screenshots/` and reuse the components above.

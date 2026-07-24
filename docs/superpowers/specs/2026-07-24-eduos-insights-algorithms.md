# Edu-OS Insights Engine — Implementable Algorithm Reference

> Companion to `2026-07-22-eduos-feature-architecture-design.md` (§6).
> Every algorithm here is **deterministic** (no LLM). Same input → same output.
> This doc is the source of truth the Jira tickets link to for the Insights epic.
> All params are **global versioned defaults** (D5); only `pass_mark` is per-school overridable.
>
> **Params version:** `INSIGHTS_PARAMS_V1` (bump on any weight/threshold/item change; store on `insight_runs.params_hash`).

---

## 0. Shared contract

Every engine is a pure function:

```ts
type Band = 'LOW' | 'MED' | 'HIGH';
interface Insight {
  score: number;                 // 0..100 (or 0..1 where noted)
  band: Band | string;           // band or trend label
  factors: { key: string; label: string; value: number; contribution: number }[];
  recommended_action: string;    // chosen from a rule table
}
```

`factors[]` is mandatory — it powers the "why" UI (reproduces the Feature-Doc mock-ups). `contribution`
is that factor's share of the score so the UI can rank reasons.

---

## 1. RIASEC Psychometric Instrument (`RIASEC_V1`)

### 1.1 Design
- **6 types:** R (Realistic), I (Investigative), A (Artistic), S (Social), E (Enterprising), C (Conventional).
- **48 items**, 8 per type, each **positively keyed to exactly one type** (no reverse-keyed items → simpler, robust).
- **Response scale:** 5-point Likert — `1 Strongly Disagree, 2 Disagree, 3 Neutral, 4 Agree, 5 Strongly Agree`.
- **All 48 required** (no partial submissions; UI blocks submit until complete).
- Stored data-driven in `psychometric_instruments(items, scoring, norms)` so Big-Five/Learning-Styles drop in later.

### 1.2 Item bank
Each item: `{ id, type, prompt }`. Presented in a fixed shuffled order (seed = instrument id, deterministic).

**R — Realistic (hands-on / mechanical / outdoor)**
1. R1 — I enjoy building or repairing things with my hands.
2. R2 — I like working with tools, machines, or equipment.
3. R3 — I would enjoy a job that is mostly outdoors.
4. R4 — I like activities like woodworking, electronics, or mechanics.
5. R5 — I prefer doing practical tasks over discussing ideas.
6. R6 — I enjoy physical activities and sports.
7. R7 — I like to see a concrete, finished product from my work.
8. R8 — I would rather fix a machine than write a report.

**I — Investigative (analytical / scientific / curious)**
9. I1 — I enjoy solving math or science problems.
10. I2 — I like to understand how and why things work.
11. I3 — I enjoy doing experiments or research.
12. I4 — I like analysing data and finding patterns.
13. I5 — I would enjoy a career in science or technology.
14. I6 — I ask a lot of questions to understand a topic deeply.
15. I7 — I prefer thinking through a problem carefully before acting.
16. I8 — I enjoy puzzles, logic problems, and brain teasers.

**A — Artistic (creative / expressive / original)**
17. A1 — I enjoy drawing, painting, or design.
18. A2 — I like to express myself through music, writing, or art.
19. A3 — I prefer tasks that let me be creative and original.
20. A4 — I enjoy performing (acting, singing, dancing) or creating performances.
21. A5 — I like coming up with new ideas rather than following set rules.
22. A6 — I appreciate beauty in art, design, and nature.
23. A7 — I would enjoy a career in the creative or media fields.
24. A8 — I dislike work that is highly repetitive and rigid.

**S — Social (helping / teaching / cooperative)**
25. S1 — I enjoy helping people solve their problems.
26. S2 — I like teaching or explaining things to others.
27. S3 — I feel good when I care for or support others.
28. S4 — I prefer working in a team over working alone.
29. S5 — I am a good listener and people come to me for advice.
30. S6 — I would enjoy a career in teaching, counselling, or healthcare.
31. S7 — I like volunteering and community activities.
32. S8 — I value cooperation more than competition.

**E — Enterprising (leading / persuading / business)**
33. E1 — I enjoy leading a group or being in charge.
34. E2 — I like persuading or convincing others.
35. E3 — I would enjoy starting my own business.
36. E4 — I am comfortable speaking in front of people.
37. E5 — I like setting goals and driving others to achieve them.
38. E6 — I enjoy competition and winning.
39. E7 — I would enjoy a career in business, sales, or management.
40. E8 — I am willing to take risks to get ahead.

**C — Conventional (organising / detail / structure)**
41. C1 — I like keeping things organised and in order.
42. C2 — I enjoy working with numbers, records, or spreadsheets.
43. C3 — I prefer clear rules and step-by-step instructions.
44. C4 — I am careful and pay attention to detail.
45. C5 — I like planning and following schedules.
46. C6 — I would enjoy a career in accounting, administration, or data.
47. C7 — I prefer predictable, well-defined tasks.
48. C8 — I like checking work for accuracy and correctness.

### 1.3 Scoring algorithm
```
For each type t in {R,I,A,S,E,C}:
    raw[t]   = Σ (response value 1..5 for the 8 items keyed to t)   # range 8..40
    scaled[t]= round( (raw[t] - 8) / (40 - 8) * 100 )               # 0..100, for bar display
    # Percentile against fixed norm table (deterministic; mean/sd are published defaults, not learned):
    z[t]     = (raw[t] - NORM[t].mean) / NORM[t].sd
    pct[t]   = round( 100 * Φ(z[t]) )                               # Φ = standard normal CDF (numeric approx)

Holland code = top 3 types by raw[] descending.
Tie-break (deterministic): higher raw wins; on equal raw, RIASEC canonical order R<I<A<S<E<C.
code_string = concat(top3)   e.g. "SAE"
```

`NORM` default table (`RIASEC_V1`, tunable, versioned):
```
R: mean 24, sd 6     I: mean 25, sd 6     A: mean 24, sd 6
S: mean 27, sd 6     E: mean 25, sd 6     C: mean 25, sd 6
```
(Slightly higher S mean reflects typical school-age response skew; adjust with real data later — bump version.)

`Φ(z)` numeric approximation (Abramowitz–Stegun 7.1.26) — implement in the pure package; deterministic.

### 1.4 Output mapping
- **Profile:** `{ code: "SAE", bars: scaled[], percentiles: pct[], top3: [...] }`
- **Interpretation text:** per-type blurb bank (one paragraph each) → concatenate blurbs for the top-3 types.
- **Stream/career suggestions:** fixed map from single-letter and common two-letter Holland codes → suggested
  streams (Science/Commerce/Arts/Vocational) + example careers. Stored as data. Example rows:
```
S -> Teaching, Counselling, Nursing, Social Work, HR
I -> Research, Engineering, Medicine, Data/Analytics
A -> Design, Media, Architecture, Performing Arts, Writing
E -> Business, Sales, Law, Entrepreneurship, Management
R -> Engineering trades, Agriculture, Sports, Defence, Technician
C -> Accounting, Banking, Administration, Data entry, Auditing
SA -> Teaching + creative (e.g. art teacher, content design, therapy-through-arts)
IE -> Product/tech management, biotech entrepreneurship
... (2-letter combos of top-2 provide refined suggestions)
```
- **No free-text generation** — interpretation is template concatenation from the blurb bank + career map.

### 1.5 Storage / flow
- `psychometric_instruments` row seeded per school (or global template copied on enable) with `items/scoring/norms`.
- Student takes test (web/mobile) → responses saved to `psychometric_results.raw`.
- Scoring runs **inline on submit** (cheap, deterministic) → writes `scored` (raw/scaled/pct per type) + `profile`
  (code, top3, suggestions, interpretation). No nightly batch needed for this one.

---

## 2. Attendance Risk (`ATTN_RISK_V1`) — reproduces Feature-Doc mock-up #2

Window `W = 30` school days (configurable). Inputs from `attendance_records` (excluding `excused`, per D8).
```
rate    = present_days / counted_days                       # counted excludes 'excused'
recent  = rate over last 15 counted days
prior   = rate over the 15 counted days before that
drop    = max(0, prior - recent)                            # e.g. 0.18 => "18% attendance drop"
streak  = current consecutive unexcused absences
weekday = max over weekday W of (absences_on_W / occurrences_of_W)   # e.g. "Missed 6 Mondays"

score = 100 * ( 0.40*(1-rate) + 0.25*drop + 0.20*min(streak/5,1) + 0.15*weekday )
band  = HIGH if score>=60 ; MED if 35<=score<60 ; LOW if score<35
```
`factors[]` = the four weighted terms with human labels ("18% drop", "6 Mondays", "3 in a row", "72% present").
Action table keyed on `(band, dominant_factor)`:
```
HIGH + drop     -> "Call parent within 48 hours."
HIGH + weekday  -> "Discuss recurring <weekday> absence with parent."
HIGH + streak   -> "Immediate parent call; check for dropout risk."
MED  + any      -> "Send attendance reminder to parent; monitor next 2 weeks."
LOW             -> "No action needed."
```

## 3. Performance Forecast (`PERF_V1`) — reproduces Feature-Doc mock-up #1

Per subject, ordered exam scores `y[1..n]` as %, from `exam_results` (marks_obtained/max_marks*100).
```
avg    = mean(y)
slope  = least-squares slope of y over index 1..n           # trend per exam
vol    = stddev(y)
pred   = clamp(y[n] + slope, 0, 100)                        # next-exam estimate
label  = "High risk"        if pred < pass_mark OR slope < -8
         "Likely to improve" if slope > +5
         "Stable"            otherwise
```
`pass_mark` = per-school override (default 35). Overall = worst-labelled subjects surfaced first.
Action: for each subject labelled High risk, gap = pass_mark_target(=50) - pred;
`remedial = ceil(gap / 5)` → "Conduct {remedial} remedial classes in {subject}." (mock-up: 61% avg, Math high risk → "Conduct 3 remedial classes in Mathematics.")
Needs `n >= 3` exams for a subject to forecast; else label "Insufficient data".

## 4. Fee Defaulter Risk (`FEE_RISK_V1`)

Inputs from `fee_line_items` / `line_item_payments` / `payments` (per student, current academic year).
```
x1 = outstanding_amount / total_billed                      # 0..1
x2 = min(past_late_payments / 6, 1)
x3 = min(avg_days_late / 30, 1)
x4 = partial_payments / max(total_payments, 1)              # 0..1
x5 = min(months_since_last_payment / 6, 1)
z  = b0 + b1*x1 + b2*x2 + b3*x3 + b4*x4 + b5*x5
p  = 1 / (1 + e^(-z))                                       # 0..1 "default risk"
band = HIGH if p>=0.66 ; MED if 0.33<=p<0.66 ; LOW if p<0.33
```
Default coefficients (`FEE_RISK_V1`, versioned, hand-tuned — NOT learned):
```
b0=-2.0  b1=3.2  b2=1.4  b3=1.1  b4=0.8  b5=1.6
```
`factors[]` = each `bi*xi` contribution. Action table:
```
HIGH -> "Send fee reminder + schedule counselling call with parent."
MED  -> "Send automated fee reminder."
LOW  -> "No action needed."
```
(All comms are drafted/queued for staff approval — advisory-only, D5.)

## 5. Report Card Analysis (`REPORT_ANALYSIS_V1`)

Pure statistics over one exam's `exam_results` for a student + their section cohort.
```
per subject: pct, class_rank, class_percentile, delta_vs_previous_exam
overall: percentage, class_rank, consistency = 1 - (stddev(subject_pcts)/50)   # 0..1
strengths = subjects with class_percentile >= 75
focus     = subjects with class_percentile <= 25 OR delta < -10
```
Narrative = slot-filled templates chosen by flags (improving / declining / consistent / top-quartile), one sentence
each, concatenated. Feeds the existing `generate-report-card` PDF. No generative text.

## 6. Parent Communication (`COMMS_V1`)

Rule + template engine (not a chatbot). Triggers from other engines:
```
attendance band HIGH, fee band HIGH, perf subject High risk, doc expiring (KYC),
achievement (top_quartile / rank improved), leave decided
```
```
for each trigger:
  template = select(trigger, severity_band, locale)         # data-driven template bank
  rendered = slot_fill(template, {student, numbers, action})
  dedupe within 24h per (parent, trigger); rate-limit per parent/day
  enqueue -> comms_outbox (status='draft')                  # advisory: staff approves batch
  on approve -> dispatch via existing send-sms / send-push
```
Channel by severity: HIGH → SMS+push; MED/LOW → push only (SMS cost control). Consent flag on profile honored.
Light deterministic phrasing rotation seeded by `(student_id, trigger, date)` so messages don't read identical —
still reproducible.

---

## 7. Recompute orchestration
- Engines 2–5 (attendance/perf/fee/report): nightly `pg_cron` → `insights-recompute` Edge Function → pure
  `@edu-os/insights` fns → upsert snapshots keyed `(school_id, student_id, kind, day)` (idempotent). Manual
  "Recompute now" re-runs on demand. Only recompute for schools with the `insights` flag ON.
- Engine 1 (psychometric): inline on submit (no batch).
- Engine 6 (comms): triggered as engines 2–5 write HIGH bands + on KYC/leave events; writes drafts to
  `comms_outbox` for staff approval.
- Every run stamps `insight_runs(params_hash = INSIGHTS_PARAMS_V1)` for reproducibility.

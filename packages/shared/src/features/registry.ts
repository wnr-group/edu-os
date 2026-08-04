// F1 — canonical feature-key registry. Single source of truth for web, mobile,
// and the super-admin console. See docs/superpowers/specs/2026-07-24-f1-module-toggle-implementation.md §1.

export type FeatureKey =
  | "attendance" | "attendance_geo" | "homework" | "exams" | "exam_schedule"
  | "report_cards" | "syllabus" | "timetable"
  | "admissions" | "kyc_documents" | "leave" | "testing"
  | "fees" | "online_payments"
  | "announcements" | "gallery" | "feedback" | "discipline"
  | "insights";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  /** UI copy for the console — not in the original spec's FeatureDef, added for the mockup's descriptive text. */
  description: string;
  category: "Academics" | "Operations" | "Finance" | "Communication" | "Intelligence";
  /** Seed value for new schools + backfill for existing schools (migration 063). */
  defaultOn: boolean;
  /** 'existing' → already enforced/retrofit-eligible now. 'new' → key present, no-op until the module ships. */
  status: "existing" | "new";
  /** Console blocks enabling this until every dependency is on. */
  dependsOn?: FeatureKey[];
  /** Tables whose RLS gets the feature_enabled() conjunct when retrofitted (ERP-62). */
  gatesTables?: string[];
  /** Edge/cron functions that bypass RLS and need an explicit feature_enabled() check. */
  gatesFunctions?: string[];
}

// Core/structural modules (students, teachers, classes, subjects, academic
// years, settings, dashboard) are intentionally NOT in this registry — they
// are always on and never toggleable.

export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDef> = {
  attendance: {
    key: "attendance",
    label: "Attendance",
    description: "Daily attendance marking and summaries.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["attendance_records"],
  },
  attendance_geo: {
    key: "attendance_geo",
    label: "Geo Attendance",
    description: "Validate teacher location against the school geofence when marking.",
    category: "Academics",
    defaultOn: false,
    status: "new",
    dependsOn: ["attendance"],
  },
  homework: {
    key: "homework",
    label: "Homework",
    description: "Assignments, submissions, grading and feedback.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["homework", "homework_attachments", "homework_status"],
    gatesFunctions: ["send-homework-notification", "send-homework-reminders"],
  },
  exams: {
    key: "exams",
    label: "Exams & Results",
    description: "Exam marks, grades and report cards.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["exams", "exam_results"],
    gatesFunctions: ["generate-report-card"],
  },
  exam_schedule: {
    key: "exam_schedule",
    label: "Exam Schedule",
    description: "Datesheet with rooms & invigilators; clash detection.",
    category: "Academics",
    defaultOn: false,
    status: "new",
    dependsOn: ["exams"],
    gatesTables: ["exam_schedule_slots", "rooms"],
  },
  report_cards: {
    key: "report_cards",
    label: "Report Cards",
    description: "Report card templates and generation.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["report_card_templates"],
    gatesFunctions: ["generate-report-card"],
  },
  syllabus: {
    key: "syllabus",
    label: "Syllabus",
    description: "Upload and share syllabus documents.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["syllabus"],
  },
  timetable: {
    key: "timetable",
    label: "Timetable",
    description: "Period schedule per section; drives teacher scoping.",
    category: "Academics",
    defaultOn: true,
    status: "existing",
    gatesTables: ["timetable"],
  },
 admissions: {
    key: "admissions",
    label: "Admissions",
    description: "Public enquiry form → application pipeline → convert to student.",
    category: "Operations",
    defaultOn: false,
    status: "new",
    gatesTables: ["admission_applications", "admission_settings", "admission_stage_events"],
  },
  kyc_documents: {
    key: "kyc_documents",
    label: "KYC Documents",
    description: "Per-student document vault, verification & expiry tracking.",
    category: "Operations",
    defaultOn: false,
    status: "new",
    gatesTables: ["kyc_documents", "document_types"],
  },
  leave: {
    key: "leave",
    label: "Leave",
    description: "Leave applications, approvals and attendance integration.",
    category: "Operations",
    defaultOn: false,
    status: "new",
  },
  testing: {
    key: "testing",
    label: "Testing",
    description: "Live or async quizzes with auto-grading.",
    category: "Operations",
    defaultOn: false,
    status: "new",
  },
  discipline: {
    key: "discipline",
    label: "Discipline",
    description: "Behavioral incident records and tracking.",
    category: "Operations",
    defaultOn: true,
    status: "existing",
    gatesTables: ["discipline_records"],
  },
  fees: {
    key: "fees",
    label: "Fees",
    description: "Fee structures, invoices, receipts and outstanding tracking.",
    category: "Finance",
    defaultOn: true,
    status: "existing",
    gatesTables: ["fee_structures", "fee_types", "fee_line_items", "fee_payments", "payments", "line_item_payments"],
  },
  online_payments: {
    key: "online_payments",
    label: "Online Payments",
    description: "Razorpay collection in the parent app. Off → fees are recorded offline only; no pay UI, gateway blocked server-side.",
    category: "Finance",
    defaultOn: false,
    status: "new",
    dependsOn: ["fees"],
    gatesFunctions: ["create-razorpay-order"],
  },
  announcements: {
    key: "announcements",
    label: "Announcements",
    description: "School / class / section broadcasts.",
    category: "Communication",
    defaultOn: true,
    status: "existing",
    gatesTables: ["announcements"],
  },
  gallery: {
    key: "gallery",
    label: "Gallery",
    description: "Event photo albums for parents.",
    category: "Communication",
    defaultOn: true,
    status: "existing",
    gatesTables: ["school_gallery"],
  },
  feedback: {
    key: "feedback",
    label: "Feedback",
    description: "Parent feedback threads to staff.",
    category: "Communication",
    defaultOn: true,
    status: "existing",
    gatesTables: ["feedback"],
  },
  insights: {
    key: "insights",
    label: "Insights & Interventions",
    description: "Deterministic risk signals + action queue.",
    category: "Intelligence",
    defaultOn: false,
    status: "new",
    dependsOn: ["attendance", "exams", "fees"],
  },
};
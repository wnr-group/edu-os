export type Role =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "teacher"
  | "student"
  | "parent";

export type AttendanceStatus = "present" | "absent" | "late" | "half_day";

export type FeePaymentStatus = "paid" | "partial" | "overdue";

export type FeedbackStatus = "open" | "responded" | "closed";

export type DisciplineCategory = "behavioral" | "academic" | "attendance";

export type DisciplineSeverity = "verbal" | "written" | "suspension";

export type AnnouncementTargetType = "school" | "class" | "section";

export interface UserSession {
  userId: string;
  schoolId: string | null;
  role: Role;
}

export type InterventionKind = "attendance" | "academic";

export type InterventionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "dismissed";

export type InterventionType =
  | "CONTACT_PARENT"
  | "DISCUSS_ATTENDANCE_PATTERN"
  | "MONITOR"
  | "ASSIGN_ACADEMIC_SUPPORT";

export type InterventionAssignedVia =
  | "class_teacher"
  | "admin_fallback"
  | "reassigned";

export type InterventionSeverityBand = "MED" | "HIGH";

export interface Intervention {
  id: string;
  school_id: string;
  student_id: string;
  kind: InterventionKind;
  type: InterventionType;
  title: string;
  source_snapshot_id: string;
  status: InterventionStatus;
  severity_band: InterventionSeverityBand;
  assignee_id: string;
  assigned_via: InterventionAssignedVia;
  due_date: string;
  due_date_original: string;
  outcome_note: string | null;
  dismissal_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterventionAcademicEvidence {
  id: string;
  intervention_id: string;
  snapshot_id: string;
  is_pinned: boolean;
  created_at: string;
}

export interface InterventionParentNotification {
  id: string;
  intervention_id: string;
  client_request_id: string;
  notification_id: string | null;
  sent_by: string;
  sent_at: string;
  push_delivered: boolean | null;
  push_error: string | null;
}

export interface StudentRiskSnapshot {
  id: string;
  school_id: string;
  student_id: string;
  kind: "attendance" | "academic";
  computed_for: string;
  score: number;
  band: "LOW" | "MED" | "HIGH";
  factors: Array<{ factor: string; detail: string; weight: number }>;
  recommended_action: string;
  subject_id: string | null;
  params_hash: string;
  created_at: string;
}

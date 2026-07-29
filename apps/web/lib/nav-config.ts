import type { FeatureKey } from "@erp/shared";

export interface NavItem {
  label: string;
  href: string;
  /** When set, hidden unless this module is enabled for the school (see `@erp/shared` feature registry). */
  feature?: FeatureKey;
}

export interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

export interface RoleNavConfig {
  /** Shown as plain-text links in the desktop top nav, plus a "More" dropdown. */
  frequent: NavItem[];
  /** Everything else, grouped for the sidebar / mobile drawer accordion. */
  sections: NavSection[];
}

const SECTION_LABELS = {
  academic: "Academic",
  administration: "Administration",
  communication: "Communication",
  system: "System",
} as const;

function sections(map: Partial<Record<keyof typeof SECTION_LABELS, NavItem[]>>): NavSection[] {
  return (Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[])
    .map((key) => ({ key, label: SECTION_LABELS[key], items: map[key] ?? [] }))
    .filter((s) => s.items.length > 0);
}

// Same route set as the previous flat NAV_ITEMS map — only the grouping (and
// now the feature tags) is new.
export const NAV_CONFIG: Record<string, RoleNavConfig> = {
  school_admin: {
   frequent: [
      { label: "Dashboard", href: "/admin/dashboard" },
      { label: "Students", href: "/admin/students" },
      { label: "Teachers", href: "/admin/teachers" },
      { label: "Classes", href: "/admin/classes" },
      { label: "Exams", href: "/admin/exams", feature: "exams" },
      { label: "Timetable", href: "/admin/timetable", feature: "timetable" },
    ],
    sections: sections({
      academic: [
        { label: "Subjects", href: "/admin/subjects" },
        { label: "Academics", href: "/admin/academics" },
        { label: "Syllabus", href: "/admin/syllabus", feature: "syllabus" },
        { label: "Report Cards", href: "/admin/report-cards", feature: "report_cards" },
        { label: "Certificates", href: "/admin/certificates" },
      ],
      administration: [
        { label: "Fees", href: "/admin/fees", feature: "fees" },
        { label: "Discipline", href: "/admin/discipline", feature: "discipline" },
        { label: "Fee Types", href: "/admin/settings/fee-types", feature: "fees" },
        { label: "Reports", href: "/admin/reports" },
      ],
      communication: [
        { label: "Announcements", href: "/admin/announcements", feature: "announcements" },
        { label: "Gallery", href: "/admin/gallery", feature: "gallery" },
        { label: "Feedback", href: "/admin/feedback", feature: "feedback" },
      ],
      system: [{ label: "Settings", href: "/admin/settings" }],
    }),
  },
  teacher: {
    frequent: [
      { label: "Dashboard", href: "/teacher/dashboard" },
      { label: "Students", href: "/teacher/students" },
      { label: "Attendance", href: "/teacher/attendance", feature: "attendance" },
      { label: "Homework", href: "/teacher/homework", feature: "homework" },
    ],
    sections: sections({
      academic: [{ label: "Results", href: "/teacher/results", feature: "exams" }],
      administration: [
        { label: "Discipline", href: "/teacher/discipline", feature: "discipline" },
        { label: "Fees", href: "/teacher/fees", feature: "fees" },
      ],
      communication: [{ label: "Feedback", href: "/teacher/feedback", feature: "feedback" }],
    }),
  },
  teacher_no_feedback: {
    frequent: [
      { label: "Dashboard", href: "/teacher/dashboard" },
      { label: "Students", href: "/teacher/students" },
      { label: "Attendance", href: "/teacher/attendance", feature: "attendance" },
      { label: "Homework", href: "/teacher/homework", feature: "homework" },
    ],
    sections: sections({
      academic: [{ label: "Results", href: "/teacher/results", feature: "exams" }],
      administration: [
        { label: "Discipline", href: "/teacher/discipline", feature: "discipline" },
        { label: "Fees", href: "/teacher/fees", feature: "fees" },
      ],
    }),
  },
  principal: {
    frequent: [
      { label: "Dashboard", href: "/principal/dashboard" },
      { label: "Announcements", href: "/principal/announcements", feature: "announcements" },
    ],
    sections: sections({
      academic: [{ label: "Certificates", href: "/principal/certificates" }],
      administration: [
        { label: "Discipline", href: "/principal/discipline", feature: "discipline" },
        { label: "Reports", href: "/principal/reports" },
      ],
      communication: [{ label: "Feedback", href: "/principal/feedback", feature: "feedback" }],
    }),
  },
};

/** Every nav item for a role, flattened — used for active-route matching and the mobile bottom tab bar. */
export function allNavItems(config: RoleNavConfig): NavItem[] {
  return [...config.frequent, ...config.sections.flatMap((s) => s.items)];
}
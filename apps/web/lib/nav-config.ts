export interface NavItem {
  label: string;
  href: string;
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

// Same route set as the previous flat NAV_ITEMS map — only the grouping is new.
export const NAV_CONFIG: Record<string, RoleNavConfig> = {
  school_admin: {
    frequent: [
      { label: "Dashboard", href: "/admin/dashboard" },
      { label: "Students", href: "/admin/students" },
      { label: "Teachers", href: "/admin/teachers" },
      { label: "Classes", href: "/admin/classes" },
      { label: "Timetable", href: "/admin/timetable" },
    ],
    sections: sections({
      academic: [
        { label: "Subjects", href: "/admin/subjects" },
        { label: "Academics", href: "/admin/academics" },
        { label: "Syllabus", href: "/admin/syllabus" },
        { label: "Report Cards", href: "/admin/report-cards" },
        { label: "Certificates", href: "/admin/certificates" },
      ],
      administration: [
        { label: "Fees", href: "/admin/fees" },
        { label: "Discipline", href: "/admin/discipline" },
        { label: "Fee Types", href: "/admin/settings/fee-types" },
        { label: "Reports", href: "/admin/reports" },
      ],
      communication: [
        { label: "Announcements", href: "/admin/announcements" },
        { label: "Gallery", href: "/admin/gallery" },
        { label: "Feedback", href: "/admin/feedback" },
      ],
      system: [{ label: "Settings", href: "/admin/settings" }],
    }),
  },
  teacher: {
    frequent: [
      { label: "Dashboard", href: "/teacher/dashboard" },
      { label: "Students", href: "/teacher/students" },
      { label: "Attendance", href: "/teacher/attendance" },
      { label: "Homework", href: "/teacher/homework" },
    ],
    sections: sections({
      academic: [{ label: "Results", href: "/teacher/results" }],
      administration: [
        { label: "Discipline", href: "/teacher/discipline" },
        { label: "Fees", href: "/teacher/fees" },
      ],
      communication: [{ label: "Feedback", href: "/teacher/feedback" }],
    }),
  },
  teacher_no_feedback: {
    frequent: [
      { label: "Dashboard", href: "/teacher/dashboard" },
      { label: "Students", href: "/teacher/students" },
      { label: "Attendance", href: "/teacher/attendance" },
      { label: "Homework", href: "/teacher/homework" },
    ],
    sections: sections({
      academic: [{ label: "Results", href: "/teacher/results" }],
      administration: [
        { label: "Discipline", href: "/teacher/discipline" },
        { label: "Fees", href: "/teacher/fees" },
      ],
    }),
  },
  principal: {
    frequent: [
      { label: "Dashboard", href: "/principal/dashboard" },
      { label: "Announcements", href: "/principal/announcements" },
    ],
    sections: sections({
      academic: [{ label: "Certificates", href: "/principal/certificates" }],
      administration: [
        { label: "Discipline", href: "/principal/discipline" },
        { label: "Reports", href: "/principal/reports" },
      ],
      communication: [{ label: "Feedback", href: "/principal/feedback" }],
    }),
  },
};

/** Every nav item for a role, flattened — used for active-route matching and the mobile bottom tab bar. */
export function allNavItems(config: RoleNavConfig): NavItem[] {
  return [...config.frequent, ...config.sections.flatMap((s) => s.items)];
}
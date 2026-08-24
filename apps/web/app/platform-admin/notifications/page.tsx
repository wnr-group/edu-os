import { NotificationCenter } from "@/components/notification-center";

// No school-level "feedback" concept exists at the platform-admin scope, and
// no producer ever targets a super_admin identity with a feedback_contact/
// message_teacher notification here — this href is passed for prop-shape
// consistency only and is never reachable.
export default function PlatformAdminNotificationsPage() {
  // Layout already gates this whole route to super_admin — no lookup needed.
  return <NotificationCenter feedbackHref="/platform-admin/dashboard" viewerRole="super_admin" />;
}

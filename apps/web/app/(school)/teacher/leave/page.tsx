import { loadLeaveRows } from "@/lib/leave";
import { LeaveInbox } from "@/components/leave-inbox";

export default async function TeacherLeavePage() {
  const { rows, viewerLabel } = await loadLeaveRows("Teacher view · your sections");
  return <LeaveInbox requests={rows} viewerLabel={viewerLabel} />;
}
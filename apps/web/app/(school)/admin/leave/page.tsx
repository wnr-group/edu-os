import { loadLeaveRows } from "@/lib/leave";
import { LeaveInbox } from "@/components/leave-inbox";

export default async function AdminLeavePage() {
  const { rows, viewerLabel } = await loadLeaveRows("Admin view · school-wide");
  return <LeaveInbox requests={rows} viewerLabel={viewerLabel} />;
}
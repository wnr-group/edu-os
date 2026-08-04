import { loadLeaveRows } from "@/lib/leave";
import { LeaveInbox } from "@/components/leave-inbox";

export default async function PrincipalLeavePage() {
  const { rows, viewerLabel } = await loadLeaveRows("Principal view · school-wide");
  return <LeaveInbox requests={rows} viewerLabel={viewerLabel} />;
}
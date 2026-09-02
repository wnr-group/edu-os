import { PtmMeetingDetail } from "@/components/ptm-meeting-detail";

export default async function AdminPtmMeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <PtmMeetingDetail meetingId={meetingId} backHref="/admin/ptm" />;
}

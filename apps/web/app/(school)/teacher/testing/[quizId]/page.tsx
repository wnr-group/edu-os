import { redirect } from "next/navigation";

// The global Breadcrumbs component (apps/web/components/breadcrumbs.tsx)
// links every UUID path segment to its own page — e.g. /teacher/homework/[id]
// and /teacher/results/[examId] both resolve directly. The quiz builder lives
// one level deeper at .../[quizId]/edit, so that breadcrumb 404'd. This page
// exists purely to satisfy that convention.
export default async function QuizDetailRedirect({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  redirect(`/teacher/testing/${quizId}/edit`);
}

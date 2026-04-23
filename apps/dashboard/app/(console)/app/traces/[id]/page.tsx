/**
 * The trace route mounts the console inspector for a single trace inside the shared dashboard shell.
 * It keeps route params thin and lets the client component own auth-aware data fetching.
 */
import { TraceDetailView } from "../../../../../components/trace-detail-view"

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <TraceDetailView traceId={id} />
}

import { AgentDetailView } from "../../../../../components/agent-detail-view"

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params
  return <AgentDetailView agentId={resolved.id} />
}

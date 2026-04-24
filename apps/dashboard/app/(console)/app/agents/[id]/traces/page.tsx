import { AgentTracesView } from "../../../../../../components/agent-traces-view"

export default async function AgentTracesPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params
  return <AgentTracesView agentId={resolved.id} />
}

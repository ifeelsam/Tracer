import { AgentSettingsView } from "../../../../../../components/agent-settings-view"

export default async function AgentSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params
  return <AgentSettingsView agentId={resolved.id} />
}

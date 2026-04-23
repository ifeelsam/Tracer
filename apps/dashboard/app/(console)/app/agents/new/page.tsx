/**
 * The new-agent route bootstraps onboarding with server-fetched chain metadata from the shared registry.
 * It keeps chain selection authoritative while handing interaction to a client wizard component.
 */
import { AgentOnboardingWizard } from "../../../../../components/agent-onboarding-wizard"
import { getSupportedChains } from "../../../../../lib/trpc"

export default async function NewAgentPage() {
  const chains = await getSupportedChains()

  return <AgentOnboardingWizard chains={chains} />
}

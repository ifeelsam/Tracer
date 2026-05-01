"use client"

/**
 * Agents index — workspace list only. Console overview lives at /app.
 */
import Link from "next/link"

import { AgentListView } from "../../../../components/agent-list-view"
import { PageHeader } from "../../../../components/ui-primitives"

export default function AgentsIndexPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Agents"
        description="Register, open detail, or jump to traces."
        actions={
          <Link className="btn btn-primary" href="/app/agents/new">
            New agent
          </Link>
        }
      />
      <AgentListView />
    </div>
  )
}

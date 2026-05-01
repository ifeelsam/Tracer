"use client"

/**
 * Agent detail gives operators a single place to inspect core configuration and jump into traces.
 * Mutations are intentionally limited to avoid accidental destructive operations from this view.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { usePrivyEnabled } from "./providers"
import {
  Badge,
  Empty,
  KeyValue,
  KeyValueGrid,
  PageHeader,
  RailNumberedList,
  Section,
  SurfaceNotice,
} from "./ui-primitives"

interface AgentDetail {
  id: string
  displayName: string
  chainId: number
  environment: string
  verified: boolean
  verifiedAt: Date | string | null
  agentWallet: string | null
  privateMode: boolean
  retentionDays: number
  createdAt: Date | string
}

export function AgentDetailView({ agentId }: { agentId: string }) {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login, ready } = usePrivy()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!privyEnabled || !authenticated || !ready) {
      return
    }

    let cancelled = false

    async function loadAgent() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const result = (await client.query("agents.get", agentId)) as AgentDetail | null
        if (!cancelled) {
          setAgent(result)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load agent.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadAgent()
    return () => {
      cancelled = true
    }
  }, [agentId, authenticated, client, privyEnabled, ready])

  if (!privyEnabled) {
    return (
      <SurfaceNotice
        description="Set NEXT_PUBLIC_PRIVY_APP_ID to enable this surface."
        title="Agent Detail"
      />
    )
  }

  if (!ready) {
    return <SurfaceNotice description="Preparing your session…" title="Agent Detail" />
  }

  if (!authenticated) {
    return (
      <SurfaceNotice
        action={
          <button className="nav-chip" onClick={() => login()} type="button">
            Login with Privy
          </button>
        }
        description="Authenticate to inspect this agent."
        title="Agent Detail"
      />
    )
  }

  if (isLoading) {
    return <SurfaceNotice description="Loading agent..." title="Agent Detail" />
  }

  if (!agent) {
    return (
      <Section title="Agent detail">
        <Empty
          title={errorMessage ?? "Agent not found"}
          action={
            <Link className="btn btn-secondary" href="/app/agents">
              Back to agents
            </Link>
          }
        />
      </Section>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Agent"
        title={agent.displayName}
        actions={
          <div className="surface-action-row">
            <Badge tone={agent.verified ? "success" : "warning"}>
              <span className="badge-dot" />
              {agent.verified ? "Verified" : "Unverified"}
            </Badge>
            <Link className="btn btn-secondary" href={`/app/agents/${agent.id}/traces`}>
              View traces
            </Link>
            <Link className="btn btn-secondary" href={`/app/agents/${agent.id}/settings`}>
              Settings
            </Link>
          </div>
        }
      />
      <main className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <Section title="Configuration" description="Core immutable and runtime configuration.">
          <KeyValueGrid>
            <KeyValue label="Agent ID" value={agent.id} mono />
            <KeyValue label="Wallet" value={agent.agentWallet ?? "n/a"} mono />
            <KeyValue label="Chain" value={agent.chainId.toString()} />
            <KeyValue label="Environment" value={agent.environment} />
            <KeyValue label="Private mode" value={agent.privateMode ? "enabled" : "disabled"} />
            <KeyValue label="Retention" value={`${agent.retentionDays} days`} />
            <KeyValue label="Created at" value={formatDate(agent.createdAt)} />
          </KeyValueGrid>
        </Section>

        <aside className="grid gap-8">
          <Section title="Verification status">
            <div className="verification-stack">
              <Badge tone={agent.verified ? "success" : "warning"}>
                <span className="badge-dot" />
                {agent.verified ? "Verified" : "Unverified"}
              </Badge>
              <p className="text-[13px] leading-6 text-[var(--fg-muted)]">
                {agent.verified
                  ? `Verified at ${formatDate(agent.verifiedAt)}.`
                  : "First trace marks this agent verified."}
              </p>
              {!agent.verified ? (
                <a
                  className="btn btn-ghost btn-sm"
                  href="https://github.com/Madhav-Gupta-28/Tracer/blob/main/docs/demo-evidence.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify guide
                </a>
              ) : null}
            </div>
          </Section>
          <Section title="Recommended next steps">
            <RailNumberedList
              items={[
                {
                  title: "Install SDK",
                  description: "Connect your runtime and send traces automatically.",
                },
                {
                  title: "Send first trace",
                  description: "Confirm connectivity and review execution events.",
                },
                {
                  title: "Anchor on-chain",
                  description: "Publish proof metadata and verify integrity.",
                },
              ]}
            />
          </Section>
        </aside>
      </main>
    </>
  )
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "n/a"
  }
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString()
}

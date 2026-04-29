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
import { Badge, Empty, PageHeader, Section, SurfaceNotice } from "./ui-primitives"

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
            <Link className="btn btn-secondary" href="/app">
              Back to console
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
        description={`Chain ${agent.chainId} · ${agent.environment}`}
        actions={
          <>
            <Badge tone={agent.verified ? "success" : "warning"}>
              <span className="badge-dot" />
              {agent.verified ? "Verified" : "Unverified"}
            </Badge>
            <Link className="btn btn-secondary" href={`/app/agents/${agent.id}/settings`}>
              Settings
            </Link>
          </>
        }
      />
      <main className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Section
          title="Configuration"
          description="Core immutable and runtime configuration for this agent."
          actions={
            <Link className="btn btn-secondary btn-sm" href={`/app/agents/${agent.id}/traces`}>
              View traces
            </Link>
          }
        >
          <dl className="grid gap-4 text-[13px] leading-6">
            <DetailRow label="Agent ID" value={agent.id} mono />
            <DetailRow label="Wallet" value={agent.agentWallet ?? "n/a"} mono />
            <DetailRow label="Private Mode" value={agent.privateMode ? "enabled" : "disabled"} />
            <DetailRow label="Retention" value={`${agent.retentionDays} days`} />
            <DetailRow label="Created At" value={formatDate(agent.createdAt)} />
          </dl>
        </Section>

        <aside className="grid gap-4">
          <Section title="Verification status">
            <p className="text-[13px] leading-6 text-[var(--fg-muted)]">
              {agent.verified
                ? `Verified at ${formatDate(agent.verifiedAt)}.`
                : "Not verified yet. Send the first trace with TRACER_VERIFY_TOKEN to mark this agent verified."}
            </p>
          </Section>
          <Section title="Recommended next steps">
            <ul className="space-y-2 text-[13px] leading-6 text-[var(--fg-muted)]">
              <li>Install SDK with the onboarding wizard.</li>
              <li>Ship a trace and confirm connection status.</li>
              <li>Anchor and verify an on-chain Merkle proof.</li>
            </ul>
          </Section>
        </aside>
      </main>
    </>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-[13px] ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  )
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "n/a"
  }
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString()
}

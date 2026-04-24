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
  const { authenticated, getAccessToken, login } = usePrivy()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!privyEnabled || !authenticated) {
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
  }, [agentId, authenticated, client, privyEnabled])

  if (!privyEnabled) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable this surface.
        </p>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Detail</div>
        <h1 className="headline mt-4 text-4xl leading-none">Authenticate to inspect this agent.</h1>
        <button className="nav-chip mt-6" onClick={() => login()} type="button">
          Login with Privy
        </button>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">Loading agent…</p>
      </main>
    )
  }

  if (!agent) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          {errorMessage ?? "Agent not found."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="nav-chip" href="/app">
            Back to console
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent</div>
        <h1 className="headline mt-6 text-5xl leading-none">{agent.displayName}</h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
          Chain {agent.chainId} • {agent.environment} • {agent.verified ? "verified" : "unverified"}
        </p>

        <dl className="mt-8 grid gap-4 text-sm leading-6">
          <DetailRow label="Agent ID" value={agent.id} />
          <DetailRow label="Wallet" value={agent.agentWallet ?? "n/a"} />
          <DetailRow label="Private Mode" value={agent.privateMode ? "on" : "off"} />
          <DetailRow label="Retention" value={`${agent.retentionDays} days`} />
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="nav-chip" href={`/app/agents/${agent.id}/traces`}>
            View traces
          </Link>
          <Link className="nav-chip" href={`/app/agents/${agent.id}/settings`}>
            Settings
          </Link>
        </div>
      </section>

      <aside className="grid gap-4">
        <div className="frame p-5">
          <div className="label text-[var(--foreground-muted)]">Verification</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            {agent.verified
              ? `Verified at ${formatDate(agent.verifiedAt)}.`
              : "This agent has not verified yet. Send the first trace with TRACER_VERIFY_TOKEN to mark it verified."}
          </p>
        </div>
        <div className="frame p-5">
          <div className="label text-[var(--foreground-muted)]">Next Steps</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--foreground-muted)]">
            <li>Install SDK with the onboarding wizard</li>
            <li>Ship a trace and confirm connection status</li>
            <li>Anchor + verify on-chain Merkle proof</li>
          </ul>
        </div>
      </aside>
    </main>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-[var(--foreground-muted)]">{label}</dt>
      <dd className="break-all">{value}</dd>
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

"use client"

/**
 * Agent list — the primary console surface for navigating agents and their traces.
 * Renders as a true data table, with an inline empty state and an accessible loading state.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { usePrivyEnabled } from "./providers"
import { Badge, Empty, Section } from "./ui-primitives"

interface AgentRow {
  id: string
  displayName: string
  chainId: number
  environment: string
  verified: boolean
  agentWallet: string | null
  createdAt: Date | string
  actorRole: "owner" | "collaborator"
}

function prettyAgentError(message: string): string {
  if (message.includes("Unexpected token '<'")) {
    return "Agent data endpoint is unreachable. Ensure the server app is running and NEXT_PUBLIC_TRACER_SERVER_URL is correct."
  }
  return message
}

function formatRelative(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "—"
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return date.toISOString().slice(0, 10)
}

function shortHex(value: string | null): string {
  if (!value) return "—"
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function AgentTableSkeleton() {
  return (
    <div className="agent-table-skeleton mt-2" aria-hidden="true">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  )
}

export function AgentListView() {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login, ready } = usePrivy()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!privyEnabled || !authenticated || !ready) {
      return
    }

    let cancelled = false

    async function loadAgents() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const result = (await client.query("agents.list")) as AgentRow[]
        if (!cancelled) {
          setAgents(Array.isArray(result) ? result : [])
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? prettyAgentError(error.message) : "Failed to load agents."
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadAgents()

    return () => {
      cancelled = true
    }
  }, [authenticated, client, privyEnabled, ready])

  if (!privyEnabled) {
    return (
      <Section title="Agents">
        <Empty
          title="Authentication disabled"
          description="Set NEXT_PUBLIC_PRIVY_APP_ID in apps/dashboard/.env.local to load your agents."
        />
      </Section>
    )
  }

  if (!ready) {
    return (
      <Section title="Agents">
        <div className="py-10 text-center text-[13px] text-[var(--fg-muted)]">
          Preparing your session…
        </div>
      </Section>
    )
  }

  if (!authenticated) {
    return (
      <Section title="Agents">
        <Empty
          title="Sign in to view agents"
          description="Authenticate with Privy to list agents and inspect traces."
          action={
            <button className="btn btn-primary" onClick={() => login()} type="button">
              Sign in with Privy
            </button>
          }
        />
      </Section>
    )
  }

  return (
    <Section
      title="Agents"
      description="All agents in your workspace. Click a row to open detail."
      actions={
        <Link className="btn btn-primary" href="/app/agents/new">
          + New agent
        </Link>
      }
    >
      {isLoading && agents.length === 0 ? (
        <AgentTableSkeleton />
      ) : errorMessage ? (
        <Empty
          title="Couldn't load agents"
          description={errorMessage}
          action={
            <button
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
              type="button"
            >
              Retry
            </button>
          }
        />
      ) : agents.length === 0 ? (
        <Empty
          title="No agents yet"
          description="Register your first agent to start capturing evidence."
          action={
            <Link className="btn btn-primary" href="/app/agents/new">
              + New agent
            </Link>
          }
        />
      ) : (
        <div className="mt-2 overflow-x-auto -mx-[18px]">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chain</th>
                <th>Status</th>
                <th>Wallet</th>
                <th>Created</th>
                <th style={{ textAlign: "right", paddingRight: 18 }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="table-row-link">
                  <td>
                    <Link href={`/app/agents/${agent.id}`} className="block min-w-0">
                      <div className="font-medium text-[var(--fg)] truncate">
                        {agent.displayName}
                      </div>
                      <div className="mono text-[var(--fg-faint)] text-[12px] truncate">
                        {agent.id}
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Badge>
                      <span className="badge-dot" style={{ color: "var(--info)" }} />
                      {agent.environment} · {agent.chainId}
                    </Badge>
                  </td>
                  <td>
                    {agent.verified ? (
                      <Badge tone="success">
                        <span className="badge-dot" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <span className="badge-dot" />
                        Pending
                      </Badge>
                    )}
                  </td>
                  <td className="mono text-[var(--fg-muted)]">{shortHex(agent.agentWallet)}</td>
                  <td className="text-[var(--fg-muted)]">{formatRelative(agent.createdAt)}</td>
                  <td style={{ textAlign: "right", paddingRight: 18 }}>
                    <div className="inline-flex items-center gap-1">
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={`/app/agents/${agent.id}/traces`}
                      >
                        Traces
                      </Link>
                      <Link className="btn btn-secondary btn-sm" href={`/app/agents/${agent.id}`}>
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

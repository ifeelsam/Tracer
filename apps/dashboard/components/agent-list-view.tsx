"use client"

/**
 * The agent list view is the primary console surface for navigating agents and their traces.
 * It loads agents client-side to reuse the Privy access token and keep the console responsive.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { usePrivyEnabled } from "./providers"

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

export function AgentListView() {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login } = usePrivy()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!privyEnabled || !authenticated) {
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
          setErrorMessage(error instanceof Error ? error.message : "Failed to load agents.")
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
  }, [authenticated, client, privyEnabled])

  if (!privyEnabled) {
    return (
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agents</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Authentication is disabled. Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to load your agents.
        </p>
      </section>
    )
  }

  if (!authenticated) {
    return (
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agents</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Authenticate to list agents and inspect traces.
        </p>
        <button className="nav-chip mt-6" onClick={() => login()} type="button">
          Login with Privy
        </button>
      </section>
    )
  }

  return (
    <section className="frame p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label text-[var(--foreground-muted)]">Agents</div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
            Create an agent, install the SDK, and then inspect traces per chain.
          </p>
        </div>
        <Link className="nav-chip" href="/app/agents/new">
          New Agent
        </Link>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm leading-7 text-[var(--foreground-muted)]">Loading agents…</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-6 text-sm leading-7 text-[var(--accent)]">{errorMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {agents.length > 0 ? (
          agents.map((agent) => (
            <div key={agent.id} className="frame p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="label text-[var(--foreground-muted)]">Agent</div>
                  <div className="mt-2 text-xl">{agent.displayName}</div>
                  <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                    Chain {agent.chainId} • {agent.environment} •{" "}
                    {agent.verified ? "verified" : "unverified"} • {agent.actorRole}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link className="nav-chip" href={`/app/agents/${agent.id}`}>
                    Detail
                  </Link>
                  <Link className="nav-chip" href={`/app/agents/${agent.id}/traces`}>
                    Traces
                  </Link>
                  <Link className="nav-chip" href={`/app/agents/${agent.id}/settings`}>
                    Settings
                  </Link>
                </div>
              </div>
              {agent.agentWallet ? (
                <p className="mt-4 break-all text-sm leading-6 text-[var(--foreground-muted)]">
                  Wallet {agent.agentWallet}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="frame p-5">
            <div className="label text-[var(--foreground-muted)]">No agents yet</div>
            <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
              Start by creating an agent and installing <code>@tracerlabs/sdk</code>.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

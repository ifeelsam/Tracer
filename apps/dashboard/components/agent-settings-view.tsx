"use client"

/**
 * Agent settings exposes safe, explicit actions like rotating API keys and deleting agents.
 * Destructive operations require deliberate user clicks and surface warnings in-line.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { usePrivyEnabled } from "./providers"

interface AgentSettings {
  id: string
  displayName: string
  agentWallet: string | null
  chainId: number
  environment: string
}

export function AgentSettingsView({ agentId }: { agentId: string }) {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login } = usePrivy()
  const [agent, setAgent] = useState<AgentSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rotatedApiKey, setRotatedApiKey] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

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
        const result = (await client.query("agents.get", agentId)) as AgentSettings | null
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
        <div className="label text-[var(--foreground-muted)]">Settings</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable this surface.
        </p>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Settings</div>
        <h1 className="headline mt-4 text-4xl leading-none">Authenticate to manage this agent.</h1>
        <button className="nav-chip mt-6" onClick={() => login()} type="button">
          Login with Privy
        </button>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Settings</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">Loading…</p>
      </main>
    )
  }

  if (!agent) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Settings</div>
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

  if (deleted) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Settings</div>
        <h1 className="headline mt-4 text-4xl leading-none">Agent deleted.</h1>
        <p className="mt-6 text-sm leading-7 text-[var(--foreground-muted)]">
          The agent and its traces were removed from the database.
        </p>
        <div className="mt-8">
          <Link className="nav-chip" href="/app">
            Back to console
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Settings</div>
        <h1 className="headline mt-6 text-5xl leading-none">{agent.displayName}</h1>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          Chain {agent.chainId} • {agent.environment}
        </p>

        <dl className="mt-8 grid gap-4 text-sm leading-6">
          <DetailRow label="Agent ID" value={agent.id} />
          <DetailRow label="Wallet" value={agent.agentWallet ?? "n/a"} />
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="nav-chip" href={`/app/agents/${agent.id}`}>
            Back to detail
          </Link>
          <Link className="nav-chip" href={`/app/agents/${agent.id}/traces`}>
            View traces
          </Link>
        </div>
      </section>

      <aside className="grid gap-4">
        <div className="frame p-5">
          <div className="label text-[var(--foreground-muted)]">Rotate API key</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            Rotating immediately invalidates the previous key. Update your agent secrets right away.
          </p>
          <button
            className="nav-chip mt-5"
            onClick={async () => {
              setErrorMessage(null)
              setRotatedApiKey(null)
              try {
                const result = (await client.mutation("agents.rotateKey", agent.id)) as {
                  apiKey: string
                }
                setRotatedApiKey(result.apiKey)
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Failed to rotate key.")
              }
            }}
            type="button"
          >
            Rotate
          </button>
          {rotatedApiKey ? (
            <div className="mt-4">
              <div className="label text-[var(--foreground-muted)]">New API key</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm leading-6">
                {rotatedApiKey}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="frame p-5">
          <div className="label text-[var(--accent)]">Danger zone</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            Deleting an agent also deletes its traces, events, and analysis records.
          </p>
          <button
            className="nav-chip mt-5"
            onClick={async () => {
              const confirmed = window.confirm("Delete this agent and all traces?")
              if (!confirmed) {
                return
              }

              setErrorMessage(null)
              try {
                const result = (await client.mutation("agents.delete", agent.id)) as {
                  deleted: boolean
                }
                setDeleted(result.deleted)
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Failed to delete agent.")
              }
            }}
            type="button"
          >
            Delete agent
          </button>
          {errorMessage ? (
            <p className="mt-4 text-sm leading-6 text-[var(--accent)]">{errorMessage}</p>
          ) : null}
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

"use client"

/**
 * Agent traces view lists recent traces and respects the dashboard-only chain filter.
 * It keeps filtering local to the UI and never attempts to change ACTIVE_CHAIN_ID on the backend.
 */
import { usePrivy } from "@privy-io/react-auth"
import type { Trace } from "@tracerlabs/shared"
import { getChain } from "@tracerlabs/shared/chains"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { ChainBadge } from "./chain-badge"
import { usePrivyEnabled } from "./providers"
import { Badge, Empty, PageHeader, Section, SurfaceNotice } from "./ui-primitives"

const STORAGE_KEY = "tracer_active_chain"

interface TraceListResult {
  items: Trace[]
  nextCursor: string | null
}

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  const normalized = status.toLowerCase()
  if (normalized === "completed" || normalized === "success") return "success"
  if (normalized === "failed" || normalized === "error") return "danger"
  if (normalized === "running" || normalized === "pending") return "warning"
  return "default"
}

function TraceListSkeleton() {
  return (
    <div className="agent-table-skeleton mt-2" aria-hidden="true">
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  )
}

export function AgentTracesView({ agentId }: { agentId: string }) {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login, ready } = usePrivy()
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null)
  const [result, setResult] = useState<TraceListResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    const syncFromStorage = () => {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
      setSelectedChainId(Number.isNaN(parsed) ? null : parsed)
    }

    syncFromStorage()

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        syncFromStorage()
      }
    }
    const onCustom = () => {
      syncFromStorage()
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener("tracer:active-chain-changed", onCustom)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("tracer:active-chain-changed", onCustom)
    }
  }, [])

  const loadTraces = useCallback(
    async (cursor: string | null) => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const response = (await client.query("traces.list", {
          agentId,
          cursor,
          filters: selectedChainId !== null ? { chainId: selectedChainId } : undefined,
        })) as TraceListResult
        setResult((previous) => {
          if (!cursor || !previous) {
            return response
          }

          return {
            items: [...previous.items, ...response.items],
            nextCursor: response.nextCursor,
          }
        })
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load traces.")
      } finally {
        setIsLoading(false)
      }
    },
    [agentId, client, selectedChainId]
  )

  useEffect(() => {
    if (!privyEnabled || !authenticated || !ready) {
      return
    }
    void loadTraces(null)
  }, [authenticated, loadTraces, privyEnabled, ready])

  if (!privyEnabled) {
    return (
      <SurfaceNotice
        description="Set NEXT_PUBLIC_PRIVY_APP_ID to enable this surface."
        title="Traces"
      />
    )
  }

  if (!ready) {
    return <SurfaceNotice description="Preparing your session…" title="Traces" />
  }

  if (!authenticated) {
    return (
      <SurfaceNotice
        action={
          <button className="nav-chip" onClick={() => login()} type="button">
            Login with Privy
          </button>
        }
        description="Authenticate to inspect traces."
        title="Traces"
      />
    )
  }

  const activeChain = selectedChainId !== null ? safeGetChain(selectedChainId) : null

  return (
    <>
      <PageHeader
        eyebrow="Trace list"
        title="Recent traces"
        actions={
          <div className="surface-action-row">
            <span className="app-user-chip mono" title={agentId}>
              {agentId}
            </span>
            {activeChain ? <ChainBadge chain={activeChain} /> : null}
            <Link className="btn btn-secondary" href={`/app/agents/${agentId}`}>
              Agent detail
            </Link>
            <Link className="btn btn-secondary" href={`/app/agents/${agentId}/settings`}>
              Settings
            </Link>
          </div>
        }
      />

      <Section
        title="Results"
        description="Newest traces first. Click a row to inspect full timeline."
      >
        {isLoading && !result?.items?.length ? <TraceListSkeleton /> : null}
        {errorMessage ? (
          <Empty
            title="Could not load traces"
            description={errorMessage}
            action={
              <button
                className="btn btn-secondary"
                onClick={() => void loadTraces(null)}
                type="button"
              >
                Retry
              </button>
            }
          />
        ) : null}

        {!errorMessage && result?.items?.length ? (
          <div className="-mx-[18px] overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Trace ID</th>
                  <th style={{ textAlign: "right", paddingRight: 18 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((trace) => (
                  <tr key={trace.id}>
                    <td className="text-[var(--fg-muted)]">
                      {new Date(trace.startedAt).toLocaleString()}
                    </td>
                    <td>
                      <Badge tone={statusTone(trace.status)}>{trace.status}</Badge>
                    </td>
                    <td className="max-w-[320px] truncate">{trace.inputSummary}</td>
                    <td className="mono text-[var(--fg-faint)]" title={trace.id}>
                      {trace.id.slice(0, 13)}…
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 18 }}>
                      <Link className="btn btn-secondary btn-sm" href={`/app/traces/${trace.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!errorMessage && !isLoading && !result?.items?.length ? (
          <Empty
            title="No traces yet"
            description="Send the first session from your agent to populate this list."
          />
        ) : null}

        {result?.nextCursor ? (
          <div className="mt-4">
            <button
              className="btn btn-secondary"
              onClick={() => void loadTraces(result.nextCursor)}
              type="button"
            >
              Load more
            </button>
          </div>
        ) : null}
      </Section>
    </>
  )
}

function safeGetChain(chainId: number) {
  try {
    return getChain(chainId)
  } catch {
    return null
  }
}

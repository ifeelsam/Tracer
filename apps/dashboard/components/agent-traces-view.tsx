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

const STORAGE_KEY = "tracer_active_chain"

interface TraceListResult {
  items: Trace[]
  nextCursor: string | null
}

export function AgentTracesView({ agentId }: { agentId: string }) {
  const privyEnabled = usePrivyEnabled()
  const { authenticated, getAccessToken, login } = usePrivy()
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
    if (!privyEnabled || !authenticated) {
      return
    }
    void loadTraces(null)
  }, [authenticated, loadTraces, privyEnabled])

  if (!privyEnabled) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Traces</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable this surface.
        </p>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Traces</div>
        <h1 className="headline mt-4 text-4xl leading-none">Authenticate to inspect traces.</h1>
        <button className="nav-chip mt-6" onClick={() => login()} type="button">
          Login with Privy
        </button>
      </main>
    )
  }

  const activeChain = selectedChainId !== null ? safeGetChain(selectedChainId) : null

  return (
    <main className="grid gap-6">
      <section className="frame p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label text-[var(--foreground-muted)]">Trace List</div>
            <h1 className="headline mt-6 text-5xl leading-none">Recent traces</h1>
            <p className="mt-6 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
              Showing traces for agent <span className="break-all">{agentId}</span>
              {activeChain ? (
                <>
                  {" "}
                  filtered to <span className="font-semibold">{activeChain.name}</span>.
                </>
              ) : (
                "."
              )}
            </p>
            {activeChain ? (
              <div className="mt-6">
                <ChainBadge chain={activeChain} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="nav-chip" href={`/app/agents/${agentId}`}>
              Agent detail
            </Link>
            <Link className="nav-chip" href={`/app/agents/${agentId}/settings`}>
              Settings
            </Link>
          </div>
        </div>
      </section>

      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Results</div>
        {isLoading ? (
          <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">Loading traces…</p>
        ) : null}
        {errorMessage ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm leading-7 text-[var(--accent)]">{errorMessage}</p>
            <button className="nav-chip w-fit" onClick={() => void loadTraces(null)} type="button">
              Retry
            </button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {result?.items?.length ? (
            result.items.map((trace) => (
              <Link key={trace.id} className="frame p-4" href={`/app/traces/${trace.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm leading-6 text-[var(--foreground-muted)]">
                    {new Date(trace.startedAt).toISOString()}
                  </div>
                  <span className="chain-badge">{trace.status}</span>
                </div>
                <div className="mt-3 text-lg">{trace.inputSummary}</div>
                <p className="mt-2 break-all text-sm leading-6 text-[var(--foreground-muted)]">
                  {trace.id}
                </p>
              </Link>
            ))
          ) : (
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
              No traces yet. Send the first session from your agent to populate this list.
            </p>
          )}
        </div>

        {result?.nextCursor ? (
          <button
            className="nav-chip mt-6"
            onClick={() => void loadTraces(result.nextCursor)}
            type="button"
          >
            Load more
          </button>
        ) : null}
      </section>
    </main>
  )
}

function safeGetChain(chainId: number) {
  try {
    return getChain(chainId)
  } catch {
    return null
  }
}

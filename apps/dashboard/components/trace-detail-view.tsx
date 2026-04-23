"use client"

/**
 * The trace detail view turns a raw trace payload into the dashboard's three-panel investigation surface.
 * It fetches authenticated trace data client-side so the console can work with Privy tokens without SSR glue.
 */
import { usePrivy } from "@privy-io/react-auth"
import type {
  EvmContractReadPayload,
  EvmTxPayload,
  Trace,
  TraceAnalysis,
  TraceEvent,
} from "@tracerlabs/shared"
import { getChain } from "@tracerlabs/shared/chains"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { createBrowserTRPCClient } from "../lib/trpc"
import { ChainBadge } from "./chain-badge"
import { usePrivyEnabled } from "./providers"

interface TraceDetailData {
  trace: Trace
  events: TraceEvent[]
  analysis: TraceAnalysis | null
}

export function TraceDetailView({ traceId }: { traceId: string }) {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Trace Detail</div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to open authenticated trace detail screens from
          the dashboard.
        </p>
      </main>
    )
  }

  return <AuthenticatedTraceDetailView traceId={traceId} />
}

function AuthenticatedTraceDetailView({ traceId }: { traceId: string }) {
  const { authenticated, getAccessToken, login } = usePrivy()
  const [detail, setDetail] = useState<TraceDetailData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null)

  useEffect(() => {
    if (!authenticated) {
      return
    }

    const client = createBrowserTRPCClient(() => getAccessToken())
    let cancelled = false

    async function loadTrace() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const result = (await client.query("traces.get", traceId)) as TraceDetailData | null
        if (cancelled) {
          return
        }

        if (!result) {
          setDetail(null)
          setErrorMessage("Trace not found or you do not have access to it.")
          return
        }

        setDetail(result)
        setFocusedEventId(result.events[0]?.id ?? null)
      } catch (error) {
        if (cancelled) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to load trace detail.")
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTrace()

    return () => {
      cancelled = true
    }
  }, [authenticated, getAccessToken, traceId])

  const focusedEvent = useMemo(() => {
    if (!detail) {
      return null
    }

    return detail.events.find((event) => event.id === focusedEventId) ?? detail.events[0] ?? null
  }, [detail, focusedEventId])

  if (!authenticated) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Trace Detail</div>
        <h1 className="headline mt-4 text-4xl leading-none">Authenticate to inspect this trace.</h1>
        <button className="nav-chip mt-6" onClick={() => login()} type="button">
          Login with Privy
        </button>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Trace Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Loading trace timeline, metadata, and analysis.
        </p>
      </main>
    )
  }

  if (!detail) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Trace Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          {errorMessage ?? "No trace detail is available yet."}
        </p>
      </main>
    )
  }

  const chain = getChain(detail.trace.chainId)
  const anchorChainId = Number.parseInt(process.env.NEXT_PUBLIC_ACTIVE_CHAIN_ID ?? "84532", 10)
  const anchorChain = getChain(anchorChainId)

  return (
    <main className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_400px]">
      <aside className="frame p-5">
        <div className="label text-[var(--foreground-muted)]">Trace Metadata</div>
        <div className="mt-4">
          <ChainBadge chain={chain} />
        </div>
        <dl className="mt-6 grid gap-4 text-sm leading-6">
          <DetailRow label="Status" value={detail.trace.status} />
          <DetailRow label="Duration" value={formatDuration(detail.trace.durationMs)} />
          <DetailRow label="Gas Used" value={detail.trace.totalGasUsed} />
          <DetailRow label="Estimated Cost" value={`$${detail.trace.totalCostUsd}`} />
          <DetailRow label="Started" value={formatDate(detail.trace.startedAt)} />
        </dl>

        <div className="mt-8 frame p-4">
          <div className="label text-[var(--foreground-muted)]">Anchor Status</div>
          {detail.trace.anchorTxHash ? (
            <div className="mt-3 grid gap-3 text-sm leading-6">
              <a
                className="break-all text-[var(--foreground-muted)] underline"
                href={`${anchorChain.blockExplorerUrl}/tx/${detail.trace.anchorTxHash}`}
                rel="noreferrer"
                target="_blank"
              >
                {detail.trace.anchorTxHash}
              </a>
              <span>Block {detail.trace.anchorBlock?.toString() ?? "pending"}</span>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
              No anchor transaction has been recorded yet.
            </p>
          )}
        </div>

        {detail.analysis ? (
          <div className="mt-8 frame p-4">
            <div className="label text-[var(--foreground-muted)]">AI Analysis</div>
            <p className="mt-3 text-sm leading-7">{detail.analysis.summary}</p>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
              {detail.analysis.suggestedFix}
            </p>
          </div>
        ) : null}
      </aside>

      <section className="frame p-5">
        <div className="label text-[var(--foreground-muted)]">Event Timeline</div>
        <div className="mt-6 grid gap-4">
          {detail.events.map((event) => (
            <button
              key={event.id}
              className="frame w-full p-4 text-left"
              data-active={event.id === focusedEvent?.id}
              onClick={() => setFocusedEventId(event.id)}
              type="button"
            >
              <EventCard event={event} />
            </button>
          ))}
        </div>
      </section>

      <aside className="frame p-5">
        <div className="label text-[var(--foreground-muted)]">Inspector</div>
        {focusedEvent ? <EventInspector event={focusedEvent} /> : null}
      </aside>
    </main>
  )
}

function EventCard({ event }: { event: TraceEvent }) {
  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label text-[var(--foreground-muted)]">EVM Transaction</div>
            <div className="mt-2 text-lg">
              {payload.decodedFunction?.name ??
                (payload.to ? "Native transfer" : "Contract deploy")}
            </div>
          </div>
          <span
            className="chain-badge"
            style={{ color: payload.status === "reverted" ? "var(--accent)" : "var(--foreground)" }}
          >
            {payload.status}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {shortenHex(payload.hash)} • {payload.valueFormatted} • gas{" "}
          {payload.gasUsed ?? payload.gasLimit}
        </p>
      </div>
    )
  }

  if (event.type === "evm_contract_read") {
    const payload = event.payload as EvmContractReadPayload

    return (
      <div className="grid gap-3">
        <div className="label text-[var(--foreground-muted)]">Contract Read</div>
        <div className="text-lg">{payload.functionName}</div>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {shortenHex(payload.contractAddress)} • block {payload.blockNumber ?? "latest"}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="label text-[var(--foreground-muted)]">{event.type}</div>
      <p className="text-sm leading-6 text-[var(--foreground-muted)]">
        Duration {formatDuration(event.durationMs)} • status {event.status}
      </p>
    </div>
  )
}

function EventInspector({ event }: { event: TraceEvent }) {
  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="mt-4 grid gap-5 text-sm leading-7">
        <div>
          <div className="label text-[var(--foreground-muted)]">Function</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.decodedFunction?.inputs ?? payload.data)}
          </pre>
        </div>
        <div>
          <div className="label text-[var(--foreground-muted)]">Token Transfers</div>
          <div className="mt-2 grid gap-3">
            {payload.tokenTransfers.length > 0 ? (
              payload.tokenTransfers.map((transfer) => (
                <div
                  key={`${transfer.token}-${transfer.from}-${transfer.to}-${transfer.amount}`}
                  className="frame p-3"
                >
                  <div>{transfer.symbol ?? shortenHex(transfer.token)}</div>
                  <div className="text-[var(--foreground-muted)]">{transfer.amountFormatted}</div>
                </div>
              ))
            ) : (
              <p className="text-[var(--foreground-muted)]">No token transfers decoded.</p>
            )}
          </div>
        </div>
        <div>
          <div className="label text-[var(--foreground-muted)]">Logs</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{formatJson(payload.logs)}</pre>
        </div>
      </div>
    )
  }

  if (event.type === "evm_contract_read") {
    const payload = event.payload as EvmContractReadPayload

    return (
      <div className="mt-4 grid gap-5 text-sm leading-7">
        <div>
          <div className="label text-[var(--foreground-muted)]">Inputs</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.inputs)}
          </pre>
        </div>
        <div>
          <div className="label text-[var(--foreground-muted)]">Output</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.output)}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 grid gap-4 text-sm leading-7">
      <div>
        <div className="label text-[var(--foreground-muted)]">Payload</div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{formatJson(event.payload)}</pre>
      </div>
      {event.errorMessage ? (
        <div>
          <div className="label text-[var(--accent)]">Error</div>
          <p className="mt-2">{event.errorMessage}</p>
        </div>
      ) : null}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label text-[var(--foreground-muted)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function formatDuration(durationMs: number | null): string {
  return durationMs === null ? "n/a" : `${durationMs}ms`
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "n/a"
  }

  return new Date(value).toLocaleString()
}

function shortenHex(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

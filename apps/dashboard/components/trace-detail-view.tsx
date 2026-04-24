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

interface ShareResult {
  shareUrl: string
  shareToken: string
}

interface VerifyResult {
  verification: {
    traceHash: string | null
    anchorTxHash: string | null
    anchorBlock: bigint | number | string | null
    chainId: number
    blockExplorerUrl: string
    merkleRoot: string | null
    merkleProof: unknown[]
    verified: boolean
  }
}

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

function isKeeperHubToolCall(event: TraceEvent): boolean {
  if (event.type !== "tool_call" || !isRecord(event.payload)) {
    return false
  }
  return (
    typeof event.payload.name === "string" && event.payload.name.toLowerCase().includes("keeperhub")
  )
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
  const [shareResult, setShareResult] = useState<ShareResult | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  useEffect(() => {
    if (!authenticated) {
      return
    }

    const client = createBrowserTRPCClient(() => getAccessToken())
    let cancelled = false

    async function loadTrace() {
      setIsLoading(true)
      setErrorMessage(null)
      setShareResult(null)
      setVerifyResult(null)
      setVerifyError(null)

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
        if (result.trace.shareToken) {
          try {
            const verification = (await client.query(
              "verify.byShareToken",
              result.trace.shareToken
            )) as VerifyResult | null
            if (!cancelled && verification?.verification) {
              setVerifyResult(verification)
            }
          } catch (error) {
            if (!cancelled) {
              setVerifyError(
                error instanceof Error ? error.message : "Failed to load verification."
              )
            }
          }
        }
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
  const anchorChainId = Number.parseInt(
    process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID ?? process.env.NEXT_PUBLIC_ACTIVE_CHAIN_ID ?? "84532",
    10
  )
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
          <div className="label text-[var(--foreground-muted)]">Share</div>
          {detail.trace.shareToken ? (
            <div className="mt-3 grid gap-3 text-sm leading-6">
              <div className="label text-[var(--foreground-muted)]">Share token</div>
              <div className="break-all">{detail.trace.shareToken}</div>
              {shareResult?.shareUrl ? (
                <a
                  className="break-all text-[var(--foreground-muted)] underline"
                  href={shareResult.shareUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {shareResult.shareUrl}
                </a>
              ) : (
                <p className="text-[var(--foreground-muted)]">
                  Open <code>/share/{detail.trace.shareToken}</code> to view publicly.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="nav-chip"
                  onClick={() => {
                    const url =
                      shareResult?.shareUrl ??
                      `${window.location.origin}/share/${detail.trace.shareToken}`
                    void navigator.clipboard?.writeText(url)
                  }}
                  type="button"
                >
                  Copy link
                </button>
                <button
                  className="nav-chip"
                  onClick={async () => {
                    try {
                      const client = createBrowserTRPCClient(() => getAccessToken())
                      await client.mutation("traces.unshare", detail.trace.id)
                      setDetail({
                        ...detail,
                        trace: { ...detail.trace, shareToken: null },
                      })
                      setShareResult(null)
                      setVerifyResult(null)
                    } catch (error) {
                      setErrorMessage(
                        error instanceof Error ? error.message : "Failed to unshare trace."
                      )
                    }
                  }}
                  type="button"
                >
                  Unshare
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 text-sm leading-6">
              <p className="text-[var(--foreground-muted)]">
                Generate a public link for this trace.
              </p>
              <button
                className="nav-chip w-fit"
                onClick={async () => {
                  try {
                    const client = createBrowserTRPCClient(() => getAccessToken())
                    const result = (await client.mutation(
                      "traces.share",
                      detail.trace.id
                    )) as ShareResult | null
                    if (!result) {
                      setErrorMessage("Failed to share trace.")
                      return
                    }
                    setShareResult(result)
                    setDetail({
                      ...detail,
                      trace: { ...detail.trace, shareToken: result.shareToken },
                    })
                    setVerifyError(null)
                    try {
                      const verification = (await client.query(
                        "verify.byShareToken",
                        result.shareToken
                      )) as VerifyResult | null
                      if (verification?.verification) {
                        setVerifyResult(verification)
                      }
                    } catch (error) {
                      setVerifyError(
                        error instanceof Error ? error.message : "Failed to load verification."
                      )
                    }
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error ? error.message : "Failed to share trace."
                    )
                  }
                }}
                type="button"
              >
                Share trace
              </button>
            </div>
          )}
        </div>

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

        {detail.trace.shareToken ? (
          <div className="mt-8 frame p-4">
            <div className="label text-[var(--foreground-muted)]">Verification</div>
            {verifyError ? (
              <p className="mt-3 text-sm leading-6 text-[var(--accent)]">{verifyError}</p>
            ) : null}
            {verifyResult?.verification ? (
              <div className="mt-3 grid gap-3 text-sm leading-6">
                <div>
                  {verifyResult.verification.verified ? (
                    <span>Verified on-chain.</span>
                  ) : (
                    <span className="text-[var(--foreground-muted)]">Not verified yet.</span>
                  )}
                </div>
                {verifyResult.verification.anchorTxHash ? (
                  <a
                    className="break-all text-[var(--foreground-muted)] underline"
                    href={`${verifyResult.verification.blockExplorerUrl}/tx/${verifyResult.verification.anchorTxHash}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {verifyResult.verification.anchorTxHash}
                  </a>
                ) : null}
                <button
                  className="nav-chip w-fit"
                  onClick={async () => {
                    if (!detail.trace.shareToken) {
                      return
                    }
                    setVerifyError(null)
                    try {
                      const client = createBrowserTRPCClient(() => getAccessToken())
                      const verification = (await client.query(
                        "verify.byShareToken",
                        detail.trace.shareToken
                      )) as VerifyResult | null
                      if (verification?.verification) {
                        setVerifyResult(verification)
                      }
                    } catch (error) {
                      setVerifyError(
                        error instanceof Error ? error.message : "Failed to refresh verification."
                      )
                    }
                  }}
                  type="button"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                Verification data will appear once anchoring completes.
              </p>
            )}
          </div>
        ) : null}

        {detail.analysis ? (
          <div className="mt-8 frame p-4">
            <div className="label text-[var(--foreground-muted)]">AI Analysis</div>
            <p className="mt-3 text-sm leading-7">{detail.analysis.summary}</p>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
              {detail.analysis.suggestedFix}
            </p>
          </div>
        ) : null}

        <div className="mt-8 frame p-4">
          <div className="label text-[var(--foreground-muted)]">
            Execution Reliability (KeeperHub)
          </div>
          {detail.events.some((event) => isKeeperHubToolCall(event)) ? (
            <div className="mt-3 grid gap-2 text-sm leading-6">
              <p className="text-[var(--foreground-muted)]">
                This trace includes KeeperHub execution events. Select a KeeperHub tool call in the
                timeline to inspect retries, status, and settlement evidence.
              </p>
              <DetailRow
                label="KeeperHub calls"
                value={`${detail.events.filter((event) => isKeeperHubToolCall(event)).length}`}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
              No KeeperHub execution events were captured for this trace yet.
            </p>
          )}
        </div>
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
  if (isKeeperHubToolCall(event)) {
    const payload = event.payload as GenericRecord
    const name = typeof payload.name === "string" ? payload.name : "keeperhub"
    const status = typeof payload.status === "string" ? payload.status : event.status
    const executionId =
      typeof payload.executionId === "string"
        ? payload.executionId
        : isRecord(payload.result) && typeof payload.result.executionId === "string"
          ? payload.result.executionId
          : null

    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label text-[var(--foreground-muted)]">KeeperHub</div>
            <div className="mt-2 text-lg">{name}</div>
          </div>
          <span className="chain-badge">{status}</span>
        </div>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {executionId ? `execution ${executionId}` : "execution metadata pending"} • Duration{" "}
          {formatDuration(event.durationMs)}
        </p>
      </div>
    )
  }

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
  if (isKeeperHubToolCall(event)) {
    const payload = event.payload as GenericRecord
    return (
      <div className="mt-4 grid gap-4 text-sm leading-7">
        <div>
          <div className="label text-[var(--foreground-muted)]">KeeperHub payload</div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{formatJson(payload)}</pre>
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

  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="mt-4 grid gap-5 text-sm leading-7">
        <div className="frame p-3">
          <div className="label text-[var(--foreground-muted)]">Transaction</div>
          <dl className="mt-3 grid gap-2">
            <InspectorRow
              label="Hash"
              value={payload.hash ? shortenHex(payload.hash) : "pending"}
            />
            <InspectorRow label="From" value={shortenHex(payload.from)} />
            <InspectorRow
              label="To"
              value={payload.to ? shortenHex(payload.to) : "contract deploy"}
            />
            <InspectorRow label="Nonce" value={`${payload.nonce}`} />
            <InspectorRow
              label="Block"
              value={payload.blockNumber !== null ? `${payload.blockNumber}` : "pending"}
            />
            <InspectorRow label="Value" value={payload.valueFormatted} />
            <InspectorRow label="Gas used" value={payload.gasUsed ?? "pending"} />
            <InspectorRow label="Gas limit" value={payload.gasLimit} />
            <InspectorRow label="Gas price" value={payload.gasPrice ?? "n/a"} />
            <InspectorRow label="Max fee" value={payload.maxFeePerGas ?? "n/a"} />
            <InspectorRow label="Priority fee" value={payload.maxPriorityFeePerGas ?? "n/a"} />
          </dl>
          {payload.revertReason ? (
            <p className="mt-3 text-sm leading-6 text-[var(--accent)]">{payload.revertReason}</p>
          ) : null}
          {payload.hash ? (
            <a
              className="mt-3 inline-block break-all text-[var(--foreground-muted)] underline"
              href={`${payload.blockExplorerUrl}/tx/${payload.hash}`}
              rel="noreferrer"
              target="_blank"
            >
              View on explorer
            </a>
          ) : null}
        </div>
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

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <dt className="label text-[var(--foreground-muted)]">{label}</dt>
      <dd className="break-all">{value}</dd>
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

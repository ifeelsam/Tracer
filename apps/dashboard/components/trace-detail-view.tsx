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
import { useCallback, useEffect, useMemo, useState } from "react"

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

interface KeeperHubRunForTraceResult {
  queued: boolean
  executionId: string | null
  status: string
}

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim())
}

function abiHasFunction(abi: unknown[], functionName: string): boolean {
  const target = functionName.trim()
  if (!target) {
    return false
  }
  return abi.some((entry) => {
    if (!isRecord(entry)) {
      return false
    }
    return entry.type === "function" && entry.name === target
  })
}

function isKeeperHubToolCall(event: TraceEvent): boolean {
  if (event.type !== "tool_call" || !isRecord(event.payload)) {
    return false
  }
  return (
    typeof event.payload.name === "string" && event.payload.name.toLowerCase().includes("keeperhub")
  )
}

function extractKeeperHubExecutionId(event: TraceEvent): string | null {
  if (!isKeeperHubToolCall(event) || !isRecord(event.payload)) {
    return null
  }
  const payload = event.payload
  if (typeof payload.executionId === "string") {
    return payload.executionId
  }
  if (isRecord(payload.result) && typeof payload.result.executionId === "string") {
    return payload.result.executionId
  }
  return null
}

function readKeeperHubStatus(event: TraceEvent): string {
  if (isRecord(event.payload) && typeof event.payload.status === "string") {
    return event.payload.status
  }
  return event.status
}

function readKeeperHubTxLink(event: TraceEvent): string | null {
  if (!isRecord(event.payload)) {
    return null
  }
  if (
    isRecord(event.payload.execution) &&
    typeof event.payload.execution.transactionLink === "string"
  ) {
    return event.payload.execution.transactionLink
  }
  if (isRecord(event.payload.result) && typeof event.payload.result.transactionLink === "string") {
    return event.payload.result.transactionLink
  }
  return null
}

function readKeeperHubFailedReason(event: TraceEvent): string | null {
  if (event.errorMessage) {
    return event.errorMessage
  }
  if (!isRecord(event.payload)) {
    return null
  }
  if (isRecord(event.payload.execution) && event.payload.execution.error !== undefined) {
    const error = event.payload.execution.error
    return typeof error === "string" ? error : JSON.stringify(error)
  }
  return null
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
  const { authenticated, getAccessToken, login, ready } = usePrivy()
  const [detail, setDetail] = useState<TraceDetailData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<ShareResult | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [isRerunningAnalysis, setIsRerunningAnalysis] = useState(false)
  const [awaitingAnalysis, setAwaitingAnalysis] = useState(false)
  const [keeperHubExecutionIds, setKeeperHubExecutionIds] = useState<string[]>([])
  const [executionStatusById, setExecutionStatusById] = useState<Record<string, string>>({})
  const [isLoadingExecutionStatuses, setIsLoadingExecutionStatuses] = useState(false)
  const [executionStatusError, setExecutionStatusError] = useState<string | null>(null)
  const [isRunningKeeperHub, setIsRunningKeeperHub] = useState(false)
  const [isRunningKeeperHubWorkflow, setIsRunningKeeperHubWorkflow] = useState(false)
  const [keeperHubRunError, setKeeperHubRunError] = useState<string | null>(null)
  const [keeperHubAutoRefreshUntilMs, setKeeperHubAutoRefreshUntilMs] = useState<number | null>(
    null
  )
  const [isAutoRefreshingKeeperHub, setIsAutoRefreshingKeeperHub] = useState(false)
  const [keeperHubNetwork, setKeeperHubNetwork] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_NETWORK ?? "base-sepolia"
  )
  const [keeperHubContractAddress, setKeeperHubContractAddress] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_CONTRACT_ADDRESS ?? ""
  )
  const [keeperHubFunctionName, setKeeperHubFunctionName] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_FUNCTION_NAME ?? ""
  )
  const [keeperHubFunctionArgsJson, setKeeperHubFunctionArgsJson] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_FUNCTION_ARGS_JSON ?? "[]"
  )
  const [keeperHubAbiJson, setKeeperHubAbiJson] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_ABI_JSON ?? "[]"
  )
  const [keeperHubWorkflowId, setKeeperHubWorkflowId] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_WORKFLOW_ID ?? ""
  )
  const [keeperHubWorkflowPayloadJson, setKeeperHubWorkflowPayloadJson] = useState(
    process.env.NEXT_PUBLIC_KEEPERHUB_DEMO_WORKFLOW_PAYLOAD_JSON ?? "{}"
  )

  const loadTrace = useCallback(
    async (options?: { keepShareState?: boolean; silent?: boolean }) => {
      const client = createBrowserTRPCClient(() => getAccessToken())
      if (!options?.silent) {
        setIsLoading(true)
      }
      setErrorMessage(null)
      if (!options?.keepShareState) {
        setShareResult(null)
        setVerifyResult(null)
        setVerifyError(null)
      }

      try {
        const result = (await client.query("traces.get", traceId)) as TraceDetailData | null
        if (!result) {
          setDetail(null)
          setErrorMessage("Trace not found or you do not have access to it.")
          return
        }

        setDetail(result)
        setFocusedEventId((previous) => {
          if (previous && result.events.some((event) => event.id === previous)) {
            return previous
          }
          return result.events[0]?.id ?? null
        })
        if (result.analysis) {
          setAwaitingAnalysis(false)
        }
        if (result.trace.shareToken) {
          try {
            const verification = (await client.query(
              "verify.byShareToken",
              result.trace.shareToken
            )) as VerifyResult | null
            if (verification?.verification) {
              setVerifyResult(verification)
            }
          } catch (error) {
            setVerifyError(error instanceof Error ? error.message : "Failed to load verification.")
          }
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load trace detail.")
      } finally {
        if (!options?.silent) {
          setIsLoading(false)
        }
      }
    },
    [getAccessToken, traceId]
  )

  useEffect(() => {
    if (!authenticated || !ready) {
      return
    }
    void loadTrace()
  }, [authenticated, loadTrace, ready])

  useEffect(() => {
    if (!authenticated || !ready || !awaitingAnalysis) {
      return
    }
    const interval = window.setInterval(() => {
      void loadTrace({ keepShareState: true, silent: true })
    }, 4_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [authenticated, awaitingAnalysis, loadTrace, ready])

  const focusedEvent = useMemo(() => {
    if (!detail) {
      return null
    }

    return detail.events.find((event) => event.id === focusedEventId) ?? detail.events[0] ?? null
  }, [detail, focusedEventId])

  const latestKeeperHubEventByExecutionId = useMemo(() => {
    const map = new Map<string, TraceEvent>()
    if (!detail) {
      return map
    }
    for (const event of detail.events) {
      if (!isKeeperHubToolCall(event)) {
        continue
      }
      const executionId = extractKeeperHubExecutionId(event)
      if (!executionId) {
        continue
      }
      // events are already ordered by sequence asc, so the latest one wins.
      map.set(executionId, event)
    }
    return map
  }, [detail])

  const latestCompletedKeeperHubEvent = useMemo(() => {
    if (!detail) {
      return null
    }
    const keeperHubEvents = detail.events.filter((event) => isKeeperHubToolCall(event))
    for (let index = keeperHubEvents.length - 1; index >= 0; index -= 1) {
      const event = keeperHubEvents[index]
      if (event?.status === "ok") {
        return event
      }
    }
    return null
  }, [detail])

  const latestErroredKeeperHubEvent = useMemo(() => {
    if (!detail) {
      return null
    }
    const keeperHubEvents = detail.events.filter((event) => isKeeperHubToolCall(event))
    for (let index = keeperHubEvents.length - 1; index >= 0; index -= 1) {
      const event = keeperHubEvents[index]
      if (event?.status === "error") {
        return event
      }
    }
    return null
  }, [detail])

  useEffect(() => {
    if (!authenticated || !ready || !detail) {
      setKeeperHubExecutionIds([])
      return
    }
    const traceIdForFetch = detail.trace.id
    const detailEvents = detail.events
    let cancelled = false
    async function loadExecutionIds() {
      try {
        const client = createBrowserTRPCClient(() => getAccessToken())
        const result = (await client.query("keeperhub.executionsForTrace", {
          traceId: traceIdForFetch,
        })) as { executionIds: string[] }
        if (!cancelled) {
          setKeeperHubExecutionIds(result.executionIds)
        }
      } catch {
        const fallbackIds = [
          ...new Set(
            detailEvents
              .map((event) => extractKeeperHubExecutionId(event))
              .filter((value): value is string => Boolean(value))
          ),
        ]
        if (!cancelled) {
          setKeeperHubExecutionIds(fallbackIds)
        }
      }
    }
    void loadExecutionIds()
    return () => {
      cancelled = true
    }
  }, [authenticated, detail, getAccessToken, ready])

  const refreshKeeperHubExecutionStatuses = useCallback(
    async (options?: { silent?: boolean }) => {
      if (keeperHubExecutionIds.length === 0) {
        return
      }
      setExecutionStatusError(null)
      if (!options?.silent) {
        setIsLoadingExecutionStatuses(true)
      }
      try {
        const client = createBrowserTRPCClient(() => getAccessToken())
        const nextStatuses: Record<string, string> = {}
        for (const executionId of keeperHubExecutionIds) {
          const status = (await client.mutation("keeperhub.refreshExecutionForTrace", {
            traceId,
            executionId,
          })) as { refreshed: boolean; status: string }
          nextStatuses[executionId] = status.status
        }
        setExecutionStatusById(nextStatuses)
        await loadTrace({ keepShareState: true, silent: true })
      } catch (error) {
        setExecutionStatusError(
          error instanceof Error ? error.message : "Failed to load KeeperHub execution status."
        )
      } finally {
        if (!options?.silent) {
          setIsLoadingExecutionStatuses(false)
        }
      }
    },
    [getAccessToken, keeperHubExecutionIds, loadTrace, traceId]
  )

  useEffect(() => {
    if (
      !authenticated ||
      !ready ||
      !keeperHubAutoRefreshUntilMs ||
      keeperHubExecutionIds.length === 0
    ) {
      return
    }
    if (Date.now() >= keeperHubAutoRefreshUntilMs) {
      setKeeperHubAutoRefreshUntilMs(null)
      setIsAutoRefreshingKeeperHub(false)
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      if (cancelled) {
        return
      }
      if (Date.now() >= keeperHubAutoRefreshUntilMs) {
        setKeeperHubAutoRefreshUntilMs(null)
        setIsAutoRefreshingKeeperHub(false)
        return
      }
      setIsAutoRefreshingKeeperHub(true)
      void refreshKeeperHubExecutionStatuses({ silent: true }).finally(() => {
        if (!cancelled) {
          setIsAutoRefreshingKeeperHub(false)
        }
      })
    }, 4_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      setIsAutoRefreshingKeeperHub(false)
    }
  }, [
    authenticated,
    ready,
    keeperHubAutoRefreshUntilMs,
    keeperHubExecutionIds.length,
    refreshKeeperHubExecutionStatuses,
  ])

  if (!ready) {
    return (
      <main className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Trace Detail</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Preparing your session…
        </p>
      </main>
    )
  }

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

  const chain = safeGetChain(detail.trace.chainId)
  const anchorChainId = Number.parseInt(
    process.env.NEXT_PUBLIC_ANCHOR_CHAIN_ID ?? process.env.NEXT_PUBLIC_ACTIVE_CHAIN_ID ?? "84532",
    10
  )
  const anchorChain = safeGetChain(anchorChainId)
  const keeperHubExecutionTimeline = keeperHubExecutionIds
    .map((executionId) => {
      const event = latestKeeperHubEventByExecutionId.get(executionId)
      if (!event) {
        return null
      }
      return {
        executionId,
        latestStatus: executionStatusById[executionId] ?? readKeeperHubStatus(event),
        latestEventName:
          isRecord(event.payload) && typeof event.payload.name === "string"
            ? event.payload.name
            : "keeperhub.unknown",
        transactionLink: readKeeperHubTxLink(event),
        failedReason: readKeeperHubFailedReason(event),
        updatedAt: event.startedAt,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  return (
    <main className="trace-workspace">
      <section className="card trace-header-card">
        <div className="trace-header-inner">
          <div className="trace-header-top">
            <div>
              <div className="landing-chip">
                <span className="badge-dot" />
                Trace workspace
              </div>
              <h1 className="trace-headline">
                {detail.trace.inputSummary || "Agent execution trace"}
              </h1>
              <p className="trace-subcopy">
                Review the full run from metadata to event-level evidence. Timeline selection drives
                the inspector, and verification plus KeeperHub status stay visible throughout the
                investigation.
              </p>
            </div>
            <div className="trace-kpis">
              <div className="trace-kpi">
                <div className="label text-[var(--foreground-muted)]">Trace status</div>
                <div className="trace-kpi-value">{detail.trace.status}</div>
                <div className="trace-kpi-copy">{detail.events.length} recorded events</div>
              </div>
              <div className="trace-kpi">
                <div className="label text-[var(--foreground-muted)]">Chain</div>
                <div className="trace-kpi-value">
                  {chain?.name ?? `Chain ${detail.trace.chainId}`}
                </div>
                <div className="trace-kpi-copy">
                  {detail.trace.evmTxCount} tx · {detail.trace.totalTokens} tokens
                </div>
              </div>
              <div className="trace-kpi">
                <div className="label text-[var(--foreground-muted)]">Execution cost</div>
                <div className="trace-kpi-value">${detail.trace.totalCostUsd}</div>
                <div className="trace-kpi-copy">Gas used {detail.trace.totalGasUsed}</div>
              </div>
              <div className="trace-kpi">
                <div className="label text-[var(--foreground-muted)]">Focused event</div>
                <div className="trace-kpi-value">{focusedEvent ? focusedEvent.type : "—"}</div>
                <div className="trace-kpi-copy">
                  {focusedEvent
                    ? formatDuration(focusedEvent.durationMs)
                    : "Pick an event to inspect"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="trace-shell">
        <aside className="trace-panel">
          <div className="trace-panel-body trace-section-stack">
            <div className="label text-[var(--foreground-muted)]">Trace Metadata</div>
            <div className="mt-4">
              {chain ? (
                <ChainBadge chain={chain} />
              ) : (
                <span className="chain-badge">Unknown chain ({detail.trace.chainId})</span>
              )}
            </div>
            <dl className="mt-6 grid gap-4 text-sm leading-6">
              <DetailRow label="Status" value={detail.trace.status} />
              <DetailRow label="Duration" value={formatDuration(detail.trace.durationMs)} />
              <DetailRow label="Gas Used" value={detail.trace.totalGasUsed} />
              <DetailRow label="Estimated Cost" value={`$${detail.trace.totalCostUsd}`} />
              <DetailRow label="Started" value={formatDate(detail.trace.startedAt)} />
            </dl>

            <div className="trace-mini-panel">
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

            <div className="trace-mini-panel">
              <div className="label text-[var(--foreground-muted)]">Anchor Status</div>
              {detail.trace.anchorTxHash ? (
                <div className="mt-3 grid gap-3 text-sm leading-6">
                  <a
                    className="break-all text-[var(--foreground-muted)] underline"
                    href={
                      anchorChain
                        ? `${anchorChain.blockExplorerUrl}/tx/${detail.trace.anchorTxHash}`
                        : undefined
                    }
                    rel="noreferrer"
                    target="_blank"
                  >
                    {detail.trace.anchorTxHash}
                  </a>
                  <span>
                    Block {detail.trace.anchorBlock?.toString() ?? "pending"}
                    {!anchorChain ? ` on chain ${anchorChainId}` : ""}
                  </span>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                  No anchor transaction has been recorded yet.
                </p>
              )}
            </div>

            {detail.trace.shareToken ? (
              <div className="trace-mini-panel">
                <div className="label text-[var(--foreground-muted)]">Verification</div>
                {verifyError ? (
                  <p className="mt-3 text-sm leading-6 text-[var(--bear)]">{verifyError}</p>
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
                            error instanceof Error
                              ? error.message
                              : "Failed to refresh verification."
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

            <div className="trace-mini-panel">
              <div className="label text-[var(--foreground-muted)]">AI Analysis</div>
              {detail.analysis ? (
                <>
                  <p className="mt-3 text-sm leading-7">{detail.analysis.summary}</p>
                  <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
                    {detail.analysis.suggestedFix}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                  Analysis has not been generated yet.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="nav-chip"
                  disabled={isRerunningAnalysis}
                  onClick={async () => {
                    setErrorMessage(null)
                    setIsRerunningAnalysis(true)
                    try {
                      const client = createBrowserTRPCClient(() => getAccessToken())
                      const rerun = (await client.mutation("analysis.rerun", detail.trace.id)) as {
                        queued: boolean
                      }
                      if (!rerun.queued) {
                        setErrorMessage("Failed to queue analysis rerun.")
                        return
                      }
                      setAwaitingAnalysis(true)
                    } catch (error) {
                      setErrorMessage(
                        error instanceof Error ? error.message : "Failed to queue analysis rerun."
                      )
                    } finally {
                      setIsRerunningAnalysis(false)
                    }
                  }}
                  type="button"
                >
                  {isRerunningAnalysis ? "Queueing…" : "Rerun analysis"}
                </button>
                <button
                  className="nav-chip"
                  onClick={() => void loadTrace({ keepShareState: true, silent: true })}
                  type="button"
                >
                  Refresh analysis
                </button>
              </div>
              {awaitingAnalysis ? (
                <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                  Waiting for analysis worker output. This panel refreshes automatically.
                </p>
              ) : null}
            </div>

            <div className="trace-mini-panel">
              <div className="label text-[var(--foreground-muted)]">
                Execution Reliability (KeeperHub)
              </div>
              <div className="mt-3 grid gap-3 text-sm leading-6">
                <p className="text-[var(--foreground-muted)]">
                  Primary path: execute reliably via KeeperHub from this trace, then capture
                  execution IDs, retries, status, and failures directly in the timeline.
                </p>
                <div className="grid gap-2 lg:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">Network</span>
                    <input
                      className="input-brutal"
                      onChange={(event) => setKeeperHubNetwork(event.currentTarget.value)}
                      value={keeperHubNetwork}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">Contract address</span>
                    <input
                      className="input-brutal"
                      onChange={(event) => setKeeperHubContractAddress(event.currentTarget.value)}
                      value={keeperHubContractAddress}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">Function name</span>
                    <input
                      className="input-brutal"
                      onChange={(event) => setKeeperHubFunctionName(event.currentTarget.value)}
                      value={keeperHubFunctionName}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">Function args JSON</span>
                    <textarea
                      className="input-brutal min-h-14 lg:col-span-2"
                      onChange={(event) => setKeeperHubFunctionArgsJson(event.currentTarget.value)}
                      value={keeperHubFunctionArgsJson}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">ABI JSON</span>
                    <textarea
                      className="input-brutal min-h-16 lg:col-span-2"
                      onChange={(event) => setKeeperHubAbiJson(event.currentTarget.value)}
                      value={keeperHubAbiJson}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">
                      Workflow ID (webhook)
                    </span>
                    <input
                      className="input-brutal"
                      onChange={(event) => setKeeperHubWorkflowId(event.currentTarget.value)}
                      value={keeperHubWorkflowId}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">
                      Workflow payload JSON
                    </span>
                    <textarea
                      className="input-brutal min-h-14 lg:col-span-2"
                      onChange={(event) =>
                        setKeeperHubWorkflowPayloadJson(event.currentTarget.value)
                      }
                      value={keeperHubWorkflowPayloadJson}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="nav-chip"
                    disabled={isRunningKeeperHub || isRunningKeeperHubWorkflow}
                    onClick={async () => {
                      setKeeperHubRunError(null)
                      setIsRunningKeeperHub(true)
                      try {
                        const normalizedContract = keeperHubContractAddress.trim()
                        const normalizedFunction = keeperHubFunctionName.trim()
                        if (!isHexAddress(normalizedContract)) {
                          throw new Error("Contract address must be a valid 0x EVM address.")
                        }
                        if (normalizedFunction.length === 0) {
                          throw new Error("Function name is required.")
                        }
                        const parsedArgs = JSON.parse(keeperHubFunctionArgsJson) as unknown[]
                        const parsedAbi = JSON.parse(keeperHubAbiJson) as unknown[]
                        if (!Array.isArray(parsedArgs) || !Array.isArray(parsedAbi)) {
                          throw new Error("Function args and ABI must be valid JSON arrays.")
                        }
                        if (parsedAbi.length === 0) {
                          throw new Error("ABI JSON is required for direct contract calls.")
                        }
                        if (!abiHasFunction(parsedAbi, normalizedFunction)) {
                          throw new Error(
                            `Function '${normalizedFunction}' was not found in the provided ABI.`
                          )
                        }
                        const client = createBrowserTRPCClient(() => getAccessToken())
                        const result = (await client.mutation("keeperhub.runForTrace", {
                          traceId: detail.trace.id,
                          request: {
                            network: keeperHubNetwork,
                            contractAddress: normalizedContract,
                            functionName: normalizedFunction,
                            functionArgs: parsedArgs,
                            abi: parsedAbi,
                          },
                        })) as KeeperHubRunForTraceResult
                        if (!result.queued) {
                          setKeeperHubRunError("KeeperHub execution was not queued.")
                          return
                        }
                        await loadTrace({ keepShareState: true, silent: true })
                        if (result.executionId) {
                          setKeeperHubAutoRefreshUntilMs(Date.now() + 45_000)
                          await refreshKeeperHubExecutionStatuses({ silent: true })
                        }
                      } catch (error) {
                        setKeeperHubRunError(
                          error instanceof Error
                            ? error.message
                            : "Failed to trigger KeeperHub execution."
                        )
                      } finally {
                        setIsRunningKeeperHub(false)
                      }
                    }}
                    type="button"
                  >
                    {isRunningKeeperHub ? "Executing…" : "Execute reliably via KeeperHub"}
                  </button>
                  <button
                    className="nav-chip"
                    disabled={isRunningKeeperHub || isRunningKeeperHubWorkflow}
                    onClick={async () => {
                      setKeeperHubRunError(null)
                      setIsRunningKeeperHubWorkflow(true)
                      try {
                        const parsedPayload = JSON.parse(keeperHubWorkflowPayloadJson) as unknown
                        if (!isRecord(parsedPayload) || Array.isArray(parsedPayload)) {
                          throw new Error("Workflow payload must be a valid JSON object.")
                        }
                        if (!keeperHubWorkflowId.trim()) {
                          throw new Error("Workflow ID is required.")
                        }
                        const client = createBrowserTRPCClient(() => getAccessToken())
                        const result = (await client.mutation("keeperhub.runWorkflowForTrace", {
                          traceId: detail.trace.id,
                          request: {
                            workflowId: keeperHubWorkflowId.trim(),
                            payload: parsedPayload,
                          },
                        })) as KeeperHubRunForTraceResult
                        if (!result.queued) {
                          setKeeperHubRunError("KeeperHub workflow execution was not queued.")
                          return
                        }
                        await loadTrace({ keepShareState: true, silent: true })
                        if (result.executionId) {
                          setKeeperHubAutoRefreshUntilMs(Date.now() + 45_000)
                          await refreshKeeperHubExecutionStatuses({ silent: true })
                        }
                      } catch (error) {
                        setKeeperHubRunError(
                          error instanceof Error
                            ? error.message
                            : "Failed to trigger KeeperHub workflow webhook."
                        )
                      } finally {
                        setIsRunningKeeperHubWorkflow(false)
                      }
                    }}
                    type="button"
                  >
                    {isRunningKeeperHubWorkflow ? "Running workflow…" : "Run workflow webhook"}
                  </button>
                </div>
                {keeperHubRunError ? (
                  <p className="text-[var(--danger)]">{keeperHubRunError}</p>
                ) : null}
              </div>
              {detail.events.some((event) => isKeeperHubToolCall(event)) ? (
                <div className="mt-3 grid gap-2 text-sm leading-6">
                  <p className="text-[var(--foreground-muted)]">
                    This trace includes KeeperHub execution events. Select a KeeperHub tool call in
                    the timeline to inspect retries, status, and settlement evidence.
                  </p>
                  <DetailRow
                    label="KeeperHub calls"
                    value={`${detail.events.filter((event) => isKeeperHubToolCall(event)).length}`}
                  />
                  <DetailRow label="Execution IDs" value={`${keeperHubExecutionIds.length}`} />
                  {keeperHubExecutionTimeline.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {keeperHubExecutionTimeline.map((entry) => (
                        <div className="frame p-3" key={entry.executionId}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs break-all">{entry.executionId}</span>
                            <span className="chain-badge">{entry.latestStatus}</span>
                          </div>
                          <div className="mt-2 text-xs text-[var(--foreground-muted)]">
                            {entry.latestEventName} • {formatDate(entry.updatedAt)}
                          </div>
                          <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                            {entry.transactionLink ? (
                              <a
                                className="break-all underline"
                                href={entry.transactionLink}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {entry.transactionLink}
                              </a>
                            ) : (
                              "Settlement tx: n/a"
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                            Failed reason: {entry.failedReason ?? "none"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {keeperHubExecutionIds.length > 0 ? (
                    <div className="mt-2 grid gap-2">
                      {keeperHubExecutionIds.map((executionId) => (
                        <button
                          className="frame grid w-full grid-cols-[1fr_auto] items-center gap-3 p-2 text-left"
                          key={executionId}
                          onClick={() => {
                            const event = latestKeeperHubEventByExecutionId.get(executionId)
                            if (event) {
                              setFocusedEventId(event.id)
                            }
                          }}
                          type="button"
                        >
                          <span className="break-all text-xs">{executionId}</span>
                          <span className="chain-badge">
                            {executionStatusById[executionId] ?? "unknown"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="nav-chip"
                      disabled={!latestCompletedKeeperHubEvent}
                      onClick={() => {
                        if (latestCompletedKeeperHubEvent) {
                          setFocusedEventId(latestCompletedKeeperHubEvent.id)
                        }
                      }}
                      type="button"
                    >
                      Open latest completed event
                    </button>
                    <button
                      className="nav-chip"
                      disabled={!latestErroredKeeperHubEvent}
                      onClick={() => {
                        if (latestErroredKeeperHubEvent) {
                          setFocusedEventId(latestErroredKeeperHubEvent.id)
                        }
                      }}
                      type="button"
                    >
                      Open latest error event
                    </button>
                    <button
                      className="nav-chip"
                      disabled={isLoadingExecutionStatuses || keeperHubExecutionIds.length === 0}
                      onClick={() => void refreshKeeperHubExecutionStatuses()}
                      type="button"
                    >
                      {isLoadingExecutionStatuses ? "Refreshing…" : "Refresh KeeperHub status"}
                    </button>
                  </div>
                  {keeperHubAutoRefreshUntilMs ? (
                    <p className="text-xs leading-5 text-[var(--foreground-muted)]">
                      Auto-refreshing KeeperHub statuses for ~45s after trigger
                      {isAutoRefreshingKeeperHub ? " (polling now…)." : "."}
                    </p>
                  ) : null}
                  {executionStatusError ? (
                    <p className="text-[var(--bear)]">{executionStatusError}</p>
                  ) : null}
                  <p className="text-xs leading-5 text-[var(--foreground-muted)]">
                    Tip: use the two “Open latest … event” buttons to jump directly to inspector
                    details.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                  No KeeperHub execution events were captured for this trace yet.
                </p>
              )}
            </div>
          </div>
        </aside>

        <section className="trace-panel">
          <div className="trace-panel-body">
            <div className="label text-[var(--foreground-muted)]">Event Timeline</div>
            <div className="trace-event-list mt-6">
              {detail.events.length > 0 ? (
                detail.events.map((event) => (
                  <button
                    key={event.id}
                    className="trace-event-button"
                    data-active={event.id === focusedEvent?.id}
                    onClick={() => setFocusedEventId(event.id)}
                    type="button"
                  >
                    <EventCard event={event} />
                  </button>
                ))
              ) : (
                <p className="text-sm leading-6 text-[var(--foreground-muted)]">
                  No events are available for this trace yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <aside className="trace-panel">
          <div className="trace-panel-body">
            <div className="label text-[var(--foreground-muted)]">Inspector</div>
            {focusedEvent ? <EventInspector event={focusedEvent} /> : null}
          </div>
        </aside>
      </div>
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
    const hasDirectResult = name === "keeperhub.directContractCall" && "result" in payload

    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label text-[var(--foreground-muted)]">KeeperHub</div>
            <div className="mt-2 text-lg">{name}</div>
          </div>
          <span className="chain-badge">{status}</span>
        </div>
        <div className="trace-event-meta">
          <span className="badge badge-info">{status}</span>
          <span className="mono text-[var(--fg-faint)]">
            {executionId ?? (hasDirectResult ? "read result only" : "pending execution id")}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {executionId
            ? `execution ${executionId}`
            : hasDirectResult
              ? "read result captured (no executionId)"
              : "execution metadata pending"}{" "}
          • Duration {formatDuration(event.durationMs)}
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
            style={{ color: payload.status === "reverted" ? "var(--bear)" : "var(--ink-900)" }}
          >
            {payload.status}
          </span>
        </div>
        <div className="trace-event-meta">
          <span className="badge">{payload.status}</span>
          <span className="mono text-[var(--fg-faint)]">{shortenHex(payload.hash)}</span>
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
        <div className="trace-event-meta">
          <span className="badge">read</span>
          <span className="mono text-[var(--fg-faint)]">{shortenHex(payload.contractAddress)}</span>
        </div>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {shortenHex(payload.contractAddress)} • block {payload.blockNumber ?? "latest"}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="label text-[var(--foreground-muted)]">{event.type}</div>
      <div className="trace-event-meta">
        <span className="badge">{event.status}</span>
      </div>
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
      <div className="trace-inspector text-sm leading-7">
        <div>
          <div className="label text-[var(--foreground-muted)]">KeeperHub payload</div>
          <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload)}
          </pre>
        </div>
        {event.errorMessage ? (
          <div>
            <div className="label" style={{ color: "var(--bear)" }}>
              Error
            </div>
            <p className="mt-2">{event.errorMessage}</p>
          </div>
        ) : null}
      </div>
    )
  }

  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="trace-inspector text-sm leading-7">
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
            <p className="mt-3 text-sm leading-6 text-[var(--bear)]">{payload.revertReason}</p>
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
          <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.decodedFunction?.inputs ?? payload.data)}
          </pre>
        </div>
        <div>
          <div className="label text-[var(--foreground-muted)]">Token Transfers</div>
          <div className="mt-2 grid gap-3">
            {payload.tokenTransfers.length > 0 ? (
              payload.tokenTransfers.map((transfer: (typeof payload.tokenTransfers)[number]) => (
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
          <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.logs)}
          </pre>
        </div>
      </div>
    )
  }

  if (event.type === "evm_contract_read") {
    const payload = event.payload as EvmContractReadPayload

    return (
      <div className="trace-inspector text-sm leading-7">
        <div>
          <div className="label text-[var(--foreground-muted)]">Inputs</div>
          <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.inputs)}
          </pre>
        </div>
        <div>
          <div className="label text-[var(--foreground-muted)]">Output</div>
          <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
            {formatJson(payload.output)}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="trace-inspector text-sm leading-7">
      <div>
        <div className="label text-[var(--foreground-muted)]">Payload</div>
        <pre className="trace-code-block overflow-x-auto whitespace-pre-wrap">
          {formatJson(event.payload)}
        </pre>
      </div>
      {event.errorMessage ? (
        <div>
          <div className="label" style={{ color: "var(--bear)" }}>
            Error
          </div>
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

function safeGetChain(chainId: number) {
  try {
    return getChain(chainId)
  } catch {
    return null
  }
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

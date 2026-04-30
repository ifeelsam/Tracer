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
import { Badge, KeyValue, KeyValueGrid, PageHeader, Section } from "./ui-primitives"

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

type EvidenceTab = "share" | "anchor" | "analysis"

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
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("share")
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

  const traceTitle = (detail.trace.inputSummary ?? "Trace detail").slice(0, 64)

  return (
    <>
      <PageHeader
        eyebrow="Trace"
        title={traceTitle}
        actions={
          <div className="surface-action-row">
            <span className="app-user-chip mono" title={detail.trace.id}>
              {detail.trace.id}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEvidenceTab("share")}
              type="button"
            >
              Share
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEvidenceTab("anchor")}
              type="button"
            >
              Verify
            </button>
            <Link className="btn btn-secondary btn-sm" href="/app/agents">
              Open agents
            </Link>
          </div>
        }
      />

      <main className="trace-layout">
        <section className="grid gap-8">
          <Section title="Trace metadata">
            <KeyValueGrid>
              <KeyValue
                label="Status"
                value={
                  <Badge tone={detail.trace.status === "completed" ? "success" : "warning"}>
                    {detail.trace.status}
                  </Badge>
                }
              />
              <KeyValue label="Duration" value={formatDuration(detail.trace.durationMs)} />
              <KeyValue label="Started" value={formatDate(detail.trace.startedAt)} />
              <KeyValue label="Gas used" value={detail.trace.totalGasUsed} />
              <KeyValue label="Estimated cost" value={`$${detail.trace.totalCostUsd}`} />
              <KeyValue
                label="Chain"
                value={
                  chain ? <ChainBadge chain={chain} /> : `Unknown chain (${detail.trace.chainId})`
                }
              />
            </KeyValueGrid>
          </Section>

          <Section title="Execution reliability (KeeperHub)">
            <details className="keeperhub-run-details">
              <summary>Run an execution</summary>
              <div className="keeperhub-run-content mt-5">
                <p className="text-[13px] leading-6 text-[var(--fg-muted)]">
                  Trigger execution from this trace and capture retries, statuses, and finality
                  evidence.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
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
                  <label className="grid gap-1 lg:col-span-2">
                    <span className="label text-[var(--foreground-muted)]">Function args JSON</span>
                    <textarea
                      className="input-brutal min-h-14"
                      onChange={(event) => setKeeperHubFunctionArgsJson(event.currentTarget.value)}
                      value={keeperHubFunctionArgsJson}
                    />
                  </label>
                  <label className="grid gap-1 lg:col-span-2">
                    <span className="label text-[var(--foreground-muted)]">ABI JSON</span>
                    <textarea
                      className="input-brutal min-h-16"
                      onChange={(event) => setKeeperHubAbiJson(event.currentTarget.value)}
                      value={keeperHubAbiJson}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="label text-[var(--foreground-muted)]">Workflow ID</span>
                    <input
                      className="input-brutal"
                      onChange={(event) => setKeeperHubWorkflowId(event.currentTarget.value)}
                      value={keeperHubWorkflowId}
                    />
                  </label>
                  <label className="grid gap-1 lg:col-span-2">
                    <span className="label text-[var(--foreground-muted)]">
                      Workflow payload JSON
                    </span>
                    <textarea
                      className="input-brutal min-h-14"
                      onChange={(event) =>
                        setKeeperHubWorkflowPayloadJson(event.currentTarget.value)
                      }
                      value={keeperHubWorkflowPayloadJson}
                    />
                  </label>
                </div>
                <div className="surface-action-row">
                  <button
                    className="btn btn-primary"
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
                    {isRunningKeeperHub ? "Executing..." : "Execute via KeeperHub"}
                  </button>
                  <button
                    className="btn btn-secondary"
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
                    {isRunningKeeperHubWorkflow ? "Running workflow..." : "Run workflow webhook"}
                  </button>
                </div>
                {keeperHubRunError ? (
                  <p className="text-[var(--danger)]">{keeperHubRunError}</p>
                ) : null}
              </div>
            </details>

            {detail.events.some((event) => isKeeperHubToolCall(event)) ? (
              <div className="mt-6 grid gap-4">
                <div className="surface-action-row">
                  <Badge tone="info">
                    KeeperHub calls:{" "}
                    {detail.events.filter((event) => isKeeperHubToolCall(event)).length}
                  </Badge>
                  <Badge>Execution IDs: {keeperHubExecutionIds.length}</Badge>
                </div>
                {keeperHubExecutionTimeline.length > 0 ? (
                  <div className="surface-action-row">
                    {keeperHubExecutionTimeline.map((entry) => (
                      <button
                        key={entry.executionId}
                        className="btn btn-ghost btn-sm mono"
                        onClick={() => {
                          const event = latestKeeperHubEventByExecutionId.get(entry.executionId)
                          if (event) setFocusedEventId(event.id)
                        }}
                        type="button"
                      >
                        {entry.executionId.slice(0, 16)}... {entry.latestStatus}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="surface-action-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!latestCompletedKeeperHubEvent}
                    onClick={() =>
                      latestCompletedKeeperHubEvent &&
                      setFocusedEventId(latestCompletedKeeperHubEvent.id)
                    }
                    type="button"
                  >
                    Open last success
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!latestErroredKeeperHubEvent}
                    onClick={() =>
                      latestErroredKeeperHubEvent &&
                      setFocusedEventId(latestErroredKeeperHubEvent.id)
                    }
                    type="button"
                  >
                    Open last failure
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={isLoadingExecutionStatuses || keeperHubExecutionIds.length === 0}
                    onClick={() => void refreshKeeperHubExecutionStatuses()}
                    type="button"
                  >
                    {isLoadingExecutionStatuses ? "Refreshing..." : "Refresh statuses"}
                  </button>
                </div>
                {keeperHubAutoRefreshUntilMs ? (
                  <p className="text-xs leading-5 text-[var(--foreground-muted)]">
                    Auto-refreshing statuses for ~45s
                    {isAutoRefreshingKeeperHub ? " (polling)." : "."}
                  </p>
                ) : null}
                {executionStatusError ? (
                  <p className="text-[var(--danger)]">{executionStatusError}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
                No KeeperHub execution events were captured for this trace yet.
              </p>
            )}
          </Section>

          <Section title="Event timeline">
            <div className="timeline-list">
              {detail.events.length > 0 ? (
                detail.events.map((event) => (
                  <button
                    key={event.id}
                    className={`timeline-item ${event.id === focusedEvent?.id ? "timeline-active" : ""}`}
                    onClick={() => setFocusedEventId(event.id)}
                    type="button"
                  >
                    <span className="timeline-dot" />
                    <EventCard event={event} />
                  </button>
                ))
              ) : (
                <p className="text-sm leading-6 text-[var(--foreground-muted)]">
                  No events are available for this trace yet.
                </p>
              )}
            </div>
          </Section>
        </section>

        <aside className="grid gap-8">
          <Section title="Evidence">
            <div className="tab-strip">
              <button
                className={`tab-strip-item ${evidenceTab === "share" ? "is-active" : ""}`}
                onClick={() => setEvidenceTab("share")}
                type="button"
              >
                Share
              </button>
              <button
                className={`tab-strip-item ${evidenceTab === "anchor" ? "is-active" : ""}`}
                onClick={() => setEvidenceTab("anchor")}
                type="button"
              >
                Anchor
              </button>
              <button
                className={`tab-strip-item ${evidenceTab === "analysis" ? "is-active" : ""}`}
                onClick={() => setEvidenceTab("analysis")}
                type="button"
              >
                AI analysis
              </button>
            </div>

            {evidenceTab === "share" ? (
              <div className="evidence-panel-content">
                {detail.trace.shareToken ? (
                  <>
                    <p className="mono break-all">{detail.trace.shareToken}</p>
                    {shareResult?.shareUrl ? (
                      <a
                        className="break-all underline"
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
                    <div className="surface-action-row">
                      <button
                        className="btn btn-secondary btn-sm"
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
                        className="btn btn-secondary btn-sm"
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
                  </>
                ) : (
                  <button
                    className="btn btn-primary w-fit"
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
                )}
              </div>
            ) : null}

            {evidenceTab === "anchor" ? (
              <div className="evidence-panel-content">
                {detail.trace.anchorTxHash ? (
                  <a
                    className="break-all underline"
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
                ) : (
                  <p className="text-[var(--foreground-muted)]">
                    No anchor transaction has been recorded yet.
                  </p>
                )}
                <p>
                  Block {detail.trace.anchorBlock?.toString() ?? "pending"}
                  {!anchorChain ? ` on chain ${anchorChainId}` : ""}
                </p>
                {detail.trace.shareToken ? (
                  <>
                    {verifyError ? <p className="text-[var(--danger)]">{verifyError}</p> : null}
                    {verifyResult?.verification ? (
                      <>
                        <Badge tone={verifyResult.verification.verified ? "success" : "warning"}>
                          {verifyResult.verification.verified
                            ? "Verified on-chain"
                            : "Not verified yet"}
                        </Badge>
                        <button
                          className="btn btn-secondary btn-sm w-fit"
                          onClick={async () => {
                            if (!detail.trace.shareToken) return
                            setVerifyError(null)
                            try {
                              const client = createBrowserTRPCClient(() => getAccessToken())
                              const verification = (await client.query(
                                "verify.byShareToken",
                                detail.trace.shareToken
                              )) as VerifyResult | null
                              if (verification?.verification) setVerifyResult(verification)
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
                          Refresh verification
                        </button>
                      </>
                    ) : (
                      <p className="text-[var(--foreground-muted)]">
                        Verification data will appear once anchoring completes.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            {evidenceTab === "analysis" ? (
              <div className="evidence-panel-content">
                {detail.analysis ? (
                  <>
                    <p>{detail.analysis.summary}</p>
                    <p className="text-[var(--foreground-muted)]">{detail.analysis.suggestedFix}</p>
                  </>
                ) : (
                  <p className="text-[var(--foreground-muted)]">
                    Analysis has not been generated yet.
                  </p>
                )}
                <div className="surface-action-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={isRerunningAnalysis}
                    onClick={async () => {
                      setErrorMessage(null)
                      setIsRerunningAnalysis(true)
                      try {
                        const client = createBrowserTRPCClient(() => getAccessToken())
                        const rerun = (await client.mutation(
                          "analysis.rerun",
                          detail.trace.id
                        )) as {
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
                    {isRerunningAnalysis ? "Queueing..." : "Rerun analysis"}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void loadTrace({ keepShareState: true, silent: true })}
                    type="button"
                  >
                    Refresh analysis
                  </button>
                </div>
                {awaitingAnalysis ? (
                  <p className="text-[var(--foreground-muted)]">
                    Waiting for analysis worker output. This panel refreshes automatically.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section title={`Inspector · ${focusedEvent?.type ?? "event"}`}>
            {focusedEvent ? <EventInspector event={focusedEvent} /> : null}
          </Section>
        </aside>
      </main>
    </>
  )
}

function EventCard({ event }: { event: TraceEvent }) {
  const statusTone =
    event.status === "completed"
      ? "success"
      : event.status === "failed" || event.status === "error"
        ? "danger"
        : "warning"

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
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[14px] font-medium text-[var(--fg)]">{name}</div>
          <Badge tone={statusTone}>{status}</Badge>
        </div>
        <p className="text-[12px] leading-5 text-[var(--fg-muted)]">
          {executionId
            ? `execution ${executionId}`
            : hasDirectResult
              ? "read result captured (no executionId)"
              : "execution metadata pending"}{" "}
          · {formatDuration(event.durationMs)}
        </p>
      </div>
    )
  }

  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[14px] font-medium text-[var(--fg)]">
            {payload.decodedFunction?.name ?? (payload.to ? "Native transfer" : "Contract deploy")}
          </div>
          <Badge tone={payload.status === "reverted" ? "danger" : "default"}>
            {payload.status}
          </Badge>
        </div>
        <p className="text-[12px] leading-5 text-[var(--fg-muted)]">
          {shortenHex(payload.hash)} · {payload.valueFormatted} · gas{" "}
          {payload.gasUsed ?? payload.gasLimit}
        </p>
      </div>
    )
  }

  if (event.type === "evm_contract_read") {
    const payload = event.payload as EvmContractReadPayload

    return (
      <div className="grid min-w-0 gap-2">
        <div className="text-[14px] font-medium text-[var(--fg)]">{payload.functionName}</div>
        <p className="text-[12px] leading-5 text-[var(--fg-muted)]">
          {shortenHex(payload.contractAddress)} · block {payload.blockNumber ?? "latest"}
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="text-[14px] font-medium text-[var(--fg)]">{event.type}</div>
      <p className="text-[12px] leading-5 text-[var(--fg-muted)]">
        {formatDuration(event.durationMs)} · status {event.status}
      </p>
    </div>
  )
}

function EventInspector({ event }: { event: TraceEvent }) {
  if (isKeeperHubToolCall(event)) {
    const payload = event.payload as GenericRecord
    return (
      <div className="grid gap-4 text-sm leading-7">
        <div className="json-viewer">
          <div className="json-viewer-header">
            <span className="label text-[var(--foreground-muted)]">KeeperHub payload</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void navigator.clipboard?.writeText(formatJson(payload))}
              type="button"
            >
              Copy JSON
            </button>
          </div>
          <pre className="json-viewer-body">{formatJson(payload)}</pre>
        </div>
        {event.errorMessage ? (
          <div>
            <div className="label text-[var(--danger)]">Error</div>
            <p className="mt-2">{event.errorMessage}</p>
          </div>
        ) : null}
      </div>
    )
  }

  if (event.type === "evm_tx") {
    const payload = event.payload as EvmTxPayload

    return (
      <div className="grid gap-5 text-sm leading-7">
        <div className="card">
          <div className="card-body">
            <KeyValueGrid>
              <KeyValue label="Hash" value={payload.hash ? shortenHex(payload.hash) : "pending"} />
              <KeyValue label="From" value={shortenHex(payload.from)} />
              <KeyValue
                label="To"
                value={payload.to ? shortenHex(payload.to) : "contract deploy"}
              />
              <KeyValue label="Nonce" value={`${payload.nonce}`} />
              <KeyValue
                label="Block"
                value={payload.blockNumber !== null ? `${payload.blockNumber}` : "pending"}
              />
              <KeyValue label="Value" value={payload.valueFormatted} />
              <KeyValue label="Gas used" value={payload.gasUsed ?? "pending"} />
              <KeyValue label="Gas limit" value={payload.gasLimit} />
              <KeyValue label="Gas price" value={payload.gasPrice ?? "n/a"} />
              <KeyValue label="Max fee" value={payload.maxFeePerGas ?? "n/a"} />
              <KeyValue label="Priority fee" value={payload.maxPriorityFeePerGas ?? "n/a"} />
            </KeyValueGrid>
          </div>
          {payload.revertReason ? (
            <p className="px-4 pb-4 text-sm leading-6 text-[var(--danger)]">
              {payload.revertReason}
            </p>
          ) : null}
          {payload.hash ? (
            <a
              className="px-4 pb-4 inline-block break-all text-[var(--foreground-muted)] underline"
              href={`${payload.blockExplorerUrl}/tx/${payload.hash}`}
              rel="noreferrer"
              target="_blank"
            >
              View on explorer
            </a>
          ) : null}
        </div>
        <div className="json-viewer">
          <div className="json-viewer-header">
            <span className="label text-[var(--foreground-muted)]">Function</span>
          </div>
          <pre className="json-viewer-body">
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
                  className="card card-body"
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
        <div className="json-viewer">
          <div className="json-viewer-header">
            <span className="label text-[var(--foreground-muted)]">Logs</span>
          </div>
          <pre className="json-viewer-body">{formatJson(payload.logs)}</pre>
        </div>
      </div>
    )
  }

  if (event.type === "evm_contract_read") {
    const payload = event.payload as EvmContractReadPayload

    return (
      <div className="grid gap-5 text-sm leading-7">
        <div className="json-viewer">
          <div className="json-viewer-header">
            <span className="label text-[var(--foreground-muted)]">Inputs</span>
          </div>
          <pre className="json-viewer-body">{formatJson(payload.inputs)}</pre>
        </div>
        <div className="json-viewer">
          <div className="json-viewer-header">
            <span className="label text-[var(--foreground-muted)]">Output</span>
          </div>
          <pre className="json-viewer-body">{formatJson(payload.output)}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 text-sm leading-7">
      <div className="json-viewer">
        <div className="json-viewer-header">
          <span className="label text-[var(--foreground-muted)]">Payload</span>
        </div>
        <pre className="json-viewer-body">{formatJson(event.payload)}</pre>
      </div>
      {event.errorMessage ? (
        <div>
          <div className="label text-[var(--danger)]">Error</div>
          <p className="mt-2">{event.errorMessage}</p>
        </div>
      ) : null}
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

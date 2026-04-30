/**
 * Public share page renders a trace and its verification payload without requiring authentication.
 * It is a server component so the page stays useful even without client-side JavaScript.
 */
import type { TraceAnalysis, TraceEvent } from "@tracerlabs/shared"

import { createServerTRPCClient } from "../../../lib/trpc"

interface VerifyResult {
  trace: {
    id: string
    agentId: string
    chainId: number
    status: string
    startedAt: Date | string
    endedAt: Date | string | null
    durationMs: number | null
    inputSummary: string
    outputSummary: string | null
    errorMessage: string | null
    anchorTxHash: string | null
    anchorBlock: bigint | number | string | null
    traceHash: string | null
    shareToken: string | null
  }
  events: TraceEvent[]
  analysis: TraceAnalysis | null
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

export default async function ShareTracePage({ params }: { params: Promise<{ token: string }> }) {
  const client = createServerTRPCClient()
  const resolved = await params
  let detail: VerifyResult | null = null
  let loadError: string | null = null
  try {
    detail = (await client.query("verify.byShareToken", resolved.token)) as VerifyResult | null
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load shared trace."
  }

  if (loadError) {
    return (
      <main className="dashboard-shell mx-auto max-w-[980px] px-6">
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">Shared Trace</div>
          <h1 className="headline mt-6 text-4xl leading-none">Could not load this trace.</h1>
          <p className="mt-6 text-sm leading-7 text-[var(--foreground-muted)]">{loadError}</p>
          <a className="nav-chip mt-6 inline-flex" href={`/share/${resolved.token}`}>
            Retry
          </a>
        </section>
      </main>
    )
  }

  if (!detail) {
    return (
      <main className="dashboard-shell mx-auto max-w-[980px] px-6">
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">Shared Trace</div>
          <h1 className="headline mt-6 text-4xl leading-none">Trace not found.</h1>
          <p className="mt-6 text-sm leading-7 text-[var(--foreground-muted)]">
            This share token may be invalid or the trace may have been unshared.
          </p>
        </section>
      </main>
    )
  }

  const { trace, events, analysis, verification } = detail
  const keeperHubEvents = events.filter((event) => isKeeperHubEvent(event))
  const keeperHubTimeline = buildKeeperHubExecutionTimeline(keeperHubEvents)

  return (
    <main className="dashboard-shell mx-auto grid max-w-[980px] gap-6 px-6">
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Shared Trace</div>
        <h1 className="headline mt-6 text-4xl leading-none">{trace.inputSummary}</h1>
        <p className="mt-6 text-sm leading-7 text-[var(--foreground-muted)]">
          Status {trace.status} • Started {formatDate(trace.startedAt)} • Duration{" "}
          {trace.durationMs ?? "n/a"}ms
        </p>
        {trace.errorMessage ? (
          <p className="mt-4 text-sm leading-7 text-[var(--danger)]">{trace.errorMessage}</p>
        ) : null}
      </section>

      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Verification</div>
        <p className="mt-4 text-sm leading-7">
          {verification.verified ? (
            <span>Verified on-chain.</span>
          ) : (
            <span className="text-[var(--foreground-muted)]">Not verified yet.</span>
          )}
        </p>
        <dl className="mt-6 grid gap-3 text-sm leading-6">
          <Row label="Anchor chain" value={`${verification.chainId}`} />
          <Row
            label="Anchor tx"
            value={
              verification.anchorTxHash ? (
                <a
                  className="break-all underline"
                  href={`${verification.blockExplorerUrl}/tx/${verification.anchorTxHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {verification.anchorTxHash}
                </a>
              ) : (
                "pending"
              )
            }
          />
          <Row label="Merkle root" value={verification.merkleRoot ?? "pending"} />
          <Row label="Trace hash" value={verification.traceHash ?? "missing"} />
        </dl>
      </section>

      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">KeeperHub Evidence</div>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          Captured KeeperHub events in this trace:{" "}
          <span className="text-[var(--foreground)]">{keeperHubEvents.length}</span>.
        </p>
        {keeperHubTimeline.length > 0 ? (
          <div className="mt-4 grid gap-3">
            <div className="label text-[var(--foreground-muted)]">Execution timeline</div>
            <ol className="grid gap-3">
              {keeperHubTimeline.map((entry) => (
                <li key={entry.executionId} className="frame p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="label text-[var(--foreground-muted)] break-all">
                      {entry.executionId}
                    </div>
                    <span className="chain-badge">{entry.latestStatus}</span>
                  </div>
                  <dl className="mt-3 grid gap-1 text-sm leading-6 text-[var(--foreground-muted)]">
                    <Row label="Latest event" value={entry.latestEventName} />
                    <Row label="Last updated" value={formatDate(entry.latestEventAt)} />
                    <Row
                      label="Settlement tx"
                      value={
                        entry.transactionLink ? (
                          <a
                            className="break-all underline"
                            href={entry.transactionLink}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {entry.transactionLink}
                          </a>
                        ) : (
                          "n/a"
                        )
                      }
                    />
                    <Row label="Failed reason" value={entry.failedReason ?? "none"} />
                  </dl>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
            No KeeperHub execution IDs were found yet.
          </p>
        )}
        {keeperHubEvents.length > 0 ? (
          <ol className="mt-4 grid gap-3">
            {keeperHubEvents.slice(0, 5).map((event) => (
              <li key={event.id} className="frame p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="label text-[var(--foreground-muted)]">
                    {readKeeperHubEventName(event)}
                  </div>
                  <span className="chain-badge">{readKeeperHubStatus(event)}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {analysis ? (
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">AI Analysis</div>
          <p className="mt-4 text-sm leading-7">{analysis.summary}</p>
          <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
            {analysis.suggestedFix}
          </p>
        </section>
      ) : null}

      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Timeline</div>
        <ol className="mt-6 grid gap-3">
          {events.map((event) => (
            <li key={event.id} className="frame p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="label text-[var(--foreground-muted)]">{event.type}</div>
                <span className="chain-badge">{event.status}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                Sequence {event.sequence} • Duration {event.durationMs ?? "n/a"}ms
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label text-[var(--foreground-muted)]">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isKeeperHubEvent(event: TraceEvent): boolean {
  if (event.type !== "tool_call" || !isRecord(event.payload)) {
    return false
  }
  const name = event.payload.name
  return typeof name === "string" && name.toLowerCase().includes("keeperhub")
}

function readKeeperHubEventName(event: TraceEvent): string {
  if (!isRecord(event.payload) || typeof event.payload.name !== "string") {
    return "keeperhub.unknown"
  }
  return event.payload.name
}

function readKeeperHubExecutionId(event: TraceEvent): string | null {
  if (!isRecord(event.payload)) {
    return null
  }
  if (typeof event.payload.executionId === "string") {
    return event.payload.executionId
  }
  if (isRecord(event.payload.result) && typeof event.payload.result.executionId === "string") {
    return event.payload.result.executionId
  }
  return null
}

function readKeeperHubStatus(event: TraceEvent): string {
  if (isRecord(event.payload) && typeof event.payload.status === "string") {
    return event.payload.status
  }
  return event.status
}

function readKeeperHubTransactionLink(event: TraceEvent): string | null {
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

function buildKeeperHubExecutionTimeline(events: TraceEvent[]) {
  const timeline = new Map<
    string,
    {
      executionId: string
      latestStatus: string
      latestEventName: string
      latestEventAt: Date | string
      transactionLink: string | null
      failedReason: string | null
      latestSequence: number
    }
  >()

  for (const event of events) {
    const executionId = readKeeperHubExecutionId(event)
    if (!executionId) {
      continue
    }
    const existing = timeline.get(executionId)
    if (existing && existing.latestSequence > event.sequence) {
      continue
    }
    timeline.set(executionId, {
      executionId,
      latestStatus: readKeeperHubStatus(event),
      latestEventName: readKeeperHubEventName(event),
      latestEventAt: event.startedAt,
      transactionLink: readKeeperHubTransactionLink(event),
      failedReason: readKeeperHubFailedReason(event),
      latestSequence: event.sequence,
    })
  }

  return [...timeline.values()]
    .sort((a, b) => b.latestSequence - a.latestSequence)
    .map(({ latestSequence: _latestSequence, ...rest }) => rest)
}

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "n/a"
  }
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString()
}

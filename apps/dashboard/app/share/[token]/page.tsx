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
  const keeperHubEvents = events.filter((event) => event.type.startsWith("keeperhub."))

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
          <p className="mt-4 text-sm leading-7 text-[var(--accent)]">{trace.errorMessage}</p>
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
        {keeperHubEvents.length > 0 ? (
          <ol className="mt-4 grid gap-3">
            {keeperHubEvents.slice(0, 5).map((event) => (
              <li key={event.id} className="frame p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="label text-[var(--foreground-muted)]">{event.type}</div>
                  <span className="chain-badge">{event.status}</span>
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

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "n/a"
  }
  const date = typeof value === "string" ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString()
}

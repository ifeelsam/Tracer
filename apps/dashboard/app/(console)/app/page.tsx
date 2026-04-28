"use client"

/**
 * The app home is the first authenticated console surface and establishes the dashboard rhythm.
 * It pairs status copy with brutalist system cards instead of a generic empty-state table.
 */
import { usePrivy } from "@privy-io/react-auth"
import { useEffect, useMemo, useState } from "react"

import { AgentListView } from "../../../components/agent-list-view"
import { usePrivyEnabled } from "../../../components/providers"
import { createBrowserTRPCClient } from "../../../lib/trpc"

export default function AppHomePage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">Agent Console</div>
          <h1 className="headline mt-6 text-5xl leading-none">
            Trace operators, not just outputs.
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
            The console shell is live. Add <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable operator
            authentication and agent management flows.
          </p>
        </section>
      </main>
    )
  }

  return <AuthenticatedAppHomePage />
}

function AuthenticatedAppHomePage() {
  const { authenticated, user, getAccessToken } = usePrivy()
  const [metrics, setMetrics] = useState<{
    totalExecutions: number
    completedExecutions: number
    failedExecutions: number
    successRatePct: number | null
    retries: number
    averageTimeToFinalityMs: number | null
    topFailedReason: string | null
    reliabilityScore: number | null
    scoreTrend: "improving" | "stable" | "degrading" | "insufficient_data"
    scoreComponents: {
      successRate: number | null
      retryEfficiency: number | null
      finalityEfficiency: number | null
    }
  } | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!authenticated) {
      return
    }
    let cancelled = false
    async function loadMetrics() {
      try {
        const result = (await client.query("keeperhub.reliabilityMetrics")) as typeof metrics
        if (!cancelled) {
          setMetrics(result)
        }
      } catch {
        if (!cancelled) {
          setMetrics(null)
        }
      }
    }
    void loadMetrics()
    return () => {
      cancelled = true
    }
  }, [authenticated, client])

  return (
    <main className="grid gap-6">
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Console</div>
        <h1 className="headline mt-6 text-5xl leading-none">Your traced agents.</h1>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          {authenticated
            ? `Connected as ${user?.id ?? "unknown user"}.`
            : "Authenticate with Privy to manage agents and inspect traces."}{" "}
          Use the chain picker above to filter per-agent trace views without changing backend
          monitoring state.
        </p>
      </section>
      {authenticated ? (
        <section className="frame p-6">
          <div className="label text-[var(--foreground-muted)]">KeeperHub Reliability</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Reliability score"
              value={
                metrics?.reliabilityScore !== null && metrics?.reliabilityScore !== undefined
                  ? `${metrics.reliabilityScore}/100`
                  : "n/a"
              }
            />
            <MetricCard label="Score trend" value={metrics?.scoreTrend ?? "insufficient_data"} />
            <MetricCard
              label="Success rate"
              value={
                metrics?.successRatePct !== null && metrics?.successRatePct !== undefined
                  ? `${metrics.successRatePct}%`
                  : "n/a"
              }
            />
            <MetricCard label="Retries observed" value={`${metrics?.retries ?? 0}`} />
            <MetricCard
              label="Time to finality"
              value={
                metrics?.averageTimeToFinalityMs !== null &&
                metrics?.averageTimeToFinalityMs !== undefined
                  ? `${metrics.averageTimeToFinalityMs}ms`
                  : "n/a"
              }
            />
            <MetricCard label="Failed reason" value={metrics?.topFailedReason ?? "none captured"} />
            <MetricCard
              label="Retry efficiency"
              value={
                metrics?.scoreComponents.retryEfficiency !== null &&
                metrics?.scoreComponents.retryEfficiency !== undefined
                  ? `${metrics.scoreComponents.retryEfficiency}%`
                  : "n/a"
              }
            />
            <MetricCard
              label="Finality efficiency"
              value={
                metrics?.scoreComponents.finalityEfficiency !== null &&
                metrics?.scoreComponents.finalityEfficiency !== undefined
                  ? `${metrics.scoreComponents.finalityEfficiency}%`
                  : "n/a"
              }
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
            KeeperHub-backed executions captured: {metrics?.totalExecutions ?? 0} (completed{" "}
            {metrics?.completedExecutions ?? 0}, failed {metrics?.failedExecutions ?? 0}).
          </p>
        </section>
      ) : null}
      <AgentListView />
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="frame p-4">
      <div className="label text-[var(--foreground-muted)]">{label}</div>
      <p className="mt-2 break-words text-sm leading-6">{value}</p>
    </div>
  )
}

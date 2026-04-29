"use client"

/**
 * Console overview — KeeperHub reliability scorecard + agent workspace list.
 * Vercel-style layout: page header, dense KPI grid, then a real data table for agents.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { AgentListView } from "../../../components/agent-list-view"
import { usePrivyEnabled } from "../../../components/providers"
import { Empty, PageHeader, Section } from "../../../components/ui-primitives"
import { createBrowserTRPCClient } from "../../../lib/trpc"

export default function AppHomePage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Read-only mode — auth is disabled until Privy is configured."
          actions={
            <Link className="btn btn-secondary" href="/login">
              Configure auth
            </Link>
          }
        />
        <Section title="Get started" description="Two steps to enable the full console.">
          <ol className="list-decimal pl-5 space-y-2 text-[14px] leading-6 text-[var(--fg-muted)]">
            <li>
              Add <code className="mono">NEXT_PUBLIC_PRIVY_APP_ID=&lt;your_app_id&gt;</code> to{" "}
              <code className="mono">apps/dashboard/.env.local</code>.
            </li>
            <li>
              Restart the dev server: <code className="mono">pnpm -C apps/dashboard dev</code>.
            </li>
          </ol>
        </Section>
      </>
    )
  }

  return <AuthenticatedAppHomePage />
}

interface ReliabilityMetrics {
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
}

function fmtMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return `${value}%`
}

function trendPillTone(trend: ReliabilityMetrics["scoreTrend"]): "default" | "success" | "danger" {
  if (trend === "improving") return "success"
  if (trend === "degrading") return "danger"
  return "default"
}

function KeeperHubHeroScorecard({
  metrics,
}: {
  metrics: ReliabilityMetrics | null
}) {
  const snapshot = metrics !== null && metrics.totalExecutions > 0 ? metrics : null
  const hasData = snapshot !== null
  const trend = hasData ? snapshot.scoreTrend : "insufficient_data"
  const trendLabel = trend.replaceAll("_", " ")

  return (
    <div className="card keeperhub-hero mb-10">
      <div className="keeperhub-hero-inner">
        <div className="keeperhub-hero-top">
          <div className="landing-chip">
            <span className="badge-dot" />
            KeeperHub · execution reliability
          </div>
          {hasData ? (
            <span className="keeperhub-trend-pill" data-tone={trendPillTone(trend)}>
              Trend: {trendLabel}
            </span>
          ) : (
            <span className="keeperhub-trend-pill">Awaiting first execution</span>
          )}
        </div>

        <div className="keeperhub-hero-body">
          <div className="min-w-0">
            {hasData && snapshot.reliabilityScore !== null ? (
              <div className="hero-gradient keeperhub-hero-score">{snapshot.reliabilityScore}</div>
            ) : (
              <div className="keeperhub-hero-score-muted">{hasData ? "—" : "Start here"}</div>
            )}
            <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-faint)]">
              {hasData ? "Reliability score (0–100)" : "No KeeperHub telemetry yet"}
            </div>
          </div>
          <div className="keeperhub-hero-pitch">
            <strong className="text-[var(--fg)]">KeeperHub is the default execution path.</strong>{" "}
            Every direct call and workflow trigger returns an{" "}
            <code className="mono text-[12px] text-[var(--accent)]">executionId</code> that streams
            status, settlement links, and failure reasons back into the trace—so operators measure
            retries, finality, and success without guessing.
            {!hasData ? (
              <>
                {" "}
                Open a trace after your agent runs and use{" "}
                <span className="text-[var(--fg)]">Execute reliably via KeeperHub</span> to populate
                this scorecard.
              </>
            ) : null}
          </div>
        </div>

        <div className="keeperhub-hero-strip">
          <div className="keeperhub-hero-kpi">
            <div className="keeperhub-hero-kpi-label">Success rate</div>
            <div
              className="keeperhub-hero-kpi-value"
              style={
                hasData &&
                snapshot.successRatePct !== null &&
                snapshot.successRatePct !== undefined &&
                snapshot.successRatePct >= 90
                  ? { color: "var(--success)" }
                  : hasData &&
                      snapshot.successRatePct !== null &&
                      snapshot.successRatePct !== undefined &&
                      snapshot.successRatePct < 60
                    ? { color: "var(--danger)" }
                    : undefined
              }
            >
              {hasData ? fmtPct(snapshot.successRatePct) : "—"}
            </div>
            <div className="keeperhub-hero-kpi-meta">
              {hasData
                ? `${snapshot.completedExecutions}/${snapshot.totalExecutions} completed`
                : "Runs completed / total"}
            </div>
          </div>
          <div className="keeperhub-hero-kpi">
            <div className="keeperhub-hero-kpi-label">Retries</div>
            <div className="keeperhub-hero-kpi-value">{hasData ? `${snapshot.retries}` : "—"}</div>
            <div className="keeperhub-hero-kpi-meta">
              Efficiency {hasData ? fmtPct(snapshot.scoreComponents.retryEfficiency) : "—"}
            </div>
          </div>
          <div className="keeperhub-hero-kpi">
            <div className="keeperhub-hero-kpi-label">Time to finality</div>
            <div className="keeperhub-hero-kpi-value">
              {hasData ? fmtMs(snapshot.averageTimeToFinalityMs) : "—"}
            </div>
            <div className="keeperhub-hero-kpi-meta">
              Finality {hasData ? fmtPct(snapshot.scoreComponents.finalityEfficiency) : "—"}
            </div>
          </div>
          <div className="keeperhub-hero-kpi">
            <div className="keeperhub-hero-kpi-label">Failures</div>
            <div
              className="keeperhub-hero-kpi-value"
              style={
                hasData && snapshot.failedExecutions > 0 ? { color: "var(--warning)" } : undefined
              }
            >
              {hasData ? `${snapshot.failedExecutions}` : "—"}
            </div>
            <div className="keeperhub-hero-kpi-meta">
              {hasData ? (snapshot.topFailedReason ?? "No failures captured") : "Top reason"}
            </div>
          </div>
          <div className="keeperhub-hero-kpi">
            <div className="keeperhub-hero-kpi-label">Total executions</div>
            <div className="keeperhub-hero-kpi-value">
              {hasData ? `${snapshot.totalExecutions}` : "—"}
            </div>
            <div className="keeperhub-hero-kpi-meta">KeeperHub-backed events</div>
          </div>
        </div>

        {!hasData ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/app/agents/new">
              Create your first agent
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AuthenticatedAppHomePage() {
  const { authenticated, user, getAccessToken, login, ready } = usePrivy()
  const [metrics, setMetrics] = useState<ReliabilityMetrics | null>(null)

  const client = useMemo(() => createBrowserTRPCClient(() => getAccessToken()), [getAccessToken])

  useEffect(() => {
    if (!authenticated || !ready) {
      return
    }
    let cancelled = false
    async function loadMetrics() {
      try {
        const result = (await client.query(
          "keeperhub.reliabilityMetrics"
        )) as ReliabilityMetrics | null
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
  }, [authenticated, client, ready])

  if (!authenticated) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Sign in to manage agents and inspect KeeperHub-backed executions."
          actions={
            <button className="btn btn-primary" onClick={() => login()} type="button">
              Sign in with Privy
            </button>
          }
        />
        <Section title="What you'll see after signing in">
          <ul className="list-disc pl-5 space-y-2 text-[14px] leading-6 text-[var(--fg-muted)]">
            <li>Live reliability scorecard for KeeperHub-backed executions.</li>
            <li>
              All agents in your workspace with chain, verification status, and recent activity.
            </li>
            <li>Trace detail with KeeperHub execution events inline.</li>
          </ul>
        </Section>
      </>
    )
  }

  const greeting = user?.email?.address ? `Welcome back, ${user.email.address}` : "Welcome back."

  return (
    <>
      <PageHeader
        eyebrow="Console"
        title="Overview"
        description={greeting}
        actions={
          <Link className="btn btn-primary" href="/app/agents/new">
            + New agent
          </Link>
        }
      />

      <KeeperHubHeroScorecard metrics={metrics} />

      <AgentListView />
    </>
  )
}

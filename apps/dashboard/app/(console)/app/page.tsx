"use client"

/**
 * Console overview — KeeperHub reliability scorecard. Agent list is at /app/agents.
 * Dense, dark-first, no marketing copy: the dashboard greets the operator and gets out of the way.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { usePrivyEnabled } from "../../../components/providers"
import { PageHeader, Section } from "../../../components/ui-primitives"
import { createBrowserTRPCClient } from "../../../lib/trpc"

export default function AppHomePage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Read-only mode. Auth is disabled until Privy is configured."
          actions={
            <Link className="btn btn-secondary" href="/login">
              Configure auth
            </Link>
          }
        />
        <Section title="Get started">
          <ol className="mono list-decimal space-y-2 pl-5 text-[12px] leading-6 text-[var(--ink-700)]">
            <li>
              Add <code>NEXT_PUBLIC_PRIVY_APP_ID=&lt;your_app_id&gt;</code> to{" "}
              <code>apps/dashboard/.env.local</code>.
            </li>
            <li>
              Restart with <code>pnpm -C apps/dashboard dev</code>.
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

function successRateColor(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined
  if (value >= 90) return "var(--bull)"
  if (value < 60) return "var(--bear)"
  return undefined
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
    <section className="card keeperhub-hero">
      <div className="keeperhub-hero-inner">
        <div className="keeperhub-hero-top">
          <div className="landing-chip">
            <span className="badge-dot" />
            KeeperHub · execution reliability
          </div>
          {hasData ? (
            <span className="keeperhub-trend-pill" data-tone={trendPillTone(trend)}>
              {trendLabel}
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
            <div className="keeperhub-hero-score-label">
              {hasData ? "Reliability · 0–100" : "No telemetry yet"}
            </div>
          </div>
          {!hasData ? (
            <div className="keeperhub-hero-pitch">
              Register an agent and run it once. KeeperHub-backed runs stream{" "}
              <code className="mono text-[12px] text-[var(--violet-300)]">executionId</code>,
              status, and settlement back into the trace.
            </div>
          ) : null}
        </div>

        <div className="keeperhub-hero-strip">
          <KpiCell
            label="Success rate"
            value={hasData ? fmtPct(snapshot.successRatePct) : "—"}
            meta={
              hasData
                ? `${snapshot.completedExecutions}/${snapshot.totalExecutions} completed`
                : "completed / total"
            }
            {...(() => {
              const c = hasData ? successRateColor(snapshot.successRatePct) : undefined
              return c !== undefined ? { color: c } : {}
            })()}
          />
          <KpiCell
            label="Retries"
            value={hasData ? `${snapshot.retries}` : "—"}
            meta={`Efficiency ${hasData ? fmtPct(snapshot.scoreComponents.retryEfficiency) : "—"}`}
          />
          <KpiCell
            label="Time to finality"
            value={hasData ? fmtMs(snapshot.averageTimeToFinalityMs) : "—"}
            meta={`Finality ${hasData ? fmtPct(snapshot.scoreComponents.finalityEfficiency) : "—"}`}
          />
          <KpiCell
            label="Failures"
            value={hasData ? `${snapshot.failedExecutions}` : "—"}
            meta={hasData ? (snapshot.topFailedReason ?? "—") : "top reason"}
            {...(() => {
              const c =
                hasData && snapshot.failedExecutions > 0 ? ("var(--warn)" as const) : undefined
              return c !== undefined ? { color: c } : {}
            })()}
          />
          <KpiCell
            label="Executions"
            value={hasData ? `${snapshot.totalExecutions}` : "—"}
            meta="KeeperHub-backed"
          />
        </div>

        {!hasData ? (
          <div className="mt-7 flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/app/agents/new">
              Register first agent
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function KpiCell({
  label,
  value,
  meta,
  color,
}: {
  label: string
  value: string
  meta: string
  color?: string
}) {
  return (
    <div className="keeperhub-hero-kpi">
      <div className="keeperhub-hero-kpi-label">{label}</div>
      <div className="keeperhub-hero-kpi-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="keeperhub-hero-kpi-meta">{meta}</div>
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
          description="Sign in to manage agents and inspect traces."
          actions={
            <button className="btn btn-primary" onClick={() => login()} type="button">
              Sign in with Privy
            </button>
          }
        />
      </>
    )
  }

  const greeting = user?.email?.address ? `Signed in as ${user.email.address}.` : "Authenticated."

  return (
    <div className="page-stack">
      <PageHeader
        title="Overview"
        description={greeting}
        actions={
          <Link className="btn btn-primary" href="/app/agents/new">
            New agent
          </Link>
        }
      />
      <KeeperHubHeroScorecard metrics={metrics} />
    </div>
  )
}

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
import { PageHeader, Section } from "../../../components/ui-primitives"
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
  const trendLabel = hasData ? snapshot.scoreTrend.replaceAll("_", " ") : "awaiting first execution"

  return (
    <div className="card keeperhub-hero mb-8">
      <div className="keeperhub-hero-inner">
        <div className="keeperhub-hero-top">
          <div className="landing-chip">
            <span className="badge-dot" />
            KeeperHub · execution reliability
          </div>
          <span
            className="keeperhub-trend-pill"
            data-tone={hasData ? trendPillTone(snapshot.scoreTrend) : "default"}
          >
            Trend: {trendLabel}
          </span>
        </div>

        {!hasData ? (
          <div className="keeperhub-empty-grid">
            <div>
              <div className="eyebrow">Reliability scorecard</div>
              <h3 className="keeperhub-empty-title">Awaiting first execution</h3>
              <p className="keeperhub-empty-copy">
                Register an agent, run one KeeperHub execution, and your reliability snapshot
                appears here.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link className="btn btn-primary" href="/app/agents/new">
                  Create agent
                </Link>
                <a
                  className="btn btn-secondary"
                  href="https://github.com/Madhav-Gupta-28/Tracer/blob/main/docs/demo-evidence.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  View docs
                </a>
              </div>
            </div>

            <div className="keeperhub-onboarding-list">
              <div className="keeperhub-onboarding-row">
                <span className="keeperhub-step-num">01</span>
                <div>
                  <div className="keeperhub-onboarding-title">Register agent</div>
                  <div className="keeperhub-onboarding-copy">
                    Create your first workspace agent.
                  </div>
                </div>
              </div>
              <div className="keeperhub-onboarding-row">
                <span className="keeperhub-step-num">02</span>
                <div>
                  <div className="keeperhub-onboarding-title">Run via KeeperHub</div>
                  <div className="keeperhub-onboarding-copy">
                    Trigger one execution from trace detail.
                  </div>
                </div>
              </div>
              <div className="keeperhub-onboarding-row">
                <span className="keeperhub-step-num">03</span>
                <div>
                  <div className="keeperhub-onboarding-title">See evidence here</div>
                  <div className="keeperhub-onboarding-copy">
                    Track score, retries, and finality.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="keeperhub-hero-body">
              <div className="min-w-0">
                <div className="hero-gradient keeperhub-hero-score">
                  {snapshot.reliabilityScore !== null ? snapshot.reliabilityScore : "—"}
                </div>
                <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-faint)]">
                  Reliability score (0-100)
                </div>
              </div>
              <div className="keeperhub-hero-pitch">
                Every execution returns an{" "}
                <code className="mono text-[12px] text-[var(--accent)]">executionId</code> with
                status, retries, and finality.
              </div>
            </div>

            <div className="keeperhub-hero-strip">
              <div className="keeperhub-hero-kpi">
                <div className="keeperhub-hero-kpi-label">Success rate</div>
                <div
                  className="keeperhub-hero-kpi-value"
                  style={
                    snapshot.successRatePct !== null && snapshot.successRatePct >= 90
                      ? { color: "var(--success)" }
                      : snapshot.successRatePct !== null && snapshot.successRatePct < 60
                        ? { color: "var(--danger)" }
                        : undefined
                  }
                >
                  {fmtPct(snapshot.successRatePct)}
                </div>
                <div className="keeperhub-hero-kpi-meta">
                  {snapshot.completedExecutions}/{snapshot.totalExecutions} completed
                </div>
              </div>
              <div className="keeperhub-hero-kpi">
                <div className="keeperhub-hero-kpi-label">Retries</div>
                <div className="keeperhub-hero-kpi-value">{snapshot.retries}</div>
                <div className="keeperhub-hero-kpi-meta">
                  Efficiency {fmtPct(snapshot.scoreComponents.retryEfficiency)}
                </div>
              </div>
              <div className="keeperhub-hero-kpi">
                <div className="keeperhub-hero-kpi-label">Time to finality</div>
                <div className="keeperhub-hero-kpi-value">
                  {fmtMs(snapshot.averageTimeToFinalityMs)}
                </div>
                <div className="keeperhub-hero-kpi-meta">
                  Finality {fmtPct(snapshot.scoreComponents.finalityEfficiency)}
                </div>
              </div>
              <div className="keeperhub-hero-kpi">
                <div className="keeperhub-hero-kpi-label">Failures</div>
                <div
                  className="keeperhub-hero-kpi-value"
                  style={snapshot.failedExecutions > 0 ? { color: "var(--warning)" } : undefined}
                >
                  {snapshot.failedExecutions}
                </div>
                <div className="keeperhub-hero-kpi-meta">
                  {snapshot.topFailedReason ?? "No failures captured"}
                </div>
              </div>
            </div>
          </>
        )}
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

  const email = user?.email?.address

  return (
    <>
      <PageHeader
        eyebrow="Console"
        title="Overview"
        description="Reliability snapshot for your agents."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {email ? <span className="app-user-chip">{email}</span> : null}
            <Link className="btn btn-primary" href="/app/agents/new">
              + New agent
            </Link>
          </div>
        }
      />

      <KeeperHubHeroScorecard metrics={metrics} />

      <AgentListView />
    </>
  )
}

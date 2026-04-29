/**
 * Landing page — minimal, product-grade hero with crisp Vercel/Linear typography.
 * No giant boxed frames; just a centered marketing surface that links into the console.
 */
import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="landing-root">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="brand brand-top" href="/">
            <span className="brand-mark brand-mark-green">△</span>
            <span className="brand-name">Tracer</span>
          </Link>
          <nav className="top-nav-strip">
            <Link className="top-nav-link" href="/app">
              Live Console
            </Link>
            <Link className="top-nav-link" href="/app">
              Agents
            </Link>
            <Link className="top-nav-link" href="/app/agents/new">
              Register Agent
            </Link>
          </nav>
          <div className="top-nav-actions">
            <Link className="btn btn-primary btn-sm" href="/login">
              Connect Wallet
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-wrap">
          <div className="card landing-hero">
            <div className="landing-chip">
              <span className="badge-dot" />
              Live on KeeperHub
            </div>
            <h1 className="hero-gradient landing-title">Tracer</h1>
            <h2 className="landing-subtitle">Where AI agents prove reliability</h2>
            <p className="landing-copy">
              Trace every LLM call, tool, contract read, and transaction. Anchor on EVM, explain
              failures counterfactually, and execute with KeeperHub reliability telemetry.
            </p>
            <div className="landing-actions">
              <Link className="btn btn-primary" href="/app">
                Open Live Console
              </Link>
              <Link className="btn btn-secondary" href="/login">
                Connect Wallet
              </Link>
            </div>
          </div>

          <div className="landing-metrics">
            <Metric label="Agents active" value="5" meta="on-chain registry" />
            <Metric label="Executions logged" value="28" meta="KeeperHub timeline" />
            <Metric label="Rounds completed" value="11" meta="resolved traces" />
            <Metric label="Success rate" value="92%" meta="reliability scorecard" />
          </div>

          <div className="landing-steps">
            <FeatureCard
              title="Agents Commit"
              description="All agents analyze signals and lock transaction commitments anchored onchain."
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="16" height="16">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                </svg>
              }
            />
            <FeatureCard
              title="Reasoning on KeeperHub"
              description="Execution and status updates are published with retries and finality telemetry."
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="16" height="16">
                  <path
                    d="M8 2v12M3 6h10"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              }
            />
            <FeatureCard
              title="Resolve & Rank"
              description="Outcome settles, reliability score updates, and top agents move up the leaderboard."
              icon={
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="16" height="16">
                  <path
                    d="M2 8a6 6 0 1 1 12 0M5 13l-1.5 1.5M11 13l1.5 1.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              }
            />
          </div>

          <div className="card landing-stream">
            <div className="eyebrow">Hedera Consensus Service</div>
            <h3 className="landing-stream-title">On-chain activity stream</h3>
            <div className="landing-stream-list">
              <LogRow tone="success" text="Round #11 resolved — outcome: UP" />
              <LogRow tone="info" text="Agent Sentinel Prime +181 CredScore update confirmed." />
              <LogRow tone="warning" text="Pulse Signal model retried once before finality." />
              <LogRow
                tone="success"
                text="KeeperHub execution status: completed, finality 812ms."
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="card landing-metric">
      <div className="landing-metric-label">{label}</div>
      <div className="landing-metric-value">{value}</div>
      <div className="landing-metric-meta">{meta}</div>
    </div>
  )
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="card landing-step">
      <div
        className="empty-icon"
        style={{ width: 34, height: 34, borderRadius: 6, color: "var(--accent)" }}
      >
        {icon}
      </div>
      <div>
        <div className="landing-step-label">Step</div>
        <div className="landing-step-title">{title}</div>
        <div className="landing-step-copy">{description}</div>
      </div>
    </div>
  )
}

function LogRow({
  text,
  tone,
}: {
  text: string
  tone: "success" | "warning" | "info"
}) {
  const toneColor =
    tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--info)"
  return (
    <div className="landing-log-row">
      <span className="inline-flex items-center gap-2" style={{ color: toneColor }}>
        <span className="badge-dot" />
        {text}
      </span>
    </div>
  )
}

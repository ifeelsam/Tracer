/**
 * Landing page — forensic, dense, dark-first. Bloomberg-meets-Linear in tone.
 * Single hero with the brand wordmark, followed by metrics, three-step playbook, and a live stream.
 */
import Link from "next/link"

import { TracerGlyph } from "../components/tracer-glyph"

export default function LandingPage() {
  return (
    <main className="landing-root">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link className="brand brand-top" href="/">
            <span className="brand-mark">
              <TracerGlyph size={22} />
            </span>
            <span className="brand-name">Tracer</span>
          </Link>
          <nav className="top-nav-strip" aria-label="Primary">
            <Link className="top-nav-link" href="/app">
              Console
            </Link>
            <Link className="top-nav-link" href="/app">
              Agents
            </Link>
            <Link className="top-nav-link" href="/app/agents/new">
              Register
            </Link>
          </nav>
          <div className="top-nav-actions">
            <Link className="btn btn-primary btn-sm" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-wrap">
          <div className="card landing-hero">
            <div className="landing-chip">
              <span className="badge-dot" />
              v0.1 · Live on KeeperHub
            </div>
            <h1 className="hero-gradient landing-title">Trace every decision.</h1>
            <h2 className="landing-subtitle">Forensic debugging for AI trading agents.</h2>
            <p className="landing-copy">
              Tracer reconstructs every decision your agent made — the prompts, the tool calls, the
              orders placed — so you can find the exact branch where alpha leaked. Anchor onchain,
              replay counterfactually, and execute reliably with KeeperHub telemetry.
            </p>
            <div className="landing-actions">
              <Link className="btn btn-primary" href="/app">
                Open console
              </Link>
              <Link className="btn btn-secondary" href="/login">
                Sign in
              </Link>
            </div>
          </div>

          <div className="landing-metrics">
            <Metric label="Agents traced" value="5" meta="onchain registry" />
            <Metric label="Executions" value="28" meta="KeeperHub timeline" />
            <Metric label="Rounds" value="11" meta="resolved traces" />
            <Metric label="Success rate" value="92%" meta="reliability score" />
          </div>

          <div className="landing-steps">
            <FeatureCard
              label="01 · Capture"
              title="Trace the run"
              description="Every LLM call, tool decision, contract read, and transaction is recorded as one ordered timeline."
            />
            <FeatureCard
              label="02 · Inspect"
              title="Replay the branch"
              description="Step through events, expand prompts, and surface the exact decision that produced the bad order."
            />
            <FeatureCard
              label="03 · Prove"
              title="Anchor and execute"
              description="Anchor the trace onchain. Drive transactions through KeeperHub for retries, finality, and receipts."
            />
          </div>

          <div className="card landing-stream">
            <div className="eyebrow">Live · onchain activity</div>
            <h3 className="landing-stream-title">Reconstructed in real time.</h3>
            <div className="landing-stream-list">
              <LogRow tone="success" text="round.11 resolved · outcome up · finality 812ms" />
              <LogRow tone="info" text="agent.sentinel-prime credscore +181 · anchor confirmed" />
              <LogRow tone="warning" text="model.pulse-signal retry 1 · finality 4.2s" />
              <LogRow tone="success" text="keeperhub.directContractCall completed · gas 142_000" />
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
      <div className="landing-metric-value mono">{value}</div>
      <div className="landing-metric-meta">{meta}</div>
    </div>
  )
}

function FeatureCard({
  label,
  title,
  description,
}: {
  label: string
  title: string
  description: string
}) {
  return (
    <div className="card landing-step">
      <div>
        <div className="landing-step-label">{label}</div>
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
    tone === "success" ? "var(--bull)" : tone === "warning" ? "var(--warn)" : "var(--iris-500)"
  return (
    <div className="landing-log-row">
      <span className="inline-flex items-center gap-2" style={{ color: toneColor }}>
        <span className="badge-dot" />
        <span className="mono">{text}</span>
      </span>
    </div>
  )
}

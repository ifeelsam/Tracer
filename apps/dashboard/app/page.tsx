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
            <a className="top-nav-link" href="#product">
              Product
            </a>
            <a
              className="top-nav-link"
              href="https://github.com/Madhav-Gupta-28/Tracer"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
            <Link className="top-nav-link" href="/app">
              Console
            </Link>
          </nav>
          <div className="top-nav-actions">
            <Link className="btn btn-primary btn-sm" href="/app">
              Open Console
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-wrap">
          <section className="card landing-hero-2col" id="product">
            <div className="landing-hero-main">
              <div className="landing-chip">
                <span className="badge-dot" />
                Tracer
              </div>
              <h1 className="hero-gradient landing-title">Tracer</h1>
              <h2 className="landing-subtitle">Prove every autonomous agent execution</h2>
              <div className="landing-actions">
                <Link className="btn btn-primary" href="/app">
                  Open Live Console
                </Link>
                <Link className="btn btn-secondary" href="/app/agents/new">
                  Register Agent
                </Link>
              </div>
            </div>
          </section>

          <div className="landing-metrics">
            <Metric label="Executions tracked" value="1,248" meta="timeline events" />
            <Metric label="Success rate" value="92.4%" meta="reliability score" />
            <Metric label="Median finality" value="812ms" meta="settlement speed" />
            <Metric label="Reports shared" value="340" meta="public links" />
          </div>

          <section className="landing-problem-grid">
            <ProblemSolution
              problem="Teams cannot prove what an agent did."
              solution="One verifiable execution timeline."
            />
            <ProblemSolution
              problem="Failures are hard to debug."
              solution="Exact step, payload, and outcome."
            />
            <ProblemSolution
              problem="Postmortems are fragmented."
              solution="Share one clean evidence report."
            />
          </section>

          <section className="landing-section card">
            <div className="eyebrow">How it works</div>
            <h3 className="landing-section-title">From agent call to reliability score</h3>
            <div className="landing-steps">
              <FeatureCard title="Instrument agent" description="Add Tracer SDK once." step="01" />
              <FeatureCard
                title="Capture trace"
                description="Record every execution step."
                step="02"
              />
              <FeatureCard
                title="Inspect evidence"
                description="See status and outcomes."
                step="03"
              />
              <FeatureCard title="Share report" description="Send one proof link." step="04" />
            </div>
          </section>

          <section className="landing-section card">
            <div className="eyebrow">Use cases</div>
            <h3 className="landing-section-title">Who uses Tracer today</h3>
            <div className="landing-usecases">
              <UseCaseCard title="Agent teams" body="Ship with clear execution proof." />
              <UseCaseCard title="Protocol operators" body="Resolve incidents with confidence." />
              <UseCaseCard title="Auditors & investors" body="Review verified reports instantly." />
              <UseCaseCard title="Builders" body="Track reliability each release." />
            </div>
          </section>

          <footer className="landing-footer card">
            <div className="landing-footer-cta">
              <h3>Start proving reliability</h3>
              <Link className="btn btn-primary" href="/app">
                Open Live Console
              </Link>
            </div>
            <div className="landing-footer-links">
              <FooterColumn
                title="Navigation"
                links={[
                  { label: "Live Console", href: "/app" },
                  { label: "Agents", href: "/app" },
                  { label: "Register Agent", href: "/app/agents/new" },
                ]}
              />
              <FooterColumn
                title="Resources"
                links={[
                  {
                    label: "Demo",
                    href: "https://github.com/Madhav-Gupta-28/Tracer/blob/main/docs/demo-evidence.md",
                    external: true,
                  },
                  {
                    label: "GitHub",
                    href: "https://github.com/Madhav-Gupta-28/Tracer",
                    external: true,
                  },
                ]}
              />
            </div>
            <div className="landing-footer-meta">
              Tracer · Reliability console for autonomous agents
            </div>
          </footer>
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
  step,
}: { title: string; description: string; step: string }) {
  return (
    <div className="card landing-step">
      <div className="landing-step-number">{step}</div>
      <div>
        <div className="landing-step-label">Step</div>
        <div className="landing-step-title">{title}</div>
        <div className="landing-step-copy">{description}</div>
      </div>
    </div>
  )
}

function ProblemSolution({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="card landing-problem-card">
      <div className="eyebrow">Problem</div>
      <p className="landing-problem-text">{problem}</p>
      <div className="eyebrow mt-3">Tracer answer</div>
      <p className="landing-solution-text">{solution}</p>
    </div>
  )
}

function UseCaseCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card landing-usecase-card">
      <div className="landing-step-title">{title}</div>
      <p className="landing-step-copy">{body}</p>
    </div>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: Array<{ label: string; href: string; external?: boolean }>
}) {
  return (
    <div>
      <div className="landing-footer-title">{title}</div>
      <div className="landing-footer-column">
        {links.map((link) =>
          link.external ? (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="landing-footer-link"
            >
              {link.label}
            </a>
          ) : (
            <Link key={link.label} href={link.href} className="landing-footer-link">
              {link.label}
            </Link>
          )
        )}
      </div>
    </div>
  )
}

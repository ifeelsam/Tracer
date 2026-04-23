/**
 * The landing page introduces Tracer with the product's brutalist tone before auth and app flows begin.
 * It is intentionally editorial and high-contrast rather than a generic SaaS hero.
 */
export default function LandingPage() {
  return (
    <main className="dashboard-shell">
      <section className="frame mx-auto grid max-w-[1280px] grid-cols-1 gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="frame-header border-b border-r-0 p-6 lg:border-b-0 lg:border-r">
          <div className="label text-[var(--foreground-muted)]">Tracer Laboratories</div>
          <h1 className="headline mt-8 max-w-4xl text-6xl leading-none md:text-8xl">
            Observe every agent decision, <em>every read</em>, every tx.
          </h1>
          <p className="mt-8 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
            Production-grade observability and debugging for TypeScript AI agents operating on EVM
            chains.
          </p>
        </div>
        <div className="p-6">
          <div className="label text-[var(--foreground-muted)]">System Surface</div>
          <div className="mt-6 grid gap-4">
            <div className="frame p-4">
              <div className="label text-[var(--foreground-muted)]">Capture</div>
              <p className="mt-3 text-sm leading-6">
                LLM calls, tools, contract reads, transactions.
              </p>
            </div>
            <div className="frame p-4">
              <div className="label text-[var(--foreground-muted)]">Anchor</div>
              <p className="mt-3 text-sm leading-6">
                Merkle commitments on a cheap EVM anchor chain.
              </p>
            </div>
            <div className="frame p-4">
              <div className="label text-[var(--foreground-muted)]">Explain</div>
              <p className="mt-3 text-sm leading-6">
                Structured counterfactual analysis for failed traces.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

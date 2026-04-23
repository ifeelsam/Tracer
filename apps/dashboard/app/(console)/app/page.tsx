"use client"

/**
 * The app home is the first authenticated console surface and establishes the dashboard rhythm.
 * It pairs status copy with brutalist system cards instead of a generic empty-state table.
 */
import { usePrivy } from "@privy-io/react-auth"

import { usePrivyEnabled } from "../../../components/providers"

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
  const { authenticated, user } = usePrivy()

  return (
    <main className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="frame p-6">
        <div className="label text-[var(--foreground-muted)]">Agent Console</div>
        <h1 className="headline mt-6 text-5xl leading-none">Trace operators, not just outputs.</h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
          This surface is ready for agent onboarding, live connection checks, and trace inspection.
          The chain picker above filters dashboard views without changing backend monitoring state.
        </p>
      </section>
      <aside className="grid gap-4">
        <div className="frame p-5">
          <div className="label text-[var(--foreground-muted)]">Auth Status</div>
          <p className="mt-3 text-sm leading-6">
            {authenticated ? `Connected as ${user?.id ?? "unknown user"}` : "Not authenticated."}
          </p>
        </div>
        <div className="frame p-5">
          <div className="label text-[var(--foreground-muted)]">Next Surfaces</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--foreground-muted)]">
            <li>Agent onboarding wizard</li>
            <li>Trace timeline and inspector</li>
            <li>Share + verification flows</li>
          </ul>
        </div>
      </aside>
    </main>
  )
}

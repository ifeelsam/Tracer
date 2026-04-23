"use client"

/**
 * The login page gives Privy a dedicated entry surface while staying visually aligned with the console.
 * It avoids modal-only entry by offering a full-page auth action inside the Mortem framing system.
 */
import { usePrivy } from "@privy-io/react-auth"

import { usePrivyEnabled } from "../../components/providers"

export default function LoginPage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="dashboard-shell">
        <section className="frame mx-auto max-w-[720px] p-8">
          <div className="label text-[var(--foreground-muted)]">Operator Access</div>
          <h1 className="headline mt-6 text-5xl leading-none">Enter the trace room.</h1>
          <p className="mt-6 max-w-xl text-sm leading-7 text-[var(--foreground-muted)]">
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable authentication in this dashboard.
          </p>
        </section>
      </main>
    )
  }

  return <PrivyLoginPage />
}

function PrivyLoginPage() {
  const { authenticated, login, user } = usePrivy()

  return (
    <main className="dashboard-shell">
      <section className="frame mx-auto max-w-[720px] p-8">
        <div className="label text-[var(--foreground-muted)]">Operator Access</div>
        <h1 className="headline mt-6 text-5xl leading-none">Enter the trace room.</h1>
        <p className="mt-6 max-w-xl text-sm leading-7 text-[var(--foreground-muted)]">
          Authenticate with Privy to manage agents, inspect live traces, and verify anchored runs.
        </p>
        <div className="mt-8 flex flex-col gap-4">
          <button className="nav-chip w-fit" type="button" onClick={() => login()}>
            {authenticated ? "Reconnect" : "Login with Privy"}
          </button>
          <div className="frame p-4">
            <div className="label text-[var(--foreground-muted)]">Session</div>
            <p className="mt-3 text-sm leading-6">
              {authenticated
                ? `Authenticated as ${user?.id ?? "unknown user"}`
                : "No active session."}
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

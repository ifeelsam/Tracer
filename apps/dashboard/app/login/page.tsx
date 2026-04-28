"use client"

/**
 * The login page gives Privy a dedicated entry surface while staying visually aligned with the console.
 * It avoids modal-only entry by offering a full-page auth action inside the Tracer framing system.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"

import { usePrivyEnabled } from "../../components/providers"
import { PageSectionHeader, SurfaceNotice } from "../../components/ui-primitives"

export default function LoginPage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="dashboard-shell">
        <section className="frame mx-auto max-w-[720px] p-8">
          <PageSectionHeader
            description="Set NEXT_PUBLIC_PRIVY_APP_ID to enable authentication in this dashboard."
            eyebrow="Operator Access"
            title="Enter the trace room."
          />
          <div className="mt-8">
            <Link className="nav-chip" href="/app">
              Continue in read-only mode
            </Link>
          </div>
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
        <PageSectionHeader
          description="Authenticate with Privy to manage agents, inspect live traces, and verify anchored runs."
          eyebrow="Operator Access"
          title="Enter the trace room."
        />
        <div className="mt-8 flex flex-col gap-4">
          <button className="nav-chip w-fit" type="button" onClick={() => login()}>
            {authenticated ? "Reconnect" : "Login with Privy"}
          </button>
          {authenticated ? (
            <Link className="nav-chip w-fit" href="/app">
              Go to console
            </Link>
          ) : null}
          <SurfaceNotice
            description={
              authenticated
                ? `Authenticated as ${user?.id ?? "unknown user"}`
                : "No active session."
            }
            title="Session"
          />
        </div>
      </section>
    </main>
  )
}

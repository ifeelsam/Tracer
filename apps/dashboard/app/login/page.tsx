"use client"

/**
 * Centered auth card — Vercel/Linear style.
 * One primary action; setup instructions only when Privy is not configured.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"

import { usePrivyEnabled } from "../../components/providers"

export default function LoginPage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="auth-shell">
        <div className="auth-card card">
          <Link className="brand brand-top" href="/" style={{ marginBottom: 18 }}>
            <span className="brand-mark brand-mark-green">△</span>
            <span className="brand-name">Tracer</span>
          </Link>
          <div className="eyebrow mb-2">Operator Access</div>
          <h1 className="h2 mb-1">Authentication setup required</h1>
          <p className="text-[13px] leading-5 text-[var(--fg-muted)] mb-5">
            Privy is not configured for this environment. Add a credential to enable operator
            sign-in.
          </p>

          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 mb-5">
            <div className="eyebrow mb-2">Setup</div>
            <ol className="list-decimal pl-5 space-y-1.5 text-[13px] leading-5 text-[var(--fg-muted)]">
              <li>
                Add <code className="mono">NEXT_PUBLIC_PRIVY_APP_ID=&lt;your_app_id&gt;</code> to{" "}
                <code className="mono">apps/dashboard/.env.local</code>.
              </li>
              <li>
                Restart with <code className="mono">pnpm -C apps/dashboard dev</code>.
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" href="/app">
              Open read-only console
            </Link>
            <Link className="btn btn-ghost" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return <PrivyLoginCard />
}

function PrivyLoginCard() {
  const { authenticated, login, user, logout } = usePrivy()

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <Link className="brand brand-top" href="/" style={{ marginBottom: 18 }}>
          <span className="brand-mark brand-mark-green">△</span>
          <span className="brand-name">Tracer</span>
        </Link>

        <div className="eyebrow mb-2">Operator Access</div>
        <h1 className="h2 mb-1">{authenticated ? "You're signed in" : "Sign in to Tracer"}</h1>
        <p className="text-[13px] leading-5 text-[var(--fg-muted)] mb-6">
          {authenticated
            ? `Authenticated as ${user?.email?.address ?? user?.id ?? "operator"}.`
            : "Authenticate with Privy to manage agents, inspect live traces, and run KeeperHub executions."}
        </p>

        {authenticated ? (
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/app">
              Open console
            </Link>
            <button className="btn btn-secondary" type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" type="button" onClick={() => login()}>
              Continue with Privy
            </button>
            <Link className="btn btn-ghost" href="/">
              Back to home
            </Link>
          </div>
        )}

        <div className="divider mt-6 mb-4" />
        <p className="text-[12px] text-[var(--fg-faint)]">
          Privy securely handles email, wallet, and social auth. Tracer never sees your password.
        </p>
      </div>
    </main>
  )
}

"use client"

/**
 * Centered auth card. Forensic voice — single primary action, declarative copy.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"

import { usePrivyEnabled } from "../../components/providers"
import { TracerGlyph } from "../../components/tracer-glyph"

export default function LoginPage() {
  const privyEnabled = usePrivyEnabled()

  if (!privyEnabled) {
    return (
      <main className="auth-shell">
        <div className="auth-card card">
          <Link className="brand brand-top" href="/" style={{ marginBottom: 22 }}>
            <span className="brand-mark">
              <TracerGlyph size={22} />
            </span>
            <span className="brand-name">Tracer</span>
          </Link>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Operator access
          </div>
          <h1 className="h2" style={{ marginBottom: 6 }}>
            Authentication setup required
          </h1>
          <p className="text-[13px] leading-5 text-[var(--ink-700)] mb-6">
            Privy is not configured for this environment. Add a credential to enable operator
            sign-in.
          </p>

          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--ink-100)] p-4 mb-6">
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Setup
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 text-[13px] leading-5 text-[var(--ink-700)]">
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
        <Link className="brand brand-top" href="/" style={{ marginBottom: 22 }}>
          <span className="brand-mark">
            <TracerGlyph size={22} />
          </span>
          <span className="brand-name">Tracer</span>
        </Link>

        <div className="eyebrow" style={{ marginBottom: 14 }}>
          Operator access
        </div>
        <h1 className="h2" style={{ marginBottom: 6 }}>
          {authenticated ? "Signed in." : "Sign in to Tracer."}
        </h1>
        <p className="text-[13px] leading-5 text-[var(--ink-700)] mb-7">
          {authenticated
            ? `Authenticated as ${user?.email?.address ?? user?.id ?? "operator"}.`
            : "Authenticate to manage agents, inspect live traces, and run KeeperHub executions."}
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

        <div className="divider mt-7 mb-4" />
        <p className="text-[12px] text-[var(--ink-500)] mono">
          Privy handles email, wallet, and social auth. Tracer never sees your password.
        </p>
      </div>
    </main>
  )
}

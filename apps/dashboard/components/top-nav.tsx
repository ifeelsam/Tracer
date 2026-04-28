/**
 * The top nav anchors the dashboard with brand, navigation, and the persistent chain filter.
 * Its hard-edged layout mirrors the architectural framing described in the Tracer design spec.
 */
import type { TracerChain } from "@tracerlabs/shared"
import Link from "next/link"

import { ChainBadge } from "./chain-badge"
import { ChainPicker } from "./chain-picker"

export function TopNav({ chains }: { chains: TracerChain[] }) {
  return (
    <header className="frame mx-auto flex max-w-[1280px] flex-col gap-6 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent-foreground)]">
            T
          </div>
          <div>
            <div className="headline text-3xl leading-none">Tracer</div>
            <div className="label mt-2 text-[var(--foreground-muted)]">
              Observability Laboratories
            </div>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          <Link className="nav-chip" href="/">
            Landing
          </Link>
          <Link className="nav-chip" href="/login">
            Login
          </Link>
          <Link className="nav-chip" href="/app">
            Console
          </Link>
        </nav>
      </div>
      <div className="grid gap-3 lg:justify-items-end">
        <ChainPicker chains={chains} />
        <div className="flex flex-wrap gap-2 opacity-90">
          {chains.slice(0, 4).map((chain) => (
            <ChainBadge key={chain.id} chain={chain} />
          ))}
        </div>
      </div>
    </header>
  )
}

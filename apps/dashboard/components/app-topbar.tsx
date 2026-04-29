"use client"

/**
 * Ascend-inspired top navigation for Tracer console.
 * Uses a centered nav strip, compact uppercase labels, and a right utility zone.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SupportedChain } from "../lib/trpc"
import { ChainPicker } from "./chain-picker"
import { usePrivyEnabled } from "./providers"

const NAV_ITEMS = [
  {
    href: "/app",
    label: "Live Console",
    match: (path: string) => path === "/app" || path === "/app/",
  },
  {
    href: "/app",
    label: "Agents",
    match: (path: string) => path.startsWith("/app/agents") || path.startsWith("/app/traces"),
  },
  {
    href: "/app/agents/new",
    label: "Register Agent",
    match: (path: string) => path === "/app/agents/new",
  },
]

export function AppTopbar({ chains }: { chains: SupportedChain[] }) {
  const pathname = usePathname() ?? "/app"
  const privyEnabled = usePrivyEnabled()

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <Link className="brand brand-top" href="/">
          <span className="brand-mark brand-mark-green">△</span>
          <span className="brand-name">Tracer</span>
        </Link>

        <nav className="top-nav-strip" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              className="top-nav-link"
              data-active={item.match(pathname) ? "true" : undefined}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="top-nav-actions">
          <ChainPicker chains={chains} />
          {privyEnabled ? (
            <PrivyAuthAction />
          ) : (
            <Link className="btn btn-secondary btn-sm" href="/login">
              Configure auth
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function PrivyAuthAction() {
  const { authenticated, login, logout } = usePrivy()

  if (authenticated) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => void logout()} type="button">
        Disconnect
      </button>
    )
  }

  return (
    <button className="btn btn-primary btn-sm" onClick={() => login()} type="button">
      Connect Wallet
    </button>
  )
}

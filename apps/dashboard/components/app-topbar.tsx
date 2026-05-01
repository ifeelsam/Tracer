"use client"

/**
 * Top navigation for the Tracer console.
 * Sticky, dense, mono-uppercase labels per the brand system.
 * Wordmark sits on the left; primary nav centered; chain + auth on the right.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SupportedChain } from "../lib/trpc"
import { ChainPicker } from "./chain-picker"
import { usePrivyEnabled } from "./providers"
import { TracerGlyph } from "./tracer-glyph"

const NAV_ITEMS = [
  {
    href: "/app",
    label: "Console",
    match: (path: string) => path === "/app" || path === "/app/",
  },
  {
    href: "/app/agents",
    label: "Agents",
    match: (path: string) =>
      path === "/app/agents" || path.startsWith("/app/agents/") || path.startsWith("/app/traces"),
  },
  {
    href: "/app/agents/new",
    label: "Register",
    match: (path: string) => path === "/app/agents/new",
  },
]

export function AppTopbar({ chains }: { chains: SupportedChain[] }) {
  const pathname = usePathname() ?? "/app"
  const privyEnabled = usePrivyEnabled()

  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-topbar-kicker">
          <Link className="brand brand-top" href="/">
            <span className="brand-mark">
              <TracerGlyph size={22} />
            </span>
            <span className="brand-name">Tracer</span>
          </Link>
          <span className="app-topbar-caption">Forensic Console</span>
        </div>

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
      Sign in
    </button>
  )
}

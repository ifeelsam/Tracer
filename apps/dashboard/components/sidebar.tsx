"use client"

/**
 * Persistent sidebar for the authenticated console.
 * Branded header, grouped nav, identity at the footer. Forensic voice — no decorative chrome.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { usePrivyEnabled } from "./providers"
import { TracerGlyph } from "./tracer-glyph"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  match: (pathname: string) => boolean
}

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) {
    return pathname === href
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

const PRIMARY_NAV: NavItem[] = [
  {
    href: "/app",
    label: "Console",
    match: (p) => p === "/app" || p === "/app/",
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 12 L8 9 L12 4 L16 9 L21 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    href: "/app/agents",
    label: "Agents",
    match: (p) =>
      p === "/app/agents" || p.startsWith("/app/agents/") || p.startsWith("/app/traces"),
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="8"
          r="3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
]

const RESOURCE_NAV: NavItem[] = [
  {
    href: "/app/agents/new",
    label: "Register agent",
    match: (p) => isActive(p, "/app/agents/new", true),
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname() ?? "/app"
  const privyEnabled = usePrivyEnabled()

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand-block">
        <Link className="brand" href="/app">
          <span className="brand-mark">
            <TracerGlyph size={22} />
          </span>
          <span className="brand-name">Tracer</span>
        </Link>
        <div className="sidebar-rail-note">
          Reconstruct every decision your trading agent made — prompts, tool calls, transactions.
        </div>
      </div>

      <div className="sidebar-group">
        <div className="sidebar-label">Workspace</div>
        {PRIMARY_NAV.map((item, idx) => (
          <Link
            key={`${item.href}-${item.label}-${idx}`}
            className="sidebar-item"
            data-active={item.match(pathname) ? "true" : undefined}
            href={item.href}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-group">
        <div className="sidebar-label">Resources</div>
        {RESOURCE_NAV.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            className="sidebar-item"
            data-active={item.match(pathname) ? "true" : undefined}
            href={item.href}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-status-card">
          <div className="sidebar-status-label">Investigation Mode</div>
          <div className="sidebar-status-value">Live trace</div>
          <div className="sidebar-status-copy">
            Inspect runs, verify anchors, and replay KeeperHub execution telemetry.
          </div>
        </div>
        {privyEnabled ? <SidebarPrivyIdentity /> : <ConfigureAuthLink />}
      </div>
    </aside>
  )
}

function SidebarPrivyIdentity() {
  const { authenticated, user } = usePrivy()

  if (!authenticated || !user) {
    return (
      <Link className="sidebar-item" href="/login">
        <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 24 24" fill="none">
          <path
            d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M4 12h11m0 0-4-4m4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Sign in</span>
      </Link>
    )
  }

  const display = user.email?.address ?? user.id ?? "Signed in"
  const initial = display.slice(0, 1).toUpperCase()
  return (
    <div className="sidebar-item" data-active="true">
      <span
        aria-hidden="true"
        className="sidebar-icon"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "color-mix(in oklab, var(--violet-500) 18%, transparent)",
          color: "var(--violet-300)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.04,
        }}
      >
        {initial}
      </span>
      <span className="mono" style={{ fontSize: 12 }}>
        {display.length > 24 ? `${display.slice(0, 22)}…` : display}
      </span>
    </div>
  )
}

function ConfigureAuthLink() {
  return (
    <Link className="sidebar-item" href="/login">
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Configure auth</span>
    </Link>
  )
}

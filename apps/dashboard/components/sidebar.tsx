"use client"

/**
 * Sidebar provides primary navigation for the authenticated console.
 * It mirrors the Vercel/Linear pattern: branded header, grouped nav, identity at the footer.
 */
import { usePrivy } from "@privy-io/react-auth"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { usePrivyEnabled } from "./providers"

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
    label: "Overview",
    match: (p) => isActive(p, "/app", true),
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 16 16" fill="none">
        <path
          d="M2 9.5L8 3l6 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  {
    href: "/app",
    label: "Agents",
    match: (p) => p === "/app" || p.startsWith("/app/agents"),
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
]

const RESOURCE_NAV: NavItem[] = [
  {
    href: "/app/agents/new",
    label: "New agent",
    match: (p) => isActive(p, "/app/agents/new", true),
    icon: (
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 16 16" fill="none">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname() ?? "/app"
  const privyEnabled = usePrivyEnabled()

  return (
    <aside className="app-sidebar">
      <Link className="brand" href="/app">
        <span className="brand-mark">T</span>
        <span className="brand-name">Tracer</span>
      </Link>

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
        <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 16 16" fill="none">
          <path
            d="M9 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9M3 8h7m0 0L7 5m3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.4"
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
      <span className="brand-mark" style={{ width: 22, height: 22, fontSize: 11, borderRadius: 6 }}>
        {initial}
      </span>
      <span style={{ fontSize: 12.5 }} className="muted truncate">
        {display.length > 24 ? `${display.slice(0, 22)}…` : display}
      </span>
    </div>
  )
}

function ConfigureAuthLink() {
  return (
    <Link className="sidebar-item" href="/login">
      <svg aria-hidden="true" className="sidebar-icon" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v4l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span>Configure auth</span>
    </Link>
  )
}

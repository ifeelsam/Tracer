/**
 * Console layout wraps authenticated routes in a persistent operator shell.
 * Chains are loaded server-side so the topbar and filter controls render without client flicker.
 */
import type { ReactNode } from "react"

import { AppTopbar } from "../../components/app-topbar"
import { Sidebar } from "../../components/sidebar"
import { getSupportedChains } from "../../lib/trpc"

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const chains = await getSupportedChains()

  return (
    <div className="app-shell">
      <div className="app-console-shell">
        <Sidebar />
        <div className="app-main">
          <AppTopbar chains={chains} />
          <div className="app-content">{children}</div>
        </div>
      </div>
    </div>
  )
}

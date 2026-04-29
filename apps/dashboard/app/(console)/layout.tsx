/**
 * Console layout wraps authenticated routes in a top navigation shell.
 * Supported chains are loaded server-side so navigation renders immediately without client flicker.
 */
import type { ReactNode } from "react"

import { AppTopbar } from "../../components/app-topbar"
import { getSupportedChains } from "../../lib/trpc"

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const chains = await getSupportedChains()

  return (
    <div className="app-shell">
      <AppTopbar chains={chains} />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}

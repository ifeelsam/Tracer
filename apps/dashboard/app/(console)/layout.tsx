/**
 * The console layout wraps authenticated app routes in the shared top navigation and dashboard shell.
 * It fetches supported chains server-side so the nav can render immediately without client flicker.
 */
import type { ReactNode } from "react"

import { TopNav } from "../../components/top-nav"
import { getSupportedChains } from "../../lib/trpc"

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const chains = await getSupportedChains()

  return (
    <div className="dashboard-shell">
      <TopNav chains={chains} />
      <div className="mx-auto mt-6 max-w-[1280px] pb-8">{children}</div>
    </div>
  )
}

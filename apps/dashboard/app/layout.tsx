/**
 * The root layout wires in the Mortem-inspired typography and global theme tokens for the dashboard.
 * All interactive screens inherit this layout so the product feels consistent from landing to deep trace views.
 */
import type { ReactNode } from "react"

import { AppProviders } from "../components/providers"
import "./globals.css"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

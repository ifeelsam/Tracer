/**
 * This app shell exists so route handlers and server actions run inside a valid App Router project.
 * The UI here stays intentionally tiny because this package is primarily an API surface.
 */
import type { ReactNode } from "react"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

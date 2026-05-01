/**
 * The root layout wires the Tracer brand fonts and global theme tokens for the dashboard.
 * Inter Tight powers display + body; JetBrains Mono powers all data, IDs, timestamps, and code.
 */
import { Inter_Tight, JetBrains_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { AppProviders } from "../components/providers"
import "./globals.css"

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "600"],
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${interTight.variable} ${jetbrainsMono.variable}`} lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

"use client"

import { PrivyProvider } from "@privy-io/react-auth"
/**
 * Client providers centralize Privy and React Query so dashboard screens can focus on product logic.
 * The provider tree is intentionally small to keep the app responsive and easy to reason about.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, createContext, useContext, useState } from "react"

const PrivyEnabledContext = createContext(false)

function getPrivyAppId(): string {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""
}

export function usePrivyEnabled(): boolean {
  return useContext(PrivyEnabledContext)
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const privyAppId = getPrivyAppId()
  const content = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

  if (!privyAppId) {
    return <PrivyEnabledContext.Provider value={false}>{content}</PrivyEnabledContext.Provider>
  }

  return (
    <PrivyEnabledContext.Provider value>
      <PrivyProvider
        appId={privyAppId}
        config={{
          appearance: {
            theme: "dark",
            accentColor: "#dc2626",
          },
        }}
      >
        {content}
      </PrivyProvider>
    </PrivyEnabledContext.Provider>
  )
}

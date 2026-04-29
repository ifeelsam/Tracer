"use client"

/**
 * The chain picker persists a dashboard-only active chain filter in local storage.
 * It does not affect backend chain monitoring and only changes which traces the UI emphasizes.
 */
import { useEffect, useState } from "react"

import type { SupportedChain } from "../lib/trpc"

const STORAGE_KEY = "tracer_active_chain"

export function ChainPicker({ chains }: { chains: SupportedChain[] }) {
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null)

  useEffect(() => {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN
    if (!Number.isNaN(parsedValue)) {
      setSelectedChainId(parsedValue)
      return
    }

    setSelectedChainId(chains[0]?.id ?? null)
  }, [chains])

  const selectedChain = chains.find((chain) => chain.id === selectedChainId) ?? chains[0] ?? null

  return (
    <select
      aria-label="Active chain"
      className="input select"
      style={{ height: 28, minWidth: 180, fontSize: 12.5 }}
      value={selectedChain?.id ?? ""}
      onChange={(event) => {
        const nextChainId = Number.parseInt(event.currentTarget.value, 10)
        setSelectedChainId(nextChainId)
        window.localStorage.setItem(STORAGE_KEY, String(nextChainId))
        window.dispatchEvent(new Event("tracer:active-chain-changed"))
      }}
    >
      {chains.map((chain) => (
        <option key={chain.id} value={chain.id}>
          {chain.name}
          {chain.isTestnet ? " · testnet" : ""}
        </option>
      ))}
    </select>
  )
}

"use client"

/**
 * The chain picker persists a dashboard-only active chain filter in local storage.
 * It does not affect backend chain monitoring and only changes which traces the UI emphasizes.
 */
import type { TracerChain } from "@tracerlabs/shared"
import { useEffect, useState } from "react"

const STORAGE_KEY = "tracer_active_chain"

export function ChainPicker({ chains }: { chains: TracerChain[] }) {
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
    <label className="flex min-w-[220px] flex-col gap-2">
      <span className="label text-[var(--foreground-muted)]">Active Chain Filter</span>
      <select
        className="nav-chip"
        value={selectedChain?.id ?? ""}
        onChange={(event) => {
          const nextChainId = Number.parseInt(event.currentTarget.value, 10)
          setSelectedChainId(nextChainId)
          window.localStorage.setItem(STORAGE_KEY, String(nextChainId))
        }}
      >
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name} {chain.isTestnet ? "• testnet" : ""}
          </option>
        ))}
      </select>
    </label>
  )
}

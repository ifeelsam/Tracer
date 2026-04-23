/**
 * Chain badges give every supported network a consistent visual signature across the dashboard.
 * Testnets are surfaced as outlined amber accents so they remain distinct without changing layout.
 */
import type { TracerChain } from "@tracerlabs/shared"

function getChainColor(chain: TracerChain): string {
  if (chain.isTestnet) {
    return "var(--chain-testnet)"
  }

  switch (chain.id) {
    case 1:
      return "var(--chain-ethereum)"
    case 8453:
      return "var(--chain-base)"
    case 42161:
      return "var(--chain-arbitrum)"
    case 10:
      return "var(--chain-optimism)"
    case 137:
      return "var(--chain-polygon)"
    default:
      return "var(--foreground-muted)"
  }
}

export function ChainBadge({ chain }: { chain: TracerChain }) {
  return (
    <span className="chain-badge" style={{ color: getChainColor(chain) }}>
      <span>{chain.shortName}</span>
      <span>{chain.isTestnet ? "testnet" : "mainnet"}</span>
    </span>
  )
}

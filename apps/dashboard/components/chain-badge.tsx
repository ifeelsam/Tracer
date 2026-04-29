/**
 * Chain badges give every supported network a consistent visual signature across the dashboard.
 * Testnets are surfaced as outlined amber accents so they remain distinct without changing layout.
 */
import type { SupportedChain } from "../lib/trpc"

function getChainColor(chain: SupportedChain): string {
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
      return "var(--fg-muted)"
  }
}

export function ChainBadge({ chain }: { chain: SupportedChain }) {
  const color = getChainColor(chain)
  return (
    <span
      className="badge"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 45%, var(--border-strong))`,
        background: "var(--bg-elevated)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          display: "inline-block",
        }}
      />
      <span style={{ color: "var(--fg)" }}>{chain.shortName}</span>
      <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>
        {chain.isTestnet ? "testnet" : "mainnet"}
      </span>
    </span>
  )
}

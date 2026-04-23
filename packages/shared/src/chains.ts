/**
 * This file is the single source of truth for supported EVM chains in Tracer.
 * Adding a new chain should only require a new entry in the registry below.
 */
import type { Chain } from "viem"
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  optimism,
  polygon,
} from "viem/chains"

export interface TracerChain {
  id: number
  name: string
  shortName: string
  nativeCurrency: {
    symbol: string
    decimals: number
  }
  viemChain: Chain
  blockExplorerUrl: string
  isTestnet: boolean
  rpcEnvVar: string
  alchemyNetwork: string
}

export const CHAINS: Record<number, TracerChain> = {
  1: {
    id: 1,
    name: "Ethereum",
    shortName: "eth",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: mainnet,
    blockExplorerUrl: "https://etherscan.io",
    isTestnet: false,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    alchemyNetwork: "eth-mainnet",
  },
  10: {
    id: 10,
    name: "Optimism",
    shortName: "op",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: optimism,
    blockExplorerUrl: "https://optimistic.etherscan.io",
    isTestnet: false,
    rpcEnvVar: "OPTIMISM_RPC_URL",
    alchemyNetwork: "opt-mainnet",
  },
  137: {
    id: 137,
    name: "Polygon",
    shortName: "polygon",
    nativeCurrency: { symbol: "POL", decimals: 18 },
    viemChain: polygon,
    blockExplorerUrl: "https://polygonscan.com",
    isTestnet: false,
    rpcEnvVar: "POLYGON_RPC_URL",
    alchemyNetwork: "polygon-mainnet",
  },
  8453: {
    id: 8453,
    name: "Base",
    shortName: "base",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: base,
    blockExplorerUrl: "https://basescan.org",
    isTestnet: false,
    rpcEnvVar: "BASE_RPC_URL",
    alchemyNetwork: "base-mainnet",
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    shortName: "base-sepolia",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: baseSepolia,
    blockExplorerUrl: "https://sepolia.basescan.org",
    isTestnet: true,
    rpcEnvVar: "BASE_SEPOLIA_RPC_URL",
    alchemyNetwork: "base-sepolia",
  },
  42161: {
    id: 42161,
    name: "Arbitrum One",
    shortName: "arb",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: arbitrum,
    blockExplorerUrl: "https://arbiscan.io",
    isTestnet: false,
    rpcEnvVar: "ARBITRUM_RPC_URL",
    alchemyNetwork: "arb-mainnet",
  },
  421614: {
    id: 421614,
    name: "Arbitrum Sepolia",
    shortName: "arb-sepolia",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    viemChain: arbitrumSepolia,
    blockExplorerUrl: "https://sepolia.arbiscan.io",
    isTestnet: true,
    rpcEnvVar: "ARBITRUM_SEPOLIA_RPC_URL",
    alchemyNetwork: "arb-sepolia",
  },
}

export function getChain(chainId: number): TracerChain {
  const chain = CHAINS[chainId]
  if (!chain) {
    throw new Error(`Unsupported chainId: ${chainId}`)
  }

  return chain
}

export function getActiveChain(): TracerChain {
  const chainId = Number.parseInt(process.env.ACTIVE_CHAIN_ID ?? "84532", 10)
  return getChain(chainId)
}

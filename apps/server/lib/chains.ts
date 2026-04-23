/**
 * Server-side chain helpers resolve RPC URLs and cache viem clients by chain id.
 * The cache prevents route handlers and workers from rebuilding transports on every request.
 */
import { getActiveChain, getChain } from "@tracerlabs/shared"
import { http, createPublicClient } from "viem"

const publicClientCache = new Map<number, ReturnType<typeof createPublicClient>>()

function getFallbackRpcUrl(chainId: number): string {
  const chain = getChain(chainId)
  const defaultRpcUrl = chain.viemChain.rpcUrls.default.http[0]
  if (defaultRpcUrl) {
    return defaultRpcUrl
  }

  const publicRpcUrl = chain.viemChain.rpcUrls.public?.http[0]
  if (publicRpcUrl) {
    return publicRpcUrl
  }

  throw new Error(`No RPC URL available for chain ${chainId}`)
}

export function getRpcUrl(chainId: number): string {
  const chain = getChain(chainId)
  return process.env[chain.rpcEnvVar] ?? getFallbackRpcUrl(chainId)
}

export function getPublicClient(chainId: number) {
  const cached = publicClientCache.get(chainId)
  if (cached) {
    return cached
  }

  const chain = getChain(chainId)
  const client = createPublicClient({
    chain: chain.viemChain,
    transport: http(getRpcUrl(chainId)),
  })
  publicClientCache.set(chainId, client)
  return client
}

export function getActivePublicClient() {
  return getPublicClient(getActiveChain().id)
}

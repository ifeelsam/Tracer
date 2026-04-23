/**
 * This module builds the viem clients used to sign and confirm Merkle anchor transactions.
 * The anchoring chain is chosen entirely from env-driven chain ids and shared registry metadata.
 */
import { getChain } from "@tracerlabs/shared"
import { http, createPublicClient, createWalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"

function getAnchorChainId(): number {
  return Number.parseInt(process.env.ANCHOR_CHAIN_ID ?? "84532", 10)
}

function getRpcUrl(chainId: number): string {
  const chain = getChain(chainId)
  const envValue = process.env[chain.rpcEnvVar]
  if (!envValue) {
    throw new Error(`Missing RPC url for anchor chain ${chainId} (${chain.rpcEnvVar})`)
  }

  return envValue
}

function getAnchorPrivateKey(): `0x${string}` {
  const privateKey = process.env.TRACER_SIGNER_PRIVATE_KEY
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error("TRACER_SIGNER_PRIVATE_KEY must be a 0x-prefixed hex key")
  }

  return privateKey as `0x${string}`
}

export function getAnchorAccount() {
  return privateKeyToAccount(getAnchorPrivateKey())
}

export function getAnchorWalletClient() {
  const chainId = getAnchorChainId()
  const chain = getChain(chainId)

  return createWalletClient({
    account: getAnchorAccount(),
    chain: chain.viemChain,
    transport: http(getRpcUrl(chainId)),
  })
}

export function getAnchorPublicClient() {
  const chainId = getAnchorChainId()
  const chain = getChain(chainId)

  return createPublicClient({
    chain: chain.viemChain,
    transport: http(getRpcUrl(chainId)),
  })
}

export function getAnchorAddress(): `0x${string}` {
  const address = process.env.TRACER_ANCHOR_ADDRESS
  if (!address || !address.startsWith("0x")) {
    throw new Error("TRACER_ANCHOR_ADDRESS must be a 0x-prefixed address")
  }

  return address as `0x${string}`
}

export function getAnchorChainMetadata() {
  return getChain(getAnchorChainId())
}

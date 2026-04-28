import { readFileSync } from "node:fs"
/**
 * This module builds the viem clients used to sign and confirm Merkle anchor transactions.
 * The anchoring chain is chosen entirely from env-driven chain ids and shared registry metadata.
 */
import { getChain } from "@tracerlabs/shared"
import {
  http,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  fallback,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

function getAnchorChainId(): number {
  return Number.parseInt(process.env.ANCHOR_CHAIN_ID ?? "84532", 10)
}

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]
  if (filePath) {
    return readFileSync(filePath, "utf8").trim()
  }

  return process.env[name]
}

function getRpcUrls(chainId: number): string[] {
  const chain = getChain(chainId)
  const envValue = process.env[chain.rpcEnvVar]
  if (!envValue) {
    throw new Error(`Missing RPC url for anchor chain ${chainId} (${chain.rpcEnvVar})`)
  }

  const fallbackUrls = (process.env[`${chain.rpcEnvVar}_FALLBACKS`] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return [envValue, ...fallbackUrls]
}

function getAnchorPrivateKey(): `0x${string}` {
  const privateKey = readSecret("TRACER_SIGNER_PRIVATE_KEY")
  if (!privateKey || !privateKey.startsWith("0x")) {
    throw new Error(
      "TRACER_SIGNER_PRIVATE_KEY (or TRACER_SIGNER_PRIVATE_KEY_FILE) must be a 0x-prefixed hex key"
    )
  }

  return privateKey as `0x${string}`
}

function getAnchorTransport(chainId: number) {
  const urls = getRpcUrls(chainId)
  return fallback(
    urls.map((url) =>
      http(url, {
        retryCount: 2,
        timeout: 10_000,
      })
    ),
    { rank: false }
  )
}

export function getAnchorAccount() {
  return privateKeyToAccount(getAnchorPrivateKey())
}

export function getAnchorWalletClient(): WalletClient<Transport, Chain, Account> {
  const chainId = getAnchorChainId()
  const chain = getChain(chainId)

  return createWalletClient({
    account: getAnchorAccount(),
    chain: chain.viemChain,
    transport: getAnchorTransport(chainId),
  })
}

export function getAnchorPublicClient(): PublicClient<Transport, Chain> {
  const chainId = getAnchorChainId()
  const chain = getChain(chainId)

  return createPublicClient({
    chain: chain.viemChain,
    transport: getAnchorTransport(chainId),
  })
}

export function getAnchorAddress(): `0x${string}` {
  const address = process.env.TRACER_ANCHOR_ADDRESS
  if (!address || !address.startsWith("0x")) {
    throw new Error("TRACER_ANCHOR_ADDRESS must be a 0x-prefixed address")
  }

  return address as `0x${string}`
}

export function getAnchorMaxBatchSize(): number {
  return Number.parseInt(process.env.ANCHOR_MAX_TRACES_PER_TX ?? "50", 10)
}

export function getAnchorMaxDataBytes(): number {
  return Number.parseInt(process.env.ANCHOR_MAX_DATA_BYTES ?? "4096", 10)
}

export function getAnchorMaxGasLimit(): bigint {
  return BigInt(process.env.ANCHOR_MAX_GAS_LIMIT ?? "600000")
}

export function getAnchorChainMetadata() {
  return getChain(getAnchorChainId())
}

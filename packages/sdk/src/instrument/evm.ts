/**
 * These EVM wrappers trace explicit wallet and public client actions without hard-linking to viem.
 * They use dynamic imports and best-effort receipt enrichment so agent execution stays non-blocking.
 */
import { getChain } from "@tracerlabs/shared"

import { getCurrentSession } from "../context"

interface ChainLike {
  id: number
}

interface AccountLike {
  address?: string
}

interface WalletClientLike {
  chain?: ChainLike
  account?: AccountLike
  waitForTransactionReceipt?: (args: { hash: `0x${string}` }) => Promise<{
    blockNumber?: bigint
    gasUsed?: bigint
    status?: "success" | "reverted"
  }>
}

interface PublicClientLike {
  chain?: ChainLike
}

type GenericRecord = Record<string, unknown>

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null
}

function getChainId(client: WalletClientLike | PublicClientLike): number | null {
  return client.chain?.id ?? null
}

function getWalletAddress(client: WalletClientLike): string {
  return client.account?.address ?? "0x0000000000000000000000000000000000000000"
}

function getChainMetadata(chainId: number): { name: string; blockExplorerUrl: string } {
  const chain = getChain(chainId)
  return {
    name: chain.name,
    blockExplorerUrl: chain.blockExplorerUrl,
  }
}

async function formatNativeValue(value: bigint): Promise<string> {
  try {
    const { formatEther } = await import("viem")
    return `${formatEther(value)} ETH`
  } catch {
    return `${value.toString()} wei`
  }
}

async function encodeWriteData(args: GenericRecord): Promise<string> {
  try {
    const { encodeFunctionData } = await import("viem")
    const abi = args.abi
    const functionName = args.functionName
    const functionArgs = Array.isArray(args.args) ? args.args : []

    if (!abi || typeof functionName !== "string") {
      return "0x"
    }

    return encodeFunctionData({
      abi: abi as Parameters<typeof encodeFunctionData>[0]["abi"],
      functionName,
      args: functionArgs as Parameters<typeof encodeFunctionData>[0]["args"],
    })
  } catch {
    return "0x"
  }
}

function stringifyBigInt(value: unknown): string | null {
  return typeof value === "bigint" ? value.toString() : null
}

async function patchReceipt(
  walletClient: WalletClientLike,
  eventId: string,
  hash: `0x${string}`
): Promise<void> {
  const session = getCurrentSession()
  if (!session || typeof walletClient.waitForTransactionReceipt !== "function") {
    return
  }

  try {
    const receipt = await walletClient.waitForTransactionReceipt({ hash })
    session.patchEvent(eventId, (event) => {
      if (!isRecord(event.payload)) {
        return event
      }

      return {
        ...event,
        payload: {
          ...event.payload,
          gasUsed: stringifyBigInt(receipt.gasUsed),
          blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
          status: receipt.status === "reverted" ? "reverted" : "success",
        },
      }
    })
  } catch (error) {
    session.patchEvent(eventId, (event) => {
      if (!isRecord(event.payload)) {
        return event
      }

      return {
        ...event,
        payload: {
          ...event.payload,
          status: "reverted",
          revertReason: error instanceof Error ? error.message : "Unknown receipt error",
        },
      }
    })
  }
}

async function buildWalletPayload(
  walletClient: WalletClientLike,
  methodName: "writeContract" | "sendTransaction" | "deployContract",
  args: unknown
): Promise<GenericRecord | null> {
  if (!isRecord(args)) {
    return null
  }

  const chainId = getChainId(walletClient)
  if (chainId === null) {
    return null
  }

  const chain = getChainMetadata(chainId)
  const value = typeof args.value === "bigint" ? args.value : 0n
  const gasLimit =
    typeof args.gas === "bigint" ? args.gas : typeof args.gasLimit === "bigint" ? args.gasLimit : 0n
  const data =
    typeof args.data === "string"
      ? args.data
      : methodName === "writeContract"
        ? await encodeWriteData(args)
        : typeof args.bytecode === "string"
          ? args.bytecode
          : "0x"

  return {
    hash: "",
    chainId,
    chainName: chain.name,
    from: getWalletAddress(walletClient),
    to:
      typeof args.to === "string"
        ? args.to
        : typeof args.address === "string"
          ? args.address
          : null,
    value: value.toString(),
    valueFormatted: await formatNativeValue(value),
    data,
    gasLimit: gasLimit.toString(),
    gasUsed: null,
    gasPrice: stringifyBigInt(args.gasPrice),
    maxFeePerGas: stringifyBigInt(args.maxFeePerGas),
    maxPriorityFeePerGas: stringifyBigInt(args.maxPriorityFeePerGas),
    nonce: typeof args.nonce === "number" ? args.nonce : 0,
    blockNumber: null,
    blockExplorerUrl: chain.blockExplorerUrl,
    status: "pending",
    revertReason: null,
    decodedFunction: {
      name: typeof args.functionName === "string" ? args.functionName : null,
      inputs: Array.isArray(args.args) ? { args: args.args } : null,
    },
    tokenTransfers: [],
    logs: [],
  }
}

export function wrapWalletClient<T extends WalletClientLike & GenericRecord>(walletClient: T): T {
  return new Proxy(walletClient, {
    get(target, property, receiver) {
      const originalValue = Reflect.get(target, property, receiver)
      if (
        property !== "writeContract" &&
        property !== "sendTransaction" &&
        property !== "deployContract"
      ) {
        return originalValue
      }

      if (typeof originalValue !== "function") {
        return originalValue
      }

      return async (args: unknown) => {
        const session = getCurrentSession()
        if (!session) {
          return Reflect.apply(originalValue, target, [args])
        }

        const payload = await buildWalletPayload(walletClient, property, isRecord(args) ? args : {})

        if (!payload) {
          return Reflect.apply(originalValue, target, [args])
        }

        const event = session.beginEvent("evm_tx", payload)

        try {
          const hash = (await Reflect.apply(originalValue, target, [args])) as `0x${string}`
          const completedPayload = {
            ...payload,
            hash,
          }
          event.complete(completedPayload)
          void patchReceipt(walletClient, event.id, hash)
          return hash
        } catch (error) {
          event.fail(error, {
            ...payload,
            status: "reverted",
            revertReason: error instanceof Error ? error.message : "Unknown wallet error",
          })
          throw error
        }
      }
    },
  })
}

export function wrapPublicClient<T extends PublicClientLike & GenericRecord>(publicClient: T): T {
  return new Proxy(publicClient, {
    get(target, property, receiver) {
      const originalValue = Reflect.get(target, property, receiver)
      if (property !== "readContract" && property !== "call") {
        return originalValue
      }

      if (typeof originalValue !== "function") {
        return originalValue
      }

      return async (args: unknown) => {
        const session = getCurrentSession()
        if (!session || !isRecord(args)) {
          return Reflect.apply(originalValue, target, [args])
        }

        const chainId = getChainId(publicClient)
        if (chainId === null) {
          return Reflect.apply(originalValue, target, [args])
        }

        const event = session.beginEvent("evm_contract_read", {
          chainId,
          contractAddress:
            typeof args.address === "string"
              ? args.address
              : typeof args.to === "string"
                ? args.to
                : "0x0000000000000000000000000000000000000000",
          functionName:
            typeof args.functionName === "string"
              ? args.functionName
              : property === "call"
                ? "call"
                : "unknown",
          inputs: Array.isArray(args.args) ? args.args : [],
          output: null,
          blockNumber:
            typeof args.blockNumber === "bigint"
              ? Number(args.blockNumber)
              : typeof args.blockNumber === "number"
                ? args.blockNumber
                : null,
        })

        try {
          const result = await Reflect.apply(originalValue, target, [args])
          event.complete({
            chainId,
            contractAddress:
              typeof args.address === "string"
                ? args.address
                : typeof args.to === "string"
                  ? args.to
                  : "0x0000000000000000000000000000000000000000",
            functionName:
              typeof args.functionName === "string"
                ? args.functionName
                : property === "call"
                  ? "call"
                  : "unknown",
            inputs: Array.isArray(args.args) ? args.args : [],
            output: result,
            blockNumber:
              typeof args.blockNumber === "bigint"
                ? Number(args.blockNumber)
                : typeof args.blockNumber === "number"
                  ? args.blockNumber
                  : null,
          })
          return result
        } catch (error) {
          event.fail(error)
          throw error
        }
      }
    },
  })
}

/**
 * Known ABI decoding enriches receipt logs with human-readable event names and basic transfer rows.
 * The decoder is best-effort: unknown logs remain intact instead of failing the whole webhook request.
 */
import { decodeEventLog } from "viem"

import { erc20Abi } from "../abis/erc20"
import { erc721Abi } from "../abis/erc721"
import { uniswapV3Abi } from "../abis/uniswap-v3"
import { wethAbi } from "../abis/weth"

interface ReceiptLogLike {
  address: string
  topics: readonly `0x${string}`[]
  data: `0x${string}`
}

interface DecodedLog {
  address: string
  topics: string[]
  data: string
  eventName: string | null
  decoded: Record<string, unknown> | null
}

interface TokenTransfer {
  token: string
  symbol: string | null
  decimals: number | null
  from: string
  to: string
  amount: string
  amountFormatted: string
}

const knownAbis = [erc20Abi, erc721Abi, uniswapV3Abi, wethAbi] as const

function normalizeArgs(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") {
    return null
  }

  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ])
  )
}

function toTokenTransfer(
  log: ReceiptLogLike,
  eventName: string,
  decoded: Record<string, unknown> | null
): TokenTransfer | null {
  if (!decoded) {
    return null
  }

  if (
    eventName === "Transfer" &&
    typeof decoded.from === "string" &&
    typeof decoded.to === "string" &&
    (typeof decoded.value === "string" || typeof decoded.tokenId === "string")
  ) {
    const amount = typeof decoded.value === "string" ? decoded.value : decoded.tokenId
    if (typeof amount !== "string") {
      return null
    }

    return {
      token: log.address,
      symbol: null,
      decimals: null,
      from: decoded.from,
      to: decoded.to,
      amount,
      amountFormatted: amount,
    }
  }

  if (
    eventName === "Deposit" &&
    typeof decoded.dst === "string" &&
    typeof decoded.wad === "string"
  ) {
    return {
      token: log.address,
      symbol: "WETH",
      decimals: 18,
      from: "0x0000000000000000000000000000000000000000",
      to: decoded.dst,
      amount: decoded.wad,
      amountFormatted: decoded.wad,
    }
  }

  if (
    eventName === "Withdrawal" &&
    typeof decoded.src === "string" &&
    typeof decoded.wad === "string"
  ) {
    return {
      token: log.address,
      symbol: "WETH",
      decimals: 18,
      from: decoded.src,
      to: "0x0000000000000000000000000000000000000000",
      amount: decoded.wad,
      amountFormatted: decoded.wad,
    }
  }

  return null
}

export function decodeKnownLogs(logs: ReceiptLogLike[]): {
  logs: DecodedLog[]
  tokenTransfers: TokenTransfer[]
} {
  const decodedLogs: DecodedLog[] = []
  const tokenTransfers: TokenTransfer[] = []

  for (const log of logs) {
    let decodedLog: DecodedLog = {
      address: log.address,
      topics: [...log.topics],
      data: log.data,
      eventName: null,
      decoded: null,
    }

    for (const abi of knownAbis) {
      try {
        if (log.topics.length === 0) {
          break
        }

        const decoded = decodeEventLog({
          abi,
          topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
          data: log.data,
        })
        const normalizedArgs = normalizeArgs(decoded.args)
        decodedLog = {
          address: log.address,
          topics: [...log.topics],
          data: log.data,
          eventName: decoded.eventName,
          decoded: normalizedArgs,
        }

        const tokenTransfer = toTokenTransfer(log, decoded.eventName, normalizedArgs)
        if (tokenTransfer) {
          tokenTransfers.push(tokenTransfer)
        }

        break
      } catch {}
    }

    decodedLogs.push(decodedLog)
  }

  return {
    logs: decodedLogs,
    tokenTransfers,
  }
}

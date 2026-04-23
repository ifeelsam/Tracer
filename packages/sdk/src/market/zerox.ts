/**
 * The 0x quote client captures cross-chain DEX routing metadata with a single endpoint and chain header.
 * Errors are converted into an explicit no-route result so quote sampling never interrupts agent execution.
 */
import { sha256Hex } from "@tracerlabs/shared"

export interface DexQuote {
  status: "ok" | "no_route"
  protocol: "0x"
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  priceImpactPct: number
  route: unknown[]
  capturedAt: number
  responseHash: string
}

const ZEROX_BASE_URL = "https://api.0x.org"

function noRouteQuote(tokenIn: string, tokenOut: string, amountIn: string): DexQuote {
  return {
    status: "no_route",
    protocol: "0x",
    tokenIn: tokenIn.toLowerCase(),
    tokenOut: tokenOut.toLowerCase(),
    amountIn,
    amountOut: "0",
    priceImpactPct: 0,
    route: [],
    capturedAt: Date.now(),
    responseHash: sha256Hex("no_route"),
  }
}

function toRoute(response: Record<string, unknown>): unknown[] {
  if (Array.isArray(response.route)) {
    return response.route
  }

  if (Array.isArray(response.sources)) {
    return response.sources
  }

  if (
    response.route &&
    typeof response.route === "object" &&
    "fills" in response.route &&
    Array.isArray(response.route.fills)
  ) {
    return response.route.fills
  }

  return []
}

export async function fetchDexQuote(
  chainId: number,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<DexQuote> {
  const apiKey = process.env.ZEROX_API_KEY
  if (!apiKey) {
    return noRouteQuote(tokenIn, tokenOut, amountIn)
  }

  const url = new URL("/swap/permit2/quote", ZEROX_BASE_URL)
  url.searchParams.set("chainId", String(chainId))
  url.searchParams.set("sellToken", tokenIn)
  url.searchParams.set("buyToken", tokenOut)
  url.searchParams.set("sellAmount", amountIn)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "0x-api-key": apiKey,
        "0x-chain-id": String(chainId),
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      return noRouteQuote(tokenIn, tokenOut, amountIn)
    }

    const rawBody = await response.text()
    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const estimatedPriceImpact = payload.estimatedPriceImpact

    return {
      status: "ok",
      protocol: "0x",
      tokenIn: tokenIn.toLowerCase(),
      tokenOut: tokenOut.toLowerCase(),
      amountIn,
      amountOut: typeof payload.buyAmount === "string" ? payload.buyAmount : "0",
      priceImpactPct:
        typeof estimatedPriceImpact === "string"
          ? Number.parseFloat(estimatedPriceImpact)
          : typeof estimatedPriceImpact === "number"
            ? estimatedPriceImpact
            : 0,
      route: toRoute(payload),
      capturedAt: Date.now(),
      responseHash: sha256Hex(rawBody),
    }
  } catch {
    return noRouteQuote(tokenIn, tokenOut, amountIn)
  }
}

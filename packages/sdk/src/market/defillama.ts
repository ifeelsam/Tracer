/**
 * DeFiLlama provides a free multi-chain price source that works across the supported EVM networks.
 * This client keeps a short in-memory cache so repeated enrichments don't spam the upstream API.
 */
interface TokenPrice {
  chainId: number
  tokenAddress: string
  priceUsd: number
  confidence: number | null
  source: "defillama"
  fetchedAt: number
}

interface CachedTokenPrice {
  expiresAt: number
  value: TokenPrice
}

const DEFILLAMA_BASE_URL = "https://coins.llama.fi"

const DEFILLAMA_CHAIN: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  137: "polygon",
  8453: "base",
  84532: "base",
  42161: "arbitrum",
  421614: "arbitrum",
}

const tokenPriceCache = new Map<string, CachedTokenPrice>()

function getCoinId(chainId: number, tokenAddress: string): string {
  const chainName = DEFILLAMA_CHAIN[chainId]
  if (!chainName) {
    throw new Error(`Unsupported DeFiLlama chainId: ${chainId}`)
  }

  return `${chainName}:${tokenAddress.toLowerCase()}`
}

function getCacheKey(chainId: number, tokenAddress: string, timestamp?: number): string {
  return `${chainId}:${tokenAddress.toLowerCase()}:${timestamp ?? "current"}`
}

export async function fetchTokenPrice(
  chainId: number,
  tokenAddress: string,
  timestamp?: number
): Promise<TokenPrice> {
  const cacheKey = getCacheKey(chainId, tokenAddress, timestamp)
  const cached = tokenPriceCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const coinId = getCoinId(chainId, tokenAddress)
  const endpoint = timestamp
    ? `${DEFILLAMA_BASE_URL}/prices/historical/${timestamp}/${coinId}`
    : `${DEFILLAMA_BASE_URL}/prices/current/${coinId}`

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      throw new Error("DeFiLlama request failed")
    }

    const payload = (await response.json()) as {
      coins?: Record<
        string,
        {
          price?: number
          confidence?: number | null
        }
      >
    }

    const coin = payload.coins?.[coinId]
    if (!coin?.price) {
      throw new Error("Token price missing from DeFiLlama response")
    }

    const tokenPrice: TokenPrice = {
      chainId,
      tokenAddress: tokenAddress.toLowerCase(),
      priceUsd: coin.price,
      confidence: coin.confidence ?? null,
      source: "defillama",
      fetchedAt: Date.now(),
    }

    tokenPriceCache.set(cacheKey, {
      value: tokenPrice,
      expiresAt: Date.now() + 60_000,
    })

    return tokenPrice
  } catch {
    const fallback: TokenPrice = {
      chainId,
      tokenAddress: tokenAddress.toLowerCase(),
      priceUsd: 0,
      confidence: null,
      source: "defillama",
      fetchedAt: Date.now(),
    }

    tokenPriceCache.set(cacheKey, {
      value: fallback,
      expiresAt: Date.now() + 60_000,
    })

    return fallback
  }
}

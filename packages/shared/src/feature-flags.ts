/**
 * Centralized feature flags for Tracer across apps/packages.
 * Flags are intentionally conservative to keep the hackathon demo scope tight.
 */
import { z } from "zod"

const featureFlagsSchema = z.object({
  keeperhub: z.boolean(),
  optionalUniswap: z.boolean(),
  optionalGensyn: z.boolean(),
  optional0g: z.boolean(),
})

export type FeatureFlags = z.infer<typeof featureFlagsSchema>

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  if (value === "1" || value.toLowerCase() === "true") return true
  if (value === "0" || value.toLowerCase() === "false") return false
  return fallback
}

/**
 * Reads server-side feature flags.
 *
 * Environment variables:
 * - TRACER_ENABLE_KEEPERHUB (default true)
 * - TRACER_ENABLE_OPTIONAL_UNISWAP (default false)
 * - TRACER_ENABLE_OPTIONAL_GENSYN (default false)
 * - TRACER_ENABLE_OPTIONAL_0G (default false)
 */
export function getServerFeatureFlags(): FeatureFlags {
  return featureFlagsSchema.parse({
    keeperhub: parseBoolean(process.env.TRACER_ENABLE_KEEPERHUB, true),
    optionalUniswap: parseBoolean(process.env.TRACER_ENABLE_OPTIONAL_UNISWAP, false),
    optionalGensyn: parseBoolean(process.env.TRACER_ENABLE_OPTIONAL_GENSYN, false),
    optional0g: parseBoolean(process.env.TRACER_ENABLE_OPTIONAL_0G, false),
  })
}

/**
 * Reads client-side feature flags. Only NEXT_PUBLIC_* variables are accessible.
 *
 * Environment variables:
 * - NEXT_PUBLIC_TRACER_ENABLE_KEEPERHUB (default true)
 * - NEXT_PUBLIC_TRACER_ENABLE_OPTIONAL_UNISWAP (default false)
 */
export function getClientFeatureFlags(): Pick<FeatureFlags, "keeperhub" | "optionalUniswap"> {
  return featureFlagsSchema.pick({ keeperhub: true, optionalUniswap: true }).parse({
    keeperhub: parseBoolean(process.env.NEXT_PUBLIC_TRACER_ENABLE_KEEPERHUB, true),
    optionalUniswap: parseBoolean(process.env.NEXT_PUBLIC_TRACER_ENABLE_OPTIONAL_UNISWAP, false),
  })
}

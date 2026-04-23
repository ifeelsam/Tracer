/**
 * These webhook schemas validate only the small subset of Alchemy payload structure we depend on.
 * The rest of the provider-specific payload is treated as opaque and ignored safely.
 */
import { z } from "zod"

export const alchemyWebhookSchema = z.object({
  event: z.object({
    activity: z
      .array(
        z.object({
          hash: z.string(),
        })
      )
      .default([]),
  }),
})

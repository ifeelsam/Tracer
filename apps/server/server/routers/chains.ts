/**
 * The chains router exposes registry-driven chain metadata to server and dashboard consumers.
 * It never hardcodes chain names outside the shared registry, preserving chain agnosticism.
 */
import { CHAINS, getActiveChain } from "@tracerlabs/shared"

import { publicProcedure, router } from "../trpc"

export const chainsRouter = router({
  listSupported: publicProcedure.query(() => {
    return Object.values(CHAINS)
  }),
  getActive: publicProcedure.query(() => {
    return getActiveChain()
  }),
})

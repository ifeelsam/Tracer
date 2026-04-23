/**
 * The root app router composes feature routers into the single tRPC API exposed by Next.
 * Routers are added incrementally so each slice can compile and ship independently.
 */
import { router } from "../trpc"
import { chainsRouter } from "./chains"

export const appRouter = router({
  chains: chainsRouter,
})

export type AppRouter = typeof appRouter

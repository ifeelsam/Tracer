/**
 * The root app router composes feature routers into the single tRPC API exposed by Next.
 * Routers are added incrementally so each slice can compile and ship independently.
 */
import { router } from "../trpc"
import { agentsRouter } from "./agents"
import { chainsRouter } from "./chains"
import { tracesRouter } from "./traces"

export const appRouter = router({
  agents: agentsRouter,
  chains: chainsRouter,
  traces: tracesRouter,
})

export type AppRouter = typeof appRouter

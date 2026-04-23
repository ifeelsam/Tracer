import { router } from "../trpc"
import { agentsRouter } from "./agents"
/**
 * The root app router composes feature routers into the single tRPC API exposed by Next.
 * Routers are added incrementally so each slice can compile and ship independently.
 */
import { analysisRouter } from "./analysis"
import { chainsRouter } from "./chains"
import { tracesRouter } from "./traces"
import { verifyRouter } from "./verify"

export const appRouter = router({
  analysis: analysisRouter,
  agents: agentsRouter,
  chains: chainsRouter,
  traces: tracesRouter,
  verify: verifyRouter,
})

export type AppRouter = typeof appRouter

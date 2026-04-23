/**
 * The tRPC route handler bridges App Router requests into the server router tree.
 * It is the single HTTP entrypoint for authenticated dashboard and worker API calls.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"

import { appRouter } from "../../../../server/routers/_app"
import { createTRPCContext } from "../../../../server/trpc"

function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext({ request }),
  })
}

export { handler as GET, handler as POST }

/**
 * The tRPC route handler bridges App Router requests into the server router tree.
 * It is the single HTTP entrypoint for authenticated dashboard and worker API calls.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"

import { appRouter } from "../../../../server/routers/_app"
import { createTRPCContext } from "../../../../server/trpc"

function getCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-trpc-source",
  }
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  const corsHeaders = getCorsHeaders()
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function handler(request: Request): Promise<Response> {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext({ request }),
  })
  return withCors(response)
}

function optionsHandler(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

export { handler as GET, optionsHandler as OPTIONS, handler as POST }

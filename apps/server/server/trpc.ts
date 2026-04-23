/**
 * This module defines the shared tRPC context and procedure factories for the server app.
 * Auth-aware procedures can reuse the same guard instead of re-implementing request checks per router.
 */
import { TRPCError, initTRPC } from "@trpc/server"
import superjson from "superjson"

import { getRequestUserId } from "./auth"

export async function createTRPCContext(opts: { request: Request }) {
  return {
    request: opts.request,
    userId: await getRequestUserId(opts.request),
  }
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
    })
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  })
})

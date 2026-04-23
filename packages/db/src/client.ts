/**
 * This module provides a single Prisma client instance for the current process.
 * Reusing the client avoids connection storms during local development and hot reloads.
 */
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

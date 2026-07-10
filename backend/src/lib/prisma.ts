import { PrismaClient } from '@prisma/client'

// Singleton — reuse connection in dev (Aviary pattern)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.ENVIRONMENT === 'local' ? ['warn', 'error'] : ['error'],
  })

if (process.env.ENVIRONMENT === 'local') {
  globalForPrisma.prisma = prisma
}

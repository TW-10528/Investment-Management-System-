// Aviary platform — JWT auth middleware

import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from '../lib/security'
import { prisma } from '../lib/prisma'
import type { HonoEnv } from '../types/index'

export type { HonoEnv }

export const auth = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ detail: 'Not authenticated' }, 401)
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    const user    = await prisma.user.findUnique({ where: { email: payload.sub } })
    if (!user || !user.isActive || user.status !== 'active') {
      return c.json({ detail: 'User inactive or not found' }, 401)
    }
    c.set('user', { id: user.id, email: user.email, role: user.role, fullName: user.fullName })
    await next()
  } catch {
    return c.json({ detail: 'Invalid or expired token' }, 401)
  }
})

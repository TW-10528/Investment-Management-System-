import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from '../lib/security'
import { prisma } from '../lib/prisma'

export type AuthVars = {
  Variables: {
    user: {
      id:       string
      email:    string
      role:     string
      fullName: string | null
    }
  }
}

// ── JWT auth middleware (Aviary pattern) ──────────────────────────────────────
export const auth = createMiddleware<AuthVars>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ detail: 'Not authenticated' }, 401)
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    const user = await prisma.user.findUnique({ where: { email: payload.sub } })
    if (!user || !user.isActive || user.status !== 'active') {
      return c.json({ detail: 'User inactive or not found' }, 401)
    }
    c.set('user', { id: user.id, email: user.email, role: user.role, fullName: user.fullName })
    await next()
  } catch {
    return c.json({ detail: 'Invalid or expired token' }, 401)
  }
})

// ── Admin guard ───────────────────────────────────────────────────────────────
export function requireAdmin(role: string): boolean {
  return role === 'admin'
}

// ── Edit guard (admin + finance) ──────────────────────────────────────────────
export function canEdit(role: string): boolean {
  return ['admin', 'finance_manager', 'finance_staff'].includes(role)
}

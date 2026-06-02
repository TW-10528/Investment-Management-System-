// Aviary platform — role guard middleware factory

import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types/index'

export function guard(...roles: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ detail: 'Insufficient permissions' }, 403)
    }
    return next()
  })
}

export function canEdit(role: string): boolean {
  return ['admin', 'finance_manager', 'finance_staff'].includes(role)
}

export function isAdmin(role: string): boolean {
  return role === 'admin'
}

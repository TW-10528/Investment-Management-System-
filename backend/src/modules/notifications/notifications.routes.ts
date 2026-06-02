// Notifications module — /api/v1/notifications

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const router = new Hono<HonoEnv>()
router.use('*', auth)

function notifDict(n: any) {
  return {
    id:         n.id,
    type:       n.type,
    title:      n.title,
    message:    n.message,
    link:       n.link,
    is_read:    n.isRead,
    metadata:   n.metadata,
    created_at: n.createdAt?.toISOString(),
  }
}

// GET /
router.get('/', async (c) => {
  const user      = c.get('user')
  const limit     = parseInt(c.req.query('limit') ?? '50')
  const unreadOnly = c.req.query('unread') === 'true'

  const where: any = { userEmail: user.email }
  if (unreadOnly) where.isRead = false

  const items = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
  const unreadCount = await prisma.notification.count({ where: { userEmail: user.email, isRead: false } })
  return c.json({ notifications: items.map(notifDict), unread_count: unreadCount })
})

// PATCH /read-all
router.patch('/read-all', async (c) => {
  const user = c.get('user')
  await prisma.notification.updateMany({ where: { userEmail: user.email, isRead: false }, data: { isRead: true } })
  return c.json({ message: 'All notifications marked as read' })
})

// PATCH /:id/read
router.patch('/:id/read', async (c) => {
  const user = c.get('user')
  const n    = await prisma.notification.findUnique({ where: { id: c.req.param('id') } })
  if (!n || n.userEmail !== user.email) return c.json({ detail: 'Not found' }, 404)
  const updated = await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } })
  return c.json(notifDict(updated))
})

export default router

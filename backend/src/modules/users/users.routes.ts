// Users module — /api/v1/users

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { guard } from '../../middleware/guard'
import * as UsersService from './users.service'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// GET /
router.get('/', guard('admin'), async (c) => {
  return c.json(await UsersService.listUsers())
})

// GET /pending-count
router.get('/pending-count', guard('admin'), async (c) => {
  const count = await UsersService.getPendingCount()
  return c.json({ count })
})

// POST /
router.post('/', guard('admin'), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    return c.json(await UsersService.createUser(body))
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// POST /:id/approve
router.post('/:id/approve', guard('admin'), async (c) => {
  const role = c.req.query('role')
  try {
    const updated = await UsersService.approveUser(c.req.param('id'), role)
    return c.json({ message: `${updated.full_name} approved.`, ...updated })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// POST /:id/reject
router.post('/:id/reject', guard('admin'), async (c) => {
  try {
    const updated = await UsersService.rejectUser(c.req.param('id'))
    return c.json({ message: `${updated.full_name}'s registration has been rejected.` })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// PUT /:id
router.put('/:id', guard('admin'), async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    return c.json(await UsersService.updateUser(c.req.param('id'), body))
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// DELETE /:id
router.delete('/:id', guard('admin'), async (c) => {
  const me = c.get('user')
  try {
    return c.json(await UsersService.deactivateUser(c.req.param('id'), me.id))
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

export default router

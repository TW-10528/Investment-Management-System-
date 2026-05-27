/** Users — /api/v1/users (admin only) */

import { Hono } from 'hono'
import { prisma } from '../lib/prisma'
import { hashPassword, checkPasswordStrength } from '../lib/security'
import { auth, type AuthVars } from '../middleware/auth'
import { config } from '../config/index'

const app = new Hono<AuthVars>()
app.use('*', auth)

function userDict(u: any) {
  return {
    id:           u.id,
    email:        u.email,
    full_name:    u.fullName,
    full_name_jp: u.fullNameJp,
    role:         u.role,
    status:       u.status,
    is_active:    u.isActive,
    last_login:   u.lastLogin?.toISOString() ?? null,
    created_at:   u.createdAt?.toISOString() ?? null,
  }
}

function requireAdmin(c: any) {
  if (c.get('user').role !== 'admin') {
    return c.json({ detail: 'Admin access required.' }, 403)
  }
  return null
}

// GET /
app.get('/', async (c) => {
  const err = requireAdmin(c)
  if (err) return err
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  return c.json(users.map(userDict))
})

// GET /pending-count
app.get('/pending-count', async (c) => {
  const err = requireAdmin(c)
  if (err) return err
  const count = await prisma.user.count({ where: { status: 'pending' } })
  return c.json({ count })
})

// POST /
app.post('/', async (c) => {
  const err = requireAdmin(c)
  if (err) return err

  const body = await c.req.json().catch(() => ({}))
  const { email, full_name, full_name_jp, password, role = 'finance_staff' } = body

  if (!email || !full_name || !password) return c.json({ detail: 'email, full_name, and password are required.' }, 400)

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (exists) return c.json({ detail: 'Email already registered.' }, 400)

  const active = await prisma.user.count({ where: { status: 'active' } })
  if (active >= config.maxActiveUsers) {
    return c.json({ detail: `System limit of ${config.maxActiveUsers} active users reached.` }, 400)
  }

  const pwErr = checkPasswordStrength(password)
  if (pwErr) return c.json({ detail: pwErr }, 400)

  const user = await prisma.user.create({
    data: {
      email:          email.toLowerCase(),
      fullName:       full_name,
      fullNameJp:     full_name_jp ?? null,
      hashedPassword: hashPassword(password),
      role:           role as any,
      status:         'active',
      isActive:       true,
    },
  })
  return c.json(userDict(user))
})

// POST /:id/approve
app.post('/:id/approve', async (c) => {
  const err = requireAdmin(c)
  if (err) return err

  const user = await prisma.user.findUnique({ where: { id: c.req.param('id') } })
  if (!user) return c.json({ detail: 'User not found.' }, 404)
  if (user.status !== 'pending') return c.json({ detail: `User is not pending (status: ${user.status}).` }, 400)

  const active = await prisma.user.count({ where: { status: 'active' } })
  if (active >= config.maxActiveUsers) {
    return c.json({ detail: `Cannot approve: system already has ${config.maxActiveUsers} active users.` }, 400)
  }

  const roleParam = c.req.query('role')

  const updated = await prisma.user.update({
    where: { id: user.id },
    data:  {
      status:   'active',
      isActive: true,
      ...(roleParam ? { role: roleParam as any } : {}),
    },
  })
  return c.json({ message: `${updated.fullName} approved.`, ...userDict(updated) })
})

// POST /:id/reject
app.post('/:id/reject', async (c) => {
  const err = requireAdmin(c)
  if (err) return err

  const user = await prisma.user.findUnique({ where: { id: c.req.param('id') } })
  if (!user) return c.json({ detail: 'User not found.' }, 404)
  if (user.status !== 'pending') return c.json({ detail: 'User is not pending.' }, 400)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data:  { status: 'inactive', isActive: false },
  })
  return c.json({ message: `${updated.fullName}'s registration has been rejected.` })
})

// PUT /:id
app.put('/:id', async (c) => {
  const err = requireAdmin(c)
  if (err) return err

  const user = await prisma.user.findUnique({ where: { id: c.req.param('id') } })
  if (!user) return c.json({ detail: 'User not found.' }, 404)

  const body: any = await c.req.json().catch(() => ({}))
  const data: any = {}

  if (body.full_name    !== undefined) data.fullName    = body.full_name
  if (body.full_name_jp !== undefined) data.fullNameJp  = body.full_name_jp
  if (body.role         !== undefined) data.role        = body.role
  if (body.is_active    !== undefined) {
    data.isActive = body.is_active
    data.status   = body.is_active ? 'active' : 'inactive'
  }
  if (body.password) {
    const pwErr = checkPasswordStrength(body.password)
    if (pwErr) return c.json({ detail: pwErr }, 400)
    data.hashedPassword = hashPassword(body.password)
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return c.json(userDict(updated))
})

// DELETE /:id
app.delete('/:id', async (c) => {
  const err = requireAdmin(c)
  if (err) return err

  const me = c.get('user')
  if (c.req.param('id') === me.id) return c.json({ detail: 'You cannot deactivate your own account.' }, 400)

  const user = await prisma.user.findUnique({ where: { id: c.req.param('id') } })
  if (!user) return c.json({ detail: 'User not found.' }, 404)

  await prisma.user.update({ where: { id: user.id }, data: { isActive: false, status: 'inactive' } })
  return c.json({ message: `${user.email} deactivated.` })
})

export default app

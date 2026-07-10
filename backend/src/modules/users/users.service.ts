// Users business logic

import { prisma } from '../../lib/prisma'
import { hashPassword, checkPasswordStrength } from '../../lib/security'
import { notifyUser, notifyAllAdmins } from '../../services/notificationService'
import { config } from '../../config/index'

export function userDict(u: any) {
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

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  return users.map(userDict)
}

export async function getPendingCount() {
  return prisma.user.count({ where: { status: 'pending' } })
}

export async function createUser(input: {
  email:        string
  full_name:    string
  full_name_jp?: string
  password:     string
  role?:        string
}) {
  if (!input.email || !input.full_name || !input.password) {
    throw Object.assign(new Error('email, full_name, and password are required.'), { status: 400 })
  }

  const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (exists) throw Object.assign(new Error('Email already registered.'), { status: 400 })

  const active = await prisma.user.count({ where: { status: 'active' } })
  if (active >= config.maxActiveUsers) {
    throw Object.assign(new Error(`System limit of ${config.maxActiveUsers} active users reached.`), { status: 400 })
  }

  const pwErr = checkPasswordStrength(input.password)
  if (pwErr) throw Object.assign(new Error(pwErr), { status: 400 })

  const user = await prisma.user.create({
    data: {
      email:          input.email.toLowerCase(),
      fullName:       input.full_name,
      fullNameJp:     input.full_name_jp ?? null,
      hashedPassword: hashPassword(input.password),
      role:           (input.role ?? 'finance_staff') as any,
      status:         'active',
      isActive:       true,
    },
  })
  return userDict(user)
}

export async function approveUser(id: string, role?: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 })
  if (user.status !== 'pending') {
    throw Object.assign(new Error(`User is not pending (status: ${user.status}).`), { status: 400 })
  }

  const active = await prisma.user.count({ where: { status: 'active' } })
  if (active >= config.maxActiveUsers) {
    throw Object.assign(new Error(`Cannot approve: system already has ${config.maxActiveUsers} active users.`), { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data:  { status: 'active', isActive: true, ...(role ? { role: role as any } : {}) },
  })

  await notifyUser(user.email, {
    type:    'user_approved',
    title:   'Account Approved ✓',
    message: `Your account has been approved with role: ${role ?? user.role}. You can now sign in.`,
    link:    '/',
  })

  return userDict(updated)
}

export async function rejectUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 })
  if (user.status !== 'pending') throw Object.assign(new Error('User is not pending.'), { status: 400 })

  const updated = await prisma.user.update({
    where: { id: user.id },
    data:  { status: 'inactive', isActive: false },
  })

  await notifyUser(user.email, {
    type:    'user_rejected',
    title:   'Account Request Declined',
    message: 'Your account request was not approved. Contact your administrator for details.',
    link:    '/login',
  })

  return userDict(updated)
}

export async function updateUser(id: string, body: any) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 })

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
    if (pwErr) throw Object.assign(new Error(pwErr), { status: 400 })
    data.hashedPassword = hashPassword(body.password)
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return userDict(updated)
}

export async function deactivateUser(id: string, requesterId: string) {
  if (id === requesterId) {
    throw Object.assign(new Error('You cannot deactivate your own account.'), { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 })

  await prisma.user.update({ where: { id: user.id }, data: { isActive: false, status: 'inactive' } })
  return { message: `${user.email} deactivated.` }
}

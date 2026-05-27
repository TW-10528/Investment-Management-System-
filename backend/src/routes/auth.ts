/**
 * Auth routes — /api/v1/auth
 * Mirrors the original FastAPI auth.py exactly.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  hashPassword, verifyPassword, createAccessToken,
  checkPasswordStrength, generateOtp,
} from '../lib/security'
import { sendOtpEmail, sendAdminNotification } from '../services/emailService'
import { config } from '../config/index'
import { rateLimit } from '../middleware/rateLimit'
import { auth, type AuthVars } from '../middleware/auth'

const app = new Hono<AuthVars>()

// ── In-memory login-attempt tracker (mirrors Python) ─────────────────────────
const loginAttempts = new Map<string, Date[]>()

function checkLockout(email: string): { locked: boolean; msg?: string } {
  const now        = new Date()
  const windowMs   = config.lockoutWindowMinutes * 60_000
  const cutoff     = new Date(now.getTime() - windowMs)
  const attempts   = (loginAttempts.get(email) ?? []).filter(t => t > cutoff)
  loginAttempts.set(email, attempts)

  if (attempts.length >= config.maxLoginAttempts) {
    const lockUntil  = new Date(attempts[attempts.length - 1].getTime() + config.lockoutMinutes * 60_000)
    if (now < lockUntil) {
      const remaining = Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 60_000))
      return { locked: true, msg: `Too many failed attempts. Try again in ${remaining} minute(s).` }
    }
  }
  return { locked: false }
}

function recordFailed(email: string) {
  const list = loginAttempts.get(email) ?? []
  list.push(new Date())
  loginAttempts.set(email, list)
}

function clearAttempts(email: string) {
  loginAttempts.delete(email)
}

const SELF_SIGNUP_ROLES = new Set(['user', 'board_member', 'finance_staff', 'finance_manager'])

// ── POST /signup ──────────────────────────────────────────────────────────────
app.post('/signup', rateLimit(5, 60), async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body) return c.json({ detail: 'Invalid JSON' }, 400)

  const schema = z.object({
    full_name: z.string().min(1),
    email:     z.string().email(),
    password:  z.string().min(1),
    role:      z.string().optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ detail: parsed.error.issues[0].message }, 400)

  const { full_name, email: rawEmail, password, role: rawRole } = parsed.data
  const email = rawEmail.toLowerCase().trim()

  if (!full_name.trim()) return c.json({ detail: 'Full name is required.' }, 400)

  const pwErr = checkPasswordStrength(password)
  if (pwErr) return c.json({ detail: pwErr }, 400)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return c.json({ detail: 'An account with this email already exists.' }, 400)

  const safeRole = (rawRole && SELF_SIGNUP_ROLES.has(rawRole)) ? rawRole : 'user'

  const user = await prisma.user.create({
    data: {
      email,
      fullName:       full_name.trim(),
      hashedPassword: hashPassword(password),
      role:           safeRole as any,
      status:         'pending',
      isActive:       false,
    },
  })

  // Admin notification
  const adminTarget = config.adminEmail ?? 'admin@thirdwave.co.jp'
  await sendAdminNotification(adminTarget, user.fullName ?? '', user.email)

  return c.json({
    message:   'Registration submitted successfully. Your account is pending administrator approval.',
    email:     user.email,
    full_name: user.fullName,
    status:    user.status,
  })
})

// ── POST /login (OAuth2 form-data) ───────────────────────────────────────────
app.post('/login', rateLimit(10, 60), async (c) => {
  const contentType = c.req.header('content-type') ?? ''
  let username = ''
  let password = ''

  if (contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody()
    username   = (body['username'] as string ?? '').toLowerCase().trim()
    password   = body['password'] as string ?? ''
  } else {
    // JSON fallback
    const body = await c.req.json().catch(() => ({}))
    username   = (body.username ?? body.email ?? '').toLowerCase().trim()
    password   = body.password ?? ''
  }

  const lockout = checkLockout(username)
  if (lockout.locked) return c.json({ detail: lockout.msg }, 429)

  const user = await prisma.user.findUnique({ where: { email: username } })
  if (!user || !verifyPassword(password, user.hashedPassword)) {
    recordFailed(username)
    const attempts = loginAttempts.get(username)?.length ?? 0
    const left     = Math.max(0, config.maxLoginAttempts - attempts)
    let detail     = 'Invalid email or password.'
    if (left <= 2) detail += ` ${left} attempt(s) left before lockout.`
    return c.json({ detail }, 401)
  }

  if (user.status === 'pending') {
    return c.json({ detail: 'Your account is awaiting administrator approval.' }, 403)
  }
  if (user.status === 'inactive' || !user.isActive) {
    return c.json({ detail: 'Your account has been deactivated. Contact your administrator.' }, 403)
  }

  clearAttempts(username)
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

  const token = createAccessToken({ sub: user.email, role: user.role, name: user.fullName ?? '' })

  return c.json({
    access_token: token,
    token_type:   'bearer',
    role:         user.role,
    name:         user.fullName,
    email:        user.email,
  })
})

// ── GET /me ───────────────────────────────────────────────────────────────────
app.get('/me', auth, (c) => {
  const u = c.get('user')
  return c.json({
    email:     u.email,
    role:      u.role,
    name:      u.fullName,
    full_name: u.fullName,
  })
})

// ── POST /forgot-password ─────────────────────────────────────────────────────
app.post('/forgot-password', rateLimit(5, 60), async (c) => {
  const body  = await c.req.json().catch(() => ({}))
  const email = (body.email ?? '').toLowerCase().trim()
  if (!email) return c.json({ detail: 'Email is required.' }, 400)

  const user = await prisma.user.findFirst({ where: { email, status: 'active' } })
  if (!user) {
    if (config.revealEmailNotFound) {
      return c.json({ detail: 'No active account found with that email. Contact your administrator.' }, 404)
    }
    return c.json({ message: 'If that email exists, an OTP has been sent.' })
  }

  // Invalidate old OTPs
  await prisma.otpToken.updateMany({ where: { email, used: false }, data: { used: true } })

  const otp       = generateOtp()
  const expiresAt = new Date(Date.now() + config.otpExpireMinutes * 60_000)
  await prisma.otpToken.create({ data: { email, token: otp, expiresAt } })

  const sent = await sendOtpEmail(email, otp, user.fullName ?? 'User')
  if (!sent) return c.json({ detail: 'Could not send email. Contact your administrator.' }, 503)

  const response: Record<string, unknown> = {
    message: `OTP sent to ${email}. Valid for ${config.otpExpireMinutes} minutes.`,
  }
  // Dev mode: expose OTP in response
  if (!config.smtpUser || !config.smtpPassword) {
    response.dev_mode = true
    response.dev_otp  = otp
  }
  return c.json(response)
})

// ── POST /verify-otp ──────────────────────────────────────────────────────────
app.post('/verify-otp', async (c) => {
  const { email, otp } = await c.req.json().catch(() => ({}))
  const rec = await prisma.otpToken.findFirst({
    where: {
      email:     email?.toLowerCase?.()?.trim?.(),
      token:     otp,
      used:      false,
      expiresAt: { gt: new Date() },
    },
  })
  if (!rec) return c.json({ detail: 'Invalid or expired code. Request a new one.' }, 400)
  return c.json({ valid: true })
})

// ── POST /reset-password ──────────────────────────────────────────────────────
app.post('/reset-password', async (c) => {
  const { email: rawEmail, otp, new_password } = await c.req.json().catch(() => ({}))
  const email = rawEmail?.toLowerCase?.()?.trim?.()

  const rec = await prisma.otpToken.findFirst({
    where: { email, token: otp, used: false, expiresAt: { gt: new Date() } },
  })
  if (!rec) return c.json({ detail: 'Invalid or expired code.' }, 400)

  const pwErr = checkPasswordStrength(new_password)
  if (pwErr) return c.json({ detail: pwErr }, 400)

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return c.json({ detail: 'User not found.' }, 404)

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { hashedPassword: hashPassword(new_password) } }),
    prisma.otpToken.update({ where: { id: rec.id }, data: { used: true } }),
  ])

  return c.json({ message: 'Password reset successfully. You can now sign in.' })
})

export default app

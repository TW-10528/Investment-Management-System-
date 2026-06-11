// Auth module — /api/v1/auth

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { rateLimit } from '../../middleware/rateLimit'
import { SignupSchema, ForgotPasswordSchema, VerifyOtpSchema, ResetPasswordSchema } from './auth.schema'
import * as AuthService from './auth.service'
import * as UsersService from '../users/users.service'
import { prisma } from '../../lib/prisma'

const router = new Hono<HonoEnv>()

// POST /signup
router.post('/signup', rateLimit(5, 60), async (c) => {
  const body   = await c.req.json().catch(() => null)
  if (!body)   return c.json({ detail: 'Invalid JSON' }, 400)

  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) return c.json({ detail: parsed.error.issues[0].message }, 400)

  try {
    const user = await AuthService.signup(parsed.data)
    return c.json({
      message:   'Registration submitted successfully. Your account is pending administrator approval.',
      email:     user.email,
      full_name: user.fullName,
      status:    user.status,
    })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// POST /login  (accepts form-data or JSON)
router.post('/login', rateLimit(10, 60), async (c) => {
  const contentType = c.req.header('content-type') ?? ''
  let username = ''
  let password = ''

  if (contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody()
    username   = (body['username'] as string ?? '').toLowerCase().trim()
    password   = body['password']  as string ?? ''
  } else {
    const body = await c.req.json().catch(() => ({}))
    username   = (body.username ?? body.email ?? '').toLowerCase().trim()
    password   = body.password ?? ''
  }

  try {
    const { token, user } = await AuthService.login(username, password)
    return c.json({
      access_token: token,
      token_type:   'bearer',
      role:         user.role,
      name:         user.fullName,
      email:        user.email,
    })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 401)
  }
})

// GET /me
router.get('/me', auth, async (c) => {
  const u    = c.get('user')
  const full = await prisma.user.findUnique({ where: { id: u.id } })
  return c.json({
    email:       u.email,
    role:        u.role,
    name:        u.fullName,
    full_name:   u.fullName,
    preferences: full?.preferences ?? null,
  })
})

// PATCH /me/preferences  — any authenticated user updates their own UI preferences
router.patch('/me/preferences', auth, async (c) => {
  const u    = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const prefs = body?.preferences ?? body
  try {
    const updated = await UsersService.updatePreferences(u.id, prefs)
    return c.json({ preferences: updated.preferences })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// POST /forgot-password
router.post('/forgot-password', rateLimit(5, 60), async (c) => {
  const body   = await c.req.json().catch(() => ({}))
  const parsed = ForgotPasswordSchema.safeParse(body)
  if (!parsed.success) return c.json({ detail: 'Email is required.' }, 400)

  try {
    const result = await AuthService.forgotPassword(parsed.data.email)
    const res: Record<string, unknown> = { message: result.message }
    if (result.devOtp) { res.dev_mode = true; res.dev_otp = result.devOtp }
    return c.json(res)
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

// POST /verify-otp
router.post('/verify-otp', async (c) => {
  const body   = await c.req.json().catch(() => ({}))
  const parsed = VerifyOtpSchema.safeParse(body)
  if (!parsed.success) return c.json({ detail: 'email and otp are required.' }, 400)

  const valid = await AuthService.verifyOtp(parsed.data.email, parsed.data.otp)
  if (!valid) return c.json({ detail: 'Invalid or expired code. Request a new one.' }, 400)
  return c.json({ valid: true })
})

// POST /reset-password
router.post('/reset-password', async (c) => {
  const body   = await c.req.json().catch(() => ({}))
  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) return c.json({ detail: parsed.error.issues[0].message }, 400)

  try {
    await AuthService.resetPassword(
      parsed.data.email.toLowerCase().trim(),
      parsed.data.otp,
      parsed.data.new_password,
    )
    return c.json({ message: 'Password reset successfully. You can now sign in.' })
  } catch (err: any) {
    return c.json({ detail: err.message }, err.status ?? 400)
  }
})

export default router

// Auth business logic

import { prisma } from '../../lib/prisma'
import {
  hashPassword, verifyPassword, createAccessToken,
  checkPasswordStrength, generateOtp,
} from '../../lib/security'
import { sendOtpEmail, sendAdminNotification } from '../../services/emailService'
import { notifyAllAdmins } from '../../services/notificationService'
import { config } from '../../config/index'

// ── Lockout tracker ───────────────────────────────────────────────────────────

const loginAttempts = new Map<string, Date[]>()

export function checkLockout(email: string): { locked: boolean; msg?: string } {
  const now      = new Date()
  const windowMs = config.lockoutWindowMinutes * 60_000
  const cutoff   = new Date(now.getTime() - windowMs)
  const attempts = (loginAttempts.get(email) ?? []).filter(t => t > cutoff)
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

export function recordFailed(email: string) {
  const list = loginAttempts.get(email) ?? []
  list.push(new Date())
  loginAttempts.set(email, list)
}

export function clearAttempts(email: string) {
  loginAttempts.delete(email)
}

// ── Signup ────────────────────────────────────────────────────────────────────

const SELF_SIGNUP_ROLES = new Set(['user', 'board_member', 'finance_staff', 'finance_manager'])

export async function signup(input: {
  full_name: string
  email:     string
  password:  string
  role?:     string
}) {
  const email    = input.email.toLowerCase().trim()
  const fullName = input.full_name.trim()
  if (!fullName) throw Object.assign(new Error('Full name is required.'), { status: 400 })

  const pwErr = checkPasswordStrength(input.password)
  if (pwErr)  throw Object.assign(new Error(pwErr), { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing)  throw Object.assign(new Error('An account with this email already exists.'), { status: 400 })

  const safeRole = (input.role && SELF_SIGNUP_ROLES.has(input.role)) ? input.role : 'user'

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      hashedPassword: hashPassword(input.password),
      role:           safeRole as any,
      status:         'pending',
      isActive:       false,
    },
  })

  const adminTarget = config.adminEmail ?? 'admin@thirdwave.co.jp'
  await sendAdminNotification(adminTarget, user.fullName ?? '', user.email)
  await notifyAllAdmins({
    type:     'user_registered',
    title:    'New User Registration',
    message:  `${user.fullName ?? user.email} (${safeRole.replace('_', ' ')}) is requesting access.`,
    link:     '/users',
    metadata: { email: user.email, role: safeRole },
  })

  return user
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  const email = username.toLowerCase().trim()

  const lockout = checkLockout(email)
  if (lockout.locked) throw Object.assign(new Error(lockout.msg!), { status: 429 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !verifyPassword(password, user.hashedPassword)) {
    recordFailed(email)
    const attempts = loginAttempts.get(email)?.length ?? 0
    const left     = Math.max(0, config.maxLoginAttempts - attempts)
    let msg        = 'Invalid email or password.'
    if (left <= 2) msg += ` ${left} attempt(s) left before lockout.`
    throw Object.assign(new Error(msg), { status: 401 })
  }

  if (user.status === 'pending') {
    throw Object.assign(new Error('Your account is awaiting administrator approval.'), { status: 403 })
  }
  if (user.status === 'inactive' || !user.isActive) {
    throw Object.assign(new Error('Your account has been deactivated. Contact your administrator.'), { status: 403 })
  }

  clearAttempts(email)
  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

  const token = createAccessToken({ sub: user.email, role: user.role, name: user.fullName ?? '' })
  return { token, user }
}

// ── OTP / Password reset ──────────────────────────────────────────────────────

export async function forgotPassword(email: string) {
  const user = await prisma.user.findFirst({ where: { email, status: 'active' } })
  if (!user) {
    if (config.revealEmailNotFound) {
      throw Object.assign(new Error('No active account found with that email. Contact your administrator.'), { status: 404 })
    }
    return { message: 'If that email exists, an OTP has been sent.', devOtp: undefined as string | undefined }
  }

  await prisma.otpToken.updateMany({ where: { email, used: false }, data: { used: true } })

  const otp       = generateOtp()
  const expiresAt = new Date(Date.now() + config.otpExpireMinutes * 60_000)
  await prisma.otpToken.create({ data: { email, token: otp, expiresAt } })

  const sent = await sendOtpEmail(email, otp, user.fullName ?? 'User')
  if (!sent) throw Object.assign(new Error('Could not send email. Contact your administrator.'), { status: 503 })

  return {
    message: `OTP sent to ${email}. Valid for ${config.otpExpireMinutes} minutes.`,
    devOtp:  (!config.smtpUser || !config.smtpPassword) ? otp : undefined,
  }
}

export async function verifyOtp(email: string, otp: string): Promise<boolean> {
  const rec = await prisma.otpToken.findFirst({
    where: { email: email.toLowerCase().trim(), token: otp, used: false, expiresAt: { gt: new Date() } },
  })
  return !!rec
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  const rec = await prisma.otpToken.findFirst({
    where: { email, token: otp, used: false, expiresAt: { gt: new Date() } },
  })
  if (!rec) throw Object.assign(new Error('Invalid or expired code.'), { status: 400 })

  const pwErr = checkPasswordStrength(newPassword)
  if (pwErr) throw Object.assign(new Error(pwErr), { status: 400 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 })

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { hashedPassword: hashPassword(newPassword) } }),
    prisma.otpToken.update({ where: { id: rec.id }, data: { used: true } }),
  ])
}

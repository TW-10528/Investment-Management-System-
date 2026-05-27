import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config/index'

// ── Password ─────────────────────────────────────────────────────────────────

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12)
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}

// ── JWT ───────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub:  string   // email
  role: string
  name: string
}

export function createAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.secretKey, {
    expiresIn: `${config.accessTokenExpireMinutes}m`,
  })
}

export function verifyAccessToken(token: string): JWTPayload & { exp: number } {
  return jwt.verify(token, config.secretKey) as JWTPayload & { exp: number }
}

// ── Password strength (mirrors Python backend rules) ─────────────────────────

export function checkPasswordStrength(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  const score = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length
  if (score < 2) return 'Password is too weak. Use uppercase letters and numbers.'
  return null
}

// ── OTP ───────────────────────────────────────────────────────────────────────

import crypto from 'crypto'

export function generateOtp(length = 6): string {
  return Array.from({ length }, () => crypto.randomInt(0, 10)).join('')
}

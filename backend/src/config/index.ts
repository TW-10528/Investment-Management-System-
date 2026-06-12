// ── Config loader (Aviary pattern: centralised env access) ───────────────────

function get(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}
function getInt(key: string, fallback: number): number {
  const v = process.env[key]
  return v ? parseInt(v, 10) : fallback
}
function getBool(key: string, fallback: boolean): boolean {
  const v = process.env[key]
  if (v === undefined) return fallback
  return v.toLowerCase() === 'true'
}

export const config = {
  port:        getInt('PORT', 8001),
  environment: get('ENVIRONMENT', 'local'),

  // JWT
  secretKey:                 get('SECRET_KEY', 'change-this-in-production'),
  accessTokenExpireMinutes:  getInt('ACCESS_TOKEN_EXPIRE_MINUTES', 480),

  // CORS
  allowedOrigins: get(
    'ALLOWED_ORIGINS',
    'http://localhost:5173,http://localhost:5174,http://localhost:3000',
  ).split(',').map(s => s.trim()),

  // Email / OTP
  smtpHost:          get('SMTP_HOST', 'smtp.office365.com'),
  smtpPort:          getInt('SMTP_PORT', 587),
  smtpUser:          get('SMTP_USER', '') || null,
  smtpPassword:      get('SMTP_PASSWORD', '') || null,
  smtpFrom:          get('SMTP_FROM', 'Thirdwave IMS <noreply@thirdwave.co.jp>'),
  otpExpireMinutes:  getInt('OTP_EXPIRE_MINUTES', 10),

  // Login lockout
  maxLoginAttempts:      getInt('MAX_LOGIN_ATTEMPTS', 5),
  lockoutWindowMinutes:  getInt('LOCKOUT_WINDOW_MINUTES', 10),
  lockoutMinutes:        getInt('LOCKOUT_MINUTES', 15),

  // Admin
  adminEmail: get('ADMIN_EMAIL', '') || null,

  // Storage
  uploadDir: get('UPLOAD_DIR', './uploads'),

  // Misc
  revealEmailNotFound: getBool('REVEAL_EMAIL_NOT_FOUND', true),
  maxActiveUsers:      5,
}

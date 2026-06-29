"use strict";
// ── Config loader (Aviary pattern: centralised env access) ───────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
function get(key, fallback = '') {
    return process.env[key] ?? fallback;
}
function getInt(key, fallback) {
    const v = process.env[key];
    return v ? parseInt(v, 10) : fallback;
}
function getBool(key, fallback) {
    const v = process.env[key];
    if (v === undefined)
        return fallback;
    return v.toLowerCase() === 'true';
}
exports.config = {
    port: getInt('PORT', 8005),
    environment: get('ENVIRONMENT', 'local'),
    // JWT
    secretKey: get('SECRET_KEY', 'change-this-in-production'),
    accessTokenExpireMinutes: getInt('ACCESS_TOKEN_EXPIRE_MINUTES', 480),
    // CORS
    allowedOrigins: get('ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:5174,http://localhost:3000,https://investment-mgmt.twave.co.jp').split(',').map(s => s.trim()),
    // Email / OTP
    smtpHost: get('SMTP_HOST', 'smtp.office365.com'),
    smtpPort: getInt('SMTP_PORT', 587),
    smtpUser: get('SMTP_USER', '') || null,
    smtpPassword: get('SMTP_PASSWORD', '') || null,
    smtpFrom: get('SMTP_FROM', 'Thirdwave IMS <noreply@thirdwave.co.jp>'),
    otpExpireMinutes: getInt('OTP_EXPIRE_MINUTES', 10),
    // Login lockout
    maxLoginAttempts: getInt('MAX_LOGIN_ATTEMPTS', 5),
    lockoutWindowMinutes: getInt('LOCKOUT_WINDOW_MINUTES', 10),
    lockoutMinutes: getInt('LOCKOUT_MINUTES', 15),
    // Admin
    adminEmail: get('ADMIN_EMAIL', '') || null,
    // Storage
    uploadDir: get('UPLOAD_DIR', './uploads'),
    // AI extraction
    aiModelUrl: get('AI_MODEL_URL', 'https://tw-gateway.twave.co.jp'),
    aiModelName: get('AI_MODEL_NAME', 'Qwen/Qwen3.6-35B-A3B-FP8'),
    aiApiKey: get('AI_API_KEY', ''),
    // Misc
    revealEmailNotFound: getBool('REVEAL_EMAIL_NOT_FOUND', true),
    maxActiveUsers: 5,
};
//# sourceMappingURL=index.js.map
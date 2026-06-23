"use strict";
// Auth business logic
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkLockout = checkLockout;
exports.recordFailed = recordFailed;
exports.clearAttempts = clearAttempts;
exports.signup = signup;
exports.login = login;
exports.forgotPassword = forgotPassword;
exports.verifyOtp = verifyOtp;
exports.resetPassword = resetPassword;
const prisma_1 = require("../../lib/prisma");
const security_1 = require("../../lib/security");
const emailService_1 = require("../../services/emailService");
const notificationService_1 = require("../../services/notificationService");
const index_1 = require("../../config/index");
// ── Lockout tracker ───────────────────────────────────────────────────────────
const loginAttempts = new Map();
function checkLockout(email) {
    const now = new Date();
    const windowMs = index_1.config.lockoutWindowMinutes * 60_000;
    const cutoff = new Date(now.getTime() - windowMs);
    const attempts = (loginAttempts.get(email) ?? []).filter(t => t > cutoff);
    loginAttempts.set(email, attempts);
    if (attempts.length >= index_1.config.maxLoginAttempts) {
        const lockUntil = new Date(attempts[attempts.length - 1].getTime() + index_1.config.lockoutMinutes * 60_000);
        if (now < lockUntil) {
            const remaining = Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 60_000));
            return { locked: true, msg: `Too many failed attempts. Try again in ${remaining} minute(s).` };
        }
    }
    return { locked: false };
}
function recordFailed(email) {
    const list = loginAttempts.get(email) ?? [];
    list.push(new Date());
    loginAttempts.set(email, list);
}
function clearAttempts(email) {
    loginAttempts.delete(email);
}
// ── Signup ────────────────────────────────────────────────────────────────────
const SELF_SIGNUP_ROLES = new Set(['user', 'board_member', 'finance_staff', 'finance_manager']);
async function signup(input) {
    const email = input.email.toLowerCase().trim();
    const fullName = input.full_name.trim();
    if (!fullName)
        throw Object.assign(new Error('Full name is required.'), { status: 400 });
    const pwErr = (0, security_1.checkPasswordStrength)(input.password);
    if (pwErr)
        throw Object.assign(new Error(pwErr), { status: 400 });
    const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (existing)
        throw Object.assign(new Error('An account with this email already exists.'), { status: 400 });
    const safeRole = (input.role && SELF_SIGNUP_ROLES.has(input.role)) ? input.role : 'user';
    const user = await prisma_1.prisma.user.create({
        data: {
            email,
            fullName,
            hashedPassword: (0, security_1.hashPassword)(input.password),
            role: safeRole,
            status: 'pending',
            isActive: false,
        },
    });
    const adminTarget = index_1.config.adminEmail ?? 'admin@thirdwave.co.jp';
    await (0, emailService_1.sendAdminNotification)(adminTarget, user.fullName ?? '', user.email);
    await (0, notificationService_1.notifyAllAdmins)({
        type: 'user_registered',
        title: 'New User Registration',
        message: `${user.fullName ?? user.email} (${safeRole.replace('_', ' ')}) is requesting access.`,
        link: '/users',
        metadata: { email: user.email, role: safeRole },
    });
    return user;
}
// ── Login ─────────────────────────────────────────────────────────────────────
async function login(username, password) {
    const email = username.toLowerCase().trim();
    const lockout = checkLockout(email);
    if (lockout.locked)
        throw Object.assign(new Error(lockout.msg), { status: 429 });
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !(0, security_1.verifyPassword)(password, user.hashedPassword)) {
        recordFailed(email);
        const attempts = loginAttempts.get(email)?.length ?? 0;
        const left = Math.max(0, index_1.config.maxLoginAttempts - attempts);
        let msg = 'Invalid email or password.';
        if (left <= 2)
            msg += ` ${left} attempt(s) left before lockout.`;
        throw Object.assign(new Error(msg), { status: 401 });
    }
    if (user.status === 'pending') {
        throw Object.assign(new Error('Your account is awaiting administrator approval.'), { status: 403 });
    }
    if (user.status === 'inactive' || !user.isActive) {
        throw Object.assign(new Error('Your account has been deactivated. Contact your administrator.'), { status: 403 });
    }
    clearAttempts(email);
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const token = (0, security_1.createAccessToken)({ sub: user.email, role: user.role, name: user.fullName ?? '' });
    return { token, user };
}
// ── OTP / Password reset ──────────────────────────────────────────────────────
async function forgotPassword(email) {
    const user = await prisma_1.prisma.user.findFirst({ where: { email, status: 'active' } });
    if (!user) {
        if (index_1.config.revealEmailNotFound) {
            throw Object.assign(new Error('No active account found with that email. Contact your administrator.'), { status: 404 });
        }
        return { message: 'If that email exists, an OTP has been sent.', devOtp: undefined };
    }
    await prisma_1.prisma.otpToken.updateMany({ where: { email, used: false }, data: { used: true } });
    const otp = (0, security_1.generateOtp)();
    const expiresAt = new Date(Date.now() + index_1.config.otpExpireMinutes * 60_000);
    await prisma_1.prisma.otpToken.create({ data: { email, token: otp, expiresAt } });
    const sent = await (0, emailService_1.sendOtpEmail)(email, otp, user.fullName ?? 'User');
    if (!sent)
        throw Object.assign(new Error('Could not send email. Contact your administrator.'), { status: 503 });
    return {
        message: `OTP sent to ${email}. Valid for ${index_1.config.otpExpireMinutes} minutes.`,
        devOtp: (!index_1.config.smtpUser || !index_1.config.smtpPassword) ? otp : undefined,
    };
}
async function verifyOtp(email, otp) {
    const rec = await prisma_1.prisma.otpToken.findFirst({
        where: { email: email.toLowerCase().trim(), token: otp, used: false, expiresAt: { gt: new Date() } },
    });
    return !!rec;
}
async function resetPassword(email, otp, newPassword) {
    const rec = await prisma_1.prisma.otpToken.findFirst({
        where: { email, token: otp, used: false, expiresAt: { gt: new Date() } },
    });
    if (!rec)
        throw Object.assign(new Error('Invalid or expired code.'), { status: 400 });
    const pwErr = (0, security_1.checkPasswordStrength)(newPassword);
    if (pwErr)
        throw Object.assign(new Error(pwErr), { status: 400 });
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        throw Object.assign(new Error('User not found.'), { status: 404 });
    await Promise.all([
        prisma_1.prisma.user.update({ where: { id: user.id }, data: { hashedPassword: (0, security_1.hashPassword)(newPassword) } }),
        prisma_1.prisma.otpToken.update({ where: { id: rec.id }, data: { used: true } }),
    ]);
}
//# sourceMappingURL=auth.service.js.map
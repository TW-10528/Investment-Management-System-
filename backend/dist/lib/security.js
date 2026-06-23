"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.createAccessToken = createAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.checkPasswordStrength = checkPasswordStrength;
exports.generateOtp = generateOtp;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../config/index");
// ── Password ─────────────────────────────────────────────────────────────────
function hashPassword(plain) {
    return bcryptjs_1.default.hashSync(plain, 12);
}
function verifyPassword(plain, hash) {
    return bcryptjs_1.default.compareSync(plain, hash);
}
function createAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, index_1.config.secretKey, {
        expiresIn: `${index_1.config.accessTokenExpireMinutes}m`,
    });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, index_1.config.secretKey);
}
// ── Password strength (mirrors Python backend rules) ─────────────────────────
function checkPasswordStrength(pw) {
    if (pw.length < 8)
        return 'Password must be at least 8 characters.';
    const score = [
        pw.length >= 8,
        /[A-Z]/.test(pw),
        /[0-9]/.test(pw),
        /[^A-Za-z0-9]/.test(pw),
    ].filter(Boolean).length;
    if (score < 2)
        return 'Password is too weak. Use uppercase letters and numbers.';
    return null;
}
// ── OTP ───────────────────────────────────────────────────────────────────────
const crypto_1 = __importDefault(require("crypto"));
function generateOtp(length = 6) {
    return Array.from({ length }, () => crypto_1.default.randomInt(0, 10)).join('');
}
//# sourceMappingURL=security.js.map
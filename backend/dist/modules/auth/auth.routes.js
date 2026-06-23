"use strict";
// Auth module — /api/v1/auth
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const auth_1 = require("../../middleware/auth");
const rateLimit_1 = require("../../middleware/rateLimit");
const auth_schema_1 = require("./auth.schema");
const AuthService = __importStar(require("./auth.service"));
const router = new hono_1.Hono();
// POST /signup
router.post('/signup', (0, rateLimit_1.rateLimit)(5, 60), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body)
        return c.json({ detail: 'Invalid JSON' }, 400);
    const parsed = auth_schema_1.SignupSchema.safeParse(body);
    if (!parsed.success)
        return c.json({ detail: parsed.error.issues[0].message }, 400);
    try {
        const user = await AuthService.signup(parsed.data);
        return c.json({
            message: 'Registration submitted successfully. Your account is pending administrator approval.',
            email: user.email,
            full_name: user.fullName,
            status: user.status,
        });
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// POST /login  (accepts form-data or JSON)
router.post('/login', (0, rateLimit_1.rateLimit)(10, 60), async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    let username = '';
    let password = '';
    if (contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')) {
        const body = await c.req.parseBody();
        username = (body['username'] ?? '').toLowerCase().trim();
        password = body['password'] ?? '';
    }
    else {
        const body = await c.req.json().catch(() => ({}));
        username = (body.username ?? body.email ?? '').toLowerCase().trim();
        password = body.password ?? '';
    }
    try {
        const { token, user } = await AuthService.login(username, password);
        return c.json({
            access_token: token,
            token_type: 'bearer',
            role: user.role,
            name: user.fullName,
            email: user.email,
        });
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 401);
    }
});
// GET /me
router.get('/me', auth_1.auth, (c) => {
    const u = c.get('user');
    return c.json({ email: u.email, role: u.role, name: u.fullName, full_name: u.fullName });
});
// POST /forgot-password
router.post('/forgot-password', (0, rateLimit_1.rateLimit)(5, 60), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = auth_schema_1.ForgotPasswordSchema.safeParse(body);
    if (!parsed.success)
        return c.json({ detail: 'Email is required.' }, 400);
    try {
        const result = await AuthService.forgotPassword(parsed.data.email);
        const res = { message: result.message };
        if (result.devOtp) {
            res.dev_mode = true;
            res.dev_otp = result.devOtp;
        }
        return c.json(res);
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// POST /verify-otp
router.post('/verify-otp', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = auth_schema_1.VerifyOtpSchema.safeParse(body);
    if (!parsed.success)
        return c.json({ detail: 'email and otp are required.' }, 400);
    const valid = await AuthService.verifyOtp(parsed.data.email, parsed.data.otp);
    if (!valid)
        return c.json({ detail: 'Invalid or expired code. Request a new one.' }, 400);
    return c.json({ valid: true });
});
// POST /reset-password
router.post('/reset-password', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = auth_schema_1.ResetPasswordSchema.safeParse(body);
    if (!parsed.success)
        return c.json({ detail: parsed.error.issues[0].message }, 400);
    try {
        await AuthService.resetPassword(parsed.data.email.toLowerCase().trim(), parsed.data.otp, parsed.data.new_password);
        return c.json({ message: 'Password reset successfully. You can now sign in.' });
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map
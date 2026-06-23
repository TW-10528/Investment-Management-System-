"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResetPasswordSchema = exports.VerifyOtpSchema = exports.ForgotPasswordSchema = exports.SignupSchema = void 0;
const zod_1 = require("zod");
exports.SignupSchema = zod_1.z.object({
    full_name: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
    role: zod_1.z.string().optional(),
});
exports.ForgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.VerifyOtpSchema = zod_1.z.object({
    email: zod_1.z.string(),
    otp: zod_1.z.string(),
});
exports.ResetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string(),
    otp: zod_1.z.string(),
    new_password: zod_1.z.string(),
});
//# sourceMappingURL=auth.schema.js.map
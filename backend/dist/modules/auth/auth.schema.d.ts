import { z } from 'zod';
export declare const SignupSchema: z.ZodObject<{
    full_name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    full_name: string;
    password: string;
    role?: string | undefined;
}, {
    email: string;
    full_name: string;
    password: string;
    role?: string | undefined;
}>;
export declare const ForgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const VerifyOtpSchema: z.ZodObject<{
    email: z.ZodString;
    otp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    otp: string;
}, {
    email: string;
    otp: string;
}>;
export declare const ResetPasswordSchema: z.ZodObject<{
    email: z.ZodString;
    otp: z.ZodString;
    new_password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    otp: string;
    new_password: string;
}, {
    email: string;
    otp: string;
    new_password: string;
}>;
//# sourceMappingURL=auth.schema.d.ts.map
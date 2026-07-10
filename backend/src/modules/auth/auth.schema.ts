import { z } from 'zod'

export const SignupSchema = z.object({
  full_name: z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(1),
  role:      z.string().optional(),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const VerifyOtpSchema = z.object({
  email: z.string(),
  otp:   z.string(),
})

export const ResetPasswordSchema = z.object({
  email:        z.string(),
  otp:          z.string(),
  new_password: z.string(),
})

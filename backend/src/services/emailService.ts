import nodemailer from 'nodemailer'
import { config } from '../config/index'

function createTransport() {
  if (!config.smtpUser || !config.smtpPassword) return null
  return nodemailer.createTransport({
    host:   config.smtpHost,
    port:   config.smtpPort,
    secure: false,
    auth:   { user: config.smtpUser, pass: config.smtpPassword },
  })
}

export async function sendOtpEmail(
  to:       string,
  otp:      string,
  fullName: string,
): Promise<boolean> {
  const transport = createTransport()

  if (!transport) {
    // Dev mode: print to console
    console.log(`\n[DEV EMAIL] OTP for ${to}: ${otp}\n`)
    return true
  }

  try {
    await transport.sendMail({
      from:    config.smtpFrom,
      to,
      subject: 'Thirdwave IMS — Password Reset Code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#4f46e5">Password Reset</h2>
          <p>Hi ${fullName},</p>
          <p>Your one-time password reset code is:</p>
          <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
            <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#1e293b">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:14px">
            This code expires in ${config.otpExpireMinutes} minutes.
            If you didn't request this, please ignore this email.
          </p>
          <p style="color:#94a3b8;font-size:12px;margin-top:32px">
            Thirdwave Financial Inc. — Investment Management System
          </p>
        </div>
      `,
    })
    return true
  } catch (err) {
    console.error('[EMAIL] Failed to send OTP:', err)
    return false
  }
}

export async function sendAdminNotification(
  adminEmail:  string,
  newUserName: string,
  newUserEmail:string,
): Promise<void> {
  const transport = createTransport()

  if (!transport) {
    console.log(`\n[DEV EMAIL] New user registration: ${newUserName} <${newUserEmail}> — awaiting approval\n`)
    return
  }

  try {
    await transport.sendMail({
      from:    config.smtpFrom,
      to:      adminEmail,
      subject: `[IMS] New registration — ${newUserName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#4f46e5">New User Registration</h2>
          <p>A new user has registered and is awaiting your approval:</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr>
              <td style="padding:8px;color:#64748b;font-weight:600">Name</td>
              <td style="padding:8px">${newUserName}</td>
            </tr>
            <tr style="background:#f8fafc">
              <td style="padding:8px;color:#64748b;font-weight:600">Email</td>
              <td style="padding:8px">${newUserEmail}</td>
            </tr>
          </table>
          <p>Please log in to the IMS Admin panel to approve or reject this request.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[EMAIL] Failed to send admin notification:', err)
  }
}

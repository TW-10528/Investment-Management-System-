import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authExtAPI } from '../services/api';
import toast from 'react-hot-toast';

type Step = 'email' | 'otp' | 'reset' | 'done';

/* ── OTP digit input boxes ─────────────────────────────────────────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  function handleChange(i: number, v: string) {
    if (!/^\d*$/.test(v)) return;
    const arr = digits.map((d, idx) => (idx === i ? v.slice(-1) : d));
    onChange(arr.join(''));
    if (v && i < 5) {
      document.getElementById(`otp-${i + 1}`)?.focus();
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const arr = digits.map((d, idx) => (idx === i - 1 ? '' : d));
      onChange(arr.join(''));
      document.getElementById(`otp-${i - 1}`)?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted.padEnd(6, '').slice(0, 6)); e.preventDefault(); }
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          autoFocus={i === 0}
          className="w-11 h-14 text-center text-xl font-bold bg-gray-800 border border-gray-700 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
        />
      ))}
    </div>
  );
}

/* ── Password strength bar ──────────────────────────────────────────────── */
function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score  = checks.filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(n => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-all ${
              n <= score ? colors[score] : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs mt-1 ${
        score >= 3 ? 'text-green-400' : score >= 2 ? 'text-yellow-400' : 'text-red-400'
      }`}>
        {labels[score]}
        {score < 3 && (
          <span className="text-gray-500 ml-1">
            — add {!checks[1] ? 'uppercase, ' : ''}{!checks[2] ? 'numbers, ' : ''}{!checks[3] ? 'symbols' : ''}
          </span>
        )}
      </p>
    </div>
  );
}

/* ── Dev mode OTP banner ────────────────────────────────────────────────── */
function DevOtpBanner({ otp, onFill }: { otp: string; onFill: () => void }) {
  return (
    <div className="bg-amber-950/60 border border-amber-700 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-amber-400 text-base mt-0.5">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-wide mb-1">
            Dev Mode — SMTP Not Configured
          </p>
          <p className="text-amber-200/80 text-xs leading-relaxed mb-2">
            Email was not sent. Your OTP code is shown below for testing.
            Configure <code className="text-amber-300">SMTP_USER</code> and{' '}
            <code className="text-amber-300">SMTP_PASSWORD</code> in{' '}
            <code className="text-amber-300">backend/.env</code> for real emails.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-gray-900 text-amber-300 text-2xl font-mono font-bold px-3 py-1 rounded-lg tracking-widest">
              {otp}
            </code>
            <button
              type="button"
              onClick={onFill}
              className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
            >
              Auto-fill ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step,        setStep]        = useState<Step>('email');
  const [email,       setEmail]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [devOtp,      setDevOtp]      = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [loading,     setLoading]     = useState(false);
  const [showPwd,     setShowPwd]     = useState(false);
  const [resendCount, setResendCount] = useState(0);

  /* Step 1 — send OTP */
  async function sendOtp(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res  = await authExtAPI.forgotPassword(email.trim().toLowerCase());
      const data = res.data as { message: string; dev_otp?: string; dev_mode?: boolean };

      if (data.dev_mode && data.dev_otp) {
        setDevOtp(data.dev_otp);
        toast('Dev mode: OTP displayed on screen', { icon: '⚠', style: { background: '#451a03', color: '#fcd34d' } });
      } else {
        setDevOtp(null);
        toast.success('OTP sent! Check your email inbox.');
      }
      setStep('otp');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } };
      const status = e.response?.status;
      const detail = e.response?.data?.detail;

      if (status === 404) {
        toast.error(detail || 'Email not found. Contact your administrator.');
      } else if (status === 429) {
        toast.error('Too many requests. Please wait a minute.');
      } else {
        toast.error(detail || 'Failed to send reset code. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  /* Resend OTP */
  async function resendOtp() {
    if (resendCount >= 3) { toast.error('Maximum resend attempts reached'); return; }
    setLoading(true);
    try {
      const res  = await authExtAPI.forgotPassword(email.trim().toLowerCase());
      const data = res.data as { dev_otp?: string; dev_mode?: boolean };
      if (data.dev_mode && data.dev_otp) {
        setDevOtp(data.dev_otp);
      }
      toast.success('New code sent!');
      setOtp('');
      setResendCount(c => c + 1);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Resend failed');
    } finally {
      setLoading(false);
    }
  }

  /* Step 2 — verify OTP */
  async function verifyOtp(e: React.SyntheticEvent) {
    e.preventDefault();
    if (otp.length < 6) { toast.error('Enter the full 6-digit code'); return; }
    setLoading(true);
    try {
      await authExtAPI.verifyOtp(email.trim().toLowerCase(), otp);
      toast.success('Code verified ✓');
      setStep('reset');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Invalid or expired code — request a new one');
      setOtp('');
    } finally {
      setLoading(false);
    }
  }

  /* Step 3 — reset password */
  async function resetPassword(e: React.SyntheticEvent) {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPwd) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await authExtAPI.resetPassword(email.trim().toLowerCase(), otp, newPassword);
      setStep('done');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Reset failed — the code may have expired');
    } finally {
      setLoading(false);
    }
  }

  /* Step indicators */
  const STEPS: { key: Step; label: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'otp',   label: 'Verify' },
    { key: 'reset', label: 'New Password' },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-white rounded-xl px-5 py-2.5 shadow-lg">
          <img
            src="/thirdwave-logo.png"
            alt="Thirdwave"
            className="h-8 w-auto"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div>
          <p className="text-white font-bold text-base leading-none">Thirdwave Corporation</p>
          <p className="text-gray-500 text-xs mt-0.5">Investment Management System</p>
        </div>
      </div>

      <div className="w-full max-w-sm">

        {/* Progress steps */}
        {step !== 'done' && (
          <div className="flex items-center mb-6">
            {STEPS.map((s, i) => {
              const done   = i < stepIdx;
              const active = i === stepIdx;
              return (
                <div key={s.key} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                    done   ? 'bg-indigo-600 text-white' :
                    active ? 'bg-indigo-600 text-white ring-4 ring-indigo-900' :
                             'bg-gray-800 text-gray-500'
                  }`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <p className={`text-xs ml-1.5 ${active ? 'text-indigo-400 font-medium' : 'text-gray-600'}`}>
                    {s.label}
                  </p>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-3 ${done ? 'bg-indigo-600' : 'bg-gray-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 shadow-2xl">

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-indigo-900/60 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                  🔑
                </div>
                <h2 className="text-white text-lg font-semibold">Forgot Password</h2>
                <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">
                  Enter your registered email address and we'll send you a 6-digit reset code.
                </p>
              </div>
              <form onSubmit={sendOtp} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@thirdwave.co.jp"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
                  />
                  <p className="text-gray-600 text-xs mt-1.5">
                    Must match the email registered in the system.
                    If unsure, contact your administrator.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {loading ? 'Sending…' : 'Send Reset Code'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <>
              <div className="text-center mb-5">
                <div className="w-12 h-12 bg-indigo-900/60 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                  📧
                </div>
                <h2 className="text-white text-lg font-semibold">Enter Verification Code</h2>
                <p className="text-gray-400 text-sm mt-1.5">
                  Code sent to <span className="text-indigo-400 font-medium">{email}</span>
                </p>
              </div>

              {/* DEV MODE banner */}
              {devOtp && (
                <DevOtpBanner
                  otp={devOtp}
                  onFill={() => setOtp(devOtp)}
                />
              )}

              <form onSubmit={verifyOtp} className="space-y-5">
                <OtpInput value={otp} onChange={setOtp} />

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {loading ? 'Verifying…' : 'Verify Code'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => { setStep('email'); setOtp(''); setDevOtp(null); }}
                  className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                >
                  ← Wrong email?
                </button>
                <button
                  onClick={resendOtp}
                  disabled={loading || resendCount >= 3}
                  className="text-indigo-400 hover:text-indigo-300 disabled:opacity-40 text-xs transition-colors"
                >
                  Resend code{resendCount > 0 ? ` (${3 - resendCount} left)` : ''}
                </button>
              </div>

              <p className="text-gray-600 text-xs text-center mt-3">
                Code expires in {import.meta.env.DEV ? '10' : '10'} minutes · Check spam/junk folder
              </p>
            </>
          )}

          {/* ── Step 3: New Password ── */}
          {step === 'reset' && (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-green-900/60 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                  🔒
                </div>
                <h2 className="text-white text-lg font-semibold">Set New Password</h2>
                <p className="text-gray-400 text-sm mt-1.5">
                  Choose a strong password for your account.
                </p>
              </div>

              <form onSubmit={resetPassword} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoFocus
                      placeholder="Min. 8 characters"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                    >
                      {showPwd ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <StrengthBar password={newPassword} />
                </div>

                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    required
                    placeholder="Repeat your password"
                    className={`w-full bg-gray-800 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 transition-colors ${
                      confirmPwd && confirmPwd !== newPassword
                        ? 'border-red-500 focus:ring-red-500'
                        : confirmPwd && confirmPwd === newPassword
                          ? 'border-green-500 focus:ring-green-500'
                          : 'border-gray-700 focus:ring-indigo-500'
                    }`}
                  />
                  {confirmPwd && confirmPwd !== newPassword && (
                    <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                  )}
                  {confirmPwd && confirmPwd === newPassword && newPassword.length >= 8 && (
                    <p className="text-green-400 text-xs mt-1">✓ Passwords match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || newPassword.length < 8 || newPassword !== confirmPwd}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {loading ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-900/40 border-2 border-green-500 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                ✓
              </div>
              <h2 className="text-white text-lg font-semibold mb-2">Password Reset!</h2>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Your password has been updated successfully.<br />
                You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>

        {/* Back to login */}
        {step !== 'done' && (
          <p className="text-center mt-5 text-sm text-gray-600">
            Remember your password?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ── Role definitions ───────────────────────────────────────────────────────── */
const SIGNUP_ROLES = [
  {
    value:   'board_member',
    icon:    '🏛️',
    label:   'Board Member',
    desc:    'Executive oversight, investment reporting & performance analytics',
    access:  'View Only',
    badge:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    ring:    'ring-amber-500/40',
    glow:    'rgba(245,158,11,0.12)',
    border:  'rgba(245,158,11,0.4)',
    dot:     'bg-amber-400',
    perms:   ['Portfolio dashboard', 'Fund analytics', 'Distribution reports', 'Calculator tools'],
  },
  {
    value:   'finance_staff',
    icon:    '📝',
    label:   'Finance Staff',
    desc:    'Data entry, PDF notice processing and cash-flow records',
    access:  'Edit Access',
    badge:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    ring:    'ring-blue-500/40',
    glow:    'rgba(99,102,241,0.12)',
    border:  'rgba(99,102,241,0.4)',
    dot:     'bg-blue-400',
    perms:   ['Capital call entry', 'Distribution entry', 'Notice upload & parsing', 'FX rate management'],
  },
  {
    value:   'finance_manager',
    icon:    '📊',
    label:   'Finance Manager',
    desc:    'Approve capital calls, manage distributions & generate reports',
    access:  'Full Edit',
    badge:   'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    ring:    'ring-indigo-500/40',
    glow:    'rgba(139,92,246,0.12)',
    border:  'rgba(139,92,246,0.4)',
    dot:     'bg-indigo-400',
    perms:   ['Capital call approvals', 'Distribution approvals', 'Fund management', 'User oversight'],
  },
  {
    value:   'user',
    icon:    '👤',
    label:   'General User',
    desc:    'View portfolio reports and use financial calculators',
    access:  'View Only',
    badge:   'bg-slate-500/15 text-slate-400 border-slate-500/30',
    ring:    'ring-slate-500/30',
    glow:    'rgba(100,116,139,0.08)',
    border:  'rgba(100,116,139,0.3)',
    dot:     'bg-slate-400',
    perms:   ['Portfolio overview', 'Fund summary', 'Calculator tools', 'Read-only reports'],
  },
];

/* ── Password strength ──────────────────────────────────────────────────────── */
function pwScore(pw: string): number {
  return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
}
const STRENGTH_LABEL  = ['', 'Weak',    'Fair',    'Good',    'Strong'];
const STRENGTH_COLOR  = ['', '#ef4444', '#f59e0b', '#6366f1', '#10b981'];
const STRENGTH_TIPS   = ['', 'Use uppercase letters, numbers & symbols', 'Add a symbol (!, @, #…)', 'Add a symbol for Strong', ''];

function StrengthBar({ password }: { password: string }) {
  const score = pwScore(password);
  if (!password) return null;
  return (
    <div className="mt-2.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(n => (
          <div key={n}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: n <= score ? STRENGTH_COLOR[score] : 'rgba(255,255,255,0.08)' }} />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-semibold" style={{ color: STRENGTH_COLOR[score] }}>
          {STRENGTH_LABEL[score]}
        </span>
        {STRENGTH_TIPS[score] && (
          <span className="text-[10px] text-white/30">{STRENGTH_TIPS[score]}</span>
        )}
      </div>
    </div>
  );
}

/* ── Step indicator ─────────────────────────────────────────────────────────── */
function StepBar({ step, step1OK }: { step: 1 | 2; step1OK: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2].map((n, i) => (
        <div key={n} className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === n
                ? 'text-white'
                : (n === 1 && step1OK && step === 2)
                  ? 'text-white'
                  : 'text-white/30'
            }`} style={{
              background: step === n
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : (n === 1 && step1OK && step === 2)
                  ? '#10b981'
                  : 'rgba(255,255,255,0.08)',
            }}>
              {n === 1 && step1OK && step === 2 ? '✓' : n}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${step === n ? 'text-white' : 'text-white/30'}`}>
              {n === 1 ? 'Account Info' : 'Select Role'}
            </span>
          </div>
          {i === 0 && (
            <div className="flex-1 h-px mx-2" style={{
              background: step1OK && step === 2
                ? 'linear-gradient(90deg, #10b981, #6366f1)'
                : 'rgba(255,255,255,0.08)',
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function Signup() {
  const navigate = useNavigate();
  const { t }    = useTranslation();

  const [step,       setStep]       = useState<1 | 2>(1);
  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [role,       setRole]       = useState('board_member');
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  useEffect(() => {
    if (localStorage.getItem('authToken')) navigate('/', { replace: true });
  }, [navigate]);

  const score   = pwScore(password);
  const pwMatch = password === confirmPwd;
  const step1OK = (
    fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8 &&
    score >= 2 &&
    pwMatch
  );

  async function handleSubmit() {
    if (!step1OK || loading) return;
    setLoading(true);
    setErrMsg('');
    try {
      await authAPI.signup({
        full_name: fullName.trim(),
        email:     email.trim().toLowerCase(),
        password,
        role,
      });
      setDone(true);
    } catch (err: unknown) {
      const e       = err as { response?: { data?: { detail?: string }; status?: number }; code?: string };
      const status  = e.response?.status;
      const detail  = e.response?.data?.detail;

      if (!e.response && (e.code === 'ERR_NETWORK' || e.code === 'ECONNREFUSED')) {
        setErrMsg('Cannot connect to server. Please ensure the backend is running on port 8004.');
        toast.error('Server connection failed');
      } else if (status === 400 && detail?.includes('already exists')) {
        setErrMsg('An account with this email already exists.');
        setStep(1);
        toast.error('Email already registered');
      } else if (status === 400 && detail?.includes('weak')) {
        setErrMsg(`Password rejected by server: ${detail}`);
        setStep(1);
      } else if (status === 429) {
        setErrMsg('Too many registration attempts. Please wait a few minutes before trying again.');
        toast.error('Rate limit — please wait');
      } else {
        setErrMsg(detail || 'Registration failed. Please check your details and try again.');
        toast.error(detail || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = SIGNUP_ROLES.find(r => r.value === role)!;

  /* ── Success screen ── */
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
           style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0a0f1e 100%)' }}>
        <div className="w-full max-w-md text-center">
          {/* Success icon */}
          <div className="relative inline-flex mb-8">
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
                 style={{ background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.5)' }}>
              ✓
            </div>
            <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                 style={{ background: 'rgba(16,185,129,0.3)' }} />
          </div>

          <h1 className="text-white text-2xl font-bold mb-2">Registration Submitted!</h1>
          <p className="text-white/50 text-sm mb-8 leading-relaxed">
            Welcome, <span className="text-white font-semibold">{fullName}</span>.
            Your account request has been sent to the administrator.
          </p>

          {/* Role summary card */}
          <div className="rounded-2xl p-5 mb-6 text-left"
               style={{ background: selectedRole.glow, border: `1px solid ${selectedRole.border}` }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{selectedRole.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm">{selectedRole.label}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${selectedRole.badge}`}>
                  {selectedRole.access}
                </span>
              </div>
            </div>
            <p className="text-white/40 text-xs leading-relaxed">
              ⏳ Pending approval — the administrator will review your role request and may confirm or adjust it before granting access.
            </p>
          </div>

          {/* What happens next */}
          <div className="rounded-2xl p-4 mb-6 text-left space-y-2"
               style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">What happens next</p>
            {[
              { n: '1', text: 'Admin receives notification of your registration' },
              { n: '2', text: 'Admin reviews and approves (or adjusts) your role' },
              { n: '3', text: 'You receive access and can sign in' },
            ].map(s => (
              <div key={s.n} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {s.n}
                </div>
                <p className="text-white/50 text-xs">{s.text}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/login', {
              state: { message: 'Registration submitted! Sign in once an admin approves your account.' }
            })}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            Back to Sign In →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0a0f1e 100%)' }}>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:flex-col lg:justify-between w-[380px] xl:w-[440px] flex-shrink-0 px-10 py-12"
           style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div>
          <div className="bg-white rounded-2xl px-8 py-4 inline-block shadow-lg mb-6">
            <img src="/thirdwave-logo.png" alt="Thirdwave" className="h-9 w-auto"
              onError={e => {
                const t = e.target as HTMLImageElement;
                t.style.display = 'none';
                t.parentElement!.innerHTML = '<span style="font-size:16px;font-weight:900;color:#0d1117;letter-spacing:-0.5px">THIRDWAVE</span>';
              }} />
          </div>
          <p className="text-white/30 text-xs uppercase tracking-widest mb-2">Investment Management System</p>
          <h2 className="text-white text-2xl font-bold leading-snug mb-3">
            Request Access to<br />the IMS Platform
          </h2>
          <p className="text-white/40 text-sm leading-relaxed">
            Create your account, select your role, and await administrator approval before your first login.
          </p>
        </div>

        {/* Role overview */}
        <div className="space-y-3">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Available roles</p>
          {SIGNUP_ROLES.map(r => (
            <div key={r.value} className="flex items-center gap-3 py-1">
              <span className="text-base">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white/70 text-sm font-medium">{r.label}</p>
                <p className="text-white/30 text-xs truncate">{r.desc}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${r.badge}`}>{r.access}</span>
            </div>
          ))}
          <p className="text-white/25 text-xs pt-1">✓ All accounts require admin approval</p>
        </div>

        <p className="text-white/20 text-xs">© {new Date().getFullYear()} Thirdwave Financial Inc.</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-block bg-white rounded-2xl px-6 py-3 shadow-xl mb-2">
              <img src="/thirdwave-logo.png" alt="Thirdwave" className="h-7 w-auto"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          </div>

          <StepBar step={step} step1OK={step1OK} />

          <div className="mb-6">
            <h1 className="text-white text-2xl font-bold">
              {step === 1 ? t('auth.createAccount') : 'Select Your Role'}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              {step === 1
                ? <>{t('auth.alreadyAccount')}{' '}<Link to="/login" className="text-indigo-400 hover:text-indigo-300">Sign in →</Link></>
                : 'Choose the role that best describes your position.'
              }
            </p>
          </div>

          {/* Error banner */}
          {errMsg && (
            <div className="mb-5 flex items-start gap-3 bg-red-950/60 border border-red-800/60 rounded-xl px-4 py-3">
              <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-red-300 text-sm leading-relaxed">{errMsg}</p>
            </div>
          )}

          {/* ── Step 1: Account info ── */}
          {step === 1 && (
            <form onSubmit={e => { e.preventDefault(); if (step1OK) { setErrMsg(''); setStep(2); } }} className="space-y-4">

              {/* Full name */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  required autoFocus placeholder="Your full name"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                {fullName.trim().length > 0 && fullName.trim().length < 2 && (
                  <p className="text-red-400 text-xs mt-1">Minimum 2 characters</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10 transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${
                        !email ? 'rgba(255,255,255,0.1)' :
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'
                      }`,
                    }}
                  />
                  {email && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm">
                      {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '✅' : '❌'}
                    </span>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">
                  Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-14 transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs font-medium">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <StrengthBar password={password} />
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <input
                  type={showPwd ? 'text' : 'password'} value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)} required
                  placeholder="Repeat your password"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${!confirmPwd ? 'rgba(255,255,255,0.1)' : pwMatch ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  }}
                />
                {confirmPwd && !pwMatch && (
                  <p className="text-red-400 text-xs mt-1.5">Passwords do not match</p>
                )}
                {confirmPwd && pwMatch && (
                  <p className="text-emerald-400 text-xs mt-1.5">✓ Passwords match</p>
                )}
              </div>

              <button type="submit" disabled={!step1OK}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all mt-1 disabled:opacity-40"
                style={{ background: step1OK ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.08)' }}>
                Next: Select Role →
              </button>

              <p className="text-center text-white/20 text-xs">
                By registering you agree to Thirdwave's internal data policies.
              </p>
            </form>
          )}

          {/* ── Step 2: Role selection ── */}
          {step === 2 && (
            <div className="space-y-3">
              {SIGNUP_ROLES.map(r => {
                const active = role === r.value;
                return (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)}
                    className="w-full text-left rounded-2xl p-4 transition-all duration-200"
                    style={{
                      background:  active ? r.glow : 'rgba(255,255,255,0.02)',
                      border:      `1px solid ${active ? r.border : 'rgba(255,255,255,0.07)'}`,
                      transform:   active ? 'scale(1.005)' : 'scale(1)',
                    }}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5 flex-shrink-0">{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm text-white">{r.label}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${r.badge}`}>
                            {r.access}
                          </span>
                          {active && <span className="text-[10px] text-emerald-400 font-semibold">✓ Selected</span>}
                        </div>
                        <p className="text-white/50 text-xs leading-relaxed mb-2">{r.desc}</p>
                        {active && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {r.perms.map(p => (
                              <span key={p} className="text-[10px] px-2 py-0.5 rounded-full text-white/50"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              <div className="rounded-xl px-4 py-3 text-xs text-amber-400/70"
                   style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                ⚠️ The administrator will review and may adjust your role before granting access.
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  ← Back
                </button>
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-[2] py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
                    : 'Submit Registration →'
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

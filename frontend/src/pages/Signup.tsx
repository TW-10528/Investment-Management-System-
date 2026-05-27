import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ── Role options for self-signup (no admin) ─────────────────────────────── */
const SIGNUP_ROLES = [
  {
    value: 'user',
    icon: '👤',
    label: 'General User',
    desc: 'View portfolio reports and analytics',
    access: 'View Only',
    color: 'border-slate-400 bg-slate-500/10 text-slate-300',
    dot: 'bg-slate-400',
  },
  {
    value: 'board_member',
    icon: '🏛️',
    label: 'Board Member',
    desc: 'Executive oversight and investment reporting',
    access: 'View Only',
    color: 'border-amber-400 bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  {
    value: 'finance_staff',
    icon: '📝',
    label: 'Finance Staff',
    desc: 'Data entry, notice processing, CF records',
    access: 'Edit Access',
    color: 'border-blue-400 bg-blue-500/10 text-blue-300',
    dot: 'bg-blue-400',
  },
  {
    value: 'finance_manager',
    icon: '📊',
    label: 'Finance Manager',
    desc: 'Manage capital calls, distributions, approvals',
    access: 'Edit Access',
    color: 'border-indigo-400 bg-indigo-500/10 text-indigo-300',
    dot: 'bg-indigo-400',
  },
];

/* ── Password strength ──────────────────────────────────────────────────── */
function pwScore(pw: string) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
const STRENGTH_TEXT  = ['', 'text-red-400', 'text-amber-400', 'text-blue-400', 'text-emerald-400'];

function StrengthBar({ password }: { password: string }) {
  const score = pwScore(password);
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-all ${n <= score ? STRENGTH_COLOR[score] : 'bg-white/10'}`} />
        ))}
      </div>
      <p className={`text-xs mt-1.5 font-medium ${STRENGTH_TEXT[score]}`}>
        {STRENGTH_LABEL[score]}
        {score < 3 && <span className="text-white/30 font-normal ml-1">— add uppercase, numbers, symbols</span>}
      </p>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function Signup() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [step,      setStep]      = useState<1 | 2>(1); // Step 1: info, Step 2: role
  const [fullName,  setFullName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirmPwd,setConfirmPwd]= useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [role,      setRole]      = useState('user');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    if (localStorage.getItem('authToken')) navigate('/', { replace: true });
  }, [navigate]);

  const score    = pwScore(password);
  const pwMatch  = password === confirmPwd;
  const step1OK  = fullName.trim().length >= 2 && email.includes('@') && password.length >= 8 && score >= 2 && pwMatch;

  async function handleSubmit() {
    if (!step1OK || loading) return;
    setLoading(true);
    try {
      await authAPI.signup({
        full_name: fullName.trim(),
        email    : email.trim().toLowerCase(),
        password,
        role,
      });
      setDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } };
      const detail = e.response?.data?.detail;
      if (e.response?.status === 400 && detail?.includes('already exists')) {
        toast.error('An account with this email already exists.');
        setStep(1);
      } else {
        toast.error(detail || 'Registration failed. Please check your details.');
      }
    } finally {
      setLoading(false);
    }
  }

  const selectedRoleInfo = SIGNUP_ROLES.find(r => r.value === role)!;

  /* ── Success screen ── */
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1729 100%)' }}>
        <div className="w-full max-w-md text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full border-2 border-emerald-500 bg-emerald-900/30 flex items-center justify-center text-4xl mx-auto mb-6">✓</div>
          <h1 className="text-white text-2xl font-bold mb-2">Account Submitted!</h1>
          <p className="text-white/60 text-sm mb-6">
            Welcome, <span className="text-white font-semibold">{fullName}</span>. Your registration is pending administrator approval.
          </p>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-6 text-left">
            <p className="text-amber-400 text-sm font-semibold mb-2">⏳ Pending Approval</p>
            <p className="text-amber-300/70 text-xs leading-relaxed mb-3">
              You requested <span className="font-semibold text-amber-300">{selectedRoleInfo.label}</span> access. An administrator will review your request and may confirm or adjust your role.
            </p>
            <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
              <span className="text-lg">{selectedRoleInfo.icon}</span>
              <div>
                <p className="text-white text-xs font-semibold">{selectedRoleInfo.label}</p>
                <p className="text-white/40 text-xs">{selectedRoleInfo.access}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/login', { state: { message: 'Registration submitted! Sign in once an admin approves your account.' } })}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
          >
            Back to Sign In →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0f1729 100%)' }}>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:flex-col lg:justify-between w-[380px] xl:w-[440px] flex-shrink-0 px-10 py-12"
           style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
        <div>
          <div className="bg-white rounded-2xl px-8 py-4 inline-block shadow-lg mb-6">
            <img src="/thirdwave-logo.png" alt="Thirdwave" className="h-9 w-auto"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <p className="text-white/30 text-xs uppercase tracking-widest mb-2">Investment Management System</p>
          <h2 className="text-white text-2xl font-bold leading-snug">
            Professional Investment<br />Portfolio Management
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-white/50 text-sm font-semibold uppercase tracking-wider">Role-based Access Control</p>
          {SIGNUP_ROLES.map(r => (
            <div key={r.value} className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full ${r.dot}`} />
              <span className="text-white/70 text-sm">{r.icon} {r.label}</span>
              <span className="ml-auto text-xs text-white/30">{r.access}</span>
            </div>
          ))}
          <p className="text-white/30 text-xs pt-2">
            ✓ All accounts require admin approval before activation
          </p>
        </div>

        <p className="text-white/20 text-xs">© {new Date().getFullYear()} Thirdwave Financial Inc.</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Steps */}
          <div className="flex items-center gap-3 mb-8">
            <div className={`flex items-center gap-2 text-sm font-semibold ${step === 1 ? 'text-white' : 'text-white/40'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-indigo-600 text-white' : step1OK ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/40'}`}>
                {step1OK && step === 2 ? '✓' : '1'}
              </span>
              Account Info
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <div className={`flex items-center gap-2 text-sm font-semibold ${step === 2 ? 'text-white' : 'text-white/40'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/40'}`}>2</span>
              Select Role
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-white text-2xl font-bold">
              {step === 1 ? t('auth.createAccount') : 'Select Your Role'}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              {step === 1
                ? <>Already have an account? <Link to="/login" className="text-indigo-400 hover:text-indigo-300">Sign in →</Link></>
                : 'Choose the role that best describes your position. The admin may confirm or adjust this.'}
            </p>
          </div>

          {/* ── Step 1: Account info ── */}
          {step === 1 && (
            <form onSubmit={e => { e.preventDefault(); if (step1OK) setStep(2); }} className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Full Name <span className="text-red-400">*</span></label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required autoFocus
                  placeholder="Your full name"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Email Address <span className="text-red-400">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="Min. 8 characters"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-14"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <StrengthBar password={password} />
              </div>

              <div>
                <label className="block text-white/70 text-sm font-medium mb-1.5">Confirm Password <span className="text-red-400">*</span></label>
                <input type={showPwd ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required
                  placeholder="Repeat your password"
                  className={`w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 transition-all ${
                    !confirmPwd ? 'focus:ring-indigo-500' : pwMatch ? 'focus:ring-emerald-500' : 'focus:ring-red-500'
                  }`}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${!confirmPwd ? 'rgba(255,255,255,0.1)' : pwMatch ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
                  }} />
                {confirmPwd && !pwMatch && <p className="text-red-400 text-xs mt-1">Passwords do not match</p>}
              </div>

              <button type="submit" disabled={!step1OK}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all mt-2 disabled:opacity-40"
                style={{ background: step1OK ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)' }}>
                Next: Select Role →
              </button>

              <p className="text-center text-white/20 text-xs">
                By registering you agree to Thirdwave's internal data policies.
              </p>
            </form>
          )}

          {/* ── Step 2: Role selection ── */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-2.5">
                {SIGNUP_ROLES.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border text-left transition-all ${
                      role === r.value ? r.color : 'border-white/10 hover:border-white/20'
                    }`}
                    style={role === r.value ? {} : { background: 'rgba(255,255,255,0.03)' }}
                  >
                    <span className="text-2xl flex-shrink-0">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${role === r.value ? '' : 'text-white/80'}`}>{r.label}</p>
                      <p className={`text-xs mt-0.5 ${role === r.value ? 'opacity-80' : 'text-white/40'}`}>{r.desc}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.access === 'Edit Access'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {r.access}
                      </span>
                      {role === r.value && <p className="text-white/50 text-xs mt-1">✓ Selected</p>}
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-xl p-3 text-xs text-amber-400/70" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                ⚠️ The admin will review and may adjust your role before granting access.
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  ← Back
                </button>
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
                    : 'Submit Registration'
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

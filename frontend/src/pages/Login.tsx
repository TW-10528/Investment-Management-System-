import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ── Animated background orbs ──────────────────────────────────────────────── */
function BgOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', animation: 'float1 8s ease-in-out infinite' }} />
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', animation: 'float2 10s ease-in-out infinite' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-5"
        style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 60%)' }} />
      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,-30px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-20px,20px)} }
      `}</style>
    </div>
  );
}

/* ── Feature list for branding panel ──────────────────────────────────────── */
const FEATURES = [
  { icon: '📊', text: 'Real-time portfolio dashboard with live FX rates' },
  { icon: '🏦', text: 'Capital call & distribution workflow management' },
  { icon: '📄', text: 'AI-powered PDF notice parsing & data extraction' },
  { icon: '🧮', text: 'Advanced IRR, DPI/TVPI & fee calculators' },
  { icon: '🌐', text: 'Multi-language: EN · 日本語 · 한국어 · 中文 · TL' },
  { icon: '🔐', text: 'Role-based access — admin / finance / board' },
];

/* ── Default demo credentials (visible in dev) ─────────────────────────────── */
const DEV_ACCOUNTS = [
  { role: 'Admin',           email: 'admin@thirdwave.co.jp',   password: 'Admin123!', color: '#ef4444' },
  { role: 'Finance Manager', email: 'finance@thirdwave.co.jp', password: 'Staff123!', color: '#6366f1' },
  { role: 'Board Member',    email: 'board@thirdwave.co.jp',   password: 'Staff123!', color: '#f59e0b' },
];

export default function Login() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { t }      = useTranslation();
  const emailRef   = useRef<HTMLInputElement>(null);

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [errType,   setErrType]   = useState<'error' | 'warning' | 'info'>('error');
  const [showDev,   setShowDev]   = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  /* Success toast from signup redirect */
  useEffect(() => {
    const msg = (location.state as { message?: string } | null)?.message;
    if (msg) toast.success(msg, { duration: 5000 });
  }, [location.state]);

  /* Already logged in */
  useEffect(() => {
    if (localStorage.getItem('authToken')) navigate('/', { replace: true });
  }, [navigate]);

  /* Pre-fill remembered email */
  useEffect(() => {
    const saved = localStorage.getItem('rememberedEmail');
    if (saved) { setEmail(saved); setRememberMe(true); }
    emailRef.current?.focus();
  }, []);

  function fillDev(acc: typeof DEV_ACCOUNTS[0]) {
    setEmail(acc.email);
    setPassword(acc.password);
    setErrMsg('');
    setShowDev(false);
    toast(`Filled ${acc.role} credentials`, { icon: '🔑' });
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErrMsg('');
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const res  = await authAPI.login(email.trim().toLowerCase(), password);
      const data = res.data;

      if (rememberMe) localStorage.setItem('rememberedEmail', email.trim().toLowerCase());
      else            localStorage.removeItem('rememberedEmail');

      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('user', JSON.stringify({
        email: data.email,
        role:  data.role,
        name:  data.name,
      }));
      toast.success(`Welcome back, ${data.name || data.email}! 👋`);
      // Respect the user's preferred landing page
      let landing = '/';
      try { if (JSON.parse(localStorage.getItem('ims_prefs') || '{}').landingPage === 'funds') landing = '/funds'; } catch { /* default */ }
      navigate(landing, { replace: true });
    } catch (err: unknown) {
      const e      = err as { response?: { data?: { detail?: string }; status?: number }; code?: string };
      const status = e.response?.status;
      const detail = e.response?.data?.detail;

      if (!e.response && (e.code === 'ERR_NETWORK' || e.code === 'ECONNREFUSED')) {
        setErrMsg('Cannot connect to server. Please ensure the backend is running on port 8004.');
        setErrType('warning');
      } else if (status === 403 && detail?.includes('pending')) {
        setErrMsg('Your account is awaiting administrator approval. You will be notified once approved.');
        setErrType('info');
      } else if (status === 403 && detail?.includes('deactivated')) {
        setErrMsg('Your account has been deactivated. Please contact your administrator.');
        setErrType('warning');
      } else if (status === 429) {
        setErrMsg(detail || 'Too many attempts. Please wait before trying again.');
        setErrType('warning');
        toast.error(detail || 'Rate limit exceeded');
      } else {
        setErrMsg(detail || 'Invalid email or password. Please try again.');
        setErrType('error');
      }
    } finally {
      setLoading(false);
    }
  }

  const errColors = {
    error:   { bg: 'bg-red-950/60',    border: 'border-red-800',   icon: '⚠',  text: 'text-red-300' },
    warning: { bg: 'bg-amber-950/60',  border: 'border-amber-700', icon: '⏳', text: 'text-amber-300' },
    info:    { bg: 'bg-blue-950/60',   border: 'border-blue-800',  icon: 'ℹ',  text: 'text-blue-300' },
  }[errType];

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #0a0f1e 100%)' }}>
      <BgOrbs />

      {/* ── Left branding panel ── */}
      <div className="relative hidden lg:flex lg:flex-col lg:justify-between w-[420px] xl:w-[480px] flex-shrink-0 px-10 py-12"
           style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}>
        <div>
          {/* Logo */}
          <div className="bg-white rounded-2xl px-8 py-4 inline-block shadow-2xl mb-8">
            <img src="/thirdwave-logo.png" alt="Thirdwave" className="h-10 w-auto"
              onError={e => {
                const t = e.target as HTMLImageElement;
                t.style.display = 'none';
                t.parentElement!.innerHTML = '<span style="font-size:18px;font-weight:900;color:#0d1117;letter-spacing:-0.5px">THIRDWAVE</span>';
              }} />
          </div>
          <p className="text-white/30 text-xs uppercase tracking-widest mb-3">Investment Management System</p>
          <h2 className="text-white text-3xl font-bold leading-tight mb-2">
            Enterprise-Grade<br />Portfolio Intelligence
          </h2>
          <p className="text-white/40 text-sm leading-relaxed">
            Manage private equity commitments, capital calls, distributions and performance analytics from a single platform.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3">
          {FEATURES.map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <span className="text-lg flex-shrink-0">{f.icon}</span>
              <p className="text-white/60 text-sm leading-snug">{f.text}</p>
            </div>
          ))}
        </div>

        <p className="text-white/20 text-xs">
          © {new Date().getFullYear()} Thirdwave Financial Inc. · Confidential &amp; Proprietary
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-block bg-white rounded-2xl px-8 py-4 shadow-xl mb-3">
              <img src="/thirdwave-logo.png" alt="Thirdwave" className="h-8 w-auto"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <p className="text-white/30 text-xs uppercase tracking-widest">Investment Management System</p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-white text-2xl font-bold">{t('auth.login')}</h1>
            <p className="text-white/40 text-sm mt-1">
              {t('auth.noAccount')}{' '}
              <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                {t('auth.signUp')} →
              </Link>
            </p>
          </div>

          {/* Error / info banner */}
          {errMsg && (
            <div className={`mb-5 flex items-start gap-3 ${errColors.bg} border ${errColors.border} rounded-xl px-4 py-3 animate-fade-in`}>
              <span className={`${errColors.text} mt-0.5 flex-shrink-0 text-base`}>{errColors.icon}</span>
              <p className={`${errColors.text} text-sm leading-relaxed`}>{errMsg}</p>
            </div>
          )}

          {/* Form card */}
          <div className="rounded-2xl p-8 space-y-5"
               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-white/70 text-sm font-medium mb-2">{t('auth.email')}</label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrMsg(''); }}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/70 text-sm font-medium">{t('auth.password')}</label>
                  <Link to="/forgot-password" className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrMsg(''); }}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-16 transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs font-medium transition-colors">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                  rememberMe ? 'bg-indigo-600 border-indigo-600' : 'border-white/20 group-hover:border-white/40'
                }`} onClick={() => setRememberMe(v => !v)}>
                  {rememberMe && <span className="text-white text-[10px]">✓</span>}
                </div>
                <span className="text-white/50 text-sm group-hover:text-white/70 transition-colors select-none"
                      onClick={() => setRememberMe(v => !v)}>
                  Remember my email
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (!loading && email.trim() && password) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)' }}
              >
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('auth.signingIn')}</>
                  : <>{t('auth.signIn')} →</>
                }
              </button>
            </form>
          </div>

          {/* Dev credentials helper */}
          <div className="mt-4">
            <button
              onClick={() => setShowDev(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs text-white/30 hover:text-white/60 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <span>🔑 Development credentials (click to expand)</span>
              <span className="transition-transform" style={{ transform: showDev ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {showDev && (
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                {DEV_ACCOUNTS.map((acc, i) => (
                  <button
                    key={acc.email}
                    onClick={() => fillDev(acc)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: acc.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white/70 text-xs font-semibold">{acc.role}</p>
                      <p className="text-white/30 text-xs font-mono truncate">{acc.email}</p>
                    </div>
                    <span className="text-white/20 font-mono text-xs">{acc.password}</span>
                  </button>
                ))}
                <div className="px-4 py-2 text-[10px] text-white/20"
                     style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  ⚠ Run <code className="text-indigo-400">npm run db:seed</code> in the backend directory to create these accounts
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-white/20 text-xs mt-6">
            © {new Date().getFullYear()} Thirdwave Financial Inc. — Confidential &amp; Proprietary
          </p>
        </div>
      </div>
    </div>
  );
}

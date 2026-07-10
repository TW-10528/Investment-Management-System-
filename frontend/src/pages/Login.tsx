import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { LANGUAGES } from '../i18n';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: '📊', text: 'Real-time portfolio dashboard with live FX rates' },
  { icon: '🏦', text: 'Capital call & distribution workflow management' },
  { icon: '📄', text: 'AI-powered PDF notice parsing & data extraction' },
  { icon: '🧮', text: 'Advanced IRR, DPI/TVPI & fee calculators' },
  { icon: '🌐', text: 'Multi-language: EN · 日本語 · 한국어 · 中文 · TL' },
  { icon: '🔐', text: 'Role-based access — admin / finance / board' },
];

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

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [errMsg,      setErrMsg]      = useState('');
  const [errType,     setErrType]     = useState<'error' | 'warning' | 'info'>('error');
  const [showDev,     setShowDev]     = useState(false);
  const [rememberMe,  setRememberMe]  = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language);

  useEffect(() => {
    const msg = (location.state as { message?: string } | null)?.message;
    if (msg) toast.success(msg, { duration: 5000 });
  }, [location.state]);

  useEffect(() => {
    if (localStorage.getItem('authToken')) navigate('/', { replace: true });
  }, [navigate]);

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

  function changeLanguage(code: string) {
    i18n.changeLanguage(code);
    try {
      const prefs = JSON.parse(localStorage.getItem('ims_prefs') || '{}');
      localStorage.setItem('ims_prefs', JSON.stringify({ ...prefs, language: code }));
    } catch { /* ignore */ }
    setShowLangMenu(false);
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
    error:   { bg: 'bg-red-100',   border: 'border-red-300',   icon: '⚠',  text: 'text-red-800' },
    warning: { bg: 'bg-amber-100', border: 'border-amber-300', icon: '⏳', text: 'text-amber-800' },
    info:    { bg: 'bg-blue-100',  border: 'border-blue-300',  icon: 'ℹ',  text: 'text-blue-800' },
  }[errType];

  const thirdwaveText = i18n.language === 'ja' ? 'サードウェーブ' : 'Thirdwave';

  return (
    <div className="min-h-screen flex bg-white">
      {/* ── Left branding panel ── */}
      <div className="relative hidden lg:flex lg:flex-col lg:justify-between w-[420px] xl:w-[480px] flex-shrink-0 px-10 py-12"
           style={{ borderRight: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div>
          {/* Logo + Brand */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 186" className="h-20 w-auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Thirdwave logo">
                <path fill="#2735b3" d="M84 106 104 78h43L127 124z"/>
                <path fill="#2735b3" d="M131 124 163 66h49L178 116z"/>
                <path fill="#2735b3" d="M185 122 218 66 273 30 230 136z"/>
              </svg>
              <div>
                <p className="font-bold text-lg text-gray-900">{thirdwaveText}</p>
              </div>
            </div>
          </div>

          <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Investment Management System</p>
          <h2 className="text-gray-900 text-3xl font-bold leading-tight mb-2">
            Enterprise-Grade<br />Portfolio Intelligence
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Manage private equity commitments, capital calls, distributions and performance analytics from a single platform.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3">
          {FEATURES.map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <span className="text-lg flex-shrink-0">{f.icon}</span>
              <p className="text-gray-600 text-sm leading-snug">{f.text}</p>
            </div>
          ))}
        </div>

        {/* Language Selector - Bottom Left */}
        <div>
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(v => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-sm font-medium ${
                showLangMenu
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              <span className="text-base">{currentLang?.flag}</span>
              <span>{currentLang?.code.toUpperCase()}</span>
              <span className="text-xs ml-auto">▼</span>
            </button>

            {showLangMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                {LANGUAGES.map((lang, idx) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      i18n.language === lang.code
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ borderTop: idx > 0 ? '1px solid #f0f0f0' : undefined }}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-gray-400 text-xs mt-4">
            © {new Date().getFullYear()} Thirdwave Financial Inc. · Confidential &amp; Proprietary
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center gap-2 justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 186" className="h-14 w-auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Thirdwave logo">
                <path fill="#2735b3" d="M84 106 104 78h43L127 124z"/>
                <path fill="#2735b3" d="M131 124 163 66h49L178 116z"/>
                <path fill="#2735b3" d="M185 122 218 66 273 30 230 136z"/>
              </svg>
              <div>
                <p className="font-bold text-base text-gray-900">{thirdwaveText}</p>
              </div>
            </div>
            <p className="text-gray-400 text-xs uppercase tracking-widest">Investment Management System</p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-gray-900 text-2xl font-bold">{t('auth.login')}</h1>
            <p className="text-gray-600 text-sm mt-1">
              {t('auth.noAccount')}{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
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
          <div className="rounded-2xl p-8 border border-gray-200 shadow-sm bg-white">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">{t('auth.email')}</label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrMsg(''); }}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-xl text-sm text-gray-900 placeholder-gray-400 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-gray-700 text-sm font-medium">{t('auth.password')}</label>
                  <Link to="/forgot-password" className="text-blue-600 hover:text-blue-700 text-xs transition-colors">
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
                    className="w-full px-4 py-3 rounded-xl text-sm text-gray-900 placeholder-gray-400 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-16 transition-all"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-xs font-medium transition-colors">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                  rememberMe ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-gray-400'
                }`} onClick={() => setRememberMe(v => !v)}>
                  {rememberMe && <span className="text-white text-[10px]">✓</span>}
                </div>
                <span className="text-gray-600 text-sm group-hover:text-gray-900 transition-colors select-none"
                      onClick={() => setRememberMe(v => !v)}>
                  Remember my email
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (!loading && email.trim() && password) ? '#2735b3' : '#e5e7eb' }}
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
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs text-gray-400 hover:text-gray-600 transition-colors border border-gray-200">
              <span>🔑 Development credentials (click to expand)</span>
              <span className="transition-transform" style={{ transform: showDev ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {showDev && (
              <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                {DEV_ACCOUNTS.map((acc, i) => (
                  <button
                    key={acc.email}
                    onClick={() => fillDev(acc)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: acc.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-xs font-semibold">{acc.role}</p>
                      <p className="text-gray-500 text-xs font-mono truncate">{acc.email}</p>
                    </div>
                    <span className="text-gray-400 font-mono text-xs">{acc.password}</span>
                  </button>
                ))}
                <div className="px-4 py-2 text-[10px] text-gray-500 bg-gray-100 border-t border-gray-200">
                  ⚠ Run <code className="text-blue-600">npm run db:seed</code> in the backend directory to create these accounts
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-gray-400 text-xs mt-6">
            © {new Date().getFullYear()} Thirdwave Financial Inc. — Confidential &amp; Proprietary
          </p>
        </div>
      </div>
    </div>
  );
}
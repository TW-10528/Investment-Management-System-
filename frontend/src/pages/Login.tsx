import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t }    = useTranslation();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [errMsg,   setErrMsg]   = useState('');

  /* Success toast when redirected from signup */
  useEffect(() => {
    const msg = (location.state as { message?: string } | null)?.message;
    if (msg) toast.success(msg, { duration: 5000 });
  }, [location.state]);

  /* Already logged in → go home */
  useEffect(() => {
    if (localStorage.getItem('authToken')) navigate('/', { replace: true });
  }, [navigate]);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setErrMsg('');
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      const res  = await authAPI.login(email.trim().toLowerCase(), password);
      const data = res.data;
      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('user', JSON.stringify({
        email: data.email,
        role : data.role,
        name : data.name,
      }));
      toast.success(`Welcome back, ${data.name || data.email}!`);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const e      = err as { response?: { data?: { detail?: string }; status?: number } };
      const status = e.response?.status;
      const detail = e.response?.data?.detail || 'Sign in failed. Please try again.';
      setErrMsg(detail);
      if (status === 429) toast.error(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-block bg-white rounded-2xl px-10 py-5 shadow-xl mb-4">
            <img
              src="/thirdwave-logo.png"
              alt="Thirdwave Corporation"
              className="h-10 w-auto"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <h1 className="text-white text-2xl font-bold mt-2">{t('auth.login')}</h1>
          <p className="text-gray-500 text-sm mt-1">Investment Management System</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-8">

          {/* Error banner */}
          {errMsg && (
            <div className="mb-5 flex items-start gap-3 bg-red-950/60 border border-red-800 rounded-xl px-4 py-3">
              <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-red-300 text-sm leading-relaxed">{errMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                {t('auth.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrMsg(''); }}
                required
                autoFocus
                autoComplete="email"
                placeholder={t('auth.email')}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-500"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-gray-300 text-sm font-medium">{t('auth.password')}</label>
                <Link to="/forgot-password"
                  className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
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
                  placeholder={t('auth.password')}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-16"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs font-medium">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('auth.signingIn')}</>
                : t('auth.signIn')
              }
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-800 text-center">
            <p className="text-gray-500 text-sm">
              {t('auth.noAccount')}{' '}
              <Link to="/signup"
                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                {t('auth.signUp')}
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-gray-700 text-xs mt-6">
          © {new Date().getFullYear()} Thirdwave Financial Inc. — Confidential &amp; Proprietary
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usersAPI } from '../services/api';
import { usePreferences } from '../contexts/usePreferences';
import { LANGUAGES } from '../i18n';
import SettingsModal from './SettingsModal';
import NotificationBell from './NotificationBell';

/* ── Nav items ─────────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { to: '/',           key: 'nav.dashboard', icon: '⊞',  end: true,  adminOnly: false, badge: 'none' as const },
  { to: '/funds',      key: 'nav.funds',     icon: '🏦', end: false, adminOnly: false, badge: 'none' as const },
  { to: '/fx-rates',   key: 'nav.fxRates',   icon: '💱', end: false, adminOnly: false, badge: 'none' as const },
  { to: '/calculator', key: 'nav.calculator',icon: '🧮', end: false, adminOnly: false, badge: 'none' as const },
  { to: '/users',      key: 'nav.users',     icon: '👥', end: false, adminOnly: true,  badge: 'users' as const },
];

/* ── Role helpers ──────────────────────────────────────────────────────────── */
const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  admin:           { label: 'Administrator',    color: 'text-violet-400' },
  finance_manager: { label: 'Finance Manager',  color: 'text-blue-400'   },
  finance_staff:   { label: 'Finance Staff',    color: 'text-blue-400'   },
  board_member:    { label: 'Board Member',     color: 'text-amber-400'  },
  user:            { label: 'User',             color: 'text-slate-400'  },
};

function avatarInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/* ── Layout ─────────────────────────────────────────────────────────────────── */
export default function Layout() {
  const navigate = useNavigate();
  const { t }    = useTranslation();
  const prefs    = usePreferences();

  const raw   = localStorage.getItem('user') || '{}';
  const user  = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const isAdmin   = user.role === 'admin';
  const isReadOnly = ['board_member', 'user'].includes(user.role);

  const [pendingUsers,   setPendingUsers]   = useState(0);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showLangMenu,   setShowLangMenu]   = useState(false);
  const [queueSummary,   setQueueSummary]   = useState<{ done: number; failed: number; waiting: number } | null>(null);

  /* Upload queue indicator — reads localStorage, stays in sync via custom event */
  useEffect(() => {
    function update() {
      try {
        const stored = JSON.parse(localStorage.getItem('ims_upload_queue') ?? '[]');
        if (!Array.isArray(stored) || stored.length === 0) { setQueueSummary(null); return; }
        const done    = stored.filter((i: any) => i.status === 'done').length;
        const failed  = stored.filter((i: any) => i.status === 'failed').length;
        const waiting = stored.filter((i: any) => i.status === 'waiting').length;
        if (done + failed + waiting === 0) { setQueueSummary(null); return; }
        setQueueSummary({ done, failed, waiting });
      } catch { setQueueSummary(null); }
    }
    update();
    window.addEventListener('ims-queue-update', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('ims-queue-update', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  /* Poll pending counts every 30s (admin only) */
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    async function load() {
      try {
        const ur = await usersAPI.pendingCount();
        if (!cancelled) setPendingUsers(ur.data.count ?? 0);
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isAdmin]);

  function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    navigate('/login');
  }

  const NAV         = NAV_ITEMS.filter(({ adminOnly }) => !adminOnly || isAdmin);
  const currentLang = LANGUAGES.find(l => l.code === prefs.language);
  const roleInfo    = ROLE_DISPLAY[user.role] || { label: user.role, color: 'text-slate-400' };
  const initials    = avatarInitials(user.name || user.email || 'A');

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col select-none" style={{
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0d14 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}>

        {/* Brand */}
        <div className="px-4 py-4" style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-xs flex-shrink-0 shadow-lg">
              <img
                src="/thirdwave-logo.png"
                alt="TW"
                className="h-5 w-auto"
                onError={e => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  (img.parentElement as HTMLElement).textContent = 'TW';
                }}
              />
            </div>
            <div>
              <p className="font-bold text-sm text-white leading-none">ThirdWave IMS</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Investment Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest px-2.5 mb-2.5"
             style={{ color: 'rgba(255,255,255,0.2)' }}>
            {t('nav.navigation')}
          </p>
          {NAV.map(({ to, key, icon, end, badge }) => {
            const badgeCount = badge === 'users' ? pendingUsers : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative
                  ${isActive
                    ? 'text-white nav-active-glow'
                    : 'hover:text-white'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0.2) 100%)',
                  border: '1px solid rgba(99,102,241,0.4)',
                } : {
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid transparent',
                }}
              >
                {({ isActive }) => (<>
                  <span className={`text-base w-5 text-center flex-shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                    {icon}
                  </span>
                  <span className="flex-1 truncate">{t(key)}</span>
                  {badgeCount > 0 && isAdmin && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none
                      ${badge === 'users' ? 'bg-amber-500 text-white' : 'bg-yellow-400 text-gray-900'}`}>
                      {badgeCount}
                    </span>
                  )}
                </>)}
              </NavLink>
            );
          })}
        </nav>

        {/* Pending alerts */}
        {isAdmin && pendingUsers > 0 && (
          <div className="mx-2.5 mb-2 px-3 py-2.5 rounded-xl space-y-1.5" style={{
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
          }}>
            <div>
              <p className="text-amber-400 text-xs font-semibold">
                ⏳ {pendingUsers} {t('users.awaitingApproval')}
              </p>
              <button onClick={() => navigate('/users')}
                className="text-amber-300 hover:text-amber-200 text-xs underline underline-offset-2">
                {t('users.reviewNow')}
              </button>
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="px-3 py-3 space-y-2">

          {/* Quick controls */}
          <div className="flex items-center gap-1">
            {/* Language */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(p => !p)}
                title="Language"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{currentLang?.flag}</span>
                <span className="uppercase font-mono">{prefs.language}</span>
              </button>
              {showLangMenu && (
                <div className="absolute bottom-full left-0 mb-1 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[150px] animate-fade-in"
                     style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { prefs.setLanguage(lang.code); setShowLangMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left
                        ${prefs.language === lang.code ? 'text-white' : 'text-white/50 hover:text-white'}`}
                      style={prefs.language === lang.code
                        ? { background: 'rgba(99,102,241,0.3)' }
                        : {}}
                      onMouseEnter={e => { if (prefs.language !== lang.code) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={e => { if (prefs.language !== lang.code) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme */}
            <button
              onClick={() => prefs.setTheme(prefs.theme === 'dark' ? 'light' : 'dark')}
              title={prefs.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              className="p-1.5 rounded-lg text-base transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {prefs.theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="p-1.5 rounded-lg text-base transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              ⚙️
            </button>

            {/* Notifications */}
            <NotificationBell />

            {/* Sign out */}
            <button
              onClick={logout}
              title={t('nav.signOut')}
              className="p-1.5 rounded-lg text-base transition-colors ml-auto"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              🚪
            </button>
          </div>

          {/* User card */}
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl" style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate leading-none">
                {user.name || user.email || 'Admin'}
              </p>
              <p className={`text-xs mt-0.5 ${roleInfo.color}`}>{roleInfo.label}</p>
            </div>
            {isReadOnly && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                {t('nav.viewOnly')}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto transition-colors" style={{ background: 'var(--color-bg)' }}>
        <Outlet />
      </main>

      {/* Modals & overlays */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showLangMenu && <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />}

      {/* Upload queue indicator */}
      {queueSummary && (
        <button
          onClick={() => {
            navigate('/funds');
            window.dispatchEvent(new CustomEvent('ims-reset-fund-selection'));
          }}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold shadow-xl transition-all hover:scale-105"
          style={{
            background: queueSummary.failed > 0 ? 'rgba(239,68,68,0.92)' : 'rgba(16,185,129,0.92)',
            color:  'white',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)',
          }}
        >
          📤
          {queueSummary.done > 0    && <span>{queueSummary.done} done</span>}
          {queueSummary.failed > 0  && <span>{queueSummary.done > 0 ? ' · ' : ''}{queueSummary.failed} failed</span>}
          {queueSummary.waiting > 0 && <span>{(queueSummary.done + queueSummary.failed) > 0 ? ' · ' : ''}{queueSummary.waiting} waiting</span>}
          <span style={{ opacity: 0.75 }}>— view queue</span>
        </button>
      )}
    </div>
  );
}

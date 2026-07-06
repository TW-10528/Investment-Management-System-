import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { usersAPI } from '../services/api';
import { usePreferences } from '../contexts/usePreferences';
import { LANGUAGES } from '../i18n';
import SettingsModal from './SettingsModal';
import FloatingCalculator from './FloatingCalculator';

/* ── Nav items ─────────────────────────────────────────────────────────────── */
type SubItem = { to: string; section: string; label: string; labelKey?: string };
const NAV_ITEMS: {
  to: string; key: string; label?: string; labelKey?: string; icon: string; end: boolean;
  adminOnly: boolean; badge: 'none' | 'users'; children?: SubItem[];
}[] = [
  { to: '/',           key: 'nav.dashboard', icon: '⊞',  end: true,  adminOnly: false, badge: 'none' },
  { to: '/funds',      key: 'nav.funds',     icon: '🏦', end: false, adminOnly: false, badge: 'none',
    children: [
      { to: '/funds',                      section: 'manage',      label: 'Manage Funds',      labelKey: 'manageFunds.manageFunds' },
      { to: '/funds?section=comparison',   section: 'comparison',   label: 'Funds Comparison',  labelKey: 'nav.comparison' },
      { to: '/funds?section=reports',      section: 'reports',     label: 'Reports',           labelKey: 'nav.reports' },
    ] },
  { to: '/fx-rates',     key: 'nav.fxRates',   icon: '💱', end: false, adminOnly: false, badge: 'none' },
  { to: '/notifications',key: 'nav.alertsNotifications', labelKey: 'nav.alertsNotifications', icon: '🔔', end: false, adminOnly: false, badge: 'none' },
  { to: '/users',        key: 'nav.users',     icon: '👥', end: false, adminOnly: true,  badge: 'users' },
];

/* ── Role helpers ──────────────────────────────────────────────────────────── */
const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  admin:           { label: 'Administrator',    color: 'text-violet-600' },
  finance_manager: { label: 'Finance Manager',  color: 'text-blue-600'   },
  finance_staff:   { label: 'Finance Staff',    color: 'text-blue-600'   },
  board_member:    { label: 'Board Member',     color: 'text-amber-600'  },
  user:            { label: 'User',             color: 'text-slate-500'  },
};

function avatarInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/* ── Layout ─────────────────────────────────────────────────────────────────── */
export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t }    = useTranslation();
  const prefs    = usePreferences();

  // Current Funds sub-section (from ?section=…) for highlighting the sidebar sub-items
  const fundsSection = new URLSearchParams(location.search).get('section') || 'manage';
  const onFundsRoute = location.pathname === '/funds' || location.pathname.startsWith('/funds/');

  const raw   = localStorage.getItem('user') || '{}';
  const user  = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const isAdmin   = user.role === 'admin';

  const [pendingUsers,   setPendingUsers]   = useState(0);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showLangMenu,   setShowLangMenu]   = useState(false);

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
    const id = setInterval(() => {
      if (!cancelled && document.visibilityState === 'visible') load();
    }, 30_000);
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
      <aside className="w-[230px] flex-shrink-0 flex flex-col select-none" style={{
        background: 'var(--color-card)',
        borderRight: '1px solid var(--color-card-border)',
      }}>

        {/* Brand */}
        <div className="px-4 py-4" style={{
          background: 'linear-gradient(135deg, rgba(30,64,175,0.08) 0%, rgba(15,118,110,0.04) 100%)',
          borderBottom: '1px solid var(--color-card-border)',
        }}>
          <div className="flex items-center gap-2.5">
            <div className="w-16 h-12 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 186" className="w-full h-full object-contain" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Thirdwave logo">
                <path fill="#2735b3" d="M84 106 104 78h43L127 124z"/>
                <path fill="#2735b3" d="M131 124 163 66h49L178 116z"/>
                <path fill="#2735b3" d="M185 122 218 66 273 30 230 136z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-base theme-text leading-tight">{i18n.language === 'ja' ? 'サードウェーブ' : 'Thirdwave'}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest px-2.5 mb-2.5 theme-text-sub">
            {t('nav.navigation')}
          </p>
          {NAV.map(({ to, key, label, labelKey, icon, end, badge, children }) => {
            const badgeCount = badge === 'users' ? pendingUsers : 0;
            return (
              <div key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative
                    ${isActive ? 'font-semibold' : 'theme-text-muted hover:theme-text theme-row-hover'}`
                  }
                  style={({ isActive }) => isActive ? {
                    background: 'rgba(30,64,175,0.12)',
                    border: '1px solid rgba(30,64,175,0.30)',
                    color: '#1e40af',
                  } : {
                    border: '1px solid transparent',
                  }}
                >
                  {({ isActive }) => (<>
                    <span className={`text-base w-5 text-center flex-shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                      {icon}
                    </span>
                    <span className="flex-1 truncate">{labelKey ? t(labelKey) : (label ?? t(key))}</span>
                    {badgeCount > 0 && isAdmin && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none
                        ${badge === 'users' ? 'bg-amber-500 text-white' : 'bg-yellow-400 text-gray-900'}`}>
                        {badgeCount}
                      </span>
                    )}
                  </>)}
                </NavLink>

                {/* Sub-items (e.g. Funds → Manage / Reports / Cashflow) */}
                {children && onFundsRoute && (
                  <div className="mt-0.5 mb-1 ml-5 pl-3 space-y-0.5"
                       style={{ borderLeft: '1px solid var(--color-card-border)' }}>
                    {children.map(sub => {
                      const active = fundsSection === sub.section;
                      return (
                        <button
                          key={sub.section}
                          onClick={() => navigate(sub.to)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-colors
                            ${active ? 'font-semibold' : 'theme-text-muted hover:theme-text theme-row-hover'}`}
                          style={active ? { background: 'rgba(30,64,175,0.10)', color: '#1e40af' } : undefined}
                        >
                          {sub.labelKey ? t(sub.labelKey) : sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Settings — opens the preferences panel */}
          <button
            onClick={() => setShowSettings(true)}
            className="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all theme-text-muted hover:theme-text theme-row-hover"
            style={{ border: '1px solid transparent' }}
          >
            <span className="text-base w-5 text-center flex-shrink-0 opacity-70 group-hover:opacity-100">⚙️</span>
            <span className="flex-1 truncate text-left">{t('nav.settings')}</span>
          </button>
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
        <div style={{ borderTop: '1px solid var(--color-card-border)' }} className="px-3 py-3 space-y-2">

          {/* Quick controls */}
          <div className="flex items-center gap-1">
            {/* Language */}
            <div className="relative">
              <button
                onClick={() => setShowLangMenu(p => !p)}
                title="Language"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors theme-text-muted"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-row-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{currentLang?.flag}</span>
                <span className="uppercase font-mono">{prefs.language}</span>
              </button>
              {showLangMenu && (
                <div className="absolute bottom-full left-0 mb-1 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[150px] animate-fade-in"
                     style={{ background: 'var(--color-card)', border: '1px solid var(--color-card-border)' }}>
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { prefs.setLanguage(lang.code); setShowLangMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left
                        ${prefs.language === lang.code ? 'font-semibold theme-text' : 'theme-text-muted hover:theme-text'}`}
                      style={prefs.language === lang.code
                        ? { background: 'rgba(30,64,175,0.15)', color: '#1e40af' }
                        : {}}
                      onMouseEnter={e => { if (prefs.language !== lang.code) e.currentTarget.style.background = 'var(--color-row-hover)'; }}
                      onMouseLeave={e => { if (prefs.language !== lang.code) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* User card */}
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl" style={{
            background: 'var(--color-row-hover)',
            border: '1px solid var(--color-card-border)',
          }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #1e3a8a, #0f766e)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="theme-text text-xs font-semibold truncate leading-none">
                {user.name || user.email || 'Admin'}
              </p>
              <p className={`text-xs mt-0.5 ${roleInfo.color}`}>{roleInfo.label}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ color: '#dc2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.16)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto transition-colors" style={{ background: 'var(--color-bg)' }}>
        <Outlet />
      </main>

      {/* Modals & overlays */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showLangMenu && <div className="fixed inset-0 z-40" onClick={() => setShowLangMenu(false)} />}

      {/* Floating Calculator */}
      <FloatingCalculator />
    </div>
  );
}

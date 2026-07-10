import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usersAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ── Types ───────────────────────────────────────────────────────────────── */
interface User {
  id          : string;
  email       : string;
  full_name   : string;
  role        : string;
  status      : 'pending' | 'active' | 'inactive';
  is_active   : boolean;
  last_login  : string | null;
  created_at  : string | null;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-purple-500 to-fuchsia-600',
  'from-teal-500 to-sky-600',
  'from-orange-500 to-red-600',
];
function avatarGradient(email: string) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ── Password strength ───────────────────────────────────────────────────── */
function pwScore(pw: string) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
}
const SW_COLOR = ['', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
const SW_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

/* ── Edit / Add User Modal ───────────────────────────────────────────────── */
function UserModal({ mode, user, onClose, onSaved }: {
  mode: 'add' | 'edit'; user?: User; onClose: () => void; onSaved: () => void;
}) {
  const [fullName,  setFullName]  = useState(user?.full_name || '');
  const [email,     setEmail]     = useState(user?.email || '');
  const [role]                    = useState(user?.role || 'user');
  const [password,  setPassword]  = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [saving,    setSaving]    = useState(false);

  const score   = pwScore(password);
  const pwMatch = password === confirmPw;

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (mode === 'add' && !password) { toast.error('Password is required'); return; }
    if (password && !pwMatch)        { toast.error('Passwords do not match'); return; }
    if (password && score < 2)       { toast.error('Password is too weak'); return; }
    setSaving(true);
    try {
      if (mode === 'add') {
        await usersAPI.create({ full_name: fullName, email, role, password });
        toast.success(`${fullName} added successfully`);
      } else {
        const payload: Record<string, unknown> = { full_name: fullName, role };
        if (password) payload.password = password;
        await usersAPI.update(user!.id, payload);
        toast.success('User updated');
      }
      onSaved(); onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b theme-divider">
          <div>
            <h2 className="text-base font-semibold theme-text">
              {mode === 'add' ? '+ Add New User' : `Edit — ${user?.full_name}`}
            </h2>
            <p className="text-xs theme-text-muted mt-0.5">
              {mode === 'add' ? 'Directly creates an active user account' : 'Update user info and permissions'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
              className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm"
              placeholder="Full name" />
          </div>

          {mode === 'add' && (
            <div>
              <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm"
                placeholder="user@company.com" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              {mode === 'add' ? 'Password' : 'New Password (leave blank to keep current)'}
            </label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} required={mode === 'add'}
                className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm pr-12"
                placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs theme-text-muted hover:theme-text">
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {password && (
              <div className="mt-1.5 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`flex-1 h-1 rounded-full ${score >= i ? SW_COLOR[score] : 'bg-gray-200 dark:bg-gray-600'}`} />
                  ))}
                </div>
                <p className="text-xs theme-text-muted">{SW_LABEL[score]}</p>
              </div>
            )}
          </div>

          {password && (
            <div>
              <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">Confirm Password</label>
              <input type={showPw ? 'text' : 'password'} value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className={`theme-input w-full border rounded-xl px-3 py-2.5 text-sm ${
                  confirmPw ? pwMatch ? 'border-emerald-400 focus:border-emerald-500' : 'border-red-400 focus:border-red-500' : ''
                }`}
                placeholder="••••••••" />
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border theme-divider text-sm font-medium theme-text-muted hover:theme-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || (!!password && !pwMatch)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors">
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : mode === 'add' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Users Page ─────────────────────────────────────────────────────── */
export default function Users() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const raw  = localStorage.getItem('user') || '{}';
  const me   = (() => { try { return JSON.parse(raw); } catch { return {}; } })();

  const [users,         setUsers]         = useState<User[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState<'add' | 'edit' | null>(null);
  const [editTarget,    setEditTarget]    = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (me.role !== 'admin') navigate('/', { replace: true });
  }, [me.role, navigate]);

  const fetchUsers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await usersAPI.list();
      setUsers(res.data);
    } catch { if (!silent) toast.error('Failed to load users'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  // Initial load + poll every 20 s so new registrations appear automatically
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchUsers(true);
    }, 20_000);
    return () => clearInterval(id);
  }, [fetchUsers]);

  async function doApprove(u: User) {
    setActionLoading(u.id);
    try {
      await usersAPI.approve(u.id);
      toast.success(`✓ ${u.full_name} approved`);
      fetchUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Approval failed');
    } finally { setActionLoading(null); }
  }

  async function doReject(u: User) {
    if (!confirm(`Reject ${u.full_name}'s registration request?`)) return;
    setActionLoading(u.id);
    try {
      await usersAPI.reject(u.id);
      toast.success(`${u.full_name}'s request rejected`);
      fetchUsers();
    } catch { toast.error('Rejection failed'); }
    finally { setActionLoading(null); }
  }

  async function doDeactivate(u: User) {
    if (!confirm(`Deactivate ${u.full_name}? They will lose login access.`)) return;
    setActionLoading(u.id);
    try {
      await usersAPI.deactivate(u.id);
      toast.success(`${u.full_name} deactivated`);
      fetchUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Failed');
    } finally { setActionLoading(null); }
  }

  async function doReactivate(u: User) {
    setActionLoading(u.id);
    try {
      await usersAPI.update(u.id, { is_active: true });
      toast.success(`${u.full_name} re-activated`);
      fetchUsers();
    } catch { toast.error('Failed'); }
    finally { setActionLoading(null); }
  }

  const pending  = users.filter(u => u.status === 'pending');
  const active   = users.filter(u => u.status === 'active');
  const inactive = users.filter(u => u.status === 'inactive');


  /* ── User row component ── */
  function UserRow({ u }: { u: User }) {
    const isMe   = u.email === me.email;
    const busy   = actionLoading === u.id;
    return (
      <tr className="theme-row-hover border-b theme-divider last:border-0 transition-colors">
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gradient-to-br ${avatarGradient(u.email)}`}>
              {initials(u.full_name)}
            </div>
            <div>
              <p className="font-semibold theme-text text-sm leading-none">{u.full_name}</p>
              <p className="theme-text-muted text-xs mt-0.5">{u.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          {u.status === 'active'
            ? <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t('users.activeStatus')}
              </span>
            : <span className="flex items-center gap-1.5 theme-text-muted text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" /> {t('users.inactiveStatus')}
              </span>
          }
        </td>
        <td className="px-4 py-3.5 theme-text-muted text-xs">{fmtDateTime(u.last_login)}</td>
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setEditTarget(u); setModal('edit'); }}
              className="pill-btn theme-card theme-divider theme-text-muted hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400">
              ✎ {t('common.edit')}
            </button>
            {isMe ? (
              <span className="text-xs theme-text-sub px-2">{t('users.you')}</span>
            ) : u.status === 'active' ? (
              <button onClick={() => doDeactivate(u)} disabled={busy}
                className="pill-btn border-transparent text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 disabled:opacity-40">
                {busy ? '…' : t('users.deactivateAction')}
              </button>
            ) : (
              <button onClick={() => doReactivate(u)} disabled={busy}
                className="pill-btn border-transparent text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 disabled:opacity-40">
                {busy ? '…' : t('users.reactivate')}
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text flex items-center gap-2">
            👥 {t('users.title')}
            {pending.length > 0 && (
              <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-semibold animate-pulse-glow">
                {pending.length} {t('users.pendingWord')}
              </span>
            )}
          </h1>
          <p className="theme-text-muted text-sm mt-0.5">
            {active.length} active · {inactive.length} deactivated · max 10 seats
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchUsers()}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border theme-divider theme-text-muted hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm font-medium">
            ↻ {t('common.refresh')}
          </button>
          <button
            onClick={() => { setEditTarget(null); setModal('add'); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            {t('users.addUser')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 theme-text-muted">
          <span className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          {t('users.loadingUsers')}
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── PENDING APPROVALS ─────────────────────────────────────────────── */}
          {pending.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-bold theme-text">{t('users.pending')}</h2>
                <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {pending.length}
                </span>
              </div>
              <div className="space-y-3">
                {pending.map(u => {
                  const busy = actionLoading === u.id;
                  return (
                    <div key={u.id} className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 overflow-hidden animate-fade-in"
                         style={{ background: 'rgba(245,158,11,0.05)' }}>
                      <div className="px-5 py-4 flex items-start gap-4">
                        {/* Avatar */}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 bg-gradient-to-br ${avatarGradient(u.email)}`}>
                          {initials(u.full_name)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold theme-text">{u.full_name}</p>
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                              {t('users.newRegistration')}
                            </span>
                          </div>
                          <p className="theme-text-muted text-sm">{u.email}</p>
                          <p className="theme-text-sub text-xs mt-0.5">
                            Requested {fmtDateTime(u.created_at)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => doApprove(u)}
                            disabled={busy || active.length >= 10}
                            title={active.length >= 10 ? 'Max 10 active users reached' : ''}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-md shadow-emerald-500/20"
                          >
                            {busy
                              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : '✓'
                            }
                            {t('users.approve')}
                          </button>
                          <button
                            onClick={() => doReject(u)}
                            disabled={busy}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
                          >
                            ✕ {t('users.reject')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ACTIVE USERS BY ROLE GROUP ─────────────────────────────────── */}
          {active.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold theme-text">Active Users</h2>
                <span className="text-xs theme-text-muted">{active.length} / 10 seats used</span>
              </div>
              {/* Capacity bar */}
              <div className="progress-track">
                <div className="progress-fill-indigo" style={{ width: `${(active.length / 10) * 100}%` }} />
              </div>

              {/* Table header (shared) */}
              <div className="theme-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="theme-table-head border-b theme-divider">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">User</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Last Login</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-divider)]">
                    {active.map(u => <UserRow key={u.id} u={u} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── INACTIVE / REJECTED ─────────────────────────────────────────── */}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-sm font-bold theme-text mb-3">
                Deactivated / Rejected
                <span className="ml-2 text-xs font-normal theme-text-muted">({inactive.length})</span>
              </h2>
              <div className="theme-card border rounded-xl overflow-hidden opacity-70">
                <table className="w-full text-sm">
                  <thead className="theme-table-head border-b theme-divider">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">User</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Last Login</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>{inactive.map(u => <UserRow key={u.id} u={u} />)}</tbody>
                </table>
              </div>
            </div>
          )}

          {active.length === 0 && pending.length === 0 && (
            <div className="theme-card border rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">👥</div>
              <h3 className="font-semibold theme-text mb-1">No users yet</h3>
              <p className="theme-text-muted text-sm">Add users or approve registrations to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <UserModal
          mode={modal}
          user={editTarget ?? undefined}
          onClose={() => { setModal(null); setEditTarget(null); }}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
}

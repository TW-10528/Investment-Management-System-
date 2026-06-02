import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../services/api';

interface Notification {
  id:         string;
  type:       string;
  title:      string;
  message:    string;
  link?:      string;
  is_read:    boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  user_registered:  '👤',
  user_approved:    '✅',
  user_rejected:    '❌',
  notice_uploaded:  '📄',
  notice_approved:  '✅',
  notice_rejected:  '❌',
  capital_call_due: '⏰',
  general:          '🔔',
};

const TYPE_COLORS: Record<string, string> = {
  user_registered:  'text-blue-400',
  user_approved:    'text-emerald-400',
  user_rejected:    'text-red-400',
  notice_uploaded:  'text-indigo-400',
  notice_approved:  'text-emerald-400',
  notice_rejected:  'text-red-400',
  capital_call_due: 'text-amber-400',
  general:          'text-gray-400',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open,         setOpen]         = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread,        setUnread]        = useState(0);
  const [loading,       setLoading]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await notificationsAPI.list();
      setNotifications(res.data.notifications ?? []);
      setUnread(res.data.unread_count ?? 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  async function markRead(n: Notification) {
    if (!n.is_read) {
      await notificationsAPI.markRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(v => Math.max(0, v - 1));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }

  async function markAll() {
    setLoading(true);
    await notificationsAPI.markAll();
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnread(0);
    setLoading(false);
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-white/10"
        title="Notifications"
      >
        <span className="text-lg" style={{ color: unread > 0 ? '#f59e0b' : undefined }}>🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 w-[360px] rounded-2xl shadow-2xl z-50 overflow-hidden"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold theme-text">Notifications</span>
              {unread > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAll} disabled={loading}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-sm theme-text-muted">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => markRead(n)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                  style={{
                    background:  n.is_read ? 'transparent' : 'rgba(99,102,241,0.05)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className={`text-xs font-semibold truncate ${n.is_read ? 'theme-text-muted' : 'theme-text'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] theme-text-muted flex-shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-xs theme-text-muted leading-relaxed line-clamp-2">{n.message}</p>
                    {n.link && (
                      <p className={`text-[10px] mt-1 ${TYPE_COLORS[n.type] ?? 'text-indigo-400'}`}>
                        View →
                      </p>
                    )}
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2.5 text-center" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setOpen(false)} className="text-xs theme-text-muted hover:theme-text transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

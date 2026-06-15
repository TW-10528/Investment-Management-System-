import { useState, useEffect, useCallback } from 'react';
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
  user_registered:  '#60a5fa',
  user_approved:    '#34d399',
  user_rejected:    '#f87171',
  notice_uploaded:  '#818cf8',
  notice_approved:  '#34d399',
  notice_rejected:  '#f87171',
  capital_call_due: '#fbbf24',
  general:          '#94a3b8',
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
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread,        setUnread]        = useState(0);
  const [loading,       setLoading]       = useState(false);

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
    <>
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

      {/* Panel + backdrop */}
      {open && (
        <>
          {/* Transparent backdrop — closes panel on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Notification panel — fixed in the top-right of the main content area */}
          <div
            className="fixed z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
            style={{
              top:       '16px',
              right:     '16px',
              width:     '380px',
              maxHeight: 'calc(100vh - 32px)',
              background: 'var(--color-card)',
              border:     '1px solid var(--color-card-border)',
              boxShadow:  '0 25px 50px -12px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.15)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-card-border)' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">🔔</span>
                <span className="text-sm font-bold theme-text">Notifications</span>
                {unread > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                    {unread} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button
                    onClick={markAll}
                    disabled={loading}
                    className="text-xs transition-colors disabled:opacity-50"
                    style={{ color: '#818cf8' }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-sm theme-text-muted hover:theme-text transition-colors"
                  style={{ background: 'rgba(100,116,139,0.1)' }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-16 text-center px-6">
                  <p className="text-4xl mb-3 opacity-30">🔔</p>
                  <p className="text-sm font-medium theme-text">All caught up</p>
                  <p className="text-xs theme-text-muted mt-1">No notifications yet</p>
                </div>
              ) : (
                <div>
                  {notifications.map((n, i) => (
                    <button
                      key={n.id}
                      onClick={() => markRead(n)}
                      className="w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/5 group"
                      style={{
                        background:   !n.is_read ? 'rgba(99,102,241,0.05)' : undefined,
                        borderBottom: i < notifications.length - 1 ? '1px solid var(--color-card-border)' : undefined,
                      }}
                    >
                      {/* Unread indicator */}
                      <div className="flex-shrink-0 mt-1 w-2 flex items-start justify-center">
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-indigo-500 block" />
                        )}
                      </div>

                      {/* Icon */}
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {TYPE_ICONS[n.type] ?? '🔔'}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-semibold leading-snug ${n.is_read ? 'theme-text-muted' : 'theme-text'}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] theme-text-muted flex-shrink-0 mt-0.5">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="text-xs theme-text-muted leading-relaxed mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        {n.link && (
                          <p className="text-[11px] mt-1.5 font-medium group-hover:underline"
                            style={{ color: TYPE_COLORS[n.type] ?? '#818cf8' }}>
                            View →
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div
                className="px-5 py-2.5 flex items-center justify-between flex-shrink-0"
                style={{ borderTop: '1px solid var(--color-card-border)' }}
              >
                <span className="text-[11px] theme-text-muted">
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs theme-text-muted hover:theme-text transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

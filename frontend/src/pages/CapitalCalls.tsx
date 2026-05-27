import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { capitalCallsAPI, fundsAPI } from '../services/api';
import type { CapitalCall } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const STATUS_TABS = ['all', 'pending', 'approved', 'paid', 'cancelled'] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  approved:  'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  paid:      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  cancelled: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
};

/* ── Role helper ── */
function useCanEdit() {
  const raw  = localStorage.getItem('user') || '{}';
  const user = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  return ['admin', 'finance_manager', 'finance_staff'].includes(user.role ?? '');
}

export default function CapitalCalls() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [calls, setCalls]       = useState<CapitalCall[]>([]);
  const [fundMap, setFundMap]   = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<StatusTab>('all');
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    fundsAPI.list().then(r => {
      const map: Record<string, string> = {};
      for (const f of r.data) map[f.fund_id] = f.fund_name;
      setFundMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchCalls(); }, [tab]);

  async function fetchCalls() {
    setLoading(true);
    try {
      const status = tab === 'all' ? undefined : tab;
      const r = await capitalCallsAPI.list(undefined, status);
      setCalls(r.data);
    } catch {
      toast.error('Failed to load capital calls');
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: string) {
    if (!canEdit) return;
    setActionId(id);
    try {
      await capitalCallsAPI.approve(id);
      toast.success('Call approved');
      fetchCalls();
    } catch {
      toast.error('Approve failed');
    } finally {
      setActionId(null);
    }
  }

  async function markPaid(id: string) {
    if (!canEdit) return;
    setActionId(id);
    try {
      await capitalCallsAPI.markPaid(id);
      toast.success('Marked as paid');
      fetchCalls();
    } catch {
      toast.error('Action failed');
    } finally {
      setActionId(null);
    }
  }

  const today  = new Date().toISOString().slice(0, 10);
  const totals = {
    gross: calls.reduce((s, c) => s + c.gross_call_usd, 0),
    net:   calls.reduce((s, c) => s + c.net_call_usd,   0),
    jpy:   calls.reduce((s, c) => s + c.net_call_jpy,   0),
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('capitalCalls.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">
            {calls.length} {calls.length !== 1 ? 'calls' : 'call'} {t('capitalCalls.shown')}
          </p>
        </div>
        {!canEdit && (
          <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
            👁 {t('nav.viewOnly')}
          </span>
        )}
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg">🔒</span>
          <span>{t('capitalCalls.viewOnly')}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('capitalCalls.gross')}</p>
          <p className="text-xl font-bold theme-text mt-1">{fmt.usd(totals.gross, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('capitalCalls.netUsd')}</p>
          <p className="text-xl font-bold theme-text mt-1">{fmt.usd(totals.net, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('capitalCalls.netJpy')}</p>
          <p className="text-xl font-bold theme-text mt-1">{fmt.jpy(totals.jpy)}</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-black/20 border theme-border rounded-xl p-1 w-fit">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === s
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'theme-text-sub hover:theme-text'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="theme-card border theme-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-16 theme-text-sub">
            <p className="text-3xl mb-2">📋</p>
            <p>{t('capitalCalls.noCalls')} "{tab}"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b theme-border bg-black/10">
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('common.fund')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.noticeDate')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.dueDate')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.paidDate')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.grossUsd')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.netUsdCol')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.netJpyCol')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('capitalCalls.fx')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('common.status')}</th>
                  {canEdit && (
                    <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('common.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {calls.map(call => {
                  const overdue  = call.status === 'pending' && call.due_date < today;
                  const fundName = call.fund_name || fundMap[call.fund_id] || call.fund_id.slice(0, 8) + '…';
                  return (
                    <tr key={call.id} className={`hover:bg-white/3 transition-colors ${overdue ? 'bg-red-500/5' : ''}`}>
                      <td className="px-4 py-3 font-mono theme-text-sub">{call.call_number ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium theme-text text-xs">{fundName}</p>
                        {call.wire_reference && <p className="theme-text-sub text-xs">Ref: {call.wire_reference}</p>}
                      </td>
                      <td className="px-4 py-3 theme-text-sub text-xs">{fmt.date(call.notice_date)}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${overdue ? 'text-red-400' : 'theme-text-sub'}`}>
                        {fmt.date(call.due_date)}
                        {overdue && <span className="ml-1 text-red-400">⚠</span>}
                      </td>
                      <td className="px-4 py-3 theme-text-sub text-xs">{fmt.date(call.paid_at) ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub">{fmt.usd(call.gross_call_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold theme-text">{fmt.usd(call.net_call_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub">{fmt.jpy(call.net_call_jpy)}</td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub">{fmt.rate(call.fx_rate)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[call.status] ?? 'bg-slate-500/15 text-slate-400'}`}>
                          {call.status.toUpperCase()}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {call.status === 'pending' && (
                              <button
                                onClick={() => approve(call.id)}
                                disabled={actionId === call.id}
                                className="px-2.5 py-1 text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg disabled:opacity-50 transition-colors"
                              >
                                {t('capitalCalls.approve')}
                              </button>
                            )}
                            {call.status === 'approved' && (
                              <button
                                onClick={() => markPaid(call.id)}
                                disabled={actionId === call.id}
                                className="px-2.5 py-1 text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg disabled:opacity-50 transition-colors"
                              >
                                {t('capitalCalls.markPaid')}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

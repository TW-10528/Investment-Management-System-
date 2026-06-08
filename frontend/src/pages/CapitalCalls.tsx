import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { capitalCallsAPI, fundsAPI, fxRatesAPI } from '../services/api';
import type { CapitalCall, FundSummary } from '../types/index';
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

/* ══════════════════ Create Capital Call Modal ══════════════════════════ */
function CreateCallModal({
  funds, onClose, onSaved,
}: { funds: FundSummary[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    fund_id          : funds[0]?.fund_id ?? '',
    notice_date      : today,
    due_date         : '',
    gross_call_usd   : '',
    call_pct         : '',
    distribution_usd : '0',
    reinvestable_usd : '0',
    fx_rate          : '',
    notes            : '',
    initial_status   : 'pending',
  });
  const [saving,     setSaving]     = useState(false);
  const [fetchingFx, setFetchingFx] = useState(false);

  // Auto-compute gross from % of commitment
  useEffect(() => {
    const pct  = parseFloat(form.call_pct);
    const fund = funds.find(f => f.fund_id === form.fund_id);
    if (pct > 0 && fund && fund.commitment_usd > 0) {
      setForm(f => ({ ...f, gross_call_usd: String((fund.commitment_usd * pct / 100).toFixed(0)) }));
    }
  }, [form.call_pct, form.fund_id, funds]);

  const gross  = parseFloat(form.gross_call_usd)   || 0;
  const dist   = parseFloat(form.distribution_usd) || 0;
  const reinv  = parseFloat(form.reinvestable_usd) || 0;
  const fx     = parseFloat(form.fx_rate)           || 0;
  const netUSD = gross - dist + reinv;
  const netJPY = fx > 0 ? netUSD * fx : 0;

  async function fetchLiveFx() {
    setFetchingFx(true);
    try {
      const r = await fxRatesAPI.live();
      setForm(f => ({ ...f, fx_rate: r.data.usd_jpy.toFixed(4) }));
      toast.success(`Live rate: ¥${r.data.usd_jpy.toFixed(2)}`);
    } catch { toast.error('Could not fetch live rate'); }
    finally { setFetchingFx(false); }
  }

  async function handleSave() {
    if (!form.fund_id || !form.due_date || !form.gross_call_usd) {
      toast.error('Fund, due date and gross amount are required');
      return;
    }
    setSaving(true);
    try {
      await capitalCallsAPI.create({
        fund_id          : form.fund_id,
        notice_date      : form.notice_date,
        due_date         : form.due_date,
        gross_call_usd   : parseFloat(form.gross_call_usd),
        distribution_usd : parseFloat(form.distribution_usd) || 0,
        reinvestable_usd : parseFloat(form.reinvestable_usd) || 0,
        fx_rate          : form.fx_rate ? parseFloat(form.fx_rate) : null,
        notes            : form.notes || null,
        initial_status   : form.initial_status === 'paid' ? 'paid' : undefined,
      });
      toast.success('Capital call created');
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  const set  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const iCls = 'w-full theme-input rounded-xl px-3 py-2.5 text-sm';
  const lCls = 'block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5';

  const selectedFund = funds.find(f => f.fund_id === form.fund_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border flex-shrink-0">
          <div>
            <h2 className="font-semibold theme-text">{t('capitalCalls.newCall')}</h2>
            <p className="text-xs theme-text-muted mt-0.5">{t('capitalCalls.createDesc')}</p>
          </div>
          <button onClick={onClose} className="theme-text-sub hover:theme-text text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Fund */}
          <div>
            <label className={lCls}>{t('common.fund')} <span className="text-red-400">*</span></label>
            <select value={form.fund_id} onChange={e => set('fund_id', e.target.value)} className={iCls}>
              <option value="">{t('capitalCalls.selectFund')}</option>
              {funds.map(f => (
                <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
              ))}
            </select>
            {selectedFund && (
              <p className="text-xs theme-text-muted mt-1">
                Commitment: ${selectedFund.commitment_usd.toLocaleString()} ·
                Unfunded: ${selectedFund.unfunded_usd.toLocaleString()}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>{t('capitalCalls.noticeDate')}</label>
              <input type="date" value={form.notice_date} onChange={e => set('notice_date', e.target.value)} className={iCls} />
            </div>
            <div>
              <label className={lCls}>{t('capitalCalls.dueDate')} <span className="text-red-400">*</span></label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={iCls} />
            </div>
          </div>

          {/* Gross amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>{t('capitalCalls.grossCallAmt')} <span className="text-red-400">*</span></label>
              <input type="number" value={form.gross_call_usd} onChange={e => set('gross_call_usd', e.target.value)}
                className={iCls} step="any" placeholder="e.g. 5,000,000" />
            </div>
            <div>
              <label className={lCls}>{t('capitalCalls.callPctLabel')}</label>
              <input type="number" value={form.call_pct} onChange={e => set('call_pct', e.target.value)}
                className={iCls} step="0.1" placeholder="e.g. 25" min="0" max="100" />
              <p className="text-xs theme-text-muted mt-1">{t('capitalCalls.autoFills')}</p>
            </div>
          </div>

          {/* Net adjustments */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>{t('capitalCalls.distOffset')}</label>
              <input type="number" value={form.distribution_usd} onChange={e => set('distribution_usd', e.target.value)}
                className={iCls} step="any" placeholder="0" />
              <p className="text-xs theme-text-muted mt-1">{t('capitalCalls.reducesNet')}</p>
            </div>
            <div>
              <label className={lCls}>{t('capitalCalls.reinvestableAmt')}</label>
              <input type="number" value={form.reinvestable_usd} onChange={e => set('reinvestable_usd', e.target.value)}
                className={iCls} step="any" placeholder="0" />
              <p className="text-xs theme-text-muted mt-1">{t('capitalCalls.addsBack')}</p>
            </div>
          </div>

          {/* FX rate */}
          <div>
            <label className={lCls}>{t('capitalCalls.usdJpyRate')}</label>
            <div className="flex gap-2">
              <input type="number" value={form.fx_rate} onChange={e => set('fx_rate', e.target.value)}
                className={iCls} step="0.0001" placeholder="e.g. 150.0000" />
              <button onClick={fetchLiveFx} disabled={fetchingFx}
                className="px-3 py-2.5 bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium hover:bg-indigo-600/25 disabled:opacity-50 transition-colors flex-shrink-0 whitespace-nowrap">
                {fetchingFx ? '…' : '🔄 Live'}
              </button>
            </div>
          </div>

          {/* Notes & status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>{t('common.notes')}</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                rows={2} className={`${iCls} resize-none`} placeholder="Optional notes…" />
            </div>
            <div>
              <label className={lCls}>{t('capitalCalls.initialStatus')}</label>
              <select value={form.initial_status} onChange={e => set('initial_status', e.target.value)} className={iCls}>
                <option value="pending">{t('capitalCalls.pendingNew')}</option>
                <option value="paid">{t('capitalCalls.paidHistorical')}</option>
              </select>
            </div>
          </div>

          {/* Live calculation preview */}
          {gross > 0 && (
            <div className="rounded-xl p-4 space-y-2"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">{t('capitalCalls.calcNetCall')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs theme-text-muted">{t('capitalCalls.netUsd')}</p>
                  <p className="text-lg font-bold text-indigo-300 tabular-nums">${netUSD.toLocaleString()}</p>
                  <p className="text-[10px] theme-text-muted">= ${gross.toLocaleString()} − ${dist.toLocaleString()} + ${reinv.toLocaleString()}</p>
                </div>
                {netJPY > 0 && (
                  <div>
                    <p className="text-xs theme-text-muted">{t('capitalCalls.netJpy')}</p>
                    <p className="text-lg font-bold text-emerald-300 tabular-nums">¥{netJPY.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}</p>
                    <p className="text-[10px] theme-text-muted">@ ¥{form.fx_rate}/USD</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t theme-border flex justify-between items-center flex-shrink-0">
          <p className="text-xs theme-text-muted">{t('capitalCalls.allAmountsUsd')}</p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm theme-text-sub hover:bg-white/5 rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving || !form.fund_id || !form.due_date || !form.gross_call_usd}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? t('capitalCalls.creating') : t('capitalCalls.createCall')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ Main page ══════════════════════════════════ */
export default function CapitalCalls() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [calls,    setCalls]    = useState<CapitalCall[]>([]);
  const [funds,    setFunds]    = useState<FundSummary[]>([]);
  const [fundMap,  setFundMap]  = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<StatusTab>('all');
  const [actionId, setActionId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fundsAPI.list().then(r => {
      const map: Record<string, string> = {};
      for (const f of r.data) map[f.fund_id] = f.fund_name;
      setFundMap(map);
      setFunds(r.data);
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

  // Per-status counts for header pills
  const counts: Record<string, number> = { all: calls.length };
  calls.forEach(c => { counts[c.status] = (counts[c.status] ?? 0) + 1; });

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('capitalCalls.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">
            {calls.length} {calls.length !== 1 ? 'calls' : 'call'} {t('capitalCalls.shown')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!canEdit && (
            <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              👁 {t('nav.viewOnly')}
            </span>
          )}
          {canEdit && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
              {t('capitalCalls.newButton')}
            </button>
          )}
        </div>
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
          <p className="text-xl font-bold theme-text mt-1 tabular-nums">{fmt.usd(totals.gross, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('capitalCalls.netUsd')}</p>
          <p className="text-xl font-bold theme-text mt-1 tabular-nums">{fmt.usd(totals.net, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('capitalCalls.netJpy')}</p>
          <p className="text-xl font-bold theme-text mt-1 tabular-nums">{fmt.jpy(totals.jpy)}</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-black/20 border theme-border rounded-xl p-1 w-fit flex-wrap">
        {STATUS_TABS.map(s => {
          const STATUS_LABELS: Record<string, string> = {
            all: t('capitalCalls.statusAll'),
            pending: t('capitalCalls.statusPending'),
            approved: t('capitalCalls.statusApproved'),
            paid: t('capitalCalls.statusPaid'),
            cancelled: t('capitalCalls.statusCancelled'),
          };
          return (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === s ? 'bg-indigo-600 text-white shadow-sm' : 'theme-text-sub hover:theme-text'
            }`}
          >
            {STATUS_LABELS[s] ?? s}
            {counts[s] != null && counts[s] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                tab === s ? 'bg-white/20 text-white' : 'bg-white/10 theme-text-sub'
              }`}>
                {counts[s]}
              </span>
            )}
          </button>
          );
        })}
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
            {canEdit && tab === 'all' && (
              <button onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
                {t('capitalCalls.createFirst')}
              </button>
            )}
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
                                className="px-2.5 py-1 text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 rounded-lg disabled:opacity-50 transition-colors">
                                {t('capitalCalls.approve')}
                              </button>
                            )}
                            {call.status === 'approved' && (
                              <button
                                onClick={() => markPaid(call.id)}
                                disabled={actionId === call.id}
                                className="px-2.5 py-1 text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg disabled:opacity-50 transition-colors">
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

      {/* Create modal */}
      {showCreate && canEdit && (
        <CreateCallModal
          funds={funds}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchCalls(); }}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { distributionsAPI, fundsAPI, fxRatesAPI } from '../services/api';
import type { Distribution, FundSummary } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const DIST_TYPES = ['Capital Return', 'Income', 'Recallable', 'Deemed'] as const;
type DistType = typeof DIST_TYPES[number];

const TYPE_BADGE: Record<string, string> = {
  'Capital Return': 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  Income:           'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Recallable:       'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  Deemed:           'bg-violet-500/15 text-violet-400 border border-violet-500/30',
};

const TYPE_DESC: Record<string, string> = {
  'Capital Return': 'Return of invested principal to LP',
  Income:           'Profit / interest income distribution',
  Recallable:       'Can be recalled by the GP for future use',
  Deemed:           'Deemed / notional distribution',
};

/* ── Role helper ── */
function useCanEdit() {
  return true;   // every signed-in user can edit (no role differentiation)
}

/* ══════════════════ Create Distribution Modal ══════════════════════════ */
function CreateDistModal({
  funds, onClose, onSaved,
}: { funds: FundSummary[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    fund_id           : funds[0]?.fund_id ?? '',
    distribution_date : today,
    dist_type         : 'Capital Return' as DistType,
    amount_usd        : '',
    fx_rate           : '',
    reinvestable_usd  : '0',
    is_recallable     : false,
    recall_expiry     : '',
    notes             : '',
  });
  const [saving,     setSaving]     = useState(false);
  const [fetchingFx, setFetchingFx] = useState(false);

  const amount = parseFloat(form.amount_usd) || 0;
  const fx     = parseFloat(form.fx_rate)    || 0;
  const reinv  = parseFloat(form.reinvestable_usd) || 0;
  const amtJPY = fx > 0 ? amount * fx : 0;

  // Get selected fund to check if it's JPY-only (e.g., SDG)
  const selectedFund = funds.find(f => f.fund_id === form.fund_id);
  const isJpyOnly = selectedFund?.currency === 'JPY';

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
    if (!form.fund_id || !form.distribution_date || !form.amount_usd) {
      toast.error('Fund, date and amount are required');
      return;
    }
    setSaving(true);
    try {
      await distributionsAPI.create({
        fund_id           : form.fund_id,
        distribution_date : form.distribution_date,
        dist_type         : form.dist_type,
        amount_usd        : parseFloat(form.amount_usd),
        fx_rate           : form.fx_rate ? parseFloat(form.fx_rate) : null,
        reinvestable_usd  : parseFloat(form.reinvestable_usd) || 0,
        is_recallable     : form.is_recallable,
        recall_expiry     : form.is_recallable && form.recall_expiry ? form.recall_expiry : null,
        notes             : form.notes || null,
      });
      toast.success('Distribution created');
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  const set  = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const iCls = 'w-full theme-input rounded-xl px-3 py-2.5 text-sm';
  const lCls = 'block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border flex-shrink-0">
          <div>
            <h2 className="font-semibold theme-text">New Distribution</h2>
            <p className="text-xs theme-text-muted mt-0.5">Record a distribution from a portfolio fund</p>
          </div>
          <button onClick={onClose} className="theme-text-sub hover:theme-text text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Fund + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>Fund <span className="text-red-400">*</span></label>
              <select value={form.fund_id} onChange={e => set('fund_id', e.target.value)} className={iCls}>
                <option value="">Select fund…</option>
                {funds.map(f => (
                  <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lCls}>Distribution Date <span className="text-red-400">*</span></label>
              <input type="date" value={form.distribution_date} onChange={e => set('distribution_date', e.target.value)} className={iCls} />
            </div>
          </div>

          {/* Distribution type selector */}
          <div>
            <label className={lCls}>Distribution Type <span className="text-red-400">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {DIST_TYPES.map(type => (
                <button key={type} type="button" onClick={() => set('dist_type', type)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                    form.dist_type === type
                      ? TYPE_BADGE[type]
                      : 'border-white/8 hover:border-white/20'
                  }`}
                  style={form.dist_type !== type ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                  <p className="text-xs font-semibold">{type}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{TYPE_DESC[type]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lCls}>Distribution Amount (USD) <span className="text-red-400">*</span></label>
              <input type="number" value={form.amount_usd} onChange={e => set('amount_usd', e.target.value)}
                className={iCls} step="any" placeholder="e.g. 1,500,000" />
            </div>
            <div>
              <label className={lCls}>Reinvestable Amount (USD)</label>
              <input type="number" value={form.reinvestable_usd} onChange={e => set('reinvestable_usd', e.target.value)}
                className={iCls} step="any" placeholder="0" />
              <p className="text-xs theme-text-muted mt-1">Portion re-invested (not taken as cash)</p>
            </div>
          </div>

          {/* FX rate — hidden for JPY-only funds */}
          {!isJpyOnly && (
            <div>
              <label className={lCls}>USD / JPY Rate</label>
              <div className="flex gap-2">
                <input type="number" value={form.fx_rate} onChange={e => set('fx_rate', e.target.value)}
                  className={iCls} step="0.0001" placeholder="e.g. 150.0000" />
                <button onClick={fetchLiveFx} disabled={fetchingFx}
                  className="px-3 py-2.5 bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium hover:bg-indigo-600/25 disabled:opacity-50 transition-colors flex-shrink-0 whitespace-nowrap">
                  {fetchingFx ? '…' : '🔄 Live'}
                </button>
              </div>
            </div>
          )}

          {/* Recallable */}
          <div className="flex items-start gap-3 p-4 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_recallable} onChange={e => set('is_recallable', e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500" />
              <span className="text-sm font-medium text-amber-400">Recallable Distribution</span>
            </label>
            {form.is_recallable && (
              <div className="ml-auto">
                <label className={`${lCls} text-amber-400`}>Recall Expiry Date</label>
                <input type="date" value={form.recall_expiry} onChange={e => set('recall_expiry', e.target.value)}
                  className={`${iCls} max-w-[180px]`} />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={lCls}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} className={`${iCls} resize-none`} placeholder="Optional notes…" />
          </div>

          {/* Preview */}
          {amount > 0 && (
            <div className="rounded-xl p-4 space-y-2"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Distribution Preview</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] theme-text-muted">Amount ({isJpyOnly ? 'JPY' : 'USD'})</p>
                  <p className="text-base font-bold text-emerald-300 tabular-nums">{fmt.usd(amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] theme-text-muted">Reinvestable</p>
                  <p className="text-base font-bold text-blue-300 tabular-nums">{fmt.usd(reinv)}</p>
                </div>
                {amtJPY > 0 && (
                  <div>
                    <p className="text-[10px] theme-text-muted">Amount (JPY)</p>
                    <p className="text-base font-bold text-emerald-300 tabular-nums">
                      ¥{amtJPY.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t theme-border flex justify-between items-center flex-shrink-0">
          <p className="text-xs theme-text-muted">All amounts in USD unless stated</p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm theme-text-sub hover:bg-white/5 rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving || !form.fund_id || !form.distribution_date || !form.amount_usd}
              className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Distribution'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ Main page ══════════════════════════════════ */
export default function Distributions() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [dists,    setDists]    = useState<Distribution[]>([]);
  const [funds,    setFunds]    = useState<FundSummary[]>([]);
  const [fundMap,  setFundMap]  = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fundsAPI.list().then(r => {
      const map: Record<string, string> = {};
      for (const f of r.data) map[f.fund_id] = f.fund_name;
      setFundMap(map);
      setFunds(r.data);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchDists(); }, []);

  async function fetchDists() {
    setLoading(true);
    try {
      const r = await distributionsAPI.list();
      setDists(r.data);
    } catch {
      toast.error('Failed to load distributions');
    } finally {
      setLoading(false);
    }
  }

  async function deleteDist(id: string) {
    if (!canEdit) return;
    if (!confirm(t('distributions.deleteConfirm'))) return;
    setDeleting(id);
    try {
      await distributionsAPI.delete(id);
      toast.success('Distribution deleted');
      fetchDists();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  const TYPES    = ['all', ...Array.from(new Set(dists.map(d => d.dist_type)))];
  const filtered = filter === 'all' ? dists : dists.filter(d => d.dist_type === filter);

  const totals = {
    usd         : filtered.reduce((s, d) => s + d.amount_usd, 0),
    jpy         : filtered.reduce((s, d) => s + d.amount_jpy, 0),
    reinvestable: filtered.reduce((s, d) => s + d.reinvestable_usd, 0),
    recallable  : filtered.filter(d => d.is_recallable && !d.is_recalled).reduce((s, d) => s + d.amount_usd, 0),
  };

  // Type breakdown for summary
  const typeTotals: Record<string, number> = {};
  filtered.forEach(d => { typeTotals[d.dist_type] = (typeTotals[d.dist_type] ?? 0) + d.amount_usd; });

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('distributions.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">{t('distributions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!canEdit && (
            <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              👁 {t('nav.viewOnly')}
            </span>
          )}
          {canEdit && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
              + New Distribution
            </button>
          )}
        </div>
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg">🔒</span>
          <span>{t('distributions.viewOnly')}</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.totalUsd')}</p>
          <p className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">{fmt.usd(totals.usd, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.totalJpy')}</p>
          <p className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">{fmt.jpy(totals.jpy)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.reinvestable')}</p>
          <p className="text-xl font-bold text-blue-400 mt-1 tabular-nums">{fmt.usd(totals.reinvestable, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.recallable')}</p>
          <p className="text-xl font-bold text-amber-400 mt-1 tabular-nums">{fmt.usd(totals.recallable, true)}</p>
        </div>
      </div>

      {/* Type breakdown mini-bar */}
      {totals.usd > 0 && Object.keys(typeTotals).length > 1 && (
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide mb-2">Distribution Mix</p>
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            {Object.entries(typeTotals).map(([type, val]) => {
              const badge = TYPE_BADGE[type] ?? '';
              const color = badge.includes('blue') ? '#3b82f6'
                : badge.includes('emerald') ? '#10b981'
                : badge.includes('yellow') ? '#f59e0b'
                : '#8b5cf6';
              return (
                <div key={type} className="h-full rounded-sm" title={`${type}: ${fmt.usd(val)}`}
                  style={{ width: `${(val / totals.usd) * 100}%`, background: color }} />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {Object.entries(typeTotals).map(([type, val]) => {
              const badge = TYPE_BADGE[type] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
              return (
                <span key={type} className={`text-xs px-2 py-0.5 rounded-full border ${badge}`}>
                  {type}: {fmt.usd(val, true)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-black/20 border theme-border rounded-xl p-1 w-fit flex-wrap">
        {TYPES.map(t2 => (
          <button
            key={t2}
            onClick={() => setFilter(t2)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t2 ? 'bg-indigo-600 text-white shadow-sm' : 'theme-text-sub hover:theme-text'
            }`}
          >
            {t2}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="theme-card border theme-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 theme-text-sub">
            <p className="text-3xl mb-2">💸</p>
            <p>{t('distributions.noData')}</p>
            {canEdit && filter === 'all' && (
              <button onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors">
                + Create First Distribution
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b theme-border bg-black/10">
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('common.fund')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.type')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.amountUsd')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.amountJpy')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.reinvestable')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.fxRate')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.recallableCol')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.recallExpiry')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('distributions.recalled')}</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(dist => {
                  const fundName = dist.fund_name || fundMap[dist.fund_id] || dist.fund_id.slice(0, 8) + '…';
                  const badge    = TYPE_BADGE[dist.dist_type] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
                  return (
                    <tr key={dist.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 theme-text-sub text-xs">{fmt.date(dist.distribution_date)}</td>
                      <td className="px-4 py-3 theme-text text-xs font-medium">{fundName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                          {dist.dist_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400 tabular-nums">{fmt.usd(dist.amount_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub tabular-nums">{fmt.jpy(dist.amount_jpy)}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-400 tabular-nums">
                        {dist.reinvestable_usd ? fmt.usd(dist.reinvestable_usd) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub tabular-nums">{fmt.rate(dist.fx_rate)}</td>
                      <td className="px-4 py-3 text-center">
                        {dist.is_recallable
                          ? <span className="inline-block w-5 h-5 bg-yellow-500/20 rounded-full text-center text-xs leading-5 text-yellow-400">✓</span>
                          : <span className="theme-text-sub">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs theme-text-sub">{fmt.date(dist.recall_expiry)}</td>
                      <td className="px-4 py-3 text-center">
                        {dist.is_recalled
                          ? <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/30">Yes</span>
                          : <span className="theme-text-sub">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteDist(dist.id)}
                            disabled={deleting === dist.id}
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
                            {t('common.delete')}
                          </button>
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
        <CreateDistModal
          funds={funds}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); fetchDists(); }}
        />
      )}
    </div>
  );
}

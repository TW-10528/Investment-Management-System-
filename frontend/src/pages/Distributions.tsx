import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { distributionsAPI, fundsAPI } from '../services/api';
import type { Distribution } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const TYPE_BADGE: Record<string, string> = {
  'Capital Return': 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  Income:           'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  Recallable:       'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  Deemed:           'bg-violet-500/15 text-violet-400 border border-violet-500/30',
};

/* ── Role helper ── */
function useCanEdit() {
  const raw  = localStorage.getItem('user') || '{}';
  const user = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  return ['admin', 'finance_manager', 'finance_staff'].includes(user.role ?? '');
}

export default function Distributions() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [dists, setDists]       = useState<Distribution[]>([]);
  const [fundMap, setFundMap]   = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fundsAPI.list().then(r => {
      const map: Record<string, string> = {};
      for (const f of r.data) map[f.fund_id] = f.fund_name;
      setFundMap(map);
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
    usd:         filtered.reduce((s, d) => s + d.amount_usd, 0),
    jpy:         filtered.reduce((s, d) => s + d.amount_jpy, 0),
    reinvestable: filtered.reduce((s, d) => s + d.reinvestable_usd, 0),
    recallable:  filtered.filter(d => d.is_recallable && !d.is_recalled).reduce((s, d) => s + d.amount_usd, 0),
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('distributions.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">{t('distributions.subtitle')}</p>
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
          <span>{t('distributions.viewOnly')}</span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.totalUsd')}</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{fmt.usd(totals.usd, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.totalJpy')}</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{fmt.jpy(totals.jpy)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.reinvestable')}</p>
          <p className="text-xl font-bold text-blue-400 mt-1">{fmt.usd(totals.reinvestable, true)}</p>
        </div>
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-xs theme-text-sub uppercase tracking-wide">{t('distributions.recallable')}</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{fmt.usd(totals.recallable, true)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-black/20 border theme-border rounded-xl p-1 w-fit flex-wrap">
        {TYPES.map(t2 => (
          <button
            key={t2}
            onClick={() => setFilter(t2)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t2
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'theme-text-sub hover:theme-text'
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
                      <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-400">{fmt.usd(dist.amount_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub">{fmt.jpy(dist.amount_jpy)}</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-400">
                        {dist.reinvestable_usd ? fmt.usd(dist.reinvestable_usd) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono theme-text-sub">{fmt.rate(dist.fx_rate)}</td>
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
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                          >
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
    </div>
  );
}

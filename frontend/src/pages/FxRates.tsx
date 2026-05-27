import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fxRatesAPI } from '../services/api';
import type { FxRate } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

/* ── Role helper ── */
function useCanEdit() {
  const raw  = localStorage.getItem('user') || '{}';
  const user = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  return ['admin', 'finance_manager', 'finance_staff'].includes(user.role ?? '');
}

export default function FxRates() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [rates, setRates]             = useState<FxRate[]>([]);
  const [liveRate, setLiveRate]       = useState<{ usd_jpy: number; date: string } | null>(null);
  const [loading, setLoading]         = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [addForm, setAddForm]         = useState({ date: '', usd_jpy: '' });
  const [adding, setAdding]           = useState(false);
  const [showAdd, setShowAdd]         = useState(false);

  useEffect(() => {
    fetchRates();
    fetchLive();
  }, []);

  async function fetchRates() {
    setLoading(true);
    try {
      const r = await fxRatesAPI.history(90);
      setRates(r.data.slice().reverse()); // newest first
    } catch {
      toast.error('Failed to load FX rates');
    } finally {
      setLoading(false);
    }
  }

  async function fetchLive() {
    setLiveLoading(true);
    try {
      const r = await fxRatesAPI.live();
      setLiveRate(r.data);
    } catch { /* silent */ }
    finally { setLiveLoading(false); }
  }

  async function addRate(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!addForm.date || !addForm.usd_jpy) return;
    setAdding(true);
    try {
      await fxRatesAPI.create({ rate_date: addForm.date, usd_jpy: parseFloat(addForm.usd_jpy), source: 'manual' });
      toast.success(t('fxRates.saved'));
      setAddForm({ date: '', usd_jpy: '' });
      setShowAdd(false);
      fetchRates();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr.response?.data?.detail || 'Save failed');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('fxRates.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">{t('fxRates.subtitle')}</p>
        </div>
        <div className="flex gap-2 items-center">
          {!canEdit && (
            <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              👁 {t('nav.viewOnly')}
            </span>
          )}
          <button
            onClick={fetchLive}
            disabled={liveLoading}
            className="flex items-center gap-1.5 px-3 py-2 theme-card border theme-border theme-text-sub hover:theme-text text-sm rounded-lg disabled:opacity-50 transition-colors"
          >
            {liveLoading
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : '🔄'
            }
            {t('fxRates.refreshLive')}
          </button>
          {canEdit && (
            <button
              onClick={() => setShowAdd(v => !v)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
            >
              {t('fxRates.addRate')}
            </button>
          )}
        </div>
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg">🔒</span>
          <span>{t('fxRates.viewOnly')}</span>
        </div>
      )}

      {/* Live rate banner */}
      {liveRate && (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', border: '1px solid rgba(99,102,241,0.3)' }}>
          <div>
            <p className="text-indigo-300 text-xs font-medium uppercase tracking-wide">{t('fxRates.liveMarket')}</p>
            <p className="text-white text-3xl font-bold mt-1">{fmt.jpy(liveRate.usd_jpy)}</p>
            <p className="text-indigo-300 text-xs mt-0.5">1 USD = {liveRate.usd_jpy.toFixed(4)} JPY</p>
          </div>
          <div className="text-right">
            <p className="text-indigo-400 text-xs">{t('common.date')}</p>
            <p className="text-indigo-200 font-semibold">{fmt.date(liveRate.date)}</p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && canEdit && (
        <div className="theme-card border theme-border rounded-xl p-5">
          <h3 className="font-semibold theme-text text-sm mb-4">{t('fxRates.addMufg')}</h3>
          <form onSubmit={addRate} className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium theme-text-sub mb-1">{t('fxRates.dateLabel')}</label>
              <input
                type="date"
                value={addForm.date}
                onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                required
                className="theme-input border theme-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium theme-text-sub mb-1">{t('fxRates.rateLabel')}</label>
              <input
                type="number"
                step="0.0001"
                value={addForm.usd_jpy}
                onChange={e => setAddForm(f => ({ ...f, usd_jpy: e.target.value }))}
                placeholder="e.g. 148.25"
                required
                className="theme-input border theme-border rounded-lg px-3 py-2 text-sm w-40"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-60 transition-colors"
            >
              {adding ? t('fxRates.saving') : t('fxRates.saveRate')}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 theme-text-sub hover:bg-white/5 text-sm rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
          </form>
        </div>
      )}

      {/* History table */}
      <div className="theme-card border theme-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-border flex items-center justify-between">
          <h2 className="font-semibold theme-text text-sm">{t('fxRates.rateHistory')}</h2>
          <span className="theme-text-sub text-xs">{rates.length} {t('fxRates.entries')}</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rates.length === 0 ? (
          <div className="text-center py-12 theme-text-sub">
            <p className="text-3xl mb-2">💱</p>
            <p>{t('fxRates.noHistory')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b theme-border bg-black/10">
                <th className="text-left px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('fxRates.dateLabel')}</th>
                <th className="text-right px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('fxRates.rateLabel')}</th>
                <th className="text-right px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('fxRates.equalsLabel')}</th>
                <th className="text-left px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('fxRates.sourceLabel')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rates.map((rate, i) => (
                <tr key={i} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3 theme-text">{fmt.date(rate.date)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold theme-text">
                    {fmt.jpy(rate.usd_jpy)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono theme-text-sub">
                    {rate.usd_jpy.toFixed(4)} JPY
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                      rate.source === 'manual'
                        ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                    }`}>
                      {rate.source ?? 'unknown'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

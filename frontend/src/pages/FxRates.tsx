import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
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

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/* ── Multi-currency live panel ────────────────────────────────────────── */
const MULTI_PAIRS = [
  { pair: 'USD/JPY', from: 'USD', to: 'JPY', flag1: '🇺🇸', flag2: '🇯🇵' },
  { pair: 'EUR/JPY', from: 'EUR', to: 'JPY', flag1: '🇪🇺', flag2: '🇯🇵' },
  { pair: 'GBP/JPY', from: 'GBP', to: 'JPY', flag1: '🇬🇧', flag2: '🇯🇵' },
  { pair: 'AUD/JPY', from: 'AUD', to: 'JPY', flag1: '🇦🇺', flag2: '🇯🇵' },
  { pair: 'EUR/USD', from: 'EUR', to: 'USD', flag1: '🇪🇺', flag2: '🇺🇸' },
  { pair: 'GBP/USD', from: 'GBP', to: 'USD', flag1: '🇬🇧', flag2: '🇺🇸' },
];

function MultiCurrencyPanel() {
  const [rates,   setRates]   = useState<Record<string, number>>({});
  const [asOf,    setAsOf]    = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCross(); }, []);

  async function loadCross() {
    setLoading(true);
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=JPY,EUR,GBP,AUD');
      const d   = await res.json();
      const usdBase: Record<string, number> = { USD: 1, ...d.rates };
      const out: Record<string, number>     = {};
      MULTI_PAIRS.forEach(p => {
        const a = usdBase[p.from], b = usdBase[p.to];
        if (a && b) out[p.pair] = b / a;
      });
      setRates(out);
      setAsOf(d.date ?? '');
    } catch {
      // Fallback: try backend for USD/JPY
      try {
        const r = await fxRatesAPI.live();
        setRates({ 'USD/JPY': r.data.usd_jpy });
        setAsOf(r.data.date ?? '');
      } catch { /* silent */ }
    } finally {
      setLoading(false);
    }
  }

  const isJPYpair = (pair: string) => pair.endsWith('/JPY');

  return (
    <div className="theme-card border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b theme-border flex items-center justify-between">
        <h2 className="font-semibold theme-text text-sm">Live Multi-Currency Rates</h2>
        <div className="flex items-center gap-2">
          {asOf && <span className="text-xs theme-text-muted">As of {asOf}</span>}
          <button onClick={loadCross} disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 theme-card border rounded-lg text-xs theme-text-sub hover:theme-text disabled:opacity-50 transition-colors">
            {loading ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : '🔄'}
            Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y theme-divider">
        {MULTI_PAIRS.map(p => {
          const r = rates[p.pair];
          return (
            <div key={p.pair} className="px-4 py-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-sm">{p.flag1}</span>
                <span className="text-xs theme-text-muted">/</span>
                <span className="text-sm">{p.flag2}</span>
              </div>
              <p className="text-xs font-bold theme-text-muted uppercase tracking-wide mb-0.5">{p.pair}</p>
              {loading ? (
                <div className="h-5 bg-white/5 rounded animate-pulse" />
              ) : r != null ? (
                <p className="text-lg font-bold theme-text tabular-nums">
                  {r.toFixed(isJPYpair(p.pair) ? 2 : 4)}
                </p>
              ) : (
                <p className="text-sm theme-text-muted">—</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Rate history line chart ──────────────────────────────────────────── */
function RateChart({ rates }: { rates: FxRate[] }) {
  if (rates.length < 2) return null;

  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';

  const data     = [...rates].reverse(); // oldest → newest
  const values   = data.map(r => r.usd_jpy);
  const minVal   = Math.min(...values);
  const maxVal   = Math.max(...values);
  const avgVal   = values.reduce((s, v) => s + v, 0) / values.length;
  const change   = values.length > 1 ? values[values.length - 1] - values[0] : 0;
  const changePct = values[0] > 0 ? (change / values[0]) * 100 : 0;

  return (
    <div className="theme-card border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold theme-text text-sm">USD/JPY Rate History</h2>
          <p className="text-xs theme-text-muted mt-0.5">90-day stored rate trend</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <p className="theme-text-muted">Range</p>
            <p className="font-semibold theme-text tabular-nums">{minVal.toFixed(2)} – {maxVal.toFixed(2)}</p>
          </div>
          <div>
            <p className="theme-text-muted">Avg</p>
            <p className="font-semibold theme-text tabular-nums">{avgVal.toFixed(2)}</p>
          </div>
          <div>
            <p className="theme-text-muted">90d Change</p>
            <p className={`font-semibold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </p>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: -5, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
            tickFormatter={v => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval={Math.floor(data.length / 8)} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
            tickFormatter={v => v.toFixed(1)} />
          <Tooltip
            contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
            formatter={v => [`¥${Number(v ?? 0).toFixed(4)}`, 'USD/JPY']}
            labelFormatter={v => `Date: ${v}`} />
          <ReferenceLine y={avgVal} stroke="rgba(99,102,241,0.4)" strokeDasharray="4 2"
            label={{ value: `Avg: ${avgVal.toFixed(2)}`, fontSize: 9, fill: '#6366f1', position: 'right' }} />
          <Line type="monotone" dataKey="usd_jpy" stroke="#6366f1" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ══════════════════════════ Main page ══════════════════════════════════ */
export default function FxRates() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [rates,       setRates]       = useState<FxRate[]>([]);
  const [liveRate,    setLiveRate]    = useState<{ usd_jpy: number; date: string } | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [addForm,     setAddForm]     = useState({ date: '', usd_jpy: '' });
  const [adding,      setAdding]      = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);

  useEffect(() => {
    fetchRates();
    fetchLive();
  }, []);

  async function fetchRates() {
    setLoading(true);
    try {
      const r = await fxRatesAPI.history(90);
      setRates(r.data.slice().reverse()); // newest first in table
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

  // Determine if rate went up/down vs previous
  function getDelta(i: number): number {
    if (i >= rates.length - 1) return 0;
    return rates[i].usd_jpy - rates[i + 1].usd_jpy;
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('fxRates.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">{t('fxRates.subtitle')}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {!canEdit && (
            <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
              👁 {t('nav.viewOnly')}
            </span>
          )}
          <button
            onClick={fetchLive}
            disabled={liveLoading}
            className="flex items-center gap-1.5 px-3 py-2 theme-card border theme-border theme-text-sub hover:theme-text text-sm rounded-lg disabled:opacity-50 transition-colors">
            {liveLoading
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : '🔄'}
            {t('fxRates.refreshLive')}
          </button>
          {canEdit && (
            <button onClick={() => setShowAdd(v => !v)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors">
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

      {/* Live rate hero banner */}
      {liveRate && (
        <div className="rounded-2xl px-5 py-5 flex items-center justify-between gap-4"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', border: '1px solid rgba(99,102,241,0.3)' }}>
          <div>
            <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest">{t('fxRates.liveMarket')}</p>
            <div className="flex items-end gap-3 mt-1">
              <p className="text-white text-4xl font-bold tabular-nums">¥{liveRate.usd_jpy.toFixed(2)}</p>
              <p className="text-indigo-300 text-sm mb-1">per USD</p>
            </div>
            <p className="text-indigo-400 text-xs mt-1">1 USD = {liveRate.usd_jpy.toFixed(4)} JPY</p>
          </div>
          <div className="text-right">
            <p className="text-indigo-400 text-xs uppercase tracking-wide">Date</p>
            <p className="text-indigo-200 font-semibold">{fmt.date(liveRate.date)}</p>
            {rates.length > 0 && (
              <p className={`text-xs mt-1 ${liveRate.usd_jpy > rates[0].usd_jpy ? 'text-emerald-400' : liveRate.usd_jpy < rates[0].usd_jpy ? 'text-red-400' : 'text-indigo-400'}`}>
                {liveRate.usd_jpy > rates[0].usd_jpy ? '▲' : liveRate.usd_jpy < rates[0].usd_jpy ? '▼' : '—'}
                {' '}{Math.abs(liveRate.usd_jpy - rates[0].usd_jpy).toFixed(2)} vs stored
              </p>
            )}
          </div>
        </div>
      )}

      {/* Multi-currency live panel */}
      <MultiCurrencyPanel />

      {/* Rate history line chart */}
      <RateChart rates={rates} />

      {/* Add MUFG rate form */}
      {showAdd && canEdit && (
        <div className="theme-card border theme-border rounded-xl p-5">
          <h3 className="font-semibold theme-text text-sm mb-4">{t('fxRates.addMufg')}</h3>
          <form onSubmit={addRate} className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium theme-text-sub mb-1">{t('fxRates.dateLabel')}</label>
              <input type="date" value={addForm.date}
                onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                required className="theme-input border theme-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium theme-text-sub mb-1">{t('fxRates.rateLabel')}</label>
              <input type="number" step="0.0001" value={addForm.usd_jpy}
                onChange={e => setAddForm(f => ({ ...f, usd_jpy: e.target.value }))}
                placeholder="e.g. 148.25" required
                className="theme-input border theme-border rounded-lg px-3 py-2 text-sm w-40" />
            </div>
            {liveRate && (
              <button type="button"
                onClick={() => setAddForm(f => ({ ...f, usd_jpy: liveRate.usd_jpy.toFixed(4), date: liveRate.date }))}
                className="px-3 py-2 text-xs bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/25 transition-colors">
                Use live rate
              </button>
            )}
            <button type="submit" disabled={adding}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-60 transition-colors">
              {adding ? t('fxRates.saving') : t('fxRates.saveRate')}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-4 py-2 theme-text-sub hover:bg-white/5 text-sm rounded-lg transition-colors">
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
                <th className="text-right px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">Change</th>
                <th className="text-left px-5 py-3 text-xs font-medium theme-text-sub uppercase tracking-wide">{t('fxRates.sourceLabel')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rates.map((rate, i) => {
                const delta = getDelta(i);
                return (
                  <tr key={i} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 theme-text">{fmt.date(rate.date)}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold theme-text tabular-nums">
                      {fmt.jpy(rate.usd_jpy)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono theme-text-sub tabular-nums">
                      {rate.usd_jpy.toFixed(4)} JPY
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">
                      {i === rates.length - 1 ? (
                        <span className="theme-text-sub">—</span>
                      ) : delta === 0 ? (
                        <span className="theme-text-muted">0.00</span>
                      ) : (
                        <span className={delta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
                        </span>
                      )}
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

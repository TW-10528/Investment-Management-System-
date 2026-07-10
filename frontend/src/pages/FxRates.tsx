import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fxRatesAPI } from '../services/api';
import type { FxRate } from '../types/index';
import { fmt } from '../lib/format';
import PageHeader from '../components/PageHeader';
import toast from 'react-hot-toast';

/* ── Role helper ── */
function useCanEdit() {
  return true;   // every signed-in user can edit (no role differentiation)
}

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/* ── Rate history line chart ──────────────────────────────────────────── */
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function RateChart({ rates, year }: { rates: FxRate[]; year: number }) {
  if (rates.length < 2) return null;

  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';

  const values    = rates.map(r => r.usd_jpy);
  const minVal    = Math.min(...values);
  const maxVal    = Math.max(...values);
  const avgVal    = values.reduce((s, v) => s + v, 0) / values.length;
  const change    = values.length > 1 ? values[values.length - 1] - values[0] : 0;
  const changePct = values[0] > 0 ? (change / values[0]) * 100 : 0;

  return (
    <div className="theme-card border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold theme-text text-sm">USD/JPY Monthly Rate — {year}</h2>
          <p className="text-xs theme-text-muted mt-0.5">MUFG TTM · last trading day of each month</p>
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
            <p className="theme-text-muted">YTD Change</p>
            <p className={`font-semibold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </p>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rates} margin={{ left: -5, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
            tickFormatter={v => { const d = new Date(v + 'T00:00:00'); return MONTH_LABELS[d.getMonth()]; }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
            tickFormatter={v => v.toFixed(1)} />
          <Tooltip
            contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
            formatter={v => [`¥${Number(v ?? 0).toFixed(2)}`, 'MUFG TTM']}
            labelFormatter={v => { const d = new Date(v + 'T00:00:00'); return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}, ${year}`; }} />
          <ReferenceLine y={avgVal} stroke="rgba(99,102,241,0.4)" strokeDasharray="4 2"
            label={{ value: `Avg: ${avgVal.toFixed(2)}`, fontSize: 9, fill: '#6366f1', position: 'right' }} />
          <Line type="monotone" dataKey="usd_jpy" stroke="#6366f1" strokeWidth={2}
            dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5, fill: '#6366f1' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ══════════════════════════ Main page ══════════════════════════════════ */
export default function FxRates() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [rates,   setRates]   = useState<FxRate[]>([]);
  const [rateYear, setRateYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ date: '', usd_jpy: '' });
  const [adding,  setAdding]  = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // ── Historical lookup ────────────────────────────────────────────────────
  const [lookupDate,    setLookupDate]    = useState('');
  const [lookupFrom,    setLookupFrom]    = useState('USD');
  const [lookupTo,      setLookupTo]      = useState('JPY');
  const [lookupResult,  setLookupResult]  = useState<{
    date: string; mufgRate: number; usdJpy: number;
    tts?: number; ttb?: number;
    from: string; to: string; source: 'db' | 'murc';
  } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);

  async function fetchHistorical() {
    if (!lookupDate) return;
    setLookupLoading(true);
    setLookupResult(null);
    setLookupError('');
    setSaved(false);
    try {
      const r    = await fxRatesAPI.historical(lookupDate, lookupFrom, lookupTo);
      const data = r.data;
      if (!data.mufg_rate) throw new Error();
      setLookupResult({
        date: data.date, mufgRate: data.mufg_rate, usdJpy: data.usd_jpy,
        tts: data.tts, ttb: data.ttb, from: data.from, to: data.to, source: data.source,
      });
    } catch (err: any) {
      setLookupError(err?.response?.data?.detail ?? t('fxRates.lookupNoRate'));
    } finally {
      setLookupLoading(false);
    }
  }

  async function saveToDb() {
    if (!lookupResult || lookupResult.source !== 'murc') return;
    setSaving(true);
    try {
      await fxRatesAPI.create({ rate_date: lookupResult.date, usd_jpy: lookupResult.usdJpy, source: 'murc_ttm' });
      setSaved(true);
      setLookupResult(r => r ? { ...r, source: 'db' } : r);
      fetchRates();
      toast.success(t('fxRates.saved'));
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { fetchRates(); }, []);

  async function fetchRates() {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const r = await fxRatesAPI.monthly(year);
      setRateYear(year);
      // monthly returns oldest→newest; reverse for table (newest first)
      setRates([...(r.data.rates as FxRate[])].reverse());
    } catch {
      toast.error('Failed to load monthly rates');
    } finally {
      setLoading(false);
    }
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

  const latestRate = rates[0] ?? null;
  // Today's date in JST as YYYY-MM-DD
  const todayJst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayRateMissing = !latestRate || latestRate.date !== todayJst;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title={t('fxRates.title')}
        subtitle={t('fxRates.subtitle')}
        actions={canEdit ? [
          { icon: '+', label: t('fxRates.addRate'), onClick: () => setShowAdd(v => !v), variant: 'primary' },
        ] : []}
      >
        {!canEdit && (
          <span className="text-xs flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg whitespace-nowrap">
            👁 {t('nav.viewOnly')}
          </span>
        )}
      </PageHeader>

      <div className="p-6 space-y-5">

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg">🔒</span>
          <span>{t('fxRates.viewOnly')}</span>
        </div>
      )}

      {/* MURC not-yet-published warning — only when today's rate is not in the DB */}
      {todayRateMissing && latestRate && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-xl mt-0.5">🕐</span>
          <div>
            <p className="font-semibold">{t('fxRates.murcWarningTitle')}</p>
            <p className="text-xs mt-0.5 text-amber-400/80">
              {t('fxRates.murcWarningBody')} ({latestRate.date} — ¥{latestRate.usd_jpy.toFixed(2)}).
            </p>
          </div>
        </div>
      )}

      {/* ── Historical rate lookup ── */}
      <div className="theme-card border theme-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-border flex items-center gap-2"
             style={{ background: 'rgba(99,102,241,0.04)' }}>
          <span className="text-sm">📅</span>
          <div>
            <p className="text-sm font-bold theme-text">{t('fxRates.historicalLookup')}</p>
            <p className="text-xs theme-text-muted">{t('fxRates.historicalSub')}</p>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
          {/* Date input */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              {t('fxRates.dateLabel')}
            </label>
            <input
              type="date"
              value={lookupDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => { setLookupDate(e.target.value); setLookupResult(null); setLookupError(''); }}
              className="theme-input border theme-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          {/* Pair toggle — USD→JPY or JPY→USD */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              Pair
            </label>
            <div className="flex items-center gap-1 border theme-border rounded-xl overflow-hidden">
              {[['USD','JPY'],['JPY','USD']].map(([f, to]) => (
                <button
                  key={f+to}
                  onClick={() => { setLookupFrom(f); setLookupTo(to); setLookupResult(null); setLookupError(''); }}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                    lookupFrom === f
                      ? 'bg-indigo-600 text-white'
                      : 'theme-text-muted hover:theme-text'
                  }`}
                >
                  {f} → {to}
                </button>
              ))}
            </div>
          </div>

          {/* Fetch button */}
          <button
            onClick={fetchHistorical}
            disabled={!lookupDate || lookupLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {lookupLoading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('fxRates.lookupFetching')}</>
              : t('fxRates.lookupFetch')}
          </button>

          {/* Error */}
          {lookupError && (
            <p className="text-sm text-red-400 self-end pb-1">{lookupError}</p>
          )}
        </div>

        {/* Result — MUFG TTM only */}
        {lookupResult && (
          <div className="mx-5 mb-5 rounded-2xl px-6 py-5"
               style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', border: '1px solid rgba(99,102,241,0.4)' }}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest"
                      style={{ background: 'rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                  MUFG TTM
                </span>
                {lookupResult.source === 'db' ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>
                    ✓ Saved in DB
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                    ↗ Live from MURC
                  </span>
                )}
                <p className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest">
                  {lookupResult.from} / {lookupResult.to} · {lookupResult.date}
                </p>
              </div>

              {/* Save to DB button — only when sourced from MURC and not yet saved */}
              {lookupResult.source === 'murc' && !saved && canEdit && (
                <button onClick={saveToDb} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors flex-shrink-0"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                  {saving
                    ? <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Saving…</>
                    : '💾 Save to DB'}
                </button>
              )}
            </div>

            {/* Main rate */}
            <p className="text-white text-4xl font-bold tabular-nums">
              {lookupResult.to === 'JPY'
                ? lookupResult.mufgRate.toFixed(2)
                : lookupResult.mufgRate.toFixed(6)}
            </p>
            <p className="text-indigo-300 text-sm mt-1">
              1 {lookupResult.from} = {lookupResult.to === 'JPY'
                ? lookupResult.mufgRate.toFixed(2)
                : lookupResult.mufgRate.toFixed(6)} {lookupResult.to}
            </p>

            {/* TTS / TTB breakdown — shown when fetched from MURC */}
            {lookupResult.source === 'murc' && lookupResult.tts && lookupResult.ttb && lookupResult.from === 'USD' && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-indigo-800/50">
                <div>
                  <p className="text-indigo-400 text-[10px] uppercase tracking-wide">TTS (Selling)</p>
                  <p className="text-indigo-200 text-sm font-semibold tabular-nums">{lookupResult.tts.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-indigo-400 text-[10px] uppercase tracking-wide">TTB (Buying)</p>
                  <p className="text-indigo-200 text-sm font-semibold tabular-nums">{lookupResult.ttb.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-indigo-400 text-[10px] uppercase tracking-wide">TTM = (TTS+TTB)÷2</p>
                  <p className="text-white text-sm font-bold tabular-nums">{lookupResult.mufgRate.toFixed(2)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rate history line chart */}
      <RateChart rates={[...rates].reverse()} year={rateYear} />

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
    </div>
  );
}

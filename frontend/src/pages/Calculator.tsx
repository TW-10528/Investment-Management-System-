import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts';
import { fxRatesAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ─────────────────────────── helpers ──────────────────────────────────── */

/** Newton-Raphson IRR — returns null if no convergence */
function computeIRR(cfs: number[], guess = 0.1): number | null {
  let r = guess;
  for (let i = 0; i < 500; i++) {
    let npv = 0, d = 0;
    cfs.forEach((c, t) => {
      const p = Math.pow(1 + r, t);
      npv += c / p;
      d   -= t * c / (p * (1 + r));
    });
    if (Math.abs(d) < 1e-14) break;
    const nr = r - npv / d;
    if (Math.abs(nr - r) < 1e-9) return nr;
    r = nr;
  }
  return null;
}

function computeNPV(cfs: number[], rate: number): number {
  return cfs.reduce((s, c, t) => s + c / Math.pow(1 + rate, t), 0);
}

const fmt = (n: number, dec = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/* ─────────────────────────── types ────────────────────────────────────── */

type RatesMap = Record<string, number>;
type CalcTab  = 'irr' | 'fx' | 'multiples' | 'netcall' | 'fee';

const TABS: { id: CalcTab; icon: string; label: string }[] = [
  { id: 'irr',       icon: '📈', label: 'IRR / NPV' },
  { id: 'fx',        icon: '💱', label: 'FX Converter' },
  { id: 'multiples', icon: '✖️',  label: 'DPI / TVPI' },
  { id: 'netcall',   icon: '📋', label: 'Net Call' },
  { id: 'fee',       icon: '💰', label: 'Fee & Carry' },
];

const ALL_CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'CNY', 'KRW', 'SGD', 'HKD'];
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', JPY: '🇯🇵', EUR: '🇪🇺', GBP: '🇬🇧', AUD: '🇦🇺',
  CAD: '🇨🇦', CHF: '🇨🇭', CNY: '🇨🇳', KRW: '🇰🇷', SGD: '🇸🇬', HKD: '🇭🇰',
};

/* ═══════════════════════════ TAB 1: IRR / NPV ══════════════════════════ */

function IRRCalc() {
  const [flows, setFlows] = useState([
    { label: 'Year 0 (Investment)', amount: '-10000000' },
    { label: 'Year 1',              amount: '0'         },
    { label: 'Year 2',              amount: '0'         },
    { label: 'Year 3',              amount: '2000000'   },
    { label: 'Year 4',              amount: '3000000'   },
    { label: 'Year 5 (Exit)',       amount: '12000000'  },
  ]);

  const cfs      = flows.map(f => parseFloat(f.amount) || 0);
  const irr      = computeIRR(cfs);
  const npv10    = computeNPV(cfs, 0.10);
  const npv15    = computeNPV(cfs, 0.15);
  const totalIn  = cfs.filter(c => c < 0).reduce((s, c) => s + Math.abs(c), 0);
  const totalOut = cfs.filter(c => c > 0).reduce((s, c) => s + c, 0);

  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';

  // NPV sensitivity curve
  const npvCurve = Array.from({ length: 41 }, (_, i) => {
    const rate = (i * 0.025) - 0.25;
    const npv  = computeNPV(cfs, rate);
    return { rate: (rate * 100).toFixed(1), npv: isFinite(npv) ? Math.round(npv) : null };
  }).filter(d => d.npv !== null && Math.abs(d.npv!) < 1e12) as { rate: string; npv: number }[];

  // Cash-flow bar data
  const cfBars = flows.map((f, _i) => ({
    period : f.label.length > 10 ? f.label.slice(0, 9) + '…' : f.label,
    amount : parseFloat(f.amount) || 0,
    fill   : (parseFloat(f.amount) || 0) >= 0 ? '#10b981' : '#ef4444',
  }));

  function addRow() {
    setFlows(f => [...f, { label: `Year ${f.length}`, amount: '0' }]);
  }
  function removeRow(i: number) {
    setFlows(f => f.filter((_, j) => j !== i));
  }
  function update(i: number, field: 'label' | 'amount', val: string) {
    setFlows(f => f.map((r, j) => j === i ? { ...r, [field]: val } : r));
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Cash flow inputs ── */}
        <div className="theme-card border rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold theme-text text-sm">Cash Flows</h3>
            <button onClick={addRow}
              className="text-xs px-3 py-1.5 bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/25 transition-colors">
              + Add Period
            </button>
          </div>
          <div className="space-y-2">
            {flows.map((f, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={f.label} onChange={e => update(i, 'label', e.target.value)}
                  className="flex-1 theme-input rounded-lg px-2.5 py-1.5 text-xs"
                  placeholder="Label" />
                <input value={f.amount} onChange={e => update(i, 'amount', e.target.value)}
                  type="number" step="any"
                  className={`w-36 theme-input rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums
                    ${(parseFloat(f.amount) || 0) < 0 ? 'text-red-400' : (parseFloat(f.amount) || 0) > 0 ? 'text-emerald-400' : 'theme-text'}`}
                  placeholder="0" />
                {flows.length > 2 && (
                  <button onClick={() => removeRow(i)}
                    className="text-red-400/60 hover:text-red-400 text-sm px-1 flex-shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs theme-text-muted pt-1 border-t theme-divider">
            Negative = capital outflow · Positive = cash inflow
          </p>
        </div>

        {/* ── Results ── */}
        <div className="space-y-3">
          <div className="rounded-2xl p-5"
            style={{
              background: irr !== null && irr > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
              border: `1px solid ${irr !== null && irr > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.2)'}`,
            }}>
            <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-1">Internal Rate of Return (IRR)</p>
            <p className="text-4xl font-bold tabular-nums"
               style={{ color: irr !== null && irr > 0 ? '#10b981' : irr !== null ? '#f59e0b' : '#6b7280' }}>
              {irr !== null ? `${(irr * 100).toFixed(2)}%` : 'N/A'}
            </p>
            {irr !== null && (
              <p className="text-xs theme-text-muted mt-1.5">
                {irr >= 0.20 ? '🏆 Exceptional (≥ 20%)' : irr >= 0.15 ? '✅ Strong (≥ 15%)' : irr >= 0.08 ? '⚡ Acceptable (≥ 8%)' : '⚠️ Below typical 8% hurdle'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Total Invested',    value: fmt(totalIn),      color: 'text-red-400'     },
              { label: 'Total Returned',    value: fmt(totalOut),     color: 'text-emerald-400' },
              { label: 'NPV @ 10%',         value: fmt(npv10),        color: npv10 >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'NPV @ 15%',         value: fmt(npv15),        color: npv15 >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(r => (
              <div key={r.label} className="theme-card border rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide theme-text-muted">{r.label}</p>
                <p className={`text-base font-bold mt-1 tabular-nums ${r.color}`}>${r.value}</p>
              </div>
            ))}
          </div>

          {totalIn > 0 && totalOut > 0 && (
            <div className="theme-card border rounded-xl p-3 flex items-center justify-between">
              <p className="text-xs font-semibold theme-text-muted uppercase tracking-wide">MOIC (Multiple on Invested Capital)</p>
              <p className="text-xl font-bold theme-text tabular-nums">{(totalOut / totalIn).toFixed(2)}×</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Cash-flow bar chart ── */}
      <div className="theme-card border rounded-2xl p-5">
        <h3 className="font-semibold theme-text text-sm mb-3">Cash Flow by Period</h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={cfBars} margin={{ left: -5, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : String(v)} />
            <Tooltip contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
              formatter={v => [`$${fmt(Number(v ?? 0))}`, 'Cash Flow']} />
            <ReferenceLine y={0} stroke="rgba(156,163,175,0.4)" />
            <Bar dataKey="amount" radius={[3,3,0,0]}>
              {cfBars.map((entry, index) => (
                <rect key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── NPV Curve ── */}
      {npvCurve.length > 3 && (
        <div className="theme-card border rounded-2xl p-5">
          <h3 className="font-semibold theme-text text-sm mb-3">NPV Sensitivity — Discount Rate Analysis</h3>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={npvCurve} margin={{ left: -5, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="rate" tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v}%`} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : String(v)} />
              <Tooltip contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
                formatter={v => [`$${fmt(Number(v ?? 0))}`, 'NPV']}
                labelFormatter={v => `Discount Rate: ${v}%`} />
              <ReferenceLine y={0} stroke="rgba(239,68,68,0.5)" strokeDasharray="4 2" label={{ value: 'Break-even', fontSize: 9, fill: '#ef4444', position: 'right' }} />
              {irr !== null && (
                <ReferenceLine x={(irr * 100).toFixed(1)} stroke="rgba(16,185,129,0.7)" strokeDasharray="4 2"
                  label={{ value: `IRR ${(irr*100).toFixed(1)}%`, fontSize: 9, fill: '#10b981', position: 'top' }} />
              )}
              <Line type="monotone" dataKey="npv" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ TAB 2: FX CONVERTER ════════════════════════ */

function FXConverter() {
  const [rates,   setRates]   = useState<RatesMap>({});
  const [loading, setLoading] = useState(true);
  const [amount,  setAmount]  = useState('1000000');
  const [from,    setFrom]    = useState('USD');
  const [to,      setTo]      = useState('JPY');
  const [asOf,    setAsOf]    = useState('');

  useEffect(() => { loadRates(from); }, [from]);

  async function loadRates(base: string) {
    setLoading(true);
    try {
      const targets = ALL_CURRENCIES.filter(c => c !== base).join(',');
      const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${targets}`);
      const data = await res.json();
      setRates(data.rates ?? {});
      setAsOf(data.date ?? '');
    } catch {
      // Fallback: backend live rate for USD/JPY
      try {
        const r2 = await fxRatesAPI.live();
        setRates(base === 'USD' ? { JPY: r2.data.usd_jpy } : {});
        setAsOf(r2.data.date ?? '');
      } catch { /* silent */ }
    } finally {
      setLoading(false);
    }
  }

  const num    = parseFloat(amount) || 0;
  const rate   = to === from ? 1 : (rates[to] ?? null);
  const result = rate !== null ? num * rate : null;

  function swap() {
    const prevFrom = from, prevTo = to;
    setFrom(prevTo);
    setTo(prevFrom);
  }

  const fmtResult = (n: number, currency: string) =>
    n.toLocaleString(undefined, { maximumFractionDigits: ['JPY','KRW','HKD'].includes(currency) ? 0 : 4 });

  return (
    <div className="space-y-5">
      {/* Main converter */}
      <div className="theme-card border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold theme-text text-sm">Live Currency Converter</h3>
          <div className="flex items-center gap-2">
            {asOf && <span className="text-xs theme-text-muted">Rates: {asOf}</span>}
            <button onClick={() => loadRates(from)} disabled={loading}
              className="text-xs px-2.5 py-1 theme-card border rounded-lg hover:bg-white/5 disabled:opacity-50">
              {loading ? '⟳' : '🔄'} Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          {/* From */}
          <div className="flex-1 flex gap-2 w-full">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="flex-1 theme-input rounded-xl px-4 py-3 text-xl font-bold tabular-nums"
              placeholder="Amount" step="any" />
            <select value={from} onChange={e => setFrom(e.target.value)}
              className="theme-input rounded-xl px-3 py-3 text-sm font-semibold">
              {ALL_CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_FLAGS[c]} {c}</option>)}
            </select>
          </div>

          {/* Swap */}
          <button onClick={swap}
            className="w-10 h-10 flex items-center justify-center theme-card border rounded-xl text-xl hover:bg-white/5 transition-colors flex-shrink-0">
            ⇄
          </button>

          {/* To */}
          <div className="flex-1 flex gap-2 w-full">
            <div className="flex-1 rounded-xl px-4 py-3 text-xl font-bold tabular-nums text-emerald-400"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
              {loading ? <span className="animate-pulse">…</span>
                : result !== null ? fmtResult(result, to) : '—'}
            </div>
            <select value={to} onChange={e => setTo(e.target.value)}
              className="theme-input rounded-xl px-3 py-3 text-sm font-semibold">
              {ALL_CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_FLAGS[c]} {c}</option>)}
            </select>
          </div>
        </div>

        {rate !== null && rate !== 1 && (
          <div className="flex flex-wrap gap-4 text-xs theme-text-muted">
            <span>1 {from} = <strong className="theme-text">{rate.toFixed(4)} {to}</strong></span>
            <span>1 {to} = <strong className="theme-text">{(1/rate).toFixed(6)} {from}</strong></span>
          </div>
        )}
      </div>

      {/* Rate grid */}
      <div className="theme-card border rounded-2xl p-5">
        <h3 className="font-semibold theme-text text-sm mb-3">
          All Rates (Base: {CURRENCY_FLAGS[from]} {from})
          {loading && <span className="ml-2 text-xs text-indigo-400 animate-pulse">Loading…</span>}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
          {Object.entries(rates).map(([currency, r]) => (
            <button key={currency} onClick={() => setTo(currency)}
              className={`rounded-xl p-3 text-left transition-all border ${
                to === currency
                  ? 'border-indigo-500/60 bg-indigo-600/10'
                  : 'border-white/8 hover:border-white/20 hover:bg-white/4'
              }`}
              style={{ background: to === currency ? undefined : 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{CURRENCY_FLAGS[currency] ?? '🏳️'}</span>
                <span className="text-xs font-bold theme-text">{currency}</span>
              </div>
              <p className="text-sm font-bold text-indigo-400 tabular-nums">
                {(r as number).toFixed(['JPY','KRW','HKD'].includes(currency) ? 2 : 4)}
              </p>
              {num > 0 && (
                <p className="text-xs theme-text-muted mt-0.5 tabular-nums">
                  = {fmtResult(num * (r as number), currency)}
                </p>
              )}
            </button>
          ))}
          {Object.keys(rates).length === 0 && !loading && (
            <p className="col-span-full text-sm theme-text-muted text-center py-6">
              Could not load live rates. Check your connection.
            </p>
          )}
        </div>
      </div>

      {/* Key pairs quick reference */}
      <div className="theme-card border rounded-2xl p-5">
        <h3 className="font-semibold theme-text text-sm mb-3">Investment-Relevant Pairs</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { pair: 'USD/JPY', from: 'USD', to: 'JPY' },
            { pair: 'EUR/JPY', from: 'EUR', to: 'JPY' },
            { pair: 'EUR/USD', from: 'EUR', to: 'USD' },
            { pair: 'GBP/USD', from: 'GBP', to: 'USD' },
          ].map(p => {
            const crossRate = from === p.from
              ? rates[p.to]
              : from === p.to
              ? (rates[p.from] ? 1 / rates[p.from] : null)
              : null;
            return (
              <div key={p.pair} className="rounded-xl p-3 text-center"
                style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <p className="text-xs font-bold text-indigo-400">{p.pair}</p>
                <p className="text-lg font-bold theme-text tabular-nums mt-0.5">
                  {crossRate != null ? crossRate.toFixed(2) : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ TAB 3: DPI / TVPI ══════════════════════════ */

function MultiplesCalc() {
  const [paidIn,   setPaidIn]   = useState('10000000');
  const [dists,    setDists]    = useState('3500000');
  const [nav,      setNav]      = useState('12000000');

  const paid   = parseFloat(paidIn) || 0;
  const dist   = parseFloat(dists)  || 0;
  const navV   = parseFloat(nav)    || 0;

  const dpi    = paid > 0 ? dist / paid : 0;
  const rvpi   = paid > 0 ? navV / paid : 0;
  const tvpi   = dpi + rvpi;
  const moic   = paid > 0 ? (dist + navV) / paid : 0;
  const profit = dist + navV - paid;

  function Gauge({ val, max, label, color, desc }: { val: number; max: number; label: string; color: string; desc: string }) {
    const pct   = Math.min((val / max) * 100, 100);
    const good  = val >= 1;
    return (
      <div className="theme-card border rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide theme-text-muted">{label}</p>
            <p className="text-[9px] theme-text-muted mt-0.5">{desc}</p>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: good ? color : '#9ca3af' }}>
            {val.toFixed(2)}×
          </p>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: good ? color : '#6b7280' }} />
        </div>
        <div className="flex justify-between text-[9px] theme-text-muted">
          <span>0×</span><span className="opacity-40">1×</span><span>{max}×+</span>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full theme-input rounded-xl px-4 py-3 text-sm font-mono';
  const labelCls = 'block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5';

  const dark = isDark();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Paid-in Capital (USD)</label>
          <input type="number" value={paidIn} onChange={e => setPaidIn(e.target.value)} className={inputCls} step="any" />
        </div>
        <div>
          <label className={labelCls}>Total Distributions (USD)</label>
          <input type="number" value={dists}  onChange={e => setDists(e.target.value)}  className={inputCls} step="any" />
        </div>
        <div>
          <label className={labelCls}>Current NAV (USD)</label>
          <input type="number" value={nav}    onChange={e => setNav(e.target.value)}    className={inputCls} step="any" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Gauge val={dpi}  max={3} label="DPI"  color="#10b981" desc="Distributions / Paid-In" />
        <Gauge val={rvpi} max={3} label="RVPI" color="#6366f1" desc="NAV / Paid-In"           />
        <Gauge val={tvpi} max={3} label="TVPI" color="#8b5cf6" desc="(Dist + NAV) / Paid-In"  />
        <Gauge val={moic} max={3} label="MOIC" color="#f59e0b" desc="Total Value / Cost"       />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* P&L table */}
        <div className="theme-card border rounded-2xl p-5">
          <h3 className="font-semibold theme-text text-sm mb-3">Profit & Loss Summary</h3>
          <div className="space-y-0">
            {[
              { label: 'Total Invested (Cost)',        val: -paid,  note: '' },
              { label: 'Distributions Received',       val:  dist,  note: 'Realised' },
              { label: 'Current NAV (Unrealised)',     val:  navV,  note: 'Mark-to-market' },
              { label: 'Net Profit / (Loss)',          val:  profit, note: 'After cost', bold: true },
            ].map(r => (
              <div key={r.label}
                className={`flex items-center justify-between py-2.5 border-b theme-divider last:border-0 ${r.bold ? 'pt-3.5' : ''}`}>
                <div>
                  <p className={`text-sm ${r.bold ? 'font-bold theme-text' : 'theme-text-muted'}`}>{r.label}</p>
                  {r.note && <p className="text-xs theme-text-muted">{r.note}</p>}
                </div>
                <p className={`font-bold font-mono tabular-nums text-sm ${r.val < 0 ? 'text-red-400' : r.val > 0 ? 'text-emerald-400' : 'theme-text-muted'}`}>
                  {r.val < 0 ? '-' : ''}${fmt(Math.abs(r.val))}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Visual bar chart */}
        <div className="theme-card border rounded-2xl p-5">
          <h3 className="font-semibold theme-text text-sm mb-3">Value Composition (USD M)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[
              { name: 'Paid-in',         value: paid / 1e6,  fill: '#6366f1' },
              { name: 'Distributions',   value: dist / 1e6,  fill: '#10b981' },
              { name: 'NAV',             value: navV / 1e6,  fill: '#8b5cf6' },
              { name: 'Total Value',     value: (dist + navV) / 1e6, fill: '#f59e0b' },
            ]} margin={{ left: -5, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#21262d' : '#e2e8f0'} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: dark ? '#6b7280' : '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: dark ? '#6b7280' : '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}M`} />
              <Tooltip contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
                formatter={v => [`$${Number(v ?? 0).toFixed(2)}M`]} />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {[
                  { fill: '#6366f1' }, { fill: '#10b981' }, { fill: '#8b5cf6' }, { fill: '#f59e0b' },
                ].map((entry, index) => <rect key={index} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ TAB 4: NET CALL ════════════════════════════ */

function NetCallCalc() {
  const [grossUSD,      setGrossUSD]      = useState('5000000');
  const [callPct,       setCallPct]       = useState('');
  const [commitment,    setCommitment]    = useState('');
  const [distFromFund,  setDistFromFund]  = useState('0');
  const [reinvestable,  setReinvestable]  = useState('0');
  const [mgmtOffset,    setMgmtOffset]    = useState('0');
  const [fxRate,        setFxRate]        = useState('150.00');
  const [fetchingFx,    setFetchingFx]    = useState(false);

  // Auto-compute gross from commitment % if provided
  useEffect(() => {
    const pct   = parseFloat(callPct);
    const total = parseFloat(commitment);
    if (pct > 0 && total > 0) setGrossUSD(String((total * pct / 100).toFixed(0)));
  }, [callPct, commitment]);

  const gross  = parseFloat(grossUSD)     || 0;
  const dist   = parseFloat(distFromFund) || 0;
  const reinv  = parseFloat(reinvestable) || 0;
  const mgmt   = parseFloat(mgmtOffset)   || 0;
  const fx     = parseFloat(fxRate)       || 1;

  // Net = Gross − (Dist from fund − Reinvestable) − MgmtFeeOffset
  const netUSD = gross - dist + reinv - mgmt;
  const netJPY = netUSD * fx;

  async function fetchLiveFx() {
    setFetchingFx(true);
    try {
      const r = await fxRatesAPI.live();
      setFxRate(r.data.usd_jpy.toFixed(4));
      toast.success(`Live rate loaded: ¥${r.data.usd_jpy.toFixed(2)}`);
    } catch { toast.error('Could not fetch live rate'); }
    finally { setFetchingFx(false); }
  }

  const inputCls = 'w-full theme-input rounded-xl px-3 py-2.5 text-sm font-mono';
  const labelCls = 'block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5';

  const steps = [
    { label: 'Gross Capital Call',          value:  gross,  sign: '' },
    { label: '− Distribution Offset',       value: -dist,   sign: '−' },
    { label: '+ Reinvestable Amount',        value:  reinv,  sign: '+' },
    { label: '− Management Fee Offset',     value: -mgmt,   sign: '−' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Gross Capital Call (USD)</label>
          <input type="number" value={grossUSD} onChange={e => setGrossUSD(e.target.value)} className={inputCls} step="any" />
        </div>
        <div>
          <label className={labelCls}>Or: Call % of Commitment</label>
          <input type="number" value={callPct} onChange={e => setCallPct(e.target.value)} className={inputCls} step="0.1" placeholder="e.g. 25" />
        </div>
        <div>
          <label className={labelCls}>Total Commitment (USD)</label>
          <input type="number" value={commitment} onChange={e => setCommitment(e.target.value)} className={inputCls} step="any" placeholder="e.g. 20,000,000" />
        </div>
        <div>
          <label className={labelCls}>Distribution from Fund (USD)</label>
          <input type="number" value={distFromFund} onChange={e => setDistFromFund(e.target.value)} className={inputCls} step="any" placeholder="0" />
          <p className="text-xs theme-text-muted mt-1">Offsets the gross call amount</p>
        </div>
        <div>
          <label className={labelCls}>Reinvestable Amount (USD)</label>
          <input type="number" value={reinvestable} onChange={e => setReinvestable(e.target.value)} className={inputCls} step="any" placeholder="0" />
          <p className="text-xs theme-text-muted mt-1">Adds back to net call</p>
        </div>
        <div>
          <label className={labelCls}>Mgmt Fee / Other Offset (USD)</label>
          <input type="number" value={mgmtOffset} onChange={e => setMgmtOffset(e.target.value)} className={inputCls} step="any" placeholder="0" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={labelCls}>USD / JPY Rate</label>
          <div className="flex gap-2 max-w-xs">
            <input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} className={inputCls} step="0.0001" />
            <button onClick={fetchLiveFx} disabled={fetchingFx}
              className="px-4 py-2.5 bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-medium hover:bg-indigo-600/25 disabled:opacity-50 transition-colors flex-shrink-0 whitespace-nowrap">
              {fetchingFx ? '…' : '🔄 Live Rate'}
            </button>
          </div>
        </div>
      </div>

      {/* Calculation breakdown */}
      <div className="theme-card border rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold theme-text text-sm">Step-by-step Calculation</h3>
        <div className="font-mono text-sm space-y-0">
          {steps.map((r, i) => (
            <div key={i} className={`flex items-center justify-between py-2 border-b theme-divider last:border-0`}>
              <span className="text-xs theme-text-muted">{r.label}</span>
              <span className={`text-sm tabular-nums font-semibold ${
                r.value < 0 ? 'text-red-400' : r.value > 0 ? 'theme-text' : 'theme-text-muted'}`}>
                {r.value !== 0 ? `${r.value < 0 ? '(' : ''}$${fmt(Math.abs(r.value))}${r.value < 0 ? ')' : ''}` : '—'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 mt-1">
            <span className="text-sm font-bold theme-text">= Net Capital Call</span>
            <span className="text-sm font-bold text-indigo-400 tabular-nums">${fmt(netUSD)}</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Net Capital Call (USD)</p>
          <p className="text-3xl font-bold text-indigo-300 tabular-nums">${fmt(netUSD)}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-2">Net Capital Call (JPY)</p>
          <p className="text-3xl font-bold text-emerald-300 tabular-nums">
            ¥{netJPY.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-emerald-500/70 mt-1">@ ¥{fxRate} / USD</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ TAB 5: FEE & CARRY ════════════════════════ */

function FeeCalc() {
  const [aum,      setAum]      = useState('100000000');
  const [mgmtPct,  setMgmtPct]  = useState('2');
  const [carryPct, setCarryPct] = useState('20');
  const [hurdleP,  setHurdleP]  = useState('8');
  const [retP,     setRetP]     = useState('15');
  const [yrs,      setYrs]      = useState('10');

  const base   = parseFloat(aum)     || 0;
  const mgmt   = parseFloat(mgmtPct) / 100 || 0;
  const carry  = parseFloat(carryPct) / 100 || 0;
  const hurdle = parseFloat(hurdleP) / 100 || 0;
  const ret    = parseFloat(retP) / 100 || 0;
  const years  = Math.max(1, Math.min(15, parseInt(yrs) || 10));

  const annualMgmt   = base * mgmt;
  const totalMgmt    = annualMgmt * years;
  const grossReturn  = base * Math.pow(1 + ret, years) - base;
  const hurdleReturn = base * Math.pow(1 + hurdle, years) - base;
  const excessReturn = Math.max(0, grossReturn - hurdleReturn);
  const carriedInt   = excessReturn * carry;
  const lpNetProfit  = grossReturn - carriedInt - totalMgmt;

  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';

  const yearRows = Array.from({ length: years }, (_, i) => ({
    year   : `Y${i + 1}`,
    NAV    : +((base * Math.pow(1 + ret, i + 1)) / 1e6).toFixed(2),
    MgmtFee: +((base * mgmt) / 1e6).toFixed(3),
  }));

  const inputCls = 'w-full theme-input rounded-xl px-3 py-2.5 text-sm font-mono';
  const labelCls = 'block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Fund AUM / Committed (USD)</label>
          <input type="number" value={aum} onChange={e => setAum(e.target.value)} className={inputCls} step="any" />
        </div>
        <div>
          <label className={labelCls}>Management Fee (% p.a.)</label>
          <input type="number" value={mgmtPct} onChange={e => setMgmtPct(e.target.value)} className={inputCls} step="0.1" min="0" max="5" />
        </div>
        <div>
          <label className={labelCls}>Carried Interest (%)</label>
          <input type="number" value={carryPct} onChange={e => setCarryPct(e.target.value)} className={inputCls} step="1" min="0" max="40" />
        </div>
        <div>
          <label className={labelCls}>Hurdle Rate (% p.a.)</label>
          <input type="number" value={hurdleP} onChange={e => setHurdleP(e.target.value)} className={inputCls} step="0.5" min="0" max="20" />
        </div>
        <div>
          <label className={labelCls}>Assumed Return (% p.a.)</label>
          <input type="number" value={retP} onChange={e => setRetP(e.target.value)} className={inputCls} step="0.5" />
        </div>
        <div>
          <label className={labelCls}>Fund Life (Years)</label>
          <input type="number" value={yrs} onChange={e => setYrs(e.target.value)} className={inputCls} step="1" min="1" max="15" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: `Annual Mgmt Fee`,       value: annualMgmt,  color: '#f59e0b', note: `${mgmtPct}% of AUM/yr` },
          { label: `Total Mgmt (${years}y)`,value: totalMgmt,   color: '#f97316', note: 'LP cost' },
          { label: 'Gross Return',           value: grossReturn, color: '#10b981', note: `@ ${retP}% p.a.` },
          { label: 'Hurdle Return',          value: hurdleReturn,color: '#6366f1', note: `@ ${hurdleP}% p.a.` },
          { label: 'Carried Interest',       value: carriedInt,  color: '#ef4444', note: `GP profit share` },
          { label: 'LP Net Profit',          value: lpNetProfit, color: lpNetProfit >= 0 ? '#10b981' : '#ef4444', note: 'After fees & carry' },
        ].map(r => (
          <div key={r.label} className="theme-card border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide theme-text-muted">{r.label}</p>
            <p className="text-[10px] theme-text-muted">{r.note}</p>
            <p className="text-base font-bold mt-1 tabular-nums" style={{ color: r.color }}>
              ${fmt(r.value)}
            </p>
          </div>
        ))}
      </div>

      {/* NAV + fee projection chart */}
      <div className="theme-card border rounded-2xl p-5">
        <h3 className="font-semibold theme-text text-sm mb-3">NAV Growth Projection (USD Millions)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={yearRows} margin={{ left: -5, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: tick }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}M`} />
            <Tooltip contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 11 }}
              formatter={(v, name) => [`$${Number(v ?? 0).toFixed(2)}M`, name]} />
            <Bar dataKey="NAV" fill="#6366f1" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary breakdown */}
      <div className="theme-card border rounded-2xl p-5">
        <h3 className="font-semibold theme-text text-sm mb-3">Fee Waterfall — Who Gets What</h3>
        <div className="space-y-2">
          {[
            { label: 'Gross Investment Return',    val: grossReturn, pct: 100,                              color: '#6366f1' },
            { label: 'Management Fees (LP cost)',  val: -totalMgmt,  pct: -(totalMgmt / (grossReturn || 1)) * 100, color: '#f97316' },
            { label: 'Carried Interest (GP)',      val: -carriedInt, pct: -(carriedInt / (grossReturn || 1)) * 100, color: '#ef4444' },
            { label: 'LP Net Return',              val: lpNetProfit, pct: (lpNetProfit / (grossReturn || 1)) * 100,  color: '#10b981' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
              <span className="text-xs theme-text-muted flex-1">{r.label}</span>
              <span className="text-xs theme-text-muted w-16 text-right tabular-nums">{r.pct.toFixed(1)}%</span>
              <span className="text-xs font-bold w-28 text-right tabular-nums" style={{ color: r.color }}>
                {r.val < 0 ? '-' : ''}${fmt(Math.abs(r.val))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ MAIN PAGE ══════════════════════════════════ */

export default function Calculator() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CalcTab>('irr');

  const TRANSLATED_TABS: { id: CalcTab; icon: string; label: string }[] = [
    { id: 'irr',       icon: '📈', label: t('calculator.irrTab') },
    { id: 'fx',        icon: '💱', label: t('calculator.fxTab') },
    { id: 'multiples', icon: '✖️',  label: t('calculator.multiplesTab') },
    { id: 'netcall',   icon: '📋', label: t('calculator.netCallTab') },
    { id: 'fee',       icon: '💰', label: t('calculator.feeTab') },
  ];

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('calculator.title')}</h1>
          <p className="theme-text-muted text-sm mt-0.5">{t('calculator.subtitle')}</p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
          🔓 {t('calculator.availableAll')}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap p-1 rounded-xl border theme-border"
        style={{ background: 'rgba(0,0,0,0.15)' }}>
        {TRANSLATED_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'theme-text-sub hover:theme-text'
            }`}>
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div key={tab} className="animate-fade-in">
        {tab === 'irr'       && <IRRCalc />}
        {tab === 'fx'        && <FXConverter />}
        {tab === 'multiples' && <MultiplesCalc />}
        {tab === 'netcall'   && <NetCallCalc />}
        {tab === 'fee'       && <FeeCalc />}
      </div>
    </div>
  );
}

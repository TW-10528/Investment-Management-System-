import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardAPI, fxRatesAPI } from '../services/api';
import type { DashboardData, FundSummary } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const REFRESH_MS = 30_000;

const C = {
  indigo:    '#4f46e5', indigoBg:  'rgba(79,70,229,0.08)',  indigoBdr: 'rgba(79,70,229,0.2)',
  emerald:   '#10b981', emeraldBg: 'rgba(16,185,129,0.08)', emeraldBdr:'rgba(16,185,129,0.2)',
  slate:     '#64748b', slateBg:   'rgba(100,116,139,0.06)',slateBdr:  'rgba(100,116,139,0.15)',
  red:       '#ef4444', redBg:     'rgba(239,68,68,0.08)',  redBdr:    'rgba(239,68,68,0.2)',
  amber:     '#d97706', amberBg:   'rgba(217,119,6,0.08)',  amberBdr:  'rgba(217,119,6,0.2)',
  violet:    '#8b5cf6',
};

function usd(n: number) { return fmt.usd(n, true); }
function pct(n: number) { return n.toFixed(2) + '%'; }

/* ── KPI card ─────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color = C.indigo, bg = C.indigoBg, bdr = C.indigoBdr }:
  { label:string; value:string; sub?:string; color?:string; bg?:string; bdr?:string }) {
  return (
    <div className="theme-card border rounded-xl p-4" style={{ borderColor: bdr, background: bg }}>
      <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-1.5">{label}</p>
      <p className="text-xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] theme-text-muted mt-1">{sub}</p>}
    </div>
  );
}

/* ── Per-fund summary row ─────────────────────────────────────────────────── */
function FundRow({ fund }: { fund: FundSummary }) {
  const drawn = Math.min(fund.drawn_pct, 100);
  return (
    <tr className="theme-row-hover transition-colors">
      <td className="px-5 py-3">
        <Link to="/funds" className="font-semibold theme-text hover:text-indigo-400 text-sm transition-colors">
          {fund.fund_name}
        </Link>
        {fund.fund_name_jp && <p className="text-[10px] theme-text-muted mt-0.5">{fund.fund_name_jp}</p>}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{usd(fund.commitment_usd)}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>
        {usd(fund.total_called_usd)}
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums theme-text-muted">
        {fund.total_called_jpy ? fmt.jpy(fund.total_called_jpy) : '—'}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums theme-text-muted">
        {usd(fund.unfunded_usd ?? fund.commitment_usd - fund.total_called_usd)}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.emerald }}>
        {usd(fund.total_received_usd)}
      </td>
      <td className="px-4 py-3 text-right text-xs tabular-nums theme-text-muted">
        {fund.total_received_jpy ? fmt.jpy(fund.total_received_jpy) : '—'}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold"
          style={{ color: (fund.net_cash_position ?? 0) < 0 ? C.red : C.emerald }}>
        {usd(fund.net_cash_position ?? (fund.total_received_usd - fund.total_called_usd))}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">
        {(fund.dpi ?? 0).toFixed(3)}×
      </td>
      <td className="px-4 py-3 min-w-[130px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
            <div className="h-full rounded-full transition-all duration-700"
                 style={{ width: `${drawn}%`, background: drawn >= 90 ? C.red : C.indigo }} />
          </div>
          <span className="text-xs tabular-nums theme-text-muted w-10 text-right">{fund.drawn_pct.toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  );
}

/* ── FX widget ────────────────────────────────────────────────────────────── */
function FxWidget({ data, live, loading, onFetch }:
  { data: DashboardData; live: number|null; loading: boolean; onFetch: ()=>void }) {
  const rate = live ?? data.latest_fx_rate;
  return (
    <div className="theme-card border rounded-xl px-5 py-4 flex items-center gap-6">
      <div className="flex-1">
        <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">USD / JPY</p>
        <p className="text-2xl font-bold tabular-nums theme-text mt-0.5">{rate ? `¥${rate.toFixed(2)}` : '—'}</p>
        <p className="text-[10px] theme-text-muted">
          {live ? 'Live rate' : `Stored · ${fmt.date(data.latest_fx_date ?? '')}`}
        </p>
      </div>
      <button onClick={onFetch} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border theme-divider theme-text-muted hover:border-indigo-400 hover:text-indigo-400 transition-colors disabled:opacity-40">
        {loading ? <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/> : '🔄'}
        Refresh
      </button>
    </div>
  );
}

/* ── Overdue alert ────────────────────────────────────────────────────────── */
function OverdueAlert({ calls }: { calls: DashboardData['overdue_calls'] }) {
  if (!calls?.length) return null;
  return (
    <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
         style={{ background: C.redBg, borderColor: C.redBdr }}>
      <span className="flex-shrink-0 text-base">⚠️</span>
      <div className="flex-1">
        <p className="text-sm font-bold" style={{ color: C.red }}>
          {calls.length} Overdue Capital Call{calls.length > 1 ? 's' : ''}
        </p>
        {calls.map(c => (
          <div key={c.id} className="flex justify-between text-xs mt-0.5" style={{ color: C.red }}>
            <span>Due {fmt.date(c.due_date)}</span>
            <span className="font-mono font-bold">{usd(c.net_call_usd)}</span>
          </div>
        ))}
      </div>
      <Link to="/funds" className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.red }}>
        Review →
      </Link>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { t } = useTranslation();
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [liveRate,    setLiveRate]    = useState<number | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const r = await dashboardAPI.summary();
      setData(r.data);
      setLastUpdated(new Date());
    } catch {
      if (!silent) toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const id = setInterval(() => { loadDashboard(true); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadDashboard]);

  async function fetchLive() {
    setLiveLoading(true);
    try {
      const r = await fxRatesAPI.live();
      setLiveRate(r.data.usd_jpy);
      toast.success('Live rate refreshed');
    } catch { toast.error('Could not fetch live rate'); }
    finally { setLiveLoading(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: `${C.indigo} transparent transparent transparent` }} />
        <p className="theme-text-muted text-sm">Loading portfolio…</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm" style={{ color: C.red }}>Failed to load dashboard</p>
    </div>
  );

  const activeFunds = data.fund_summaries.filter(f => f.is_active !== false);
  const sec = (ago: number) => ago < 5 ? 'Just now' : ago < 60 ? `${ago}s ago` : `${Math.floor(ago/60)}m ago`;
  const agoSec = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0;

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold theme-text">{t('dashboard.title')}</h1>
            {lastUpdated && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: C.emeraldBg, color: C.emerald, border: `1px solid ${C.emeraldBdr}` }}>
                ↻ {sec(agoSec)}
              </span>
            )}
            {refreshing && (
              <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: `${C.indigo} transparent transparent transparent` }} />
            )}
          </div>
          <p className="theme-text-muted text-sm mt-0.5">
            Thirdwave Financial Inc. · {new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
            {' · '}auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadDashboard(true); }} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border theme-divider theme-text-muted hover:theme-text transition-colors disabled:opacity-40">
            🔄 Refresh
          </button>
          <Link to="/funds"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: C.indigo }}>
            Manage Funds →
          </Link>
        </div>
      </div>

      {/* ── Overdue alert ── */}
      <OverdueAlert calls={data.overdue_calls ?? []} />

      {/* ── Portfolio KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Active Funds"      value={String(data.total_funds)}            sub="under management" />
        <KpiCard label="Total Commitment"  value={usd(data.total_commitment_usd)}      sub="gross LP commitment" />
        <KpiCard label="Total Paid-in"     value={usd(data.total_called_usd)}          sub={pct(data.drawn_pct) + ' drawn'} />
        <KpiCard label="Dry Powder"        value={usd(data.dry_powder_usd)}            sub={pct(100 - data.drawn_pct) + ' available'} color={C.slate} bg={C.slateBg} bdr={C.slateBdr} />
        <KpiCard label="Total Distributed" value={usd(data.total_received_usd)}       sub={`DPI ${data.dpi.toFixed(3)}×`} color={C.emerald} bg={C.emeraldBg} bdr={C.emeraldBdr} />
      </div>

      {/* ── FX Rate ── */}
      <FxWidget data={data} live={liveRate} loading={liveLoading} onFetch={fetchLive} />

      {/* ── Per-fund table ── */}
      {activeFunds.length > 0 && (
        <div className="theme-card border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b theme-divider flex items-center justify-between"
               style={{ background: C.indigoBg }}>
            <div>
              <h2 className="text-sm font-bold theme-text">Fund Portfolio</h2>
              <p className="text-[10px] theme-text-muted mt-0.5">{activeFunds.length} active fund{activeFunds.length!==1?'s':''} · updates every 30s</p>
            </div>
            <Link to="/funds" className="text-xs font-medium" style={{ color: C.indigo }}>Edit funds →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
                <tr>
                  {['Fund','Commitment','Paid-in','Paid-in (¥)','Dry Powder','Distributed','Distributed (¥)','Net Cash','DPI','Drawn'].map(h => (
                    <th key={h} className={`px-${h==='Fund'?5:4} py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide ${h==='Fund'?'text-left':'text-right'} ${h==='Drawn'?'min-w-[140px]':''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y theme-divider">
                {activeFunds.map(f => <FundRow key={f.fund_id} fund={f} />)}
              </tbody>
              <tfoot className="border-t theme-divider" style={{ background: 'rgba(99,102,241,0.03)' }}>
                <tr>
                  <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">Portfolio Total</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{usd(data.total_commitment_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{usd(data.total_called_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold theme-text-muted">{fmt.jpy(activeFunds.reduce((s, f) => s + (f.total_called_jpy ?? 0), 0))}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text-muted">{usd(data.dry_powder_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.emerald }}>{usd(data.total_received_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold theme-text-muted">{fmt.jpy(activeFunds.reduce((s, f) => s + (f.total_received_jpy ?? 0), 0))}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold"
                      style={{ color: (data.total_received_usd - data.total_called_usd) < 0 ? C.red : C.emerald }}>
                    {usd(data.total_received_usd - data.total_called_usd)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{data.dpi.toFixed(3)}×</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{pct(data.drawn_pct)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Pending calls notice ── */}
      {data.pending_calls_count > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
             style={{ background: C.amberBg, borderColor: C.amberBdr }}>
          <p className="text-sm font-semibold" style={{ color: C.amber }}>
            📋 {data.pending_calls_count} pending capital call{data.pending_calls_count>1?'s':''} — manage in Funds
          </p>
          <Link to="/funds" className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.amber }}>
            Go to Funds →
          </Link>
        </div>
      )}

    </div>
  );
}

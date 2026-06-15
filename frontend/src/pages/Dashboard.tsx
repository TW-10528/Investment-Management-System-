import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardAPI, fxRatesAPI } from '../services/api';
import type { DashboardData } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const SUMMARY_REFRESH_MS = 60_000;   // dashboard summary + fx — 1 min

// Prevents concurrent FX auto-saves when StrictMode double-invokes mount effects.
// Stays true after a successful save; next poll finds today's rate via /fx-rates/latest anyway.
let _fxAutoSaveGuard = false;

// Formal / corporate palette — deep navy primary, muted green, teal, slate
const C = {
  indigo:    '#1e40af', indigoBg:  'rgba(30,64,175,0.07)',  indigoBdr: 'rgba(30,64,175,0.20)',
  emerald:   '#047857', emeraldBg: 'rgba(4,120,87,0.07)',   emeraldBdr:'rgba(4,120,87,0.20)',
  slate:     '#475569', slateBg:   'rgba(71,85,105,0.06)',  slateBdr:  'rgba(71,85,105,0.16)',
  red:       '#b91c1c', redBg:     'rgba(185,28,28,0.07)',  redBdr:    'rgba(185,28,28,0.20)',
  amber:     '#b45309', amberBg:   'rgba(180,83,9,0.08)',   amberBdr:  'rgba(180,83,9,0.20)',
  violet:    '#0f766e',
};

function usd(n: number) { return fmt.usd(n); }
function pct(n: number) { return n.toFixed(2) + '%'; }

/* ── KPI card ─────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, full, sub, color = C.indigo, bg = C.indigoBg, bdr = C.indigoBdr }:
  { label:string; value:string; full?:string; sub?:string; color?:string; bg?:string; bdr?:string }) {
  return (
    <div className="theme-card border rounded-xl p-5" style={{ borderColor: bdr, background: bg }}
         title={full ? `${label}: ${full}` : undefined}>
      <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-2">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {full && <p className="text-xs font-semibold tabular-nums theme-text mt-1.5">{full}</p>}
      {sub && <p className="text-[11px] theme-text-muted mt-1">{sub}</p>}
    </div>
  );
}

/* ── FX widget ────────────────────────────────────────────────────────────── */
function FxWidget({ latestSaved, latestDate }:
  { latestSaved: number|null; latestDate: string|null }) {
  const { t } = useTranslation();
  const todayJst   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const jstHour    = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
  const todayRateMissing = !latestDate || latestDate !== todayJst;
  // Warning only when today's rate is not yet in DB AND before 11:00 JST
  const showWarning = todayRateMissing && jstHour < 11;

  return (
    <div className="space-y-2">
      {showWarning && latestSaved && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg mt-0.5">🕐</span>
          <div>
            <p className="font-semibold text-sm">{t('fxRates.murcWarningTitle')}</p>
            <p className="text-xs mt-0.5 text-amber-400/80">
              {t('fxRates.murcWarningBody')} ({latestDate} — ¥{latestSaved.toFixed(2)}).
            </p>
          </div>
        </div>
      )}

      {/* Rate card */}
      <div className="theme-card border rounded-xl px-5 py-4">
        <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">USD / JPY · MUFG TTM Rate</p>
        <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: latestSaved ? C.emerald : C.slate }}>
          {latestSaved ? `¥${latestSaved.toFixed(2)}` : '—'}
        </p>
        <p className="text-[10px] theme-text-muted mt-1">
          {latestDate
            ? `MUFG TTM · ${new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}`
            : t('fxRates.fetchToday')}
        </p>
      </div>
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
  const [latestSaved, setLatestSaved] = useState<number | null>(null);
  const [latestDate,  setLatestDate]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [r, fxR] = await Promise.all([
        dashboardAPI.summary(),
        fxRatesAPI.latest(),
      ]);
      setData(r.data);
      setLastUpdated(new Date());

      const todayJst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
      const jstHour  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })).getHours();
      const savedDate = fxR.data?.date ?? null;

      if (savedDate === todayJst) {
        // Today's rate already in DB — use it directly
        setLatestSaved(fxR.data.usd_jpy);
        setLatestDate(savedDate);
      } else if (jstHour >= 11) {
        // After 11:00 JST and today's rate missing — auto-fetch and save
        if (!_fxAutoSaveGuard) {
          _fxAutoSaveGuard = true;
          try {
            const live = await fxRatesAPI.historical(todayJst, 'USD', 'JPY');
            if (live.data?.usd_jpy) {
              await fxRatesAPI.create({ rate_date: todayJst, usd_jpy: live.data.usd_jpy, source: 'murc_ttm' });
              setLatestSaved(live.data.usd_jpy);
              setLatestDate(todayJst);
            }
          } catch { /* leave guard set — don't re-hit MURC every 60s poll when today's rate isn't published yet (or it's a non-trading/future date). Picked up on next page load. */ }
        }
      } else if (fxR.data?.usd_jpy) {
        // Before 11:00 JST — show last saved rate with warning
        setLatestSaved(fxR.data.usd_jpy);
        setLatestDate(savedDate);
      }
    } catch {
      if (!silent) toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Poll dashboard summary + FX every 60s — skip when tab is not visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard(true);
    }, SUMMARY_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadDashboard]);

  // Refresh immediately when tab becomes visible again after being hidden
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadDashboard(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadDashboard]);


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
            {' · '}auto-refreshes every 60s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadDashboard(true)} disabled={refreshing}
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

      {/* ── Headline portfolio values (main overall only) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Value"        value={fmt.usdAbbr(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd))}
                 full={fmt.usdFull(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd))}
                 sub="Distributions + NAV" color={C.indigo} />
        <KpiCard label="Total Commitments"  value={fmt.usdAbbr(data.total_commitment_usd)}
                 full={fmt.usdFull(data.total_commitment_usd)}
                 sub={`${data.total_funds} funds · ${pct(data.drawn_pct)} drawn`} />
        <KpiCard label="Net IRR"            value={data.irr != null ? `${data.irr.toFixed(1)}%` : '—'}
                 sub="since inception"
                 color={(data.irr ?? 0) < 0 ? C.red : C.emerald}
                 bg={(data.irr ?? 0) < 0 ? C.redBg : C.emeraldBg}
                 bdr={(data.irr ?? 0) < 0 ? C.redBdr : C.emeraldBdr} />
      </div>

      {/* ── FX Rate ── */}
      <FxWidget latestSaved={latestSaved} latestDate={latestDate} />

      {/* ── Funds — compact table, essential columns only ── */}
      {activeFunds.length > 0 && (
        <div className="theme-card border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b theme-divider flex items-center justify-between"
               style={{ background: C.indigoBg }}>
            <h2 className="text-sm font-bold theme-text">Funds <span className="theme-text-muted font-medium">· {activeFunds.length}</span></h2>
            <Link to="/funds" className="text-xs font-semibold" style={{ color: C.indigo }}>Manage Funds →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
                <tr>
                  {[
                    { label: 'Fund',          left: true  },
                    { label: 'Commitment',    left: false },
                    { label: 'Contributions', left: false },
                    { label: 'Distributions', left: false },
                    { label: 'NAV',           left: false },
                    { label: 'Total Value',   left: false },
                  ].map(h => (
                    <th key={h.label} className={`px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h.left ? 'text-left pl-5' : 'text-right'}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y theme-divider">
                {activeFunds.map(f => {
                  const navUsd   = f.nav_usd ?? 0;
                  const valueUsd = f.total_value_usd ?? (f.total_received_usd + navUsd);
                  return (
                    <tr key={f.fund_id} className="theme-row-hover transition-colors">
                      <td className="px-5 py-3">
                        <Link to="/funds" className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors">{f.fund_name}</Link>
                        {f.fund_name_jp && <p className="text-[10px] theme-text-muted mt-0.5">{f.fund_name_jp}</p>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums theme-text" title={fmt.usdFull(f.commitment_usd)}>{fmt.usdAbbr(f.commitment_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}  title={fmt.usdFull(f.total_called_usd)}>{fmt.usdAbbr(f.total_called_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.emerald }} title={fmt.usdFull(f.total_received_usd)}>{fmt.usdAbbr(f.total_received_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.violet }} title={fmt.usdFull(navUsd)}>{fmt.usdAbbr(navUsd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold theme-text" title={fmt.usdFull(valueUsd)}>{fmt.usdAbbr(valueUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t theme-divider" style={{ background: 'rgba(99,102,241,0.03)' }}>
                <tr>
                  <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">Total</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text" title={fmt.usdFull(data.total_commitment_usd)}>{fmt.usdAbbr(data.total_commitment_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}  title={fmt.usdFull(data.total_called_usd)}>{fmt.usdAbbr(data.total_called_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.emerald }} title={fmt.usdFull(data.total_received_usd)}>{fmt.usdAbbr(data.total_received_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }} title={fmt.usdFull(data.total_nav_usd)}>{fmt.usdAbbr(data.total_nav_usd)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold theme-text" title={fmt.usdFull(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd))}>{fmt.usdAbbr(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

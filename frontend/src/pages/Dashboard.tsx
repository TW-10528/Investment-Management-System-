import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardAPI, fxRatesAPI } from '../services/api';
import type { DashboardData } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

const SUMMARY_REFRESH_MS = 60_000;   // dashboard summary + fx — 1 min


// Formal / corporate palette — deep navy primary, muted green, teal, slate
const C = {
  indigo:    '#1e40af', indigoBg:  'rgba(30,64,175,0.07)',  indigoBdr: 'rgba(30,64,175,0.20)',
  emerald:   '#1e40af', emeraldBg: 'rgba(4,120,87,0.07)',   emeraldBdr:'rgba(4,120,87,0.20)',
  slate:     '#475569', slateBg:   'rgba(71,85,105,0.06)',  slateBdr:  'rgba(71,85,105,0.16)',
  red:       '#b91c1c', redBg:     'rgba(185,28,28,0.07)',  redBdr:    'rgba(185,28,28,0.20)',
  amber:     '#b45309', amberBg:   'rgba(180,83,9,0.08)',   amberBdr:  'rgba(180,83,9,0.20)',
  violet:    '#1e40af',
};

function usd(n: number) { return fmt.usd(n); }

function getFundNameTranslationKey(fundName: string): string {
  const keyMap: Record<string, string> = {
    'Dover Street XI Feeder Fund L.P.': 'fundNames.doverStreet',
    'Siguler Guff Small Buyout Opportunities Fund VI (F), LP': 'fundNames.sigulerGuff',
    'Vintage X (Flagship) Offshore SCSp': 'fundNames.vintageX',
    'Capula Global Relative Value Trust': 'fundNames.capulaGlobal',
    'Hamilton Lane Secondary Fund VI-B LP': 'fundNames.hamiltonLaneSecondary',
    'Hamilton Lane Strategic Opportunities Fund IX-B LP': 'fundNames.hamiltonLane',
    'NB Real Estate Secondary Opportunities Offshore Fund II LP': 'fundNames.nealEstate',
    'SDG Fund': 'fundNames.sdgFund',
  };
  return keyMap[fundName] || '';
}

/* ── FX widget ────────────────────────────────────────────────────────────── */
function FxWidget({ prevRate, prevDate, t, i18n }:
  { prevRate: number|null; prevDate: string|null; t?: any; i18n?: any }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const lang = i18n?.language || 'en';

    if (lang === 'ja') {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${year}年${month}月${day}日現在`;
    } else {
      return date.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    }
  };

  return (
    <div className="theme-card border rounded-xl px-5 py-4">
      <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{t('usdJpy.label')}</p>
      <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: prevRate ? C.indigo : C.slate }}>
        {prevRate ? `¥${prevRate.toFixed(2)}` : '—'}
      </p>
      <p className="text-[10px] theme-text-muted mt-1">
        {prevDate ? formatDate(prevDate) : 'Rate unavailable'}
      </p>
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
  const { t, i18n } = useTranslation();
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [latestSaved, setLatestSaved] = useState<number | null>(null);
  const [latestDate,  setLatestDate]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      // Previous business day in JST (go back 1 day; skip weekends)
      const prevJst = (() => {
        const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        d.setDate(d.getDate() - 1);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
      })();

      const [r, fxPrev] = await Promise.all([
        dashboardAPI.summary(),
        fxRatesAPI.historical(prevJst, 'USD', 'JPY', true),   // fallback=latest
      ]);
      setData(r.data);
      setLastUpdated(new Date());

      if (fxPrev.data?.usd_jpy) {
        setLatestSaved(fxPrev.data.usd_jpy);
        setLatestDate(fxPrev.data.date ?? prevJst);
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
                    style={{ background: C.indigoBg, color: C.indigo, border: `1px solid ${C.indigoBdr}` }}>
                ↻ {sec(agoSec)}
              </span>
            )}
            {refreshing && (
              <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: `${C.indigo} transparent transparent transparent` }} />
            )}
          </div>
          <p className="theme-text-muted text-sm mt-0.5">
            {t('app.company')} · {(() => {
              const now = new Date();
              if (i18n.language === 'ja') {
                const year = now.getFullYear();
                const month = now.getMonth() + 1;
                const day = now.getDate();
                return `${year}年${month}月${day}日`;
              }
              return now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
            })()}
            {' · '}{t('dashboard.autoRefresh')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.location.reload()} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border theme-divider theme-text-muted hover:theme-text transition-colors disabled:opacity-40">
            🔄 {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* ── Overdue alert ── */}
      <OverdueAlert calls={data.overdue_calls ?? []} />

      {/* ── 7 Regular Funds (USD) vs SDG (JPY) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: 7 Regular Funds in USD */}
        <div className="grid grid-cols-2 gap-2">
          {(() => {
            const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
            const regularCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
            const regularDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);

            return (
              <>
                <div className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '100px' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-2 text-center">{i18n.language === 'ja' ? '7ファンド\nコミットメント' : '7 Funds\nCommitment'}</p>
                  <p className="text-lg font-bold tabular-nums theme-text text-center">{fmt.usdFull(regularCommit)}</p>
                  <p className="text-[10px] theme-text-muted mt-2 text-center">USD</p>
                </div>
                <div className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '100px' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-2 text-center">{i18n.language === 'ja' ? '7ファンド\n分配金' : '7 Funds\nDistribution'}</p>
                  <p className="text-lg font-bold tabular-nums text-center" style={{ color: C.indigo }}>{fmt.usdFull(regularDist)}</p>
                  <p className="text-[10px] theme-text-muted mt-2 text-center">USD</p>
                </div>
              </>
            );
          })()}
        </div>

        {/* Right: SDG Fund in JPY */}
        <div className="grid grid-cols-2 gap-2">
          {(() => {
            const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
            if (!sdgFund) return null;

            const sdgCommit = sdgFund.commitment_usd ?? 0;
            const sdgDist = sdgFund.total_received_usd ?? 0;

            return (
              <>
                <div className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '100px' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-2 text-center">{i18n.language === 'ja' ? 'SDG\nコミットメント' : 'SDG\nCommitment'}</p>
                  <p className="text-lg font-bold tabular-nums theme-text text-center">{latestSaved ? fmt.jpy(sdgCommit * latestSaved) : fmt.usdFull(sdgCommit)}</p>
                  <p className="text-[10px] theme-text-muted mt-2 text-center">JPY</p>
                </div>
                <div className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '100px' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-2 text-center">{i18n.language === 'ja' ? 'SDG\n分配金' : 'SDG\nDistribution'}</p>
                  <p className="text-lg font-bold tabular-nums text-center" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgDist * latestSaved) : fmt.usdFull(sdgDist)}</p>
                  <p className="text-[10px] theme-text-muted mt-2 text-center">JPY</p>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Additional metrics (MOIC, NET IRR, DRY POWDER, NAV) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: 7 Funds metrics */}
        <div className="grid grid-cols-4 gap-2">
          {(() => {
            const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
            const regularCalled = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
            const regularDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);
            const regularNav = regularFunds.reduce((sum, f) => sum + (f.nav_usd ?? 0), 0);
            const regularCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
            const regularValue = regularFunds.reduce((sum, f) => sum + (f.total_value_usd ?? (f.total_received_usd + (f.nav_usd ?? 0))), 0);
            const dpi = regularCalled > 0 ? regularDist / regularCalled : 0;
            const tvpi = regularCalled > 0 ? regularValue / regularCalled : 0;
            const moic = dpi * tvpi;
            const dryPowder = regularCommit - regularCalled;

            return (
              <>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.moic')}</p>
                  <p className="text-base font-bold" style={{ color: '#1e40af' }}>{moic.toFixed(2)}×</p>
                  <p className="text-[7px] text-blue-600 mt-1">DPI {dpi.toFixed(2)}× · TVPI {tvpi.toFixed(2)}×</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.netIRR')}</p>
                  <p className="text-base font-bold" style={{ color: '#1e40af' }}>{data.irr != null ? `${data.irr.toFixed(1)}%` : '—'}</p>
                  <p className="text-[7px] text-blue-600 mt-1">Since Inception</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.dryPowder')}</p>
                  <p className="text-xs font-bold break-words" style={{ color: '#1e40af' }}>{fmt.usdFull(dryPowder)}</p>
                  <p className="text-[7px] text-blue-600 mt-1">{((dryPowder/regularCommit)*100).toFixed(2)}% Available</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.totalNAV')}</p>
                  <p className="text-xs font-bold break-words" style={{ color: '#1e40af' }}>{fmt.usdFull(regularNav)}</p>
                  <p className="text-[7px] text-blue-600 mt-1">Latest Reported</p>
                </div>
              </>
            );
          })()}
        </div>

        {/* Right: SDG metrics */}
        <div className="grid grid-cols-4 gap-2">
          {(() => {
            const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
            const sdgCalled = sdgFund ? (sdgFund.total_called_usd ?? 0) : 0;
            const sdgDist = sdgFund ? (sdgFund.total_received_usd ?? 0) : 0;
            const sdgNav = sdgFund ? (sdgFund.nav_usd ?? 0) : 0;
            const sdgCommit = sdgFund ? (sdgFund.commitment_usd ?? 0) : 0;
            const sdgValue = sdgFund ? (sdgFund.total_value_usd ?? (sdgFund.total_received_usd + (sdgFund.nav_usd ?? 0))) : 0;
            const sdgDpi = sdgCalled > 0 ? sdgDist / sdgCalled : 0;
            const sdgTvpi = sdgCalled > 0 ? sdgValue / sdgCalled : 0;
            const sdgMoic = sdgDpi * sdgTvpi;
            const sdgDryPowder = sdgCommit - sdgCalled;

            return (
              <>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.moic')}</p>
                  <p className="text-base font-bold" style={{ color: '#1e40af' }}>{sdgMoic.toFixed(2)}×</p>
                  <p className="text-[7px] text-blue-600 mt-1">DPI {sdgDpi.toFixed(2)}× · TVPI {sdgTvpi.toFixed(2)}×</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.netIRR')}</p>
                  <p className="text-base font-bold" style={{ color: '#1e40af' }}>—</p>
                  <p className="text-[7px] text-blue-600 mt-1">Since Inception</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.dryPowder')}</p>
                  <p className="text-xs font-bold break-words" style={{ color: '#1e40af' }}>{latestSaved ? fmt.jpy(sdgDryPowder * latestSaved) : fmt.jpy(sdgDryPowder)}</p>
                  <p className="text-[7px] text-blue-600 mt-1">{((sdgDryPowder/sdgCommit)*100).toFixed(2)}% Available</p>
                </div>
                <div className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(30, 64, 175, 0.12)', border: '1px solid rgba(30, 64, 175, 0.3)' }}>
                  <p className="text-[7px] font-bold uppercase tracking-widest text-blue-600 mb-1">{t('manageFunds.totalNAV')}</p>
                  <p className="text-xs font-bold break-words" style={{ color: '#1e40af' }}>{latestSaved ? fmt.jpy(sdgNav * latestSaved) : fmt.jpy(sdgNav)}</p>
                  <p className="text-[7px] text-blue-600 mt-1">Latest Reported</p>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── FX Rate ── */}
      <FxWidget prevRate={latestSaved} prevDate={latestDate} t={t} i18n={i18n} />

      {/* ── Funds — compact table, essential columns only ── */}
      {activeFunds.length > 0 && (
        <div className="theme-card border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b theme-divider flex items-center"
               style={{ background: C.indigoBg }}>
            <h2 className="text-sm font-bold theme-text">{t('nav.funds')} <span className="theme-text-muted font-medium">· {activeFunds.length}</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
                <tr>
                  {[
                    { key: 'fundOverview.fundName',     left: true  },
                    { key: 'fundOverview.fundManager',  left: true  },
                    { key: 'fundOverview.commitment',    left: false },
                    { key: 'metrics.contributions', left: false },
                    { key: 'metrics.distributions', left: false },
                    { key: 'metrics.nav',           left: false },
                    { key: 'dashboard.totalValue',   left: false },
                  ].map(h => (
                    <th key={h.key} className={`px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap sticky top-0 z-10 ${h.left ? 'text-left pl-5' : 'text-right'}`} style={{ background: 'var(--color-header-bg)' }}>{t(h.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y theme-divider">
                {/* 7 Funds rows (USD) */}
                {activeFunds.map(f => {
                  const navUsd   = f.nav_usd ?? 0;
                  const valueUsd = f.total_value_usd ?? (f.total_received_usd + navUsd);
                  const fundNameKey = getFundNameTranslationKey(f.fund_name);
                  const isSdg = /sdg/i.test(f.fund_name ?? '');

                  if (isSdg) return null; // Skip SDG fund in main rows

                  return (
                    <tr key={f.fund_id} className="theme-row-hover transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/funds?fund=${f.fund_id}`} className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors">
                          {fundNameKey ? t(fundNameKey) : f.fund_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm theme-text">{f.manager || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums theme-text">{fmt.usdFull(f.contract_commitment_usd ?? f.commitment_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{fmt.usdFull(f.total_called_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{fmt.usdFull(f.total_received_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.violet }}>{fmt.usdFull(navUsd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold theme-text">{fmt.usdFull(valueUsd)}</td>
                    </tr>
                  );
                })}
                {/* SDG Fund row (JPY) - placed before totals */}
                {(() => {
                  const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
                  if (!sdgFund) return null;

                  const fundNameKey = getFundNameTranslationKey(sdgFund.fund_name);
                  const navUsd = sdgFund.nav_usd ?? 0;
                  const valueUsd = sdgFund.total_value_usd ?? (sdgFund.total_received_usd + navUsd);

                  return (
                    <tr key={sdgFund.fund_id} className="theme-row-hover transition-colors" style={{ borderTop: '2px solid rgba(99,102,241,0.2)' }}>
                      <td className="px-5 py-3">
                        <span className="font-semibold theme-text text-sm">{fundNameKey ? t(fundNameKey) : sdgFund.fund_name}</span>
                      </td>
                      <td className="px-4 py-3 text-sm theme-text">{sdgFund.manager || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums theme-text">{latestSaved ? fmt.jpy(sdgFund.commitment_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_called_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_received_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: C.violet }}>{latestSaved ? fmt.jpy(navUsd * latestSaved) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(valueUsd * latestSaved) : '—'}</td>
                    </tr>
                  );
                })()}
              </tbody>
              <tfoot className="border-t theme-divider" style={{ background: 'rgba(99,102,241,0.03)' }}>
                {/* Dollar Total (7 Funds in USD) */}
                {(() => {
                  const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
                  const regCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
                  const regCalled = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
                  const regDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);
                  const regNav = regularFunds.reduce((sum, f) => sum + (f.nav_usd ?? 0), 0);
                  const regValue = regularFunds.reduce((sum, f) => sum + (f.total_value_usd ?? (f.total_received_usd + (f.nav_usd ?? 0))), 0);

                  return (
                    <tr>
                      <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.dollarTotal')}</td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{fmt.usdFull(regCommit)}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regCalled)}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regDist)}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{fmt.usdFull(regNav)}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{fmt.usdFull(regValue)}</td>
                    </tr>
                  );
                })()}
                {/* Yen Total (SDG Fund in JPY) */}
                {(() => {
                  const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
                  if (!sdgFund) return null;

                  const navUsd = sdgFund.nav_usd ?? 0;
                  const valueUsd = sdgFund.total_value_usd ?? (sdgFund.total_received_usd + navUsd);

                  return (
                    <tr>
                      <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.yenTotal')}</td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{latestSaved ? fmt.jpy(sdgFund.commitment_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_called_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_received_usd * latestSaved) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{latestSaved ? fmt.jpy(navUsd * latestSaved) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{latestSaved ? fmt.jpy(valueUsd * latestSaved) : '—'}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

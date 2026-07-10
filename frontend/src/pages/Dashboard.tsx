import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardAPI, fxRatesAPI, fundsAPI } from '../services/api';
import type { DashboardData, LedgerRow } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';
import PageHeader from '../components/PageHeader';

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
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{t('usdJpy.label')}</p>
          <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: prevRate ? C.indigo : C.slate }}>
            {prevRate ? `¥${prevRate.toFixed(2)}` : '—'}
          </p>
          <p className="text-[10px] theme-text-muted mt-1">
            {prevDate ? formatDate(prevDate) : 'Rate unavailable'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <svg width="140" height="60" viewBox="0 0 140 60" className="text-indigo-500" style={{ filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.4))' }}>
            <defs>
              <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {/* Filled area under the line */}
            <path
              d="M 5,48 Q 20,42 35,38 T 65,30 T 95,18 T 135,8 L 135,60 L 5,60 Z"
              fill="url(#sparkGradient)"
              opacity="0.4"
            />
            {/* Main line with glow */}
            <path
              d="M 5,48 Q 20,42 35,38 T 65,30 T 95,18 T 135,8"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              opacity="0.8"
            />
            {/* Highlighted line on top */}
            <path
              d="M 5,48 Q 20,42 35,38 T 65,30 T 95,18 T 135,8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
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
  const { t, i18n } = useTranslation();
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [latestSaved, setLatestSaved] = useState<number | null>(null);
  const [latestDate,  setLatestDate]  = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [totals, setTotals] = useState<{
    regularReturnOfCapital: number; regularGain: number; regularInterest: number;
    sdgReturnOfCapital: number; sdgGain: number; sdgInterest: number;
  }>({ regularReturnOfCapital: 0, regularGain: 0, regularInterest: 0, sdgReturnOfCapital: 0, sdgGain: 0, sdgInterest: 0 });

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

      // Fetch ledger data for all active funds to calculate totals
      if (r.data?.fund_summaries) {
        const activeFunds = r.data.fund_summaries.filter((f: any) => f.is_active !== false);
        const regularFundIds = activeFunds.filter((f: any) => !/sdg/i.test(f.fund_name ?? '')).map((f: any) => f.fund_id);
        const sdgFundId = activeFunds.find((f: any) => /sdg/i.test(f.fund_name ?? ''))?.fund_id;

        let regularReturnOfCapital = 0, regularGain = 0, regularInterest = 0;
        let sdgReturnOfCapital = 0, sdgGain = 0, sdgInterest = 0;

        try {
          const ledgers = await Promise.all(activeFunds.map((f: any) =>
            fundsAPI.ledger(f.fund_id)
              .then(res => ({ rows: (res.data?.rows ?? []) as LedgerRow[] }))
              .catch(() => ({ rows: [] as LedgerRow[] }))
          ));

          ledgers.forEach((ledger: any, idx: number) => {
            const fund = activeFunds[idx];
            const isRegular = regularFundIds.includes(fund.fund_id);
            ledger.rows.forEach((r: any) => {
              if (isRegular) {
                regularReturnOfCapital += r.return_of_capital ?? 0;
                regularGain += r.gain ?? 0;
                regularInterest += r.interest ?? 0;
              } else if (fund.fund_id === sdgFundId) {
                sdgReturnOfCapital += r.return_of_capital ?? 0;
                sdgGain += r.gain ?? 0;
                sdgInterest += r.interest ?? 0;
              }
            });
          });

          setTotals({ regularReturnOfCapital, regularGain, regularInterest, sdgReturnOfCapital, sdgGain, sdgInterest });
        } catch {
          // Silently fail — use zero totals if ledger fetch fails
        }
      }

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
    <div className="space-y-3 animate-fade-in">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={`${t('app.company')} · ${(() => {
          const now = new Date();
          if (i18n.language === 'ja') {
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const day = now.getDate();
            return `${year}年${month}月${day}日`;
          }
          return now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
        })()} · ${t('dashboard.autoRefresh')}`}
        badge={lastUpdated ? {
          label: `↻ ${sec(agoSec)}`,
          color: C.indigo,
        } : undefined}
        actions={[
          { icon: '🔄', label: t('common.refresh'), onClick: () => window.location.reload(), disabled: refreshing, variant: 'secondary' },
        ]}
      />

      <div className="p-5 space-y-3">

      {/* ── Overdue alert ── */}
      <OverdueAlert calls={data.overdue_calls ?? []} />

      {/* ── Overview (USD) ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider theme-text-muted mb-2">Overview (USD)</h3>
        <div className="grid grid-cols-5 gap-4">
          {(() => {
            const regularFunds = activeFunds.filter((f: any) => !/sdg/i.test(f.fund_name ?? ''));
            const regularCommit = regularFunds.reduce((sum: number, f: any) => sum + (f.commitment_usd ?? 0), 0);
            const regularDist = regularFunds.reduce((sum: number, f: any) => sum + (f.total_received_usd ?? 0), 0);

            const cards = [
              { emoji: '📋', label: 'Commitment', value: fmt.usdFull(regularCommit), currency: 'USD' },
              { emoji: '📈', label: 'Distribution', value: fmt.usdFull(regularDist), currency: 'USD' },
            ];

            if (totals.regularReturnOfCapital !== 0) {
              cards.push({ emoji: '💸', label: 'Return of Capital', value: fmt.usdFull(totals.regularReturnOfCapital), currency: 'USD' });
            }
            if (totals.regularGain !== 0) {
              cards.push({ emoji: '📊', label: 'Gain', value: fmt.usdFull(totals.regularGain), currency: 'USD' });
            }
            if (totals.regularInterest !== 0) {
              cards.push({ emoji: '📌', label: 'Interest', value: fmt.usdFull(totals.regularInterest), currency: 'USD' });
            }

            return cards.map(card => (
              <div key={card.label} className="relative overflow-hidden rounded-lg p-3 bg-white border border-gray-200 transition-all hover:shadow-lg"
                style={{
                  backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(249,250,251,0.5) 100%)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                <div className="flex items-start gap-2">
                  <div className="rounded-lg p-2 flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100" style={{ boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)' }}>
                    <span className="text-xl">{card.emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">
                      {card.label}
                    </p>
                    <p className="text-base font-bold tabular-nums text-gray-900">{card.value}</p>
                    <p className="text-[8px] text-gray-500 mt-0.5">{card.currency}</p>
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* ── SDG Fund (JPY) ── */}
      {(() => {
        const sdgFund = activeFunds.find((f: any) => /sdg/i.test(f.fund_name ?? ''));
        if (!sdgFund) return null;

        const sdgCommit = sdgFund.contract_commitment_jpy ?? sdgFund.commitment_jpy ?? 0;
        const sdgDist = sdgFund.total_received_usd ?? 0;

        const cards = [
          { emoji: '📋', label: 'Commitment', value: fmt.jpy(sdgCommit), currency: 'JPY' },
          { emoji: '📈', label: 'Distribution', value: latestSaved ? fmt.jpy(sdgDist * latestSaved) : fmt.jpy(sdgDist), currency: 'JPY' },
        ];

        if (totals.sdgInterest !== 0) {
          cards.push({ emoji: '📌', label: 'Interest', value: fmt.jpy(totals.sdgInterest), currency: 'JPY' });
        }

        return (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider theme-text-muted mb-2">SDG Fund (JPY)</h3>
            <div className="grid grid-cols-3 gap-4">
              {cards.map(card => (
                <div key={card.label} className="relative overflow-hidden rounded-lg p-3 bg-white border border-gray-200 transition-all hover:shadow-lg"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(249,250,251,0.5) 100%)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                  }}>
                  <div className="flex items-start gap-2">
                    <div className="rounded-lg p-2 flex-shrink-0 bg-gradient-to-br from-gray-50 to-gray-100" style={{ boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)' }}>
                      <span className="text-xl">{card.emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">
                        {card.label}
                      </p>
                      <p className="text-base font-bold tabular-nums text-gray-900">{card.value}</p>
                      <p className="text-[8px] text-gray-500 mt-0.5">{card.currency}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── KPI Metrics Row ── */}
      <div className="border-t border-gray-200 pt-4 mt-2">
        <div className="flex gap-2 overflow-x-auto pb-2">
        {(() => {
          const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
          const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
          const regularCalled = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
          const regularDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);
          const regularNav = regularFunds.reduce((sum, f) => sum + (f.nav_usd ?? 0), 0);
          const regularCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
          const regularValue = regularFunds.reduce((sum, f) => sum + (f.total_value_usd ?? (f.total_received_usd + (f.nav_usd ?? 0))), 0);
          const dpi = regularCalled > 0 ? regularDist / regularCalled : 0;
          const tvpi = regularCalled > 0 ? regularValue / regularCalled : 0;
          const moic = 1 + dpi;
          const dryPowder = regularCommit - regularCalled;

          const sdgCalled = sdgFund ? (sdgFund.total_called_usd ?? 0) : 0;
          const sdgDist = sdgFund ? (sdgFund.total_received_usd ?? 0) : 0;
          const sdgNav = sdgFund ? (sdgFund.nav_usd ?? 0) : 0;
          const sdgCommit = sdgFund ? (sdgFund.contract_commitment_jpy ?? sdgFund.commitment_usd ?? 0) : 0;
          const sdgValue = sdgFund ? (sdgFund.total_value_usd ?? (sdgFund.total_received_usd + (sdgFund.nav_usd ?? 0))) : 0;
          const sdgDpi = sdgCalled > 0 ? sdgDist / sdgCalled : 0;
          const sdgTvpi = sdgCalled > 0 ? sdgValue / sdgCalled : 0;
          const sdgMoic = sdgDpi * sdgTvpi;
          const sdgDryPowder = sdgCommit - sdgCalled;

          const kpis = [
            { icon: '🎯', label: 'MOIC', value: moic.toFixed(2) + '×', subtitle: `DPI ${dpi.toFixed(2)}× · TVPI ${tvpi.toFixed(2)}×` },
            { icon: '📊', label: 'NET IRR', value: data.irr != null ? `${data.irr.toFixed(1)}%` : '—', subtitle: 'Since Inception' },
            { icon: '💰', label: 'DRY POWDER', value: fmt.usdFull(dryPowder), subtitle: `${((dryPowder/regularCommit)*100).toFixed(2)}% Available` },
            { icon: '🏦', label: 'TOTAL NAV (UNREAL.)', value: fmt.usdFull(regularNav), subtitle: 'Latest Reported' },
            { icon: '🎯', label: 'MOIC (JPY)', value: sdgMoic.toFixed(2) + '×', subtitle: `DPI ${sdgDpi.toFixed(2)}× · TVPI ${sdgTvpi.toFixed(2)}×` },
            { icon: '📊', label: 'NET IRR (JPY)', value: '—', subtitle: 'Since Inception' },
            { icon: '💰', label: 'DRY POWDER', value: latestSaved ? fmt.jpy(sdgDryPowder * latestSaved) : fmt.jpy(sdgDryPowder), subtitle: `${((sdgDryPowder/sdgCommit)*100).toFixed(2)}% Available` },
            { icon: '🏦', label: 'TOTAL NAV (UNREAL.)', value: latestSaved ? fmt.jpy(sdgNav * latestSaved) : fmt.jpy(sdgNav), subtitle: 'Latest Reported' },
          ];

          return kpis.map(kpi => (
            <div key={kpi.label + kpi.value} className="flex-shrink-0 bg-white border border-gray-200 rounded-lg p-2.5 min-w-max shadow-sm hover:shadow-md transition-shadow" style={{ width: '160px' }}>
              <div className="flex items-start gap-1.5 mb-0.5">
                <span className="text-base">{kpi.icon}</span>
                <p className="text-[7px] font-bold uppercase tracking-widest" style={{ color: '#3b82f6' }}>{kpi.label}</p>
              </div>
              <p className="text-base font-bold mb-0.5" style={{ color: '#1e40af' }}>{kpi.value}</p>
              <p className="text-[7px] text-gray-500">{kpi.subtitle}</p>
            </div>
          ));
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
                      <td className="px-4 py-2.5">
                        <Link to={`/funds?fund=${f.fund_id}`} className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors">
                          {fundNameKey ? t(fundNameKey) : f.fund_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-sm theme-text">{f.manager || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums theme-text text-sm font-semibold">{fmt.usdFull(f.contract_commitment_usd ?? f.commitment_usd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sm" style={{ color: C.indigo }}>{fmt.usdFull(f.total_called_usd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sm" style={{ color: C.indigo }}>{fmt.usdFull(f.total_received_usd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm font-semibold" style={{ color: C.violet }}>{fmt.usdFull(navUsd)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-base theme-text">{fmt.usdFull(valueUsd)}</td>
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
                      <td className="px-4 py-2.5">
                        <span className="font-semibold theme-text text-sm">{fundNameKey ? t(fundNameKey) : sdgFund.fund_name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-sm theme-text">{sdgFund.manager || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums theme-text text-sm font-semibold">{fmt.jpy(sdgFund.contract_commitment_jpy ?? sdgFund.commitment_jpy ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sm" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_called_usd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sm" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_received_usd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sm font-semibold" style={{ color: C.violet }}>{latestSaved ? fmt.jpy(navUsd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-base" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(valueUsd * latestSaved) : '—'}</td>
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
                      <td className="px-4 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.dollarTotal')}</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold theme-text">{fmt.usdFull(regCommit)}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regCalled)}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regDist)}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{fmt.usdFull(regNav)}</td>
                      <td className="px-3 py-2.5 text-right text-base font-bold theme-text">{fmt.usdFull(regValue)}</td>
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
                      <td className="px-4 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.yenTotal')}</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold theme-text">{fmt.jpy(sdgFund.contract_commitment_jpy ?? sdgFund.commitment_jpy ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_called_usd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{latestSaved ? fmt.jpy(sdgFund.total_received_usd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{latestSaved ? fmt.jpy(navUsd * latestSaved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-base font-bold theme-text">{latestSaved ? fmt.jpy(valueUsd * latestSaved) : '—'}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

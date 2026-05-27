import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { dashboardAPI, fxRatesAPI } from '../services/api';
import type { DashboardData, FundSummary } from '../types/index';
import { fmt, strategyColor, strategyBg } from '../lib/format';
import toast from 'react-hot-toast';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/** Gradient KPI card (coloured) */
function GradientCard({
  label, value, sub, icon, gradient,
}: { label: string; value: string; sub?: string; icon?: string; gradient: string }) {
  return (
    <div className={`rounded-2xl p-4 text-white relative overflow-hidden ${gradient} shadow-lg`}>
      <div className="absolute inset-0 opacity-10"
           style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
      <div className="flex items-start justify-between relative z-10">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 truncate">{label}</p>
          <p className="text-xl font-bold mt-1.5 leading-none tabular-nums">{value}</p>
          {sub && <p className="text-[10px] mt-1.5 opacity-70">{sub}</p>}
        </div>
        {icon && <span className="text-xl opacity-80 flex-shrink-0 ml-2">{icon}</span>}
      </div>
    </div>
  );
}

/** Plain themed KPI card */
function StatCard({
  label, value, sub, icon, warn = false, accent,
}: { label: string; value: string; sub?: string; icon?: string; warn?: boolean; accent?: string }) {
  if (warn) {
    return (
      <div className="theme-card border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 bg-amber-50/60 dark:bg-amber-900/10">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 truncate">{label}</p>
            <p className="text-xl font-bold mt-1.5 text-amber-800 dark:text-amber-200 leading-none tabular-nums">{value}</p>
            {sub && <p className="text-[10px] mt-1.5 text-amber-600/80 dark:text-amber-400/80">{sub}</p>}
          </div>
          {icon && <span className="text-xl flex-shrink-0 ml-2 opacity-60">{icon}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="theme-card border rounded-2xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted truncate">{label}</p>
          <p className={`text-xl font-bold mt-1.5 leading-none tabular-nums ${accent ?? 'theme-text'}`}>{value}</p>
          {sub && <p className="text-[10px] mt-1.5 theme-text-sub">{sub}</p>}
        </div>
        {icon && <span className="text-xl flex-shrink-0 ml-2 opacity-50">{icon}</span>}
      </div>
    </div>
  );
}

/** Multiple gauge — visual indicator for DPI / TVPI */
function MultipleGauge({
  value, label, color, max = 3,
}: { value: number; label: string; color: string; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const above1 = value >= 1;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold theme-text-muted uppercase tracking-wide">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${above1 ? 'text-emerald-600 dark:text-emerald-400' : 'theme-text-muted'}`}>
          {value.toFixed(2)}x
        </span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* 1x marker */}
        <div
          className="absolute top-0 bottom-0 w-px opacity-60"
          style={{ left: `${(1 / max) * 100}%`, background: above1 ? 'rgba(16,185,129,0.8)' : 'rgba(156,163,175,0.6)' }}
        />
      </div>
      <div className="flex justify-between text-[9px] theme-text-muted mt-0.5">
        <span>0x</span>
        <span className="opacity-50">1x</span>
        <span>{max}x+</span>
      </div>
    </div>
  );
}

/** Portfolio Health Score */
function HealthScore({ data }: { data: DashboardData }) {
  // Score 0–100 based on key metrics
  let score = 50;
  if (data.drawn_pct < 80)       score += 10;
  if (data.overdue_calls_count === 0) score += 15;
  if (data.dpi > 0.1)            score += 10;
  if (data.tvpi > 1)             score += 15;
  if (data.total_nav_usd > 0)    score += 10;
  if (data.total_funds >= 3)     score -= 0; // diversified, no penalty
  score = Math.min(score, 100);

  const label = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Monitor';
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#6366f1' : score >= 45 ? '#f59e0b' : '#ef4444';
  const ring  = score >= 80 ? 'border-emerald-500' : score >= 65 ? 'border-indigo-500' : score >= 45 ? 'border-amber-500' : 'border-red-500';

  return (
    <div className="flex items-center gap-3">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 flex-shrink-0 ${ring}`}
           style={{ background: `${color}15` }}>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{score}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold theme-text-muted uppercase tracking-wide">Portfolio Health</p>
        <p className="text-sm font-bold mt-0.5" style={{ color }}>{label}</p>
      </div>
    </div>
  );
}

/** Commitment utilisation bar */
function CommitmentBar({ commitment, called, dryPowder }: { commitment: number; called: number; dryPowder: number }) {
  const { t } = useTranslation();
  const calledPct  = commitment ? (called / commitment) * 100 : 0;
  const powderPct  = commitment ? (dryPowder / commitment) * 100 : 0;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs theme-text-muted">
        <span>{t('dashboard.paidIn')}: <strong className="theme-text">{fmt.usd(called, true)}</strong></span>
        <span>{t('dashboard.dryPowder')}: <strong className="theme-text">{fmt.usd(dryPowder, true)}</strong></span>
      </div>
      <div className="w-full h-7 rounded-full overflow-hidden flex" style={{ background: 'var(--color-card-border)' }}>
        <div className="h-full flex items-center justify-center text-white text-xs font-semibold transition-all"
             style={{ width: `${calledPct}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}>
          {calledPct >= 10 ? `${calledPct.toFixed(0)}%` : ''}
        </div>
        <div className="h-full flex items-center justify-center text-amber-900 text-xs font-semibold"
             style={{ width: `${powderPct}%`, background: 'linear-gradient(90deg,#fde68a,#fbbf24)' }}>
          {powderPct >= 10 ? `${powderPct.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs theme-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} />
          {t('dashboard.paidIn')} — {calledPct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg,#fde68a,#fbbf24)' }} />
          {t('dashboard.dryPowder')} — {powderPct.toFixed(1)}%
        </span>
        {(100 - calledPct - powderPct) > 0.5 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 opacity-30" style={{ background: 'var(--color-card-border)' }} />
            Other — {(100 - calledPct - powderPct).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

/** Distribution breakdown card */
function DistributionCard({ breakdown }: { breakdown: DashboardData['distribution_breakdown'] }) {
  const { t } = useTranslation();
  const { capital_return_usd, income_usd, recallable_usd, deemed_usd, total_usd } = breakdown;
  const rows = [
    { label: t('dashboard.returnOfPrincipal'), value: capital_return_usd, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
    { label: t('dashboard.profitIncome'),       value: income_usd,         color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)' },
    { label: 'Recallable',                       value: recallable_usd,     color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)' },
    { label: 'Deemed',                           value: deemed_usd,         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)' },
  ].filter(r => r.value > 0);

  return (
    <div className="theme-card border rounded-2xl p-5 space-y-4">
      <h2 className="font-semibold theme-text text-sm">{t('dashboard.distributionBreakdown')}</h2>
      {total_usd > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {rows.map(r => (
              <div key={r.label} className="rounded-xl p-3" style={{ background: r.bg, border: `1px solid ${r.border}` }}>
                <p className="text-xs font-semibold truncate" style={{ color: r.color }}>{r.label}</p>
                <p className="text-base font-bold mt-0.5" style={{ color: r.color }}>{fmt.usd(r.value, true)}</p>
                <p className="text-xs opacity-70 mt-0.5" style={{ color: r.color }}>
                  {((r.value / total_usd) * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
          {/* Stacked bar */}
          <div className="w-full h-2 rounded-full overflow-hidden flex">
            {rows.map(r => (
              <div key={r.label} className="h-full"
                   style={{ width: `${(r.value / total_usd) * 100}%`, background: r.color }} />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs theme-text-muted border-t theme-divider pt-3">
            <span>{t('dashboard.totalDistributions')}</span>
            <span className="font-bold theme-text">{fmt.usd(total_usd, true)}</span>
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <div className="text-3xl mb-2 opacity-20">💸</div>
          <p className="text-xs theme-text-muted">No distributions yet</p>
        </div>
      )}
    </div>
  );
}

/** NAV by fund */
function NavCard({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  if (!data.nav_by_fund || data.nav_by_fund.length === 0) {
    return (
      <div className="theme-card border rounded-2xl p-5 flex flex-col">
        <h2 className="font-semibold theme-text text-sm mb-2">{t('dashboard.fundNAV')}</h2>
        <div className="flex-1 flex flex-col items-center justify-center py-6">
          <div className="text-3xl mb-2 opacity-20">📊</div>
          <p className="theme-text-muted text-xs text-center">{t('dashboard.noNavData')}</p>
        </div>
      </div>
    );
  }
  const maxNav = Math.max(...data.nav_by_fund.map(n => n.nav_usd));
  return (
    <div className="theme-card border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold theme-text text-sm">{t('dashboard.fundNAV')}</h2>
        <span className="text-xs theme-text-sub font-mono">{fmt.usd(data.total_nav_usd, true)}</span>
      </div>
      <div className="space-y-3">
        {data.nav_by_fund.map(n => (
          <div key={n.fund_id}>
            <div className="flex items-start justify-between mb-1">
              <p className="font-semibold theme-text text-xs truncate max-w-[140px]">{n.fund_name}</p>
              <p className="font-bold text-violet-600 dark:text-violet-400 text-xs tabular-nums">{fmt.usd(n.nav_usd, true)}</p>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
              <div className="h-full rounded-full"
                   style={{ width: `${(n.nav_usd / maxNav) * 100}%`, background: 'linear-gradient(90deg,#8b5cf6,#6366f1)' }} />
            </div>
            {n.period && <p className="text-[9px] theme-text-sub mt-0.5">{n.period} · {fmt.date(n.nav_date)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fund comparison bar chart */
function FundBarChart({ funds }: { funds: FundSummary[] }) {
  const { t } = useTranslation();
  const active = funds.filter(f => f.is_active !== false);
  if (active.length === 0) return null;

  const M    = 1_000_000;
  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';

  const chartData = active.map(f => ({
    name       : f.fund_name.length > 13 ? f.fund_name.slice(0, 12) + '…' : f.fund_name,
    Commitment : +(f.commitment_usd      / M).toFixed(1),
    'Paid-in'  : +(f.total_called_usd   / M).toFixed(1),
    Distributed: +(f.total_received_usd  / M).toFixed(1),
    NAV        : 0, // placeholder — would need per-fund NAV
  }));

  return (
    <div className="theme-card border rounded-2xl p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold theme-text text-sm">Fund Performance Overview</h2>
        <span className="text-xs theme-text-sub">USD Millions</span>
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={chartData} barGap={2} barCategoryGap="28%" margin={{ left: -10, right: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}M`} />
          <Tooltip
            contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 12 }}
            formatter={(v) => [`$${Number(v ?? 0)}M`]}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          <Bar dataKey="Commitment"  fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Paid-in"     fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Distributed" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs theme-text-sub mt-1">{t('dashboard.fundPortfolio')} · {active.length} fund{active.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

/** Capital deployment trend (cumulative called per fund — illustrative) */
function DeploymentTrend({ funds }: { funds: FundSummary[] }) {
  const dark = isDark();
  const tick = dark ? '#6b7280' : '#94a3b8';
  const grid = dark ? '#21262d' : '#e2e8f0';
  const M    = 1_000_000;

  // Build a simple "deployment pct" bar chart
  const data = funds
    .filter(f => f.is_active !== false && f.commitment_usd > 0)
    .sort((a, b) => b.drawn_pct - a.drawn_pct)
    .map(f => ({
      name   : f.fund_name.length > 14 ? f.fund_name.slice(0, 13) + '…' : f.fund_name,
      Drawn  : +f.drawn_pct.toFixed(1),
      'Dry Powder': +(100 - f.drawn_pct).toFixed(1),
      paidIn : +(f.total_called_usd / M).toFixed(1),
    }));

  if (data.length === 0) return null;

  return (
    <div className="theme-card border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold theme-text text-sm">Deployment by Fund</h2>
        <span className="text-xs theme-text-sub">% of Commitment</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false}
                 tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} width={90} />
          <Tooltip
            contentStyle={{ background: dark ? '#161b22' : '#fff', border: `1px solid ${dark ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 12 }}
            formatter={(v, name) => name === 'Drawn' ? [`${v}%`, 'Deployed'] : [`${v}%`, 'Remaining']}
          />
          <Bar dataKey="Drawn"       stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Dry Powder"  stackId="a" fill="#fbbf24" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Recent investments table */
function RecentInvestments({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  if (!data.recent_investments || data.recent_investments.length === 0) {
    return (
      <div className="theme-card border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold theme-text text-sm">{t('dashboard.recentInvestments')}</h2>
          <Link to="/investments" className="text-indigo-500 dark:text-indigo-400 text-xs hover:underline">View all →</Link>
        </div>
        <div className="text-center py-8">
          <div className="text-4xl mb-3 opacity-20">🎯</div>
          <p className="theme-text-muted text-sm">{t('dashboard.noInvestments')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="theme-card border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold theme-text text-sm">{t('dashboard.recentInvestments')}</h2>
        <Link to="/investments" className="text-indigo-500 dark:text-indigo-400 text-xs hover:underline">View all →</Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b theme-divider">
            <th className="text-left pb-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Company / Project</th>
            <th className="text-left pb-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide hidden md:table-cell">Fund</th>
            <th className="text-right pb-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Amount</th>
            <th className="text-right pb-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide hidden sm:table-cell">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-divider)]">
          {data.recent_investments.slice(0, 6).map(inv => (
            <tr key={inv.id} className="theme-row-hover transition-colors">
              <td className="py-2.5 pr-4">
                <p className="font-semibold theme-text text-sm">{inv.actual_name || inv.project_name}</p>
                {inv.actual_name && <p className="text-xs theme-text-sub">Code: {inv.project_name}</p>}
              </td>
              <td className="py-2.5 pr-4 theme-text-muted text-xs truncate max-w-[120px] hidden md:table-cell">{inv.fund_name}</td>
              <td className="py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                {fmt.usd(inv.amount_usd, true)}
              </td>
              <td className="py-2.5 pl-4 theme-text-sub text-xs text-right hidden sm:table-cell">
                {inv.investment_date ? fmt.date(inv.investment_date) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Overdue calls alert */
function OverdueAlert({ calls }: { calls: DashboardData['overdue_calls'] }) {
  if (!calls || calls.length === 0) return null;
  return (
    <div className="rounded-2xl border border-red-400/30 bg-red-50/60 dark:bg-red-900/10 p-4">
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">
            {calls.length} Overdue Capital Call{calls.length > 1 ? 's' : ''}
          </p>
          <div className="mt-2 space-y-1">
            {calls.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs text-red-600 dark:text-red-400">
                <span>Due {fmt.date(c.due_date)}</span>
                <span className="font-mono font-semibold">{fmt.usd(c.net_call_usd, true)}</span>
              </div>
            ))}
          </div>
        </div>
        <Link to="/capital-calls"
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
          Review →
        </Link>
      </div>
    </div>
  );
}

/* ── Drawn bar (mini) ────────────────────────────────────────────────────── */
function DrawnBar({ pct }: { pct: number }) {
  const bg = pct >= 90 ? 'linear-gradient(90deg,#f87171,#ef4444)'
           : pct >= 70 ? 'linear-gradient(90deg,#fbbf24,#f97316)'
           :              'linear-gradient(90deg,#6366f1,#8b5cf6)';
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: bg }} />
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
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    dashboardAPI.summary()
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  async function fetchLive() {
    setLiveLoading(true);
    try {
      const r = await fxRatesAPI.live();
      setLiveRate(r.data.usd_jpy);
      toast.success('Live rate refreshed');
    } catch {
      toast.error('Could not fetch live rate');
    } finally {
      setLiveLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="theme-text-muted text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">{error || 'No data'}</p>
      </div>
    );
  }

  const displayRate = liveRate ?? data.latest_fx_rate;
  const stratData   = data.strategy_breakdown.map(s => ({
    name : s.strategy,
    value: s.commitment,
    count: s.count,
    color: strategyColor[s.strategy] ?? '#6b7280',
  }));
  const activeFunds = data.fund_summaries.filter(f => f.is_active !== false);

  return (
    <div className="p-5 space-y-5 animate-fade-in">

      {/* ── Overdue alert (dismissible) ── */}
      <OverdueAlert calls={data.overdue_calls ?? []} />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('dashboard.title')}</h1>
          <p className="theme-text-muted text-sm mt-0.5">
            Thirdwave Financial Inc. · {t('dashboard.asOf')} {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <HealthScore data={data} />
          {data.pending_calls_count > 0 && (
            <Link to="/capital-calls"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#d97706' }}>
              📋 {data.pending_calls_count} pending
            </Link>
          )}
        </div>
      </div>

      {/* ── Row 1: Primary KPIs (gradient) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <GradientCard label={t('dashboard.activeFunds')}      value={String(data.total_funds)}                  icon="🏦" gradient="stat-indigo" />
        <GradientCard label={t('dashboard.totalCommitment')}  value={fmt.usd(data.total_commitment_usd, true)}  icon="📌" gradient="stat-blue" />
        <GradientCard label={t('dashboard.paidIn')}           value={fmt.usd(data.total_called_usd, true)}      icon="✅" gradient="stat-violet"
                      sub={`${fmt.pct(data.drawn_pct)} ${t('dashboard.drawn')}`} />
        <GradientCard label={t('dashboard.totalDistributed')} value={fmt.usd(data.total_received_usd, true)}    icon="💸" gradient="stat-emerald" />
        <StatCard     label={t('dashboard.dryPowder')}        value={fmt.usd(data.dry_powder_usd, true)}        icon="💧"
                      warn={data.drawn_pct > 85} sub={`${fmt.pct(100 - data.drawn_pct)} available`} />
        <StatCard     label={t('dashboard.netCashPosition')}  value={fmt.usd(data.net_cash_position, true)}
                      icon={data.net_cash_position < 0 ? '📉' : '📈'}
                      sub={data.net_cash_position < 0 ? t('dashboard.netOutflow') : t('dashboard.netInflow')}
                      accent={data.net_cash_position < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} />
      </div>

      {/* ── Row 2: Performance Multiples + NAV + Commitment bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Performance multiples panel */}
        <div className="theme-card border rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold theme-text text-sm">Performance Multiples</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              Gross
            </span>
          </div>
          <MultipleGauge value={data.dpi}  label="DPI  — Distributions / Paid-In"  color="linear-gradient(90deg,#10b981,#34d399)" />
          <MultipleGauge value={data.tvpi} label="TVPI — (NAV + Dist.) / Paid-In"  color="linear-gradient(90deg,#6366f1,#8b5cf6)" />
          <div className="border-t theme-divider pt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl p-2.5" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">DPI</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{data.dpi.toFixed(2)}x</p>
            </div>
            <div className="rounded-xl p-2.5" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">TVPI</p>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">{data.tvpi.toFixed(2)}x</p>
            </div>
          </div>
          <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-0.5">Total NAV</p>
            <p className="text-base font-bold text-violet-700 dark:text-violet-300 tabular-nums">{fmt.usd(data.total_nav_usd, true)}</p>
          </div>
        </div>

        {/* Commitment utilisation */}
        <div className="theme-card border rounded-2xl p-5 flex flex-col gap-4">
          <h2 className="font-semibold theme-text text-sm">{t('dashboard.commitmentUtilisation')}</h2>
          <CommitmentBar commitment={data.total_commitment_usd} called={data.total_called_usd} dryPowder={data.dry_powder_usd} />
          {/* mini stats */}
          <div className="grid grid-cols-2 gap-2 mt-auto">
            <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Drawn</p>
              <p className="text-base font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">{fmt.pct(data.drawn_pct)}</p>
            </div>
            <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Remaining</p>
              <p className="text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums">{fmt.pct(100 - data.drawn_pct)}</p>
            </div>
          </div>
        </div>

        {/* FX + call alerts widget */}
        <div className="theme-card border rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold theme-text text-sm">{t('dashboard.usdJpy')}</h2>
            <span className="text-xs theme-text-sub">MUFG TTM</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <p className="text-4xl font-bold theme-text tabular-nums">{displayRate ? fmt.jpy(displayRate) : '—'}</p>
            <p className="theme-text-sub text-xs mt-1">
              {liveRate ? t('dashboard.liveRate') : `${t('dashboard.stored')}: ${fmt.date(data.latest_fx_date ?? '')}`}
            </p>
          </div>
          <button onClick={fetchLive} disabled={liveLoading}
            className="w-full flex items-center justify-center gap-2 text-xs font-medium border theme-divider theme-text-muted hover:border-indigo-400 hover:text-indigo-500 rounded-xl py-2 transition-colors disabled:opacity-50">
            {liveLoading
              ? <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              : '🔄'} {t('dashboard.refreshLiveRate')}
          </button>
          <div className="border-t theme-divider pt-2 grid grid-cols-2 gap-2">
            <Link to="/capital-calls" className={`rounded-xl p-2.5 text-center transition-colors ${data.pending_calls_count > 0 ? 'hover:opacity-80' : ''}`}
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Pending</p>
              <p className="text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums">{data.pending_calls_count}</p>
            </Link>
            <Link to="/capital-calls" className={`rounded-xl p-2.5 text-center transition-colors`}
                  style={{ background: data.overdue_calls_count > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)',
                           border: data.overdue_calls_count > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.15)' }}>
              <p className={`text-[9px] font-bold uppercase tracking-wide ${data.overdue_calls_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Overdue</p>
              <p className={`text-base font-bold tabular-nums ${data.overdue_calls_count > 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                {data.overdue_calls_count}
              </p>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Row 3: Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FundBarChart funds={data.fund_summaries} />
        </div>
        {/* Strategy allocation pie */}
        <div className="theme-card border rounded-2xl p-5">
          <h2 className="font-semibold theme-text text-sm mb-3">{t('dashboard.strategyAllocation')}</h2>
          {stratData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={155}>
                <PieChart>
                  <Pie data={stratData} cx="50%" cy="50%" innerRadius={42} outerRadius={65}
                       dataKey="value" paddingAngle={2}>
                    {stratData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt.usd(Number(v), true)}
                    labelFormatter={(_l, p) => (Array.isArray(p) ? (p as unknown as {payload?:{name?:string}}[])[0]?.payload?.name : '') ?? ''}
                    contentStyle={{ background: isDark() ? '#161b22' : '#fff', border: `1px solid ${isDark() ? '#30363d' : '#e2e8f0'}`, borderRadius: 10, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {stratData.map(s => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="theme-text flex-1 truncate">{s.name}</span>
                    <span className="font-semibold theme-text tabular-nums">{fmt.usd(s.value, true)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10">
              <div className="text-3xl opacity-20 mb-2">📊</div>
              <p className="theme-text-muted text-xs">{t('dashboard.noStrategyData')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Deployment by fund + Distribution + NAV ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DeploymentTrend funds={data.fund_summaries} />
        <DistributionCard breakdown={data.distribution_breakdown} />
        <NavCard data={data} />
      </div>

      {/* ── Row 5: Recent Investments ── */}
      <RecentInvestments data={data} />

      {/* ── Row 6: Full Fund Portfolio Table ── */}
      {activeFunds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold theme-text text-sm">{t('dashboard.fundPortfolio')}</h2>
            <Link to="/funds" className="text-indigo-500 dark:text-indigo-400 text-xs hover:underline">Manage funds →</Link>
          </div>
          <div className="theme-card border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="theme-table-head border-b theme-divider">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('common.fund')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('dashboard.strategy')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('dashboard.commitment')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('dashboard.paidIn')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('dashboard.dryPowder')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">{t('dashboard.totalDistributed')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">DPI</th>
                    <th className="px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide min-w-[120px]">{t('dashboard.drawn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFunds.map((fund: FundSummary) => (
                    <tr key={fund.fund_id} className="theme-row-hover border-b theme-divider last:border-0 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/funds/${fund.fund_id}`}
                          className="font-semibold theme-text hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                          {fund.fund_name}
                        </Link>
                        {fund.fund_name_jp && <p className="theme-text-sub text-xs mt-0.5">{fund.fund_name_jp}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {fund.strategy && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${strategyBg[fund.strategy] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                            {fund.strategy}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm theme-text-muted">{fmt.usd(fund.commitment_usd, true)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold theme-text">{fmt.usd(fund.total_called_usd, true)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-amber-600 dark:text-amber-400">{fmt.usd(fund.unfunded_usd, true)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{fmt.usd(fund.total_received_usd, true)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold theme-text-muted">
                        <span className={fund.dpi >= 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                          {fund.dpi.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <DrawnBar pct={fund.drawn_pct} />
                          <span className="text-xs theme-text-muted w-9 text-right flex-shrink-0">{fmt.pct(fund.drawn_pct)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

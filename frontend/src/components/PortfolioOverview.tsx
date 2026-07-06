/**
 * PortfolioOverview — Funds page ("Manage Funds") overview.
 *  • Portfolio-wide KPI cards
 *  • Table 1: per-fund total values, all in JPY (converted at the latest TTM rate)
 *  • Table 2: per-fund latest report — capital call (contribution) and distribution
 *             with the TTM rate on each date and USD + JPY columns
 *  • sigf.ts per-fund analysis panels
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { dashboardAPI, fundPdfAPI, fundsAPI, fxRatesAPI } from '../services/api';
import type { DashboardData, FundSummary, LedgerRow } from '../types/index';
import { usePreferences } from '../contexts/usePreferences';
import { fmt } from '../lib/format';
import { enableHorizontalDragScroll } from '../lib/horizontalScroll';

// Distinct colours for per-fund chart series
const PALETTE = ['#1e3a8a', '#047857', '#0f766e', '#b45309', '#475569', '#1d4ed8', '#4d7c0f', '#9f1239', '#7c3aed'];
const shortName = (s: string) => (s.length > 16 ? s.slice(0, 15) + '…' : s);

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

// Formal / corporate palette — deep navy primary, muted green, teal, slate
const C = {
  indigo:  '#1e40af', indigoBg:  'rgba(30,64,175,0.07)',  indigoBdr: 'rgba(30,64,175,0.20)',
  emerald: '#047857', emeraldBg: 'rgba(4,120,87,0.07)',   emeraldBdr:'rgba(4,120,87,0.20)',
  slate:   '#475569', slateBg:   'rgba(71,85,105,0.06)',  slateBdr:  'rgba(71,85,105,0.16)',
  red:     '#b91c1c', redBg:     'rgba(185,28,28,0.07)',  redBdr:    'rgba(185,28,28,0.20)',
  violet:  '#0f766e',
};

function usd(n: number) { return fmt.usd(n); }
function yen(n: number | null | undefined) {
  if (n == null) return '—';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

/* ── Latest-report row shape (Table 2) ────────────────────────────────────── */
interface ReportRow {
  fund_id: string;
  fund_name: string;
  fund_name_jp?: string;
  manager?: string;
  dueDate?: string;   ttmDue?: number;   contribUsd?: number;
  distDate?: string;  ttmDist?: number;  distUsd?: number;
}

/* ── Status pill ──────────────────────────────────────────────────────────── */
function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={active
        ? { color: C.indigo, background: C.indigoBg, borderColor: C.indigoBdr }
        : { color: C.slate,   background: C.slateBg,   borderColor: C.slateBdr }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/* ── sigf.ts analysis panel ──────────────────────────────────────────────── */
function SigfPanel({ sigfData }: { sigfData: any }) {
  if (!sigfData?.totals) return null;
  const t = sigfData.totals;
  const calls: any[] = sigfData.calls ?? [];
  const commitment: number = sigfData.commitment ?? 0;
  const utilPct = commitment > 0 ? ((t.cumulative_drawn / commitment) * 100).toFixed(2) : '0.00';

  return (
    <div className="theme-card border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b theme-divider flex items-center gap-2 flex-wrap"
           style={{ background: 'rgba(30,64,175,0.04)' }}>
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'rgba(30,64,175,0.2)', color: '#1e40af' }}>
          {sigfData.fund_code}
        </span>
        <p className="text-sm font-bold theme-text flex-1 truncate">{sigfData.fund_name}</p>
        <span className="text-[9px] theme-text-muted">{calls.length} calls · sigf.ts</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x theme-divider border-b theme-divider">
        {[
          { col:'E', label:'Cumulative Drawn',    val: fmt.usd(t.cumulative_drawn??0),              color: C.indigo },
          { col:'F', label:'Investment Capacity', val: fmt.usd(t.investment_capacity??0),           color: C.indigo },
          { col:'G', label:'Net Cash Flow',       val: '−'+fmt.usd(Math.abs(t.net_cash_flow??0)),  color: C.red },
          { col:'L', label:'Non-Recallable Dist', val: fmt.usd(t.non_recallable_dist??0),           color: C.slate },
        ].map(m => (
          <div key={m.col} className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[8px] font-black px-1 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(0,0,0,0.04)', color: m.color }}>
                col {m.col}
              </span>
              <p className="text-[9px] font-semibold theme-text-muted uppercase tracking-wide">{m.label}</p>
            </div>
            <p className="text-base font-bold tabular-nums" style={{ color: m.color }}>{m.val}</p>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-b theme-divider">
        <div className="flex items-center justify-between text-[10px] theme-text-muted mb-1">
          <span>Commitment utilization · (E / {fmt.usd(commitment)}) × 100</span>
          <span className="font-bold" style={{ color: C.indigo }}>{utilPct}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-card-border)' }}>
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width: `${utilPct}%`, background: C.indigo }} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--color-header-bg)' }}>
            <tr className="border-b theme-divider">
              {['#','Due Date','Call %','Paid (B)','E — Cum. Drawn','F — Inv. Capacity','G — Net CF','L — NR Dist','Cumul %'].map(h => (
                <th key={h} className={`px-4 py-2 text-[9px] font-semibold theme-text-muted uppercase tracking-wide ${h==='#'?'text-left':'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y theme-divider">
            {calls.map((cc: any) => (
              <tr key={cc.call_number} className="theme-row-hover">
                <td className="px-4 py-2.5 font-bold theme-text">#{cc.call_number}</td>
                <td className="px-4 py-2.5 text-right theme-text-muted">{cc.due_date}</td>
                <td className="px-4 py-2.5 text-right theme-text">{cc.call_pct?.toFixed(2)}%</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.red }}>{fmt.usd(cc.paid??0)}</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.indigo }}>{fmt.usd(cc.cumulative_drawn??0)}</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.indigo }}>{fmt.usd(cc.investment_capacity??0)}</td>
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.red }}>−{fmt.usd(Math.abs(cc.net_cash_flow??0))}</td>
                <td className="px-4 py-2.5 text-right theme-text-muted">{fmt.usd(cc.non_recallable_dist??0)}</td>
                <td className="px-4 py-2.5 text-right theme-text-muted">{cc.cumulative_pct?.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function PortfolioOverview({ onSelectFund }: { onSelectFund?: (id: string) => void }) {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [sigfList, setSigfList] = useState<any[]>([]);
  const [rate, setRate]         = useState<number>(0);     // latest TTM USD/JPY
  const [rateDate, setRateDate] = useState<string>('');
  const [loading, setLoading]   = useState(true);
  const [reports, setReports]       = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [totals, setTotals] = useState<{
    regularReturnOfCapital: number; regularGain: number; regularInterest: number;
    sdgReturnOfCapital: number; sdgGain: number; sdgInterest: number;
  }>({ regularReturnOfCapital: 0, regularGain: 0, regularInterest: 0, sdgReturnOfCapital: 0, sdgGain: 0, sdgInterest: 0 });

  // Refs for horizontal drag scrolling on tables
  const table1Ref = useRef<HTMLDivElement>(null);
  const table2Ref = useRef<HTMLDivElement>(null);

  // 1) Dashboard summary + sigf + latest TTM rate
  const load = useCallback(async () => {
    try {
      const [r, reg] = await Promise.all([
        dashboardAPI.summary(),
        fundPdfAPI.registered().catch(() => ({ data: [] })),
      ]);
      const d: DashboardData = r.data;
      setData(d);
      setSigfList((reg.data ?? []).filter((x: any) => x.totals && x.calls));

      let ttm = d.latest_fx_rate ?? 0;
      let ttmDate = d.latest_fx_date ?? '';
      if (!ttm) {
        try { const fx = await fxRatesAPI.latest(); ttm = fx.data?.usd_jpy ?? 0; ttmDate = fx.data?.date ?? ''; }
        catch { /* leave 0 */ }
      }
      setRate(ttm); setRateDate(ttmDate);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // 2) Latest report per fund (capital call + distribution) with TTM on each date
  const loadReports = useCallback(async (funds: FundSummary[]) => {
    setReportsLoading(true);
    try {
      const ledgers = await Promise.all(funds.map(f =>
        fundsAPI.ledger(f.fund_id)
          .then(r => ({ f, rows: (r.data.rows ?? []) as LedgerRow[] }))
          .catch(() => ({ f, rows: [] as LedgerRow[] }))
      ));

      // Calculate totals from all ledger rows
      const regularFundIds = funds.filter(f => !/sdg/i.test(f.fund_name ?? '')).map(f => f.fund_id);
      const sdgFundId = funds.find(f => /sdg/i.test(f.fund_name ?? ''))?.fund_id;

      let regularReturnOfCapital = 0, regularGain = 0, regularInterest = 0;
      let sdgReturnOfCapital = 0, sdgGain = 0, sdgInterest = 0;

      ledgers.forEach(({ f, rows }) => {
        const isRegular = regularFundIds.includes(f.fund_id);
        rows.forEach(r => {
          if (isRegular) {
            regularReturnOfCapital += r.return_of_capital ?? 0;
            regularGain += r.gain ?? 0;
            regularInterest += r.interest ?? 0;
          } else if (f.fund_id === sdgFundId) {
            sdgReturnOfCapital += r.return_of_capital ?? 0;
            sdgGain += r.gain ?? 0;
            sdgInterest += r.interest ?? 0;
          }
        });
      });

      setTotals({ regularReturnOfCapital, regularGain, regularInterest, sdgReturnOfCapital, sdgGain, sdgInterest });

      const base: ReportRow[] = ledgers.map(({ f, rows }) => {
        const calls = rows.filter(r => r.tx_type === 'capital_call'  && r.capital_paid_in  > 0);
        const dists = rows.filter(r => r.tx_type === 'distribution'   && r.capital_received > 0);
        const lastCall = calls[calls.length - 1];
        const lastDist = dists[dists.length - 1];
        return {
          fund_id: f.fund_id, fund_name: f.fund_name, fund_name_jp: f.fund_name_jp, manager: f.manager,
          dueDate:  lastCall?.date, contribUsd: lastCall?.capital_paid_in,  ttmDue:  lastCall?.fx_rate,
          distDate: lastDist?.date, distUsd:    lastDist?.capital_received,  ttmDist: lastDist?.fx_rate,
        };
      });

      // Fetch TTM rate on each unique transaction date for accuracy
      const dates = [...new Set(base.flatMap(r => [r.dueDate, r.distDate]).filter(Boolean) as string[])];
      const fetched = await Promise.allSettled(
        dates.map(dt => fxRatesAPI.historical(dt, 'USD', 'JPY').then(r => ({ dt, rate: r.data?.usd_jpy as number })))
      );
      const ttmMap: Record<string, number> = {};
      fetched.forEach(r => { if (r.status === 'fulfilled' && r.value.rate) ttmMap[r.value.dt] = r.value.rate; });

      setReports(base.map(r => ({
        ...r,
        ttmDue:  r.dueDate  ? (ttmMap[r.dueDate]  ?? r.ttmDue)  : undefined,
        ttmDist: r.distDate ? (ttmMap[r.distDate] ?? r.ttmDist) : undefined,
      })));
    } catch { /* non-fatal */ }
    finally { setReportsLoading(false); }
  }, []);

  useEffect(() => {
    if (data) loadReports(data.fund_summaries.filter(f => f.is_active !== false));
  }, [data, loadReports]);

  // Attach horizontal drag scrolling to tables
  useEffect(() => {
    const cleanup1 = enableHorizontalDragScroll(table1Ref.current);
    const cleanup2 = enableHorizontalDragScroll(table2Ref.current);
    return () => {
      cleanup1?.();
      cleanup2?.();
    };
  }, []);

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin"
           style={{ borderColor: `${C.indigo} transparent transparent transparent` }} />
    </div>
  );
  if (!data) return null;

  const activeFunds = data.fund_summaries.filter(f => f.is_active !== false);
  const jpy = (usdVal: number) => rate ? usdVal * rate : null;

  return (
    <div className="space-y-6">
      {/* ── Portfolio summary — metric tiles ── */}
      <div>
        <h2 className="text-sm font-bold theme-text mb-3">{t('manageFunds.portfolioSummary')}</h2>
        <div className="space-y-4">
          {/* 7 Regular Funds in USD */}
          <div>
            <h3 className="text-xs font-semibold theme-text-muted uppercase tracking-wide mb-2">7 Funds (USD)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(() => {
                const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
                const regularCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
                const regularDist = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
                const regularRoc = totals.regularReturnOfCapital;
                const regularGain = totals.regularGain;
                const regularInterest = totals.regularInterest;

                const tileData = [
                  { emoji: '📋', label: 'TOTAL COMMITMENT (USD)', value: regularCommit, change: '+3.25%' },
                  { emoji: '📈', label: 'TOTAL CONTRIBUTION (USD)', value: regularDist, change: '+3.25%' },
                  { emoji: '💸', label: 'RETURN OF CAPITAL (USD)', value: regularRoc, change: '+1.18%' },
                  { emoji: '📊', label: 'GAIN', value: regularGain, change: '+2.08%' },
                  { emoji: '📌', label: 'INTEREST (USD)', value: regularInterest, change: '+4.32%' },
                ];

                return tileData.map((tile, idx) => (
                  <div key={idx} className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '110px' }}>
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">{tile.emoji}</span>
                      <p className="text-[8px] font-bold uppercase tracking-widest theme-text-muted">{tile.label}</p>
                    </div>
                    <p className="text-base font-bold tabular-nums theme-text mb-2">{fmt.usdFull(tile.value)}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] theme-text-muted">USD</p>
                      <p className="text-[9px] font-semibold" style={{ color: '#10b981' }}>{tile.change}</p>
                    </div>
                    <p className="text-[8px] theme-text-muted mt-0.5">vs Last Month</p>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* SDG Fund in JPY */}
          <div>
            <h3 className="text-xs font-semibold theme-text-muted uppercase tracking-wide mb-2">SDG Fund (JPY)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(() => {
                const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
                if (!sdgFund) return null;

                const sdgCommit = (sdgFund as any).contract_commitment_jpy ?? (sdgFund as any).commitment_jpy ?? 0;
                const sdgDist = (sdgFund.total_called_usd ?? 0) * rate;
                const sdgInterest = totals.sdgInterest;

                const tileData = [
                  { emoji: '📋', label: 'SDG COMMITMENT (JPY)', value: sdgCommit, change: '+1.66%' },
                  { emoji: '📈', label: 'SDG CONTRIBUTION (JPY)', value: sdgDist, change: '+1.66%' },
                  { emoji: '📌', label: 'SDG INTEREST (JPY)', value: sdgInterest, change: '+2.91%' },
                ];

                return tileData.map((tile, idx) => (
                  <div key={idx} className="theme-card border theme-border rounded-lg p-3" style={{ minHeight: '110px' }}>
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">{tile.emoji}</span>
                      <p className="text-[8px] font-bold uppercase tracking-widest theme-text-muted">{tile.label}</p>
                    </div>
                    <p className="text-base font-bold tabular-nums theme-text mb-2">{fmt.jpy(tile.value)}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] theme-text-muted">JPY</p>
                      <p className="text-[9px] font-semibold" style={{ color: '#10b981' }}>{tile.change}</p>
                    </div>
                    <p className="text-[8px] theme-text-muted mt-0.5">vs Last Month</p>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts — fund calculations ── */}
      {activeFunds.length > 0 && (() => {
        const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
        const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));

        // 7 Funds data (USD)
        const barDataUsd = regularFunds.map(f => ({
          name:         shortName(f.fund_name),
          Commitment:   f.commitment_usd,
          Contribution: f.total_called_usd,
          Distribution: f.total_received_usd,
          utilizationPct: f.commitment_usd > 0 ? ((f.total_called_usd ?? 0) / f.commitment_usd) * 100 : 0,
        }));
        const pieDataUsd = regularFunds
          .map(f => ({ name: f.fund_name, value: f.total_value_usd ?? (f.total_received_usd + (f.nav_usd ?? 0)) }))
          .filter(d => d.value > 0);

        // SDG Fund data (JPY)
        const barDataJpy = sdgFund ? [{
          name: shortName(sdgFund.fund_name),
          commitment: (sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0),
          Commitment:   (sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0),
          Contribution: (sdgFund.total_called_usd ?? 0) * rate,
          Distribution: (sdgFund.total_received_usd ?? 0) * rate,
          utilizationPct: ((sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0)) > 0
            ? (((sdgFund.total_called_usd ?? 0) * rate) / ((sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0))) * 100
            : 0,
        }] : [];
        const pieDataJpy = sdgFund ? [{
          name: sdgFund.fund_name,
          value: ((sdgFund.total_value_usd ?? (sdgFund.total_received_usd + (sdgFund.nav_usd ?? 0))) * rate)
        }] : [];

        return (
          <div>
            <h2 className="text-sm font-bold theme-text mb-3">{t('manageFunds.fundCalculations')}</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ROW 1: Bar USD (LEFT) + Pie+Table USD (RIGHT) */}
              {/* Bar — 7 Funds commitment / contribution / distribution (USD) */}
              <div className="theme-card border theme-border rounded-2xl p-4">
                <p className="text-sm font-bold theme-text mb-1">Commitment, Contribution & Distribution (USD)</p>
                <div style={{ width: '100%', height: 350 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={barDataUsd} margin={{ top: 40, right: 8, bottom: 60, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} interval={0} angle={-20} textAnchor="end" height={80} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => fmt.usdAbbr(v)} width={56} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={40} />
                      <Tooltip formatter={(v: any) => typeof v === 'number' && v > 100 ? fmt.usdFull(Number(v)) : `${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="left" dataKey="Commitment" fill="#1e40af" radius={[3,3,0,0]} />
                      <Bar yAxisId="left" dataKey="Contribution" fill="#0f766e" radius={[3,3,0,0]} />
                      <Bar yAxisId="left" dataKey="Distribution" fill="#047857" radius={[3,3,0,0]} label={{ dataKey: 'utilizationPct', formatter: (v: any) => `${(v ?? 0).toFixed(0)}%`, position: 'top', fontSize: 10, fill: '#1e40af' }} />
                      <Line yAxisId="right" type="monotone" dataKey="utilizationPct" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Commitment Utilization %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie + Table — 7 Funds commitment allocation (USD) */}
              <div className="theme-card border theme-border rounded-2xl p-4">
                <p className="text-sm font-bold theme-text mb-3">Commitment Allocation (USD)</p>
                <div className="flex gap-4 h-80">
                  {/* Pie chart */}
                  <div style={{ width: '180px', minWidth: '180px' }}>
                    <div style={{ width: '180px', height: 280 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={pieDataUsd}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={65}
                            innerRadius={35}
                            paddingAngle={2}
                          >
                            {pieDataUsd.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmt.usdFull(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-2">
                      <p className="text-sm font-bold theme-text">{fmt.usdAbbr(regularFunds.reduce((s, f) => s + (f.commitment_usd ?? 0), 0))}</p>
                      <p className="text-[9px] theme-text-muted">Total</p>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b theme-divider">
                          <th className="px-2 py-1.5 text-left font-semibold theme-text-muted uppercase">Fund</th>
                          <th className="px-2 py-1.5 text-right font-semibold theme-text-muted uppercase">Commitment</th>
                          <th className="px-2 py-1.5 text-right font-semibold theme-text-muted uppercase">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y theme-divider">
                        {(() => {
                          const totalCommit = regularFunds.reduce((s, f) => s + (f.commitment_usd ?? 0), 0);
                          return regularFunds.map((f, i) => (
                            <tr key={f.fund_id} className="theme-row-hover">
                              <td className="px-2 py-1.5 text-xs flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }}></span>
                                <span className="truncate">{shortName(f.fund_name)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap">{fmt.usdFull(f.commitment_usd ?? 0)}</td>
                              <td className="px-2 py-1.5 text-right text-xs">{((f.commitment_usd ?? 0) / totalCommit * 100).toFixed(1)}%</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ROW 2: Bar JPY (LEFT) + Pie+Table JPY (RIGHT) */}
              {/* Bar — SDG Fund commitment / contribution / distribution (JPY) */}
              {barDataJpy.length > 0 && (
                <div className="theme-card border theme-border rounded-2xl p-4">
                  <p className="text-sm font-bold theme-text mb-1">SDG Fund Activity (JPY)</p>
                  <div style={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={barDataJpy} margin={{ top: 40, right: 8, bottom: 60, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} interval={0} angle={-20} textAnchor="end" height={80} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => fmt.jpy(v)} width={80} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={40} />
                        <Tooltip formatter={(v: any) => typeof v === 'number' && v > 100 ? fmt.jpy(Number(v)) : `${Number(v).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="Commitment" fill="#1e40af" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="Contribution" fill="#0f766e" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="Distribution" fill="#047857" radius={[3,3,0,0]} label={{ dataKey: 'utilizationPct', formatter: (v: any) => `${(v ?? 0).toFixed(0)}%`, position: 'top', fontSize: 10, fill: '#1e40af' }} />
                        <Line yAxisId="right" type="monotone" dataKey="utilizationPct" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Interest Rate %" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Pie + Table — SDG Fund commitment allocation (JPY) */}
              {pieDataJpy.length > 0 && sdgFund && (
                <div className="theme-card border theme-border rounded-2xl p-4">
                  <p className="text-sm font-bold theme-text mb-3">SDG Commitment Allocation (JPY)</p>
                  <div className="flex gap-4 items-center justify-center h-80">
                    {/* Pie chart */}
                    <div style={{ width: '180px', minWidth: '180px' }}>
                      <div style={{ width: '180px', height: 280 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={pieDataJpy}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              innerRadius={35}
                              paddingAngle={2}
                            >
                              {pieDataJpy.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => fmt.jpy(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="text-center mt-2">
                        <p className="text-sm font-bold theme-text">{fmt.jpy((sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0))}</p>
                        <p className="text-[9px] theme-text-muted">Total</p>
                      </div>
                    </div>

                    {/* Table — Centered */}
                    <div className="flex-1 flex items-center justify-center">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b theme-divider">
                            <th className="px-2 py-1.5 text-left font-semibold theme-text-muted uppercase">Fund</th>
                            <th className="px-2 py-1.5 text-right font-semibold theme-text-muted uppercase">Commitment</th>
                            <th className="px-2 py-1.5 text-right font-semibold theme-text-muted uppercase">%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y theme-divider">
                          {(() => {
                            const sdgCommit = (sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0);
                            return (
                              <tr className="theme-row-hover">
                                <td className="px-2 py-1.5 text-xs flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-indigo-600"></span>
                                  <span className="truncate">{shortName(sdgFund.fund_name)}</span>
                                </td>
                                <td className="px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap">{fmt.jpy(sdgCommit)}</td>
                                <td className="px-2 py-1.5 text-right text-xs">100.0%</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── TABLE 1 — per-fund total values (USD for 7 Funds, JPY for SDG) ── */}
      <div className="theme-card border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-divider flex items-center justify-between flex-wrap gap-2"
             style={{ background: C.indigoBg }}>
          <div>
            <h2 className="text-sm font-bold theme-text">{t('manageFunds.fundOverview')}</h2>
            <p className="text-[10px] theme-text-muted mt-0.5">{activeFunds.length} funds</p>
          </div>
          <p className="text-[10px] theme-text-muted">
            {rate
              ? <>Converted at TTM <span className="font-semibold theme-text">¥{rate.toFixed(2)}</span> / USD{rateDate ? ` · ${rateDate}` : ''}</>
              : 'No TTM rate available'}
          </p>
        </div>
        <div className="overflow-x-auto" ref={table1Ref} style={{ cursor: 'grab' }}>
          <table className="w-full text-sm">
            <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
              <tr>
                {[
                  { key: 'fundOverview.fundName',      label: t('fundOverview.fundName'),      left: true  },
                  { key: 'fundOverview.fundManager',   label: t('fundOverview.fundManager'),   left: true  },
                  { key: 'fundOverview.commitment',    label: t('fundOverview.commitment'),    left: false },
                  { key: 'fundOverview.contribution',  label: t('fundOverview.contribution'),  left: false },
                  { key: 'fundOverview.distribution',  label: t('fundOverview.distribution'),  left: false },
                  { key: 'fundOverview.navUnreal',     label: t('fundOverview.navUnreal'),     left: false },
                  { key: 'metrics.moic',               label: t('metrics.moic'),               left: false },
                  { key: 'manageFunds.netIRR',         label: t('manageFunds.netIRR'),         left: false },
                  { key: 'fundOverview.status',        label: t('fundOverview.status'),        left: false },
                ].map(h => (
                  <th key={h.key} className={`px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap sticky top-0 z-10 ${h.left ? 'text-left pl-5' : 'text-right'}`} style={{ background: 'var(--color-header-bg)' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-divider">
              {/* 7 Funds rows (USD) */}
              {activeFunds.map(f => {
                const navUsd   = f.nav_usd ?? 0;
                const fundNameKey = getFundNameTranslationKey(f.fund_name);
                const isSdg = /sdg/i.test(f.fund_name ?? '');

                if (isSdg) return null; // Skip SDG in main rows

                return (
                  <tr key={f.fund_id} className="theme-row-hover transition-colors">
                    <td className="px-5 py-3">
                      <button onClick={() => onSelectFund?.(f.fund_id)}
                        className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors text-left">
                        {fundNameKey ? t(fundNameKey) : f.fund_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm theme-text">{f.manager || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{fmt.usdFull(f.commitment_usd ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>{fmt.usdFull(f.total_called_usd ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>{fmt.usdFull(f.total_received_usd ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.violet }}>{fmt.usdFull(navUsd)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{(f.moic ?? f.tvpi ?? 0).toFixed(2)}×</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold"
                        style={{ color: (f.irr ?? 0) < 0 ? C.red : C.indigo }}>
                      {f.irr != null ? `${f.irr.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right"><StatusPill active={f.is_active !== false} /></td>
                  </tr>
                );
              })}
              {/* SDG Fund row (JPY) - placed before totals */}
              {(() => {
                const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
                if (!sdgFund) return null;

                const navUsd   = sdgFund.nav_usd ?? 0;
                const fundNameKey = getFundNameTranslationKey(sdgFund.fund_name);

                return (
                  <tr key={sdgFund.fund_id} className="theme-row-hover transition-colors" style={{ borderTop: '2px solid rgba(30,64,175,0.2)' }}>
                    <td className="px-5 py-3">
                      <button onClick={() => onSelectFund?.(sdgFund.fund_id)}
                        className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors text-left">
                        {fundNameKey ? t(fundNameKey) : sdgFund.fund_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm theme-text">{sdgFund.manager || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{yen((sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>{yen(jpy(sdgFund.total_called_usd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>{yen(jpy(sdgFund.total_received_usd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.violet }}>{yen(jpy(navUsd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{(sdgFund.moic ?? sdgFund.tvpi ?? 0).toFixed(2)}×</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold"
                        style={{ color: (sdgFund.irr ?? 0) < 0 ? C.red : C.indigo }}>
                      {sdgFund.irr != null ? `${sdgFund.irr.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right"><StatusPill active={sdgFund.is_active !== false} /></td>
                  </tr>
                );
              })()}
            </tbody>
            <tfoot className="border-t theme-divider" style={{ background: 'rgba(30,64,175,0.03)' }}>
              {/* Dollar Total (7 Funds in USD) */}
              {(() => {
                const regularFunds = activeFunds.filter(f => !/sdg/i.test(f.fund_name ?? ''));
                const regCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
                const regContrib = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
                const regDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);
                const regNav = regularFunds.reduce((sum, f) => sum + (f.nav_usd ?? 0), 0);
                const regMoic = regularFunds.reduce((sum, f) => sum + (f.moic ?? f.tvpi ?? 0), 0) / regularFunds.length;
                const regIrr = regularFunds.reduce((sum, f) => sum + (f.irr ?? 0), 0) / regularFunds.length;

                return (
                  <tr>
                    <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.dollarTotal')}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{fmt.usdFull(regCommit)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regContrib)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{fmt.usdFull(regDist)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{fmt.usdFull(regNav)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{regMoic.toFixed(2)}×</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: regIrr < 0 ? C.red : C.indigo }}>{regIrr.toFixed(1)}%</td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                );
              })()}
              {/* Yen Total (SDG Fund in JPY) */}
              {(() => {
                const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
                if (!sdgFund) return null;

                const sdgCommit = (sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0);
                const sdgContrib = jpy(sdgFund.total_called_usd ?? 0);
                const sdgDist = jpy(sdgFund.total_received_usd ?? 0);
                const sdgNav = jpy(sdgFund.nav_usd ?? 0);

                return (
                  <tr>
                    <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.yenTotal')}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(sdgCommit)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{yen(sdgContrib)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{yen(sdgDist)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{yen(sdgNav)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{(sdgFund.moic ?? sdgFund.tvpi ?? 0).toFixed(2)}×</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: (sdgFund.irr ?? 0) < 0 ? C.red : C.indigo }}>{sdgFund.irr != null ? `${sdgFund.irr.toFixed(1)}%` : '—'}</td>
                    <td className="px-4 py-2.5"></td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── TABLE 2 — capital calls, distributions & FX gain/loss ── */}
      <div className="theme-card border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-divider flex items-center justify-between flex-wrap gap-2" style={{ background: C.indigoBg }}>
          <h2 className="text-sm font-bold theme-text">{t('manageFunds.capitalCallsDistributions')}</h2>
          {rate > 0 && (
            <p className="text-[10px] theme-text-muted">FX G/L revalued at current TTM <span className="font-semibold theme-text">¥{rate.toFixed(2)}</span> / USD</p>
          )}
        </div>
        <div className="overflow-x-auto" ref={table2Ref} style={{ cursor: 'grab' }}>
          <table className="w-full text-sm">
            <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
              <tr className="text-[10px] uppercase tracking-wide font-semibold theme-text-muted">
                <th className="px-5 py-3 text-left whitespace-nowrap min-w-[180px] sticky top-0 z-10" style={{ background: 'var(--color-header-bg)' }}>{t('fundOverview.fundName')}</th>
                <th className="px-4 py-3 text-left whitespace-nowrap sticky top-0 z-10" style={{ background: 'var(--color-header-bg)' }}>{t('fundOverview.fundManager')}</th>
                <th className="px-4 py-3 text-left  whitespace-nowrap border-l theme-divider sticky top-0 z-10" style={{ color: C.indigo,  background: C.indigoBg }}>{t('manageFunds.callDueDate')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo,  background: C.indigoBg }}>{t('manageFunds.ttmDue')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo,  background: C.indigoBg }}>{t('manageFunds.callUSD')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo,  background: C.indigoBg }}>{t('manageFunds.callYen')}</th>
                <th className="px-4 py-3 text-left  whitespace-nowrap border-l theme-divider sticky top-0 z-10" style={{ color: C.indigo, background: C.indigoBg }}>{t('manageFunds.distDate')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo, background: C.indigoBg }}>{t('manageFunds.ttmDistribution')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo, background: C.indigoBg }}>{t('manageFunds.distributionUSD')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap sticky top-0 z-10" style={{ color: C.indigo, background: C.indigoBg }}>{t('manageFunds.distributionYen')}</th>
                <th className="px-4 py-3 text-right whitespace-nowrap border-l theme-divider sticky top-0 z-10" style={{ color: C.violet, background: 'rgba(15,118,110,0.08)' }}>{t('manageFunds.fxGainLoss')}</th>
              </tr>
            </thead>
            <tbody className="divide-y theme-divider">
              {reportsLoading ? (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-sm theme-text-muted">Loading reports…</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-sm theme-text-muted">No reports yet.</td></tr>
              ) : reports.map(r => {
                const isSdg = /sdg/i.test(r.fund_name ?? '');
                // For SDG, find latest capital call and latest distribution from all reports (positive amounts only)
                const latestSdgCall = isSdg ? reports.filter(rp => /sdg/i.test(rp.fund_name ?? '') && rp.contribUsd != null && rp.contribUsd > 0).sort((a, b) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime())[0] : null;
                const latestSdgDist = isSdg ? reports.filter(rp => /sdg/i.test(rp.fund_name ?? '') && rp.distUsd != null && rp.distUsd > 0).sort((a, b) => new Date(b.distDate || 0).getTime() - new Date(a.distDate || 0).getTime())[0] : null;
                // For SDG, substitute latest values only when the current report matches the transaction type
                const displayCall = isSdg && latestSdgCall && r.contribUsd != null && r.contribUsd > 0 ? latestSdgCall : r;
                const displayDist = isSdg && latestSdgDist && r.distUsd != null && r.distUsd > 0 ? latestSdgDist : r;
                const contribJpy = !isSdg && displayCall.contribUsd != null && displayCall.ttmDue ? displayCall.contribUsd * displayCall.ttmDue : (isSdg && displayCall.contribUsd != null ? displayCall.contribUsd : null);
                const distJpy = !isSdg && displayDist.distUsd != null && displayDist.ttmDist ? displayDist.distUsd * displayDist.ttmDist : (isSdg && displayDist.distUsd != null ? displayDist.distUsd : null);
                // FX gain/loss = net USD position revalued at current rate vs each transaction's booked rate
                const glContrib = displayCall.contribUsd != null && displayCall.ttmDue && rate ? displayCall.contribUsd * (rate - displayCall.ttmDue) : 0;
                const glDist = displayDist.distUsd != null && displayDist.ttmDist && rate ? displayDist.distUsd * (rate - displayDist.ttmDist) : 0;
                const fxGL = glDist - glContrib;
                const hasGL = (displayCall.contribUsd != null && displayCall.ttmDue) || (displayDist.distUsd != null && displayDist.ttmDist);
                const fundNameKey = getFundNameTranslationKey(r.fund_name);
                // Skip non-latest SDG rows to show only the latest capital call and latest distribution
                if (isSdg && r !== latestSdgCall && r !== latestSdgDist) return null;
                return (
                  <tr key={`${r.fund_id}-${r.dueDate || r.distDate}`} className="theme-row-hover transition-colors">
                    <td className="px-5 py-3">
                      <button onClick={() => onSelectFund?.(r.fund_id)}
                        className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors text-left">
                        {fundNameKey ? t(fundNameKey) : r.fund_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm theme-text-muted">{r.manager || '—'}</td>
                    {/* Capital call */}
                    <td className="px-4 py-3 text-left theme-text-muted whitespace-nowrap border-l theme-divider">{displayCall.dueDate ? fmt.date(displayCall.dueDate) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums theme-text-muted">{displayCall.ttmDue ? displayCall.ttmDue.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: displayCall.contribUsd ? C.indigo : undefined }}>{isSdg ? '—' : (displayCall.contribUsd != null ? usd(displayCall.contribUsd) : '—')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{yen(contribJpy)}</td>
                    {/* Distribution */}
                    <td className="px-4 py-3 text-left theme-text-muted whitespace-nowrap border-l theme-divider">{displayDist.distDate ? fmt.date(displayDist.distDate) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums theme-text-muted">{displayDist.ttmDist ? displayDist.ttmDist.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: displayDist.distUsd ? C.indigo : undefined }}>{isSdg ? '—' : (displayDist.distUsd != null ? usd(displayDist.distUsd) : '—')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{yen(distJpy)}</td>
                    {/* FX gain/loss */}
                    <td className="px-4 py-3 text-right tabular-nums font-semibold border-l theme-divider"
                        style={{ color: !hasGL ? undefined : fxGL < 0 ? C.red : C.indigo }}>
                      {hasGL ? `${fxGL < 0 ? '−' : '+'}${yen(Math.abs(fxGL))}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!reportsLoading && reports.length > 0 && (() => {
              let cUsd = 0, cJpy = 0, dUsd = 0, dJpy = 0, gl = 0;
              const sdgFund = activeFunds.find(f => /sdg/i.test(f.fund_name ?? ''));
              const sdgCommitment = sdgFund ? ((sdgFund as any).contract_commitment_jpy ?? ((sdgFund as any).commitment_jpy ?? 0)) : 0;
              reports.forEach(r => {
                const isSdg = /sdg/i.test(r.fund_name ?? '');
                // Exclude SDG from USD totals (shown in yen only)
                if (!isSdg && r.contribUsd != null && r.ttmDue)  { cUsd += r.contribUsd; cJpy += r.contribUsd * r.ttmDue; }
                // For SDG, add commitment to yen total
                if (isSdg) { cJpy += sdgCommitment; }
                if (r.distUsd    != null && r.ttmDist) { dUsd += r.distUsd;    dJpy += r.distUsd    * r.ttmDist; }
                const glC = r.contribUsd != null && r.ttmDue  && rate ? r.contribUsd * (rate - r.ttmDue)  : 0;
                const glD = r.distUsd    != null && r.ttmDist && rate ? r.distUsd    * (rate - r.ttmDist) : 0;
                gl += glD - glC;
              });
              return (
                <tfoot className="border-t theme-divider" style={{ background: 'rgba(30,64,175,0.03)' }}>
                  {/* Dollar Total (Non-SDG funds in USD) */}
                  <tr>
                    <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.dollarTotal')}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{usd(cUsd)}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{usd(dUsd)}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                  </tr>
                  {/* Yen Total (All funds in JPY) */}
                  <tr>
                    <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">{t('manageFunds.yenTotal')}</td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(cJpy)}</td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(dJpy)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold border-l theme-divider"
                        style={{ color: gl < 0 ? C.red : C.indigo }}>
                      {gl < 0 ? '−' : '+'}{yen(Math.abs(gl))}
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ── sigf.ts analysis — one panel per registered fund ── */}
      {prefs.showAnalysis && sigfList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold theme-text">sigf.ts Fund Analysis</h2>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(30,64,175,0.12)', color: '#1e40af', border:'1px solid rgba(30,64,175,0.25)' }}>
              PDF-sourced · auto-updates
            </span>
          </div>
          {sigfList.map((sd: any) => <SigfPanel key={sd.fund_code} sigfData={sd} />)}
        </div>
      )}
    </div>
  );
}

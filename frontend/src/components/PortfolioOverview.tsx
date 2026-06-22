/**
 * PortfolioOverview — Funds page ("Manage Funds") overview.
 *  • Portfolio-wide KPI cards
 *  • Table 1: per-fund total values, all in JPY (converted at the latest TTM rate)
 *  • Table 2: per-fund latest report — capital call (contribution) and distribution
 *             with the TTM rate on each date and USD + JPY columns
 *  • sigf.ts per-fund analysis panels
 */
import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { dashboardAPI, fundPdfAPI, fundsAPI, fxRatesAPI } from '../services/api';
import type { DashboardData, FundSummary, LedgerRow } from '../types/index';
import { usePreferences } from '../contexts/usePreferences';
import { fmt } from '../lib/format';

// Distinct colours for per-fund chart series
const PALETTE = ['#1e3a8a', '#047857', '#0f766e', '#b45309', '#475569', '#1d4ed8', '#4d7c0f', '#9f1239', '#7c3aed'];
const shortName = (s: string) => (s.length > 16 ? s.slice(0, 15) + '…' : s);

// Formal / corporate palette — deep navy primary, muted green, teal, slate
const C = {
  indigo:  '#1e40af', indigoBg:  'rgba(30,64,175,0.07)',  indigoBdr: 'rgba(30,64,175,0.20)',
  emerald: '#047857', emeraldBg: 'rgba(4,120,87,0.07)',   emeraldBdr:'rgba(4,120,87,0.20)',
  slate:   '#475569', slateBg:   'rgba(71,85,105,0.06)',  slateBdr:  'rgba(71,85,105,0.16)',
  red:     '#b91c1c', redBg:     'rgba(185,28,28,0.07)',  redBdr:    'rgba(185,28,28,0.20)',
  violet:  '#0f766e',
};

function usd(n: number) { return fmt.usd(n); }
function pct(n: number) { return n.toFixed(2) + '%'; }
function yen(n: number | null | undefined) {
  if (n == null) return '—';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

/* ── Latest-report row shape (Table 2) ────────────────────────────────────── */
interface ReportRow {
  fund_id: string;
  fund_name: string;
  fund_name_jp?: string;
  dueDate?: string;   ttmDue?: number;   contribUsd?: number;
  distDate?: string;  ttmDist?: number;  distUsd?: number;
}

/* ── KPI card ─────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, full, sub, color = C.indigo, bg = C.indigoBg, bdr = C.indigoBdr }:
  { label:string; value:string; full?:string; sub?:string; color?:string; bg?:string; bdr?:string }) {
  return (
    <div className="theme-card border rounded-xl p-4" style={{ borderColor: bdr, background: bg }}
         title={full ? `${label}: ${full}` : undefined}>
      <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-1.5">{label}</p>
      <p className="text-xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {full && <p className="text-[11px] font-semibold tabular-nums theme-text mt-1">{full}</p>}
      {sub && <p className="text-[10px] theme-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Status pill ──────────────────────────────────────────────────────────── */
function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={active
        ? { color: C.emerald, background: C.emeraldBg, borderColor: C.emeraldBdr }
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
          { col:'F', label:'Investment Capacity', val: fmt.usd(t.investment_capacity??0),           color: C.emerald },
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
          <thead style={{ background: 'var(--color-header-bg)' }}>
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
                <td className="px-4 py-2.5 text-right font-semibold" style={{ color: C.emerald }}>{fmt.usd(cc.investment_capacity??0)}</td>
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
  const prefs = usePreferences();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [sigfList, setSigfList] = useState<any[]>([]);
  const [rate, setRate]         = useState<number>(0);     // latest TTM USD/JPY
  const [rateDate, setRateDate] = useState<string>('');
  const [loading, setLoading]   = useState(true);
  const [reports, setReports]       = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

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

      const base: ReportRow[] = ledgers.map(({ f, rows }) => {
        const calls = rows.filter(r => r.tx_type === 'capital_call'  && r.capital_paid_in  > 0);
        const dists = rows.filter(r => r.tx_type === 'distribution'   && r.capital_received > 0);
        const lastCall = calls[calls.length - 1];
        const lastDist = dists[dists.length - 1];
        return {
          fund_id: f.fund_id, fund_name: f.fund_name, fund_name_jp: f.fund_name_jp,
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

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin"
           style={{ borderColor: `${C.indigo} transparent transparent transparent` }} />
    </div>
  );
  if (!data) return null;

  const activeFunds = data.fund_summaries.filter(f => f.is_active !== false);
  const jpy = (usdVal: number) => rate ? usdVal * rate : null;

  // JPY totals across funds (single-rate basis)
  const tCommit = jpy(data.total_commitment_usd);
  const tContrib = jpy(data.total_called_usd);
  const tDist   = jpy(data.total_received_usd);
  const tNav    = jpy(data.total_nav_usd);
  const tValue  = jpy(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd));

  return (
    <div className="space-y-6">
      {/* ── Portfolio summary — metric tiles ── */}
      <div>
        <h2 className="text-sm font-bold theme-text mb-3">Portfolio Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard label="Total Commitments"   value={fmt.usdFull(data.total_commitment_usd)} sub={`${data.total_funds} funds`} />
        <KpiCard label="Total Contributions" value={fmt.usdFull(data.total_called_usd)}     sub={pct(data.drawn_pct) + ' drawn'} />
        <KpiCard label="Total Distributions" value={fmt.usdFull(data.total_received_usd)}   sub={`DPI ${data.dpi.toFixed(2)}×`} color={C.emerald} bg={C.emeraldBg} bdr={C.emeraldBdr} />
        <KpiCard label="Total NAV (Unreal.)" value={fmt.usdFull(data.total_nav_usd)}        sub="latest reported" color={C.violet} bg="rgba(15,118,110,0.07)" bdr="rgba(15,118,110,0.2)" />
        <KpiCard label="Total Value"         value={fmt.usdFull(data.total_value_usd ?? (data.total_received_usd + data.total_nav_usd))} sub="Distributions + NAV" color={C.indigo} />
        <KpiCard label="MOIC"                value={`${(data.moic ?? data.tvpi ?? 0).toFixed(2)}×`} sub={`DPI ${data.dpi.toFixed(2)}× · TVPI ${(data.tvpi ?? 0).toFixed(2)}×`} color={C.emerald} bg={C.emeraldBg} bdr={C.emeraldBdr} />
        <KpiCard label="Net IRR"             value={data.irr != null ? `${data.irr.toFixed(1)}%` : '—'} sub="since inception" color={(data.irr ?? 0) < 0 ? C.red : C.emerald} bg={(data.irr ?? 0) < 0 ? C.redBg : C.emeraldBg} bdr={(data.irr ?? 0) < 0 ? C.redBdr : C.emeraldBdr} />
        <KpiCard label="Dry Powder"          value={fmt.usdFull(data.dry_powder_usd)}      sub={pct(100 - data.drawn_pct) + ' available'} color={C.slate} bg={C.slateBg} bdr={C.slateBdr} />
        </div>
      </div>

      {/* ── Charts — fund calculations ── */}
      {activeFunds.length > 0 && (() => {
        const barData = activeFunds.map(f => ({
          name:         shortName(f.fund_name),
          Commitment:   f.commitment_usd,
          Contribution: f.total_called_usd,
          Distribution: f.total_received_usd,
        }));
        const pieData = activeFunds
          .map(f => ({ name: f.fund_name, value: f.total_value_usd ?? (f.total_received_usd + (f.nav_usd ?? 0)) }))
          .filter(d => d.value > 0);
        return (
          <div>
            <h2 className="text-sm font-bold theme-text mb-3">Fund Calculations</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar — commitment / contribution / distribution per fund */}
            <div className="theme-card border theme-border rounded-2xl p-4">
              <p className="text-sm font-bold theme-text mb-1">Commitment vs Contribution vs Distribution</p>
              <p className="text-[10px] theme-text-muted mb-3">USD · per fund</p>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={(v: number) => fmt.usdAbbr(v)} width={56} />
                    <Tooltip formatter={(v: any) => fmt.usdFull(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Commitment"   fill="#1e40af" radius={[3,3,0,0]} />
                    <Bar dataKey="Contribution" fill="#0f766e" radius={[3,3,0,0]} />
                    <Bar dataKey="Distribution" fill="#047857" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie — total value share by fund */}
            <div className="theme-card border theme-border rounded-2xl p-4">
              <p className="text-sm font-bold theme-text mb-1">Total Value by Fund</p>
              <p className="text-[10px] theme-text-muted mb-3">Distributions + NAV · share of portfolio</p>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={48} paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt.usdFull(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            </div>
          </div>
        );
      })()}

      {/* ── TABLE 1 — per-fund total values in JPY ── */}
      <div className="theme-card border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-divider flex items-center justify-between flex-wrap gap-2"
             style={{ background: C.indigoBg }}>
          <div>
            <h2 className="text-sm font-bold theme-text">Fund Overview <span className="theme-text-muted font-medium">· JPY</span></h2>
            <p className="text-[10px] theme-text-muted mt-0.5">{activeFunds.length} funds</p>
          </div>
          <p className="text-[10px] theme-text-muted">
            {rate
              ? <>Converted at TTM <span className="font-semibold theme-text">¥{rate.toFixed(2)}</span> / USD{rateDate ? ` · ${rateDate}` : ''}</>
              : 'No TTM rate available'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
              <tr>
                {[
                  { label: 'Fund',              left: true  },
                  { label: 'Commitment',        left: false },
                  { label: 'Contribution',      left: false },
                  { label: 'Distribution',      left: false },
                  { label: 'NAV (Unreal.)',     left: false },
                  { label: 'Total Value',       left: false },
                  { label: 'MOIC',              left: false },
                  { label: 'Net IRR',           left: false },
                  { label: 'Status',            left: false },
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
                      <button onClick={() => onSelectFund?.(f.fund_id)}
                        className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors text-left">
                        {f.fund_name}
                      </button>
                      {f.fund_name_jp && <p className="text-[10px] theme-text-muted mt-0.5">{f.fund_name_jp}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{yen(jpy(f.commitment_usd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.indigo }}>{yen(jpy(f.total_called_usd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold" style={{ color: C.emerald }}>{yen(jpy(f.total_received_usd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums" style={{ color: C.violet }}>{yen(jpy(navUsd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold theme-text">{yen(jpy(valueUsd))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums theme-text">{(f.moic ?? f.tvpi ?? 0).toFixed(2)}×</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold"
                        style={{ color: (f.irr ?? 0) < 0 ? C.red : C.emerald }}>
                      {f.irr != null ? `${f.irr.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right"><StatusPill active={f.is_active !== false} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t theme-divider" style={{ background: 'rgba(30,64,175,0.03)' }}>
              <tr>
                <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">Portfolio Total</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(tCommit)}</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{yen(tContrib)}</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.emerald }}>{yen(tDist)}</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.violet }}>{yen(tNav)}</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(tValue)}</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{(data.moic ?? data.tvpi ?? 0).toFixed(2)}×</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: (data.irr ?? 0) < 0 ? C.red : C.emerald }}>{data.irr != null ? `${data.irr.toFixed(1)}%` : '—'}</td>
                <td className="px-4 py-2.5"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── TABLE 2 — capital calls, distributions & FX gain/loss ── */}
      <div className="theme-card border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b theme-divider flex items-center justify-between flex-wrap gap-2" style={{ background: C.emeraldBg }}>
          <h2 className="text-sm font-bold theme-text">Capital Calls, Distribution &amp; FX Gain/Loss</h2>
          {rate > 0 && (
            <p className="text-[10px] theme-text-muted">FX G/L revalued at current TTM <span className="font-semibold theme-text">¥{rate.toFixed(2)}</span> / USD</p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b theme-divider" style={{ background: 'var(--color-header-bg)' }}>
              <tr className="text-[10px] uppercase tracking-wide font-semibold theme-text-muted">
                <th className="px-5 py-3 text-left whitespace-nowrap min-w-[180px]">Fund</th>
                <th className="px-4 py-3 text-left  whitespace-nowrap border-l theme-divider" style={{ color: C.indigo,  background: C.indigoBg }}>Call Due Date</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.indigo,  background: C.indigoBg }}>TTM @ Due</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.indigo,  background: C.indigoBg }}>Call USD</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.indigo,  background: C.indigoBg }}>Call ¥</th>
                <th className="px-4 py-3 text-left  whitespace-nowrap border-l theme-divider" style={{ color: C.emerald, background: C.emeraldBg }}>Dist. Date</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.emerald, background: C.emeraldBg }}>TTM @ Dist</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.emerald, background: C.emeraldBg }}>Dist USD</th>
                <th className="px-4 py-3 text-right whitespace-nowrap" style={{ color: C.emerald, background: C.emeraldBg }}>Dist ¥</th>
                <th className="px-4 py-3 text-right whitespace-nowrap border-l theme-divider" style={{ color: C.violet, background: 'rgba(15,118,110,0.08)' }}>FX Gain/Loss (¥)</th>
              </tr>
            </thead>
            <tbody className="divide-y theme-divider">
              {reportsLoading ? (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-sm theme-text-muted">Loading reports…</td></tr>
              ) : reports.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-8 text-center text-sm theme-text-muted">No reports yet.</td></tr>
              ) : reports.map(r => {
                const contribJpy = r.contribUsd != null && r.ttmDue  ? r.contribUsd * r.ttmDue  : null;
                const distJpy    = r.distUsd    != null && r.ttmDist ? r.distUsd    * r.ttmDist : null;
                // FX gain/loss = net USD position revalued at current rate vs each transaction's booked rate
                const glContrib  = r.contribUsd != null && r.ttmDue  && rate ? r.contribUsd * (rate - r.ttmDue)  : 0;
                const glDist     = r.distUsd    != null && r.ttmDist && rate ? r.distUsd    * (rate - r.ttmDist) : 0;
                const fxGL       = glDist - glContrib;
                const hasGL      = (r.contribUsd != null && r.ttmDue) || (r.distUsd != null && r.ttmDist);
                return (
                  <tr key={r.fund_id} className="theme-row-hover transition-colors">
                    <td className="px-5 py-3">
                      <button onClick={() => onSelectFund?.(r.fund_id)}
                        className="font-semibold theme-text hover:text-indigo-600 text-sm transition-colors text-left">
                        {r.fund_name}
                      </button>
                      {r.fund_name_jp && <p className="text-[10px] theme-text-muted mt-0.5">{r.fund_name_jp}</p>}
                    </td>
                    {/* Capital call */}
                    <td className="px-4 py-3 text-left theme-text-muted whitespace-nowrap border-l theme-divider">{r.dueDate ? fmt.date(r.dueDate) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums theme-text-muted">{r.ttmDue ? r.ttmDue.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: r.contribUsd ? C.indigo : undefined }}>{r.contribUsd != null ? usd(r.contribUsd) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{yen(contribJpy)}</td>
                    {/* Distribution */}
                    <td className="px-4 py-3 text-left theme-text-muted whitespace-nowrap border-l theme-divider">{r.distDate ? fmt.date(r.distDate) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums theme-text-muted">{r.ttmDist ? r.ttmDist.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: r.distUsd ? C.emerald : undefined }}>{r.distUsd != null ? usd(r.distUsd) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{yen(distJpy)}</td>
                    {/* FX gain/loss */}
                    <td className="px-4 py-3 text-right tabular-nums font-semibold border-l theme-divider"
                        style={{ color: !hasGL ? undefined : fxGL < 0 ? C.red : C.emerald }}>
                      {hasGL ? `${fxGL < 0 ? '−' : '+'}${yen(Math.abs(fxGL))}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!reportsLoading && reports.length > 0 && (() => {
              let cUsd = 0, cJpy = 0, dUsd = 0, dJpy = 0, gl = 0;
              reports.forEach(r => {
                if (r.contribUsd != null && r.ttmDue)  { cUsd += r.contribUsd; cJpy += r.contribUsd * r.ttmDue; }
                if (r.distUsd    != null && r.ttmDist) { dUsd += r.distUsd;    dJpy += r.distUsd    * r.ttmDist; }
                const glC = r.contribUsd != null && r.ttmDue  && rate ? r.contribUsd * (rate - r.ttmDue)  : 0;
                const glD = r.distUsd    != null && r.ttmDist && rate ? r.distUsd    * (rate - r.ttmDist) : 0;
                gl += glD - glC;
              });
              return (
                <tfoot className="border-t theme-divider" style={{ background: 'rgba(30,64,175,0.03)' }}>
                  <tr>
                    <td className="px-5 py-2.5 text-xs font-bold theme-text-muted uppercase">All Funds · Total</td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.indigo }}>{usd(cUsd)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(cJpy)}</td>
                    <td className="px-4 py-2.5 border-l theme-divider"></td>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: C.emerald }}>{usd(dUsd)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold theme-text">{yen(dJpy)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold border-l theme-divider"
                        style={{ color: gl < 0 ? C.red : C.emerald }}>
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

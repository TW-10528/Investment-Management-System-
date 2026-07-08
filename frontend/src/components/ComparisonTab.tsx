import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fundsAPI } from '../services/api';
import type { LedgerRow } from '../types/index';
import { fmt } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const C = {
  indigo:  '#1e40af',
  emerald: '#047857',
  red:     '#b91c1c',
  amber:   '#b45309',
  slate:   '#475569',
};

function extractSeries(fundName: string): string {
  // Extract series from fund name: "Hamilton Lane Secondary Fund..." -> "Hamilton Lane"
  const patterns = [
    /^(Hamilton Lane)/,
    /^(Dover Street)/,
    /^(Siguler Guff)/,
    /^(Vintage)/,
    /^(Capula)/,
    /^(NB Real Estate)/,
    /^(SDG)/,
  ];

  for (const pattern of patterns) {
    const match = fundName.match(pattern);
    if (match) return match[1];
  }
  return fundName; // fallback to full name
}

interface ComparisonData {
  fundName: string;
  fundId: string;
  commitment: number;
  paidIn: number;
  distributions: number;
  dryPowder: number;
  utilization: number;
  dpi: number;
  tvpi: number;
  nav: number;
  totalValue: number;
  returnOfCapital: number;
  gain: number;
  interest: number;
  currency: string;
}

export default function ComparisonTab({ fundId, currency }: { fundId: string; currency?: string }) {
  const { t } = useTranslation();
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFundName, setCurrentFundName] = useState('');

  const fmtMoney = useCallback((n: number) => {
    return currency === 'JPY' ? fmt.jpy(n) : fmt.usd(n, true);
  }, [currency]);

  useEffect(() => {
    const loadComparison = async () => {
      setLoading(true);
      try {
        // Get all funds
        const fundsRes = await fundsAPI.list();
        const activeFunds = (fundsRes.data ?? []).filter((f: any) => f.is_active !== false);

        // Find current fund and its series
        const current = activeFunds.find((f: any) => f.fund_id === fundId);
        if (!current) {
          setLoading(false);
          return;
        }

        setCurrentFundName(current.fund_name);
        const series = extractSeries(current.fund_name);

        // Find all funds in the same series
        const seriesFunds = activeFunds.filter((f: any) => extractSeries(f.fund_name) === series);

        // Fetch ledger data for each fund and calculate metrics
        const comparisons: ComparisonData[] = await Promise.all(
          seriesFunds.map(async (f: any) => {
            try {
              const ledgerRes = await fundsAPI.ledger(f.fund_id);
              const rows = (ledgerRes.data?.rows ?? []) as LedgerRow[];

              const commitment = f.commitment_usd ?? f.contract_commitment_jpy ?? 0;
              const paidIn = f.total_called_usd ?? 0;
              const distributions = f.total_received_usd ?? 0;
              const dryPowder = commitment - paidIn;
              const utilization = commitment > 0 ? (paidIn / commitment) * 100 : 0;
              const dpi = paidIn > 0 ? distributions / paidIn : 0;
              const nav = f.nav_usd ?? 0;
              const totalValue = f.total_value_usd ?? (distributions + nav);
              const tvpi = paidIn > 0 ? totalValue / paidIn : 0;

              const returnOfCapital = rows.reduce((sum, r) => sum + (r.return_of_capital ?? 0), 0);
              const gain = rows.reduce((sum, r) => sum + (r.gain ?? 0), 0);
              const interest = rows.reduce((sum, r) => sum + (r.interest ?? 0), 0);

              return {
                fundName: f.fund_name,
                fundId: f.fund_id,
                commitment,
                paidIn,
                distributions,
                dryPowder,
                utilization,
                dpi,
                tvpi,
                nav,
                totalValue,
                returnOfCapital,
                gain,
                interest,
                currency: f.currency ?? 'USD',
              };
            } catch {
              return {
                fundName: f.fund_name,
                fundId: f.fund_id,
                commitment: 0,
                paidIn: 0,
                distributions: 0,
                dryPowder: 0,
                utilization: 0,
                dpi: 0,
                tvpi: 0,
                nav: 0,
                totalValue: 0,
                returnOfCapital: 0,
                gain: 0,
                interest: 0,
                currency: f.currency ?? 'USD',
              };
            }
          })
        );

        setComparisonData(comparisons);
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    };

    loadComparison();
  }, [fundId]);

  if (loading) return <p className="px-5 py-8 text-sm theme-text-muted">Loading comparison data…</p>;

  if (comparisonData.length <= 1) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-3xl mb-3 opacity-20">📊</p>
        <p className="text-sm theme-text-muted">No series comparison available — this fund is standalone.</p>
      </div>
    );
  }

  const chartDataCommitment = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.commitment,
  }));

  const chartDataPaidIn = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.paidIn,
  }));

  const chartDataDistributions = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.distributions,
  }));

  const chartDataDryPowder = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.dryPowder,
  }));

  const chartDataNav = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.nav,
  }));

  const chartDataTotalValue = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.totalValue,
  }));

  const chartDataDPI = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.dpi,
  }));

  const chartDataTVPI = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.tvpi,
  }));

  const chartDataRoc = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.returnOfCapital,
  }));

  const chartDataGain = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.gain,
  }));

  const chartDataInterest = comparisonData.map(d => ({
    name: d.fundName.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
    value: d.interest,
  }));

  return (
    <div className="p-5 space-y-6">
      <div>
        <h3 className="text-sm font-bold theme-text mb-1">{extractSeries(currentFundName)} Series Comparison</h3>
        <p className="text-xs theme-text-muted">Detailed comparison of metrics across funds in this series</p>
      </div>

      {/* Commitment Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">{t('manageFunds.totalCommitmentComparison')}</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataCommitment} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Paid In Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Capital Called / Paid In</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataPaidIn} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.emerald} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distributions Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">{t('manageFunds.totalDistributionComparison')}</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataDistributions} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dry Powder Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">{t('manageFunds.dryPowderUnfunded')}</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataDryPowder} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NAV Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Net Asset Value (NAV)</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataNav} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total Value Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Total Value (Distributions + NAV)</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataTotalValue} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.emerald} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DPI Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">DPI (Distributions / Paid-In Capital)</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataDPI} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => (v as number).toFixed(3)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TVPI Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">TVPI (Total Value / Paid-In Capital)</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataTVPI} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => (v as number).toFixed(3)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.emerald} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Return of Capital Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Return of Capital</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataRoc} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gain Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Gain</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataGain} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.emerald} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interest Comparison */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-sm font-semibold theme-text mb-3">Interest</p>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <BarChart data={chartDataInterest} layout="vertical" margin={{ top: 5, right: 30, left: 150 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} width={140} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={C.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto rounded-xl border theme-border">
        <table className="w-full text-xs">
          <thead style={{ background: 'var(--color-header-bg)' }}>
            <tr className="border-b theme-border text-[10px] uppercase tracking-wide theme-text-muted">
              {[
                'Fund Name',
                'Commitment',
                'Paid In',
                'Distributions',
                'Dry Powder',
                'Utilization %',
                'DPI',
                'TVPI',
                'NAV',
                'Total Value',
                'Return of Capital',
                'Gain',
                'Interest',
              ].map(h => (
                <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${h === 'Fund Name' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y theme-border">
            {comparisonData.map(d => (
              <tr key={d.fundId} className="theme-row-hover">
                <td className="px-3 py-2 theme-text font-semibold whitespace-nowrap max-w-[200px] truncate">{d.fundName.substring(0, 30)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.commitment)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.paidIn)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.distributions)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.dryPowder)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text">{d.utilization.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text font-semibold">{d.dpi.toFixed(3)}×</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text font-semibold">{d.tvpi.toFixed(3)}×</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.nav)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.totalValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.returnOfCapital)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.gain)}</td>
                <td className="px-3 py-2 text-right tabular-nums theme-text-muted">{fmtMoney(d.interest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

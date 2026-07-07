import { useMemo, useState, useEffect } from 'react';
import type { FundSummary } from '../types/index';
import { fmt } from '../lib/format';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import AddRemoveFundsModal from './AddRemoveFundsModal';
import api from '../services/api';

const C = {
  indigo:  '#1e40af',
  emerald: '#047857',
  red:     '#b91c1c',
  amber:   '#b45309',
  violet:  '#7c3aed',
  sky:     '#0284c7',
};

const ICONS = {
  aum: '📊',
  commitment: '📋',
  distribution: '💰',
  roc: '🌱',
  gain: '📈',
  interest: '💳',
};

function extractSeries(fundName: string): string | null {
  // Extract family name from fund name
  // Handles variations like: "Hamilton Lane Secondary Fund VI-B", "Hamilton Secondary 3", "Dover Street XI", etc.

  // First, remove everything after and including common fund type descriptors
  let family = fundName
    .replace(/\s+(Fund|LP|L\.P\.|SCSp|Offshore|Secondary|Strategy|Strategic|Opportunities|Feeder|Global|Relative|Value|Trust).*/i, '')
    .trim();

  // Remove trailing version numbers and Roman numerals
  family = family
    .replace(/\s+\d+\s*$/i, '')           // Remove trailing numbers like "3", "4"
    .replace(/\s+[IVX]+\s*$/i, '')        // Remove trailing Roman numerals
    .trim();

  // Clean up any remaining whitespace
  family = family.replace(/\s+/g, ' ').trim();

  if (family.length > 0) return family;
  return null;
}

export default function ComparisonSection({ funds }: { funds: FundSummary[] }) {
  const activeFunds = useMemo(() => funds.filter(f => f.is_active !== false), [funds]);
  const [familiesData, setFamiliesData] = useState<any[]>([]);

  // Fetch fund families from API
  useEffect(() => {
    const fetchFamilies = async () => {
      try {
        const response = await api.get('/fund-families/with-members');
        setFamiliesData(response.data?.data || []);
      } catch (error) {
        console.error('Failed to fetch fund families:', error);
        // Fall back to empty array - will use pattern matching below
        setFamiliesData([]);
      }
    };
    fetchFamilies();
  }, []);

  const seriesGroups = useMemo(() => {
    const groups: Record<string, FundSummary[]> = {};

    // If we have families from API, use them
    if (familiesData.length > 0) {
      familiesData.forEach((family: any) => {
        const familyFunds = activeFunds.filter(fund => {
          // Check if fund is in this family by matching fund_id
          return family.funds?.some((f: any) => f.fund_id === fund.fund_id);
        });

        if (familyFunds.length > 1) {
          groups[family.familyName] = familyFunds;
        }
      });
    } else {
      // Fall back to pattern-based extraction for backward compatibility
      activeFunds.forEach(fund => {
        const series = extractSeries(fund.fund_name);
        if (series) {
          if (!groups[series]) groups[series] = [];
          groups[series].push(fund);
        }
      });
    }

    return Object.entries(groups)
      .filter(([_, groupFunds]) => groupFunds.length > 1)
      .map(([series, groupFunds]) => ({ series, funds: groupFunds }))
      .sort((a, b) => a.series.localeCompare(b.series));
  }, [activeFunds, familiesData]);

  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [asOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddSeriesModalOpen, setIsAddSeriesModalOpen] = useState(false);

  // Combine funds from all selected series
  const comparisonFunds = useMemo(() => {
    if (selectedSeries.length === 0) return [];
    return selectedSeries
      .flatMap(series => seriesGroups.find(g => g.series === series)?.funds ?? [])
      .filter((f, i, arr) => arr.findIndex(x => x.fund_id === f.fund_id) === i); // Remove duplicates
  }, [selectedSeries, seriesGroups]);

  if (seriesGroups.length === 0) {
    return (
      <div className="theme-card border theme-border rounded-2xl py-24 text-center">
        <p className="text-5xl mb-4 opacity-20">📊</p>
        <p className="text-base font-medium theme-text">No Comparable Series</p>
        <p className="text-sm theme-text-muted mt-1">Add funds with the same series to see comparisons.</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold theme-text">Fund Series Comparison</h1>
          {selectedSeries && (
            <p className="text-sm theme-text-muted mt-1">Compare performance and key metrics across funds in the <span className="font-semibold theme-text">{selectedSeries}</span> series</p>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-semibold theme-text min-w-fit">Series:</label>
          <select
            value={selectedSeries.length === 0 ? "" : selectedSeries[0]}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSeries(e.target.value ? [e.target.value] : [])}
            className="px-3 py-2 rounded-lg theme-input border theme-border text-sm font-medium min-w-[180px]"
          >
            <option value="">Select Series</option>
            {seriesGroups.map(g => (
              <option key={g.series} value={g.series}>{g.series}</option>
            ))}
          </select>

          {selectedSeries.length > 0 && selectedSeries.length < seriesGroups.length && (
            <button
              onClick={() => setIsAddSeriesModalOpen(true)}
              className="px-3 py-2 rounded-lg border-2 border-dashed theme-border text-theme-text-muted hover:theme-text transition-colors text-sm font-medium"
              title="Add another series to compare"
            >
              ➕ Add Series
            </button>
          )}

          {selectedSeries.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedSeries.map((series, idx) => (
                <span
                  key={series}
                  className="px-2.5 py-1 rounded-md bg-indigo-600/20 border border-indigo-600/40 text-xs font-medium theme-text flex items-center gap-1.5"
                >
                  {series}
                  <button
                    onClick={() => setSelectedSeries(selectedSeries.filter((_, i) => i !== idx))}
                    className="hover:text-red-500 transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm theme-text-muted">As of {formatDate(asOfDate)}</span>
          <button className="px-2.5 py-1.5 rounded-lg border theme-border text-sm theme-text-muted hover:theme-text transition-colors" title="Calendar">
            📅
          </button>
          <button className="px-3 py-1.5 rounded-lg border theme-border text-sm font-medium theme-text-muted hover:theme-text transition-colors">
            ⬇️ Export
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            ➕ Add / Remove Funds
          </button>
          <button className="px-2.5 py-1.5 rounded-lg border theme-border text-sm theme-text-muted hover:theme-text transition-colors" title="Filters">
            🔍
          </button>
        </div>
      </div>

      {selectedSeries.length === 0 ? (
        <div className="theme-card border theme-border rounded-2xl py-24 text-center">
          <p className="text-5xl mb-4 opacity-20">📊</p>
          <p className="text-base font-medium theme-text">Select a Series</p>
          <p className="text-sm theme-text-muted mt-1">Choose a fund series from the dropdown above to view comparisons.</p>
        </div>
      ) : comparisonFunds.length > 0 ? (
        <SeriesComparison
          funds={comparisonFunds}
          isModalOpen={isModalOpen}
          onModalClose={() => setIsModalOpen(false)}
        />
      ) : (
        <div className="theme-card border theme-border rounded-2xl py-24 text-center">
          <p className="text-5xl mb-4 opacity-20">📊</p>
          <p className="text-base font-medium theme-text">Loading Comparison...</p>
          <p className="text-sm theme-text-muted mt-1">Fetching fund data for {selectedSeries.join(', ')}</p>
        </div>
      )}

      {/* Add Series Modal */}
      {isAddSeriesModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-20">
          <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="px-6 py-4 border-b theme-border flex items-center justify-between">
              <h2 className="text-lg font-bold theme-text">Add Series to Comparison</h2>
              <button
                onClick={() => setIsAddSeriesModalOpen(false)}
                className="text-2xl leading-none theme-text-muted hover:theme-text transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {seriesGroups
                .filter(g => !selectedSeries.includes(g.series))
                .map(group => (
                  <button
                    key={group.series}
                    onClick={() => {
                      setSelectedSeries([...selectedSeries, group.series]);
                      setIsAddSeriesModalOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border theme-border theme-row-hover transition-colors"
                  >
                    <p className="text-sm font-semibold theme-text">{group.series}</p>
                    <p className="text-xs theme-text-muted mt-1">{group.funds.length} fund{group.funds.length !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              {selectedSeries.length === seriesGroups.length && (
                <div className="text-center py-8">
                  <p className="text-sm theme-text-muted">All available series are already selected</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t theme-border flex items-center justify-end gap-3">
              <button
                onClick={() => setIsAddSeriesModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium theme-text-muted hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeriesComparison({
  funds,
  isModalOpen,
  onModalClose,
}: {
  series?: string;
  funds: FundSummary[];
  isModalOpen: boolean;
  onModalClose: () => void;
}) {
  const [selectedFundIds, setSelectedFundIds] = useState<string[]>(funds.map(f => f.fund_id));

  const selectedFunds = useMemo(
    () => funds.filter(f => selectedFundIds.includes(f.fund_id)),
    [funds, selectedFundIds]
  );

  // Calculate totals
  const totals = useMemo(() => {
    const totalAum = selectedFunds.reduce((sum, f) => sum + ((f.nav_usd ?? 0) + (f.total_received_usd ?? 0)), 0);
    const totalCommitment = selectedFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
    const totalDistribution = selectedFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);
    const totalRoc = 0;
    const totalGain = 0;
    const totalInterest = 0;

    return { totalAum, totalCommitment, totalDistribution, totalRoc, totalGain, totalInterest };
  }, [selectedFunds]);

  const colors = [C.indigo, C.emerald, C.violet, C.amber, C.sky];

  // Prepare chart data
  const chartDataAum = useMemo(() =>
    selectedFunds.map(f => ({
      name: f.fund_name.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
      value: (f.nav_usd ?? 0) + (f.total_received_usd ?? 0),
    })), [selectedFunds]);

  const chartDataMultiples = useMemo(() =>
    selectedFunds.map(f => {
      const paidIn = f.total_called_usd ?? 0;
      const distributions = f.total_received_usd ?? 0;
      const nav = f.nav_usd ?? 0;
      const totalValue = distributions + nav;
      return {
        name: f.fund_name.replace(/Fund|LP|L\.P\.|Offshore|SCSp/g, '').trim().substring(0, 20),
        moic: paidIn > 0 ? (totalValue / paidIn) : 0,
        dpi: paidIn > 0 ? (distributions / paidIn) : 0,
        tvpi: paidIn > 0 ? (totalValue / paidIn) : 0,
      };
    }), [selectedFunds]);

  const chartDataCashFlow = useMemo(() => {
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
    return years.map((year, i) => ({
      year: year.toString(),
      [selectedFunds[0]?.fund_id || 'f0']: (i + 1) * 2000000,
      [selectedFunds[1]?.fund_id || 'f1']: (i + 1) * 1500000,
      [selectedFunds[2]?.fund_id || 'f2']: (i + 1) * 1800000,
    }));
  }, [selectedFunds]);

  return (
    <div className="space-y-6">
      {/* Summary Boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total AUM (USD)', value: fmt.usdFull(totals.totalAum), count: selectedFunds.length, icon: ICONS.aum },
          { label: 'Total Commitment (USD)', value: fmt.usdFull(totals.totalCommitment), count: selectedFunds.length, icon: ICONS.commitment },
          { label: 'Total Distribution (USD)', value: fmt.usdFull(totals.totalDistribution), count: selectedFunds.length, icon: ICONS.distribution },
          { label: 'Total Return of Capital (USD)', value: fmt.usdFull(totals.totalRoc), count: selectedFunds.length, icon: ICONS.roc },
          { label: 'Total Gain (USD)', value: fmt.usdFull(totals.totalGain), count: selectedFunds.length, icon: ICONS.gain },
          { label: 'Total Interest (USD)', value: fmt.usdFull(totals.totalInterest), count: selectedFunds.length, icon: ICONS.interest },
        ].map(m => (
          <div key={m.label} className="theme-card border theme-border rounded-xl p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-[8px] font-bold uppercase tracking-widest theme-text-muted mb-1">{m.label}</p>
                <p className="text-base font-bold tabular-nums theme-text">{m.value}</p>
                <p className="text-[9px] theme-text-muted mt-1">{m.count} Funds</p>
              </div>
              <span className="text-2xl opacity-60">{m.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Funds in Comparison */}
      <div>
        <h3 className="text-sm font-bold theme-text mb-3">Funds in Comparison ({selectedFunds.length})</h3>
        <div className="flex flex-wrap gap-2">
          {selectedFunds.map((f, i) => (
            <div
              key={f.fund_id}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border theme-border theme-card"
              style={{ borderLeftColor: colors[i % colors.length], borderLeftWidth: '3px' }}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-sm theme-text font-medium">{f.fund_name.substring(0, 30)}</span>
              <span className="text-[10px] theme-text-muted">Vintage {f.vintage_year || '—'} • Currency USD</span>
              <button
                onClick={() => setSelectedFundIds(selectedFundIds.filter(id => id !== f.fund_id))}
                className="ml-1 text-theme-text-muted hover:text-red-500 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>
          ))}
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed theme-border text-theme-text-muted hover:theme-text transition-colors">
            ➕ Add Fund
          </button>
        </div>
      </div>

      {/* Metrics Table */}
      <div>
        <h3 className="text-sm font-bold theme-text mb-3">Key Metrics Comparison</h3>
        <div className="overflow-x-auto rounded-xl border theme-border">
          <table className="w-full text-xs">
            <thead style={{ background: 'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-[10px] uppercase tracking-wide theme-text-muted">
                {[
                  'Fund Name', 'Vintage Year', 'Currency', 'AUM (USD)', 'Commitment (USD)', 'Distributed (USD)',
                  'Return of Capital (USD)', 'Gain (USD)', 'Interest (USD)', 'IRR (%)', 'MOIC (x)', 'DPI (x)', 'TVPI (x)',
                ].map(h => (
                  <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${h === 'Fund Name' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {selectedFunds.map((f, i) => {
                const commitment = f.commitment_usd ?? 0;
                const paidIn = f.total_called_usd ?? 0;
                const distributions = f.total_received_usd ?? 0;
                const nav = f.nav_usd ?? 0;
                const totalValue = distributions + nav;
                const dpi = paidIn > 0 ? distributions / paidIn : 0;
                const tvpi = paidIn > 0 ? totalValue / paidIn : 0;
                const aum = totalValue;
                const moic = tvpi;
                const irr = 12 + i; // Placeholder

                return (
                  <tr key={f.fund_id} className="theme-row-hover">
                    <td className="px-3 py-2 theme-text font-semibold whitespace-nowrap max-w-[250px] truncate">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: colors[i % colors.length] }} />
                      {f.fund_name}
                    </td>
                    <td className="px-3 py-2 text-right text-theme-text-muted">{f.vintage_year || '—'}</td>
                    <td className="px-3 py-2 text-right text-theme-text-muted">USD</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(aum)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(commitment)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(distributions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-theme-text-muted">{fmt.usd(0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.emerald }}>{irr.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.indigo }}>{moic.toFixed(2)}×</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: C.indigo }}>{dpi.toFixed(2)}×</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: C.indigo }}>{tvpi.toFixed(2)}×</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'rgba(99,102,241,0.05)' }}>
                <td className="px-3 py-2 text-sm font-bold theme-text">Total / Average</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(totals.totalAum)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(totals.totalCommitment)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(totals.totalDistribution)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold theme-text">{fmt.usd(0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: C.emerald }}>12.45%</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: C.indigo }}>1.32×</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: C.indigo }}>0.58×</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: C.indigo }}>0.89×</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* AUM Comparison */}
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-sm font-bold theme-text mb-4">AUM Comparison (USD)</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartDataAum} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip formatter={(v: any) => fmt.usd(v as number)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" fill={C.indigo} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance (IRR %) Comparison */}
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-sm font-bold theme-text mb-4">Performance (IRR %) Comparison</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={selectedFunds.map((f, i) => ({ name: f.fund_name.substring(0, 15), irr: 12 + i }))} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => (v as number).toFixed(2) + '%'} />
                <Line type="monotone" dataKey="irr" stroke={C.indigo} strokeWidth={2} dot={{ fill: C.indigo, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Returns Multiples Comparison */}
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-sm font-bold theme-text mb-4">Returns Multiples Comparison</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartDataMultiples} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip formatter={(v: any) => (v as number).toFixed(2) + '×'} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="moic" fill={C.indigo} radius={[4, 4, 0, 0]} name="MOIC (x)" />
                <Bar dataKey="dpi" fill={C.emerald} radius={[4, 4, 0, 0]} name="DPI (x)" />
                <Bar dataKey="tvpi" fill={C.violet} radius={[4, 4, 0, 0]} name="TVPI (x)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cumulative Cash Flow */}
        <div className="theme-card border theme-border rounded-xl p-4">
          <p className="text-sm font-bold theme-text mb-4">Cumulative Cash Flow (USD)</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartDataCashFlow} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip formatter={(v: any) => fmt.usd(v as number)} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {selectedFunds.map((f, i) => (
                  <Line
                    key={f.fund_id}
                    type="monotone"
                    dataKey={f.fund_id}
                    stroke={colors[i % colors.length]}
                    strokeWidth={2}
                    dot={{ fill: colors[i % colors.length], r: 3 }}
                    name={f.fund_name.substring(0, 15)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Stats & Top Performer */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold theme-text mb-3">Quick Stats (Average)</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Average IRR', value: '12.45%', color: C.emerald },
              { label: 'Average MOIC', value: '1.32×', color: C.indigo },
              { label: 'Average DPI', value: '0.58×', color: C.indigo },
              { label: 'Average TVPI', value: '0.99×', color: C.indigo },
            ].map(m => (
              <div key={m.label} className="theme-card border theme-border rounded-xl p-3">
                <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-1">{m.label}</p>
                <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold theme-text mb-3">Top Performer</h3>
          <div className="theme-card border theme-border rounded-xl p-4 space-y-3">
            {[
              { label: 'Highest IRR', value: 'Hamilton Lane Secondary Fund VII (0.80k)' },
              { label: 'Highest MOIC', value: 'Hamilton Lane Secondary Fund VI-B (1.38x)' },
              { label: 'Highest DPI', value: 'Hamilton Lane Secondary Fund VI-B (0.58x)' },
              { label: 'Highest TVPI', value: 'Hamilton Lane Secondary Fund VI-B (1.02x)' },
            ].map(m => (
              <div key={m.label}>
                <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted mb-1">{m.label}</p>
                <p className="text-sm theme-text">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <p className="text-[10px] theme-text-muted text-center">
        All figures are as of Jul 2026. Performance data may be approximate and subject to change.
      </p>

      {/* Modal */}
      <AddRemoveFundsModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        availableFunds={funds}
        selectedFundIds={selectedFundIds}
        onUpdate={(newFundIds: string[]) => {
          setSelectedFundIds(newFundIds);
          onModalClose();
        }}
      />
    </div>
  );
}

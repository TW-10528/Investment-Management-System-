import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { noticesAPI, fundsAPI } from '../services/api';
import type { InvestmentTarget } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

// ── Card component ─────────────────────────────────────────────────────────────

function InvestmentCard({ inv }: { inv: InvestmentTarget & { sector?: string; geography?: string; deal_type?: string; keywords?: string } }) {
  const sectorColors: Record<string, string> = {
    'Technology':         'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'Healthcare':         'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'Financial Services': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'Real Estate':        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'Consumer':           'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    'Energy':             'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    'Industrial':         'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    'Business Services':  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  };

  const sectorClass = inv.sector ? (sectorColors[inv.sector] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300') : '';
  const keywords = inv.keywords ? inv.keywords.split(', ').slice(0, 5) : [];

  return (
    <div className="rounded-xl border p-4 hover:shadow-md transition-all theme-card animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold theme-text truncate">
            {inv.actual_name || inv.project_name}
          </p>
          {inv.actual_name && (
            <p className="text-xs theme-text-muted mt-0.5">Code: {inv.project_name}</p>
          )}
          <p className="text-xs theme-text-muted mt-1 truncate">{inv.fund_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold theme-text">{fmt.usd(inv.amount_usd, true)}</p>
          <p className="text-xs theme-text-sub mt-0.5">
            {inv.investment_date ? fmt.date(inv.investment_date) : '—'}
          </p>
        </div>
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1.5">
        {inv.sector && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sectorClass}`}>
            {inv.sector}
          </span>
        )}
        {inv.geography && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            📍 {inv.geography}
          </span>
        )}
        {inv.deal_type && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {inv.deal_type}
          </span>
        )}
        {inv.investment_type && !inv.deal_type && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {inv.investment_type}
          </span>
        )}
      </div>

      {/* Keywords */}
      {keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {keywords.map(kw => (
            <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-600">
              #{kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ExtInv = InvestmentTarget & { sector?: string; geography?: string; deal_type?: string; keywords?: string };

export default function Investments() {
  const { t } = useTranslation();
  const [investments, setInvestments] = useState<ExtInv[]>([]);
  const [funds, setFunds]             = useState<{ id: string; fund_name: string }[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [fundFilter, setFundFilter]   = useState('');
  const [sectorFilter, setSectorFilter]     = useState('');
  const [geoFilter, setGeoFilter]     = useState('');
  const [view, setView]               = useState<'card' | 'table'>('card');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ir, fr] = await Promise.all([
          noticesAPI.allInvestments(),
          fundsAPI.list(),
        ]);
        setInvestments(ir.data);
        setFunds(fr.data);
      } catch {
        toast.error(t('common.error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Unique filter options
  const sectors    = useMemo(() => [...new Set(investments.map(i => i.sector).filter(Boolean))].sort() as string[], [investments]);
  const geographies = useMemo(() => [...new Set(investments.map(i => i.geography).filter(Boolean))].sort() as string[], [investments]);

  // Filtered list
  const filtered = useMemo(() => investments.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q || [inv.project_name, inv.actual_name, inv.fund_name, inv.sector, inv.geography, inv.keywords]
      .some(v => v?.toLowerCase().includes(q));
    const matchFund = !fundFilter || inv.fund_id === fundFilter;
    const matchSector = !sectorFilter || inv.sector === sectorFilter;
    const matchGeo = !geoFilter || inv.geography === geoFilter;
    return matchSearch && matchFund && matchSector && matchGeo;
  }), [investments, search, fundFilter, sectorFilter, geoFilter]);

  const totalFiltered = filtered.reduce((s, i) => s + i.amount_usd, 0);

  // Sector breakdown
  const sectorBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(inv => {
      const s = inv.sector || 'Unknown';
      map[s] = (map[s] || 0) + inv.amount_usd;
    });
    return Object.entries(map).sort(([,a], [,b]) => b - a);
  }, [filtered]);

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text">🎯 {t('investments.title')}</h1>
          <p className="theme-text-muted text-sm mt-0.5">{t('investments.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('card')}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${view === 'card' ? 'bg-indigo-600 text-white border-indigo-600' : 'theme-card theme-text border-[var(--color-card-border)] hover:border-indigo-400'}`}
          >
            ⊞ Cards
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${view === 'table' ? 'bg-indigo-600 text-white border-indigo-600' : 'theme-card theme-text border-[var(--color-card-border)] hover:border-indigo-400'}`}
          >
            ≡ Table
          </button>
        </div>
      </div>

      {/* Stats row */}
      {investments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="theme-card border rounded-xl p-4">
            <p className="text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.totalInvested')}</p>
            <p className="text-xl font-bold text-indigo-600 mt-1">{fmt.usd(totalFiltered, true)}</p>
          </div>
          <div className="theme-card border rounded-xl p-4">
            <p className="text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.targets')}</p>
            <p className="text-xl font-bold theme-text mt-1">{filtered.length}</p>
          </div>
          {sectorBreakdown[0] && (
            <div className="theme-card border rounded-xl p-4">
              <p className="text-xs font-medium theme-text-muted uppercase tracking-wide">Top Sector</p>
              <p className="text-sm font-bold theme-text mt-1 truncate">{sectorBreakdown[0][0]}</p>
              <p className="text-xs theme-text-muted">{fmt.usd(sectorBreakdown[0][1], true)}</p>
            </div>
          )}
          <div className="theme-card border rounded-xl p-4">
            <p className="text-xs font-medium theme-text-muted uppercase tracking-wide">Funds</p>
            <p className="text-xl font-bold theme-text mt-1">
              {new Set(filtered.map(i => i.fund_id)).size}
            </p>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('investments.search')}
          className="theme-input flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={fundFilter}
          onChange={e => setFundFilter(e.target.value)}
          className="theme-input border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{t('investments.allFunds')}</option>
          {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
        </select>
        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          className="theme-input border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{t('investments.allSectors')}</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={geoFilter}
          onChange={e => setGeoFilter(e.target.value)}
          className="theme-input border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{t('investments.allGeographies')}</option>
          {geographies.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="theme-card border rounded-xl p-12 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="font-semibold theme-text mb-1">{t('investments.noData')}</h3>
          <p className="theme-text-muted text-sm">{t('investments.noDataSub')}</p>
        </div>
      )}

      {/* Card grid */}
      {!loading && filtered.length > 0 && view === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(inv => <InvestmentCard key={inv.id} inv={inv} />)}
        </div>
      )}

      {/* Table view */}
      {!loading && filtered.length > 0 && view === 'table' && (
        <div className="theme-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="theme-table-head border-b theme-divider">
                <th className="text-left px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.project')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.fund')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.amount')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.sector')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.geography')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium theme-text-muted uppercase tracking-wide">{t('investments.date')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="theme-row-hover border-b theme-divider last:border-0 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium theme-text">{inv.actual_name || inv.project_name}</p>
                    {inv.actual_name && <p className="text-xs theme-text-muted">Code: {inv.project_name}</p>}
                  </td>
                  <td className="px-4 py-3 theme-text-muted text-xs max-w-[130px] truncate">{inv.fund_name}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium theme-text">{fmt.usd(inv.amount_usd, true)}</td>
                  <td className="px-4 py-3">
                    {inv.sector && <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{inv.sector}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {inv.geography && <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">📍 {inv.geography}</span>}
                  </td>
                  <td className="px-4 py-3 theme-text-sub text-xs">{inv.investment_date ? fmt.date(inv.investment_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="theme-table-head border-t theme-divider">
                <td colSpan={2} className="px-4 py-3 text-xs font-semibold theme-text-muted">{t('investments.totalInvested')}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600">{fmt.usd(totalFiltered, true)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

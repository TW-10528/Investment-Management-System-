/**
 * FundReportsOverview — Display all funds with their report statistics (files, calls, distributions)
 * Includes search functionality and navigation to fund ledger
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { FundSummary } from '../types/index';

interface Props {
  funds: FundSummary[];
  fundReports: Record<string, { files: number; calls: number; dists: number }>;
}

export default function FundReportsOverview({ funds, fundReports }: Props) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter funds based on search query
  const filteredFunds = useMemo(() => {
    if (!searchQuery.trim()) return funds;
    const query = searchQuery.toLowerCase();
    return funds.filter(f =>
      f.fund_name.toLowerCase().includes(query) ||
      f.manager?.toLowerCase().includes(query)
    );
  }, [funds, searchQuery]);

  // Sort funds by name for consistent display
  const sortedFunds = useMemo(() => {
    return [...filteredFunds].sort((a, b) => a.fund_name.localeCompare(b.fund_name));
  }, [filteredFunds]);

  return (
    <div className="space-y-4">
      {/* ── Search Bar ── */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('manageFunds.searchFunds')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border theme-border bg-transparent theme-text text-sm placeholder-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Results Count ── */}
      {searchQuery && (
        <p className="text-sm text-gray-500">
          {sortedFunds.length} {sortedFunds.length === 1 ? t('fundOverview.fund') : t('manageFunds.allFunds')} {t('common.found')}
        </p>
      )}

      {/* ── Funds Grid ── */}
      {sortedFunds.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedFunds.map(fund => {
            const stats = fundReports[fund.fund_id] || { files: 0, calls: 0, dists: 0 };
            return (
              <div
                key={fund.fund_id}
                className="theme-card border theme-border rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                {/* Fund Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold theme-text text-sm truncate">
                      {fund.fund_name}
                    </h3>
                    <p className="text-xs theme-text-muted mt-1 truncate">
                      {stats.files} {t('manageFunds.files')}
                    </p>
                  </div>
                  <div className="text-2xl ml-2">📁</div>
                </div>

                {/* Statistics */}
                <div className="flex gap-3 mb-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-indigo-600">{stats.calls}</span>
                    <span className="theme-text-muted">{t('manageFunds.calls')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-emerald-600">{stats.dists}</span>
                    <span className="theme-text-muted">{t('manageFunds.dists')}</span>
                  </div>
                </div>

                {/* Actions */}
                <Link
                  to={`/funds?fund=${fund.fund_id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {t('manageFunds.ledger')} →
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="theme-card border theme-border rounded-xl p-8 text-center">
          <p className="theme-text-muted text-sm">
            {searchQuery
              ? t('manageFunds.noFundsFound')
              : t('manageFunds.allFunds')}
          </p>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { FundSummary } from '../types/index';

interface AddRemoveFundsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableFunds: FundSummary[];
  selectedFundIds: string[];
  onUpdate: (fundIds: string[]) => void;
}

export default function AddRemoveFundsModal({
  isOpen,
  onClose,
  availableFunds,
  selectedFundIds,
  onUpdate,
}: AddRemoveFundsModalProps) {
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedFundIds);

  const handleToggle = (fundId: string) => {
    setLocalSelectedIds(prev =>
      prev.includes(fundId)
        ? prev.filter(id => id !== fundId)
        : [...prev, fundId]
    );
  };

  const handleSave = () => {
    onUpdate(localSelectedIds);
    onClose();
  };

  const handleSelectAll = () => {
    setLocalSelectedIds(availableFunds.map(f => f.fund_id));
  };

  const handleDeselectAll = () => {
    setLocalSelectedIds([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-20">
      <div
        className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden animate-fade-in"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b theme-border flex items-center justify-between">
          <h2 className="text-lg font-bold theme-text">Add / Remove Funds</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none theme-text-muted hover:theme-text transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Controls */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border theme-border theme-text-muted hover:theme-text transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border theme-border theme-text-muted hover:theme-text transition-colors"
            >
              Deselect All
            </button>
            <span className="ml-auto text-sm theme-text-muted">
              {localSelectedIds.length} of {availableFunds.length} selected
            </span>
          </div>

          {/* Funds List */}
          <div className="space-y-2">
            {availableFunds.map(fund => (
              <label
                key={fund.fund_id}
                className="flex items-center gap-3 p-3 rounded-lg border theme-border theme-row-hover cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={localSelectedIds.includes(fund.fund_id)}
                  onChange={() => handleToggle(fund.fund_id)}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium theme-text truncate">{fund.fund_name}</p>
                  <p className="text-xs theme-text-muted">
                    Vintage {fund.vintage_year || '—'} • {fund.currency || 'USD'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold theme-text-muted">
                    {fund.commitment_usd ? `$${(fund.commitment_usd / 1000000).toFixed(1)}M` : '—'}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t theme-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium theme-text-muted hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Extracted Data Review Form
 * Shows extracted fund + document data for user review and editing
 * before creating the new fund
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface ExtractedData {
  fundData: {
    fundName: string;
    manager?: string;
    strategy?: string;
    vintageYear?: number;
    currency: string;
    commitmentUsd?: number;
    entryFxRate?: number;
    managementFeePct?: number;
    carryPct?: number;
    hurdleRatePct?: number;
  };
  documentData: {
    documentType: string;
    amount?: number;
    noticeDate?: string;
    dueDate?: string;
    transactionDate?: string;
  };
  extractionConfidence: number;
  rawExtraction: Record<string, any>;
}

interface Props {
  extractedData: ExtractedData;
  pdfFileName: string;
  onCancel: () => void;
  onSave: (fundData: any, documentData: any, correctedFields: string[]) => Promise<void>;
  isLoading?: boolean;
}

export default function ExtractedDataReviewForm({
  extractedData,
  pdfFileName,
  onCancel,
  onSave,
  isLoading = false,
}: Props) {
  const { t } = useTranslation();
  const [fundData, setFundData] = useState(extractedData.fundData);
  const [documentData, setDocumentData] = useState(extractedData.documentData);
  const [correctedFields, setCorrectedFields] = useState<string[]>([]);

  const handleFundFieldChange = (field: string, value: any) => {
    setFundData(prev => ({ ...prev, [field]: value }));

    // Track corrected fields (only if different from extracted)
    if ((extractedData.fundData as any)[field] !== value) {
      if (!correctedFields.includes(field)) {
        setCorrectedFields(prev => [...prev, field]);
      }
    } else {
      setCorrectedFields(prev => prev.filter(f => f !== field));
    }
  };

  const handleDocumentFieldChange = (field: string, value: any) => {
    setDocumentData(prev => ({ ...prev, [field]: value }));

    // Track corrected fields
    if ((extractedData.documentData as any)[field] !== value) {
      if (!correctedFields.includes(field)) {
        setCorrectedFields(prev => [...prev, field]);
      }
    } else {
      setCorrectedFields(prev => prev.filter(f => f !== field));
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (!fundData.fundName?.trim()) {
      toast.error('Fund name is required');
      return;
    }

    try {
      await onSave(fundData, documentData, correctedFields);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create fund');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b theme-border flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold theme-text">Detected Document</h2>
              <p className="text-xs theme-text-muted mt-1">📄 {pdfFileName}</p>
            </div>
          </div>
        </div>

        {/* Content - Simplified Display */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Fund Section */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest theme-text-muted">Fund</label>
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold theme-text">{fundData.fundName}</h3>
              <span className="text-sm font-semibold px-2.5 py-1 rounded-full text-emerald-600" style={{ background: 'rgba(16, 185, 129, 0.12)' }}>
                {extractedData.extractionConfidence}% match
              </span>
            </div>
          </div>

          {/* Document Type */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest theme-text-muted">Document Type</label>
            <div className="theme-text text-sm font-medium">{documentData.documentType}</div>
          </div>

          {/* Date */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest theme-text-muted">Date</label>
            <div className="theme-text text-sm font-medium">{documentData.noticeDate || '—'}</div>
          </div>

          {/* Optional: Show extraction details if needed */}
          {extractedData.extractionConfidence < 80 && (
            <div className="p-3 rounded-lg border theme-border" style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
              <p className="text-xs theme-text-muted">
                ⚠️ Lower confidence detection. Review and edit below if needed.
              </p>
            </div>
          )}

          {/* Expandable Edit Section */}
          <details className="border theme-border rounded-lg p-4">
            <summary className="cursor-pointer text-sm font-semibold theme-text hover:text-indigo-600 transition-colors">
              ✏️ Edit Details
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fund Name */}
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1">Fund Name</label>
                  <input
                    type="text"
                    value={fundData.fundName}
                    onChange={(e) => handleFundFieldChange('fundName', e.target.value)}
                    className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  />
                </div>

                {/* Manager */}
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1">Manager</label>
                  <input
                    type="text"
                    value={fundData.manager || ''}
                    onChange={(e) => handleFundFieldChange('manager', e.target.value)}
                    className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  />
                </div>

                {/* Document Type */}
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1">Document Type</label>
                  <select
                    value={documentData.documentType}
                    onChange={(e) => handleDocumentFieldChange('documentType', e.target.value)}
                    className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  >
                    <option value="CAPITAL_CALL">{t('documentTypes.capital_call')}</option>
                    <option value="DISTRIBUTION">{t('documentTypes.distribution')}</option>
                    <option value="FINANCIAL_STATEMENT">{t('documentTypes.financial_statement')}</option>
                    <option value="NAV_REPORT">{t('documentTypes.nav_report')}</option>
                    <option value="QUARTERLY_REPORT">{t('documentTypes.quarterly_report')}</option>
                    <option value="ANNUAL_REPORT">{t('documentTypes.annual_report')}</option>
                    <option value="TAX_DOCUMENT">{t('documentTypes.tax_document')}</option>
                    <option value="AUDIT_REPORT">{t('documentTypes.audit_report')}</option>
                    <option value="COMMITMENT_NOTICE">{t('documentTypes.commitment_notice')}</option>
                    <option value="OTHER">{t('documentTypes.other_document')}</option>
                  </select>
                </div>

                {/* Notice Date */}
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1">Date</label>
                  <input
                    type="date"
                    value={documentData.noticeDate || ''}
                    onChange={(e) => handleDocumentFieldChange('noticeDate', e.target.value)}
                    className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  />
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Footer - Actions */}
        <div className="px-6 py-4 border-t theme-border flex items-center justify-between flex-shrink-0">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded text-sm font-medium theme-text-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-6 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? '...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

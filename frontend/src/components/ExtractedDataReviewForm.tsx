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
  const [customDocType, setCustomDocType] = useState('');

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

    // If "OTHER" is selected, custom type must be provided
    if (documentData.documentType === 'OTHER' && !customDocType?.trim()) {
      toast.error('Please specify the document type (e.g., Subscription Agreement)');
      return;
    }

    try {
      // Pass custom document type along with the data
      const finalDocumentData = { ...documentData };
      if (customDocType?.trim()) {
        (finalDocumentData as any).customDocType = customDocType.trim();
      }
      await onSave(fundData, finalDocumentData, correctedFields);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create fund');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b theme-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold theme-text">⚠️ New Fund Detected</h2>
            <p className="text-xs theme-text-muted mt-1">Review extracted data • Edit if needed • Click Save</p>
          </div>
          <div className="text-right">
            <p className="text-xs theme-text-muted">📄 {pdfFileName}</p>
            <p className="text-xs theme-text-muted">Confidence: {extractedData.extractionConfidence}%</p>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {/* Fund Details Section */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold theme-text mb-4 pb-2 border-b theme-border">
              📋 {t('funds.title')} (AI Extracted)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Fund Name */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.fundName')}
                </label>
                <input
                  type="text"
                  value={fundData.fundName}
                  onChange={(e) => handleFundFieldChange('fundName', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Fund name"
                />
              </div>

              {/* Manager */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.manager')}
                </label>
                <input
                  type="text"
                  value={fundData.manager || ''}
                  onChange={(e) => handleFundFieldChange('manager', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Fund manager"
                />
              </div>

              {/* Strategy */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.strategy')}
                </label>
                <input
                  type="text"
                  value={fundData.strategy || ''}
                  onChange={(e) => handleFundFieldChange('strategy', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Strategy"
                />
              </div>

              {/* Vintage Year */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.vintageYear')}
                </label>
                <input
                  type="number"
                  value={fundData.vintageYear || ''}
                  onChange={(e) => handleFundFieldChange('vintageYear', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Year"
                />
              </div>

              {/* Commitment (USD) */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.commitment')}
                </label>
                <input
                  type="number"
                  value={fundData.commitmentUsd || ''}
                  onChange={(e) => handleFundFieldChange('commitmentUsd', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Amount in USD"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.currency')}
                </label>
                <select
                  value={fundData.currency}
                  onChange={(e) => handleFundFieldChange('currency', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                >
                  <option value="USD">USD</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>

              {/* Entry FX Rate */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.entryFx')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fundData.entryFxRate || ''}
                  onChange={(e) => handleFundFieldChange('entryFxRate', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="FX Rate"
                />
              </div>

              {/* Mgmt Fee */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.mgmtFee')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fundData.managementFeePct || ''}
                  onChange={(e) => handleFundFieldChange('managementFeePct', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="%"
                />
              </div>

              {/* Carry */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.carry')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fundData.carryPct || ''}
                  onChange={(e) => handleFundFieldChange('carryPct', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="%"
                />
              </div>

              {/* Hurdle Rate */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('funds.hurdle')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={fundData.hurdleRatePct || ''}
                  onChange={(e) => handleFundFieldChange('hurdleRatePct', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="%"
                />
              </div>
            </div>
          </div>

          {/* Document Details Section */}
          <div>
            <h3 className="text-sm font-semibold theme-text mb-4 pb-2 border-b theme-border">
              📄 {t('notices.title')} (Detected)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Document Type */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('notices.noticeType')}
                </label>
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

              {/* Custom Document Type (if "OTHER" is selected) */}
              {documentData.documentType === 'OTHER' && (
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1">
                    Specify Document Type (e.g., Subscription, Investment Agreement)
                  </label>
                  <input
                    type="text"
                    value={customDocType}
                    onChange={(e) => setCustomDocType(e.target.value)}
                    placeholder="e.g., Subscription Agreement, Side Letter"
                    className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  />
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('common.amount')} (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={documentData.amount || ''}
                  onChange={(e) => handleDocumentFieldChange('amount', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                  placeholder="Amount"
                />
              </div>

              {/* Notice Date */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('capitalCalls.noticeDate')}
                </label>
                <input
                  type="date"
                  value={documentData.noticeDate || ''}
                  onChange={(e) => handleDocumentFieldChange('noticeDate', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1">
                  {t('capitalCalls.dueDate')}
                </label>
                <input
                  type="date"
                  value={documentData.dueDate || ''}
                  onChange={(e) => handleDocumentFieldChange('dueDate', e.target.value)}
                  className="w-full px-3 py-2 rounded border theme-border bg-transparent theme-text text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Actions */}
        <div className="px-6 py-4 border-t theme-border flex items-center justify-between flex-shrink-0 bg-opacity-50">
          <div className="text-xs theme-text-muted">
            {correctedFields.length > 0 && (
              <span>✏️ {correctedFields.length} field(s) edited</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 rounded text-sm font-medium border theme-border theme-text-muted hover:theme-text transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Fund & Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FundUploadBar — AI-powered PDF upload.
 * Drop a fund PDF → Qwen auto-detects fund + document type → confirm → upload to ledger.
 * Commitment (contract) documents are stored for viewing only — the commitment amount
 * is entered manually in fund settings.
 */
import { useRef, useState } from 'react';
import api, { fundReportsAPI } from '../services/api';
import toast from 'react-hot-toast';

function DuplicateModal({ fileName, uploadedAt, onClose }: { fileName: string; uploadedAt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">⚠️</div>
          <div className="flex-1">
            <h3 className="text-base font-bold theme-text">Duplicate Report Detected</h3>
            <p className="text-sm theme-text-muted mt-1">
              This file has already been uploaded on <span className="font-semibold">{uploadedAt}</span>.
            </p>
            <p className="text-xs theme-text-muted mt-1 break-all">{fileName}</p>
            <p className="text-sm theme-text-muted mt-3">The report was <span className="font-semibold text-amber-600">not saved again</span>. Check your existing reports in the ledger below.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors"
          >
            OK, got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface FundOption { fund_id: string; fund_name: string }

interface Props {
  funds:      FundOption[];
  onUploaded: (fundId: string, docType: string) => void;
}

// Map AI fund_key → keywords to fuzzy-match against fund names in the DB
const FUND_KEY_KEYWORDS: Record<string, string[]> = {
  NB_REAL_ESTATE:  ['NB Real Estate', 'Neuberger'],
  HAMILTON_SEC:    ['Hamilton Lane Secondary', 'Hamilton Secondary'],
  HAMILTON_STRAT:  ['Hamilton Lane Strategic', 'Hamilton Strategic'],
  SDG:             ['SDG'],
  DOVER:           ['Dover Street', 'HarbourVest'],
  GOLDMAN:         ['Vintage', 'Goldman'],
  SIGULER_GUFF:    ['Siguler Guff', 'Siguler'],
  CAPULA:          ['Capula'],
};

const DOC_TYPE_LABELS: Record<string, { label: string; badge: string; isTransaction: boolean; isCommitment?: boolean }> = {
  CAPITAL_CALL:         { label: 'Capital Call',           badge: 'bg-blue-100 text-blue-800',    isTransaction: true  },
  DISTRIBUTION:         { label: 'Distribution',           badge: 'bg-green-100 text-green-800',  isTransaction: true  },
  NETTED_CALL:          { label: 'Capital & Distribution', badge: 'bg-purple-100 text-purple-800', isTransaction: true  },
  INITIAL_CONTRIBUTION: { label: 'Initial Contribution',   badge: 'bg-slate-100 text-slate-700',  isTransaction: true  },
  FINANCIAL_STATEMENT:  { label: 'Financial Statement',    badge: 'bg-amber-100 text-amber-800',  isTransaction: false },
  NAV_REPORT:           { label: 'NAV Report',             badge: 'bg-teal-100 text-teal-800',    isTransaction: false },
  QUARTERLY_REPORT:     { label: 'Quarterly Report',       badge: 'bg-cyan-100 text-cyan-800',    isTransaction: false },
  ANNUAL_REPORT:        { label: 'Annual Report',          badge: 'bg-indigo-100 text-indigo-800', isTransaction: false },
  TAX_DOCUMENT:         { label: 'Tax Document',           badge: 'bg-orange-100 text-orange-800', isTransaction: false },
  AUDIT_REPORT:         { label: 'Audit Report',           badge: 'bg-rose-100 text-rose-800',    isTransaction: false },
  COMMITMENT_NOTICE:    { label: 'Commitment Document',    badge: 'bg-emerald-100 text-emerald-800', isTransaction: false },
  OTHER:                { label: 'Other Document',         badge: 'bg-gray-100 text-gray-700',    isTransaction: false },
  UNKNOWN:              { label: 'Unknown',                badge: 'bg-red-100 text-red-700',      isTransaction: false },
};

// Map AI report_type → backend notice_type
const REPORT_TYPE_MAP: Record<string, string> = {
  CAPITAL_CALL:         'capital_call',
  DISTRIBUTION:         'distribution',
  NETTED_CALL:          'capital_and_distribution',
  INITIAL_CONTRIBUTION: 'capital_call',
  FINANCIAL_STATEMENT:  'financial_statement',
  NAV_REPORT:           'nav_report',
  QUARTERLY_REPORT:     'quarterly_report',
  ANNUAL_REPORT:        'annual_report',
  TAX_DOCUMENT:         'tax_document',
  AUDIT_REPORT:         'audit_report',
  COMMITMENT_NOTICE:    'commitment_notice',
  OTHER:                'other_document',
};

function matchFund(fundKey: string, displayName: string, funds: FundOption[]): FundOption | null {
  const keywords = FUND_KEY_KEYWORDS[fundKey] ?? [displayName];
  for (const fund of funds) {
    const name = fund.fund_name.toLowerCase();
    if (keywords.some(k => name.includes(k.toLowerCase()))) return fund;
  }
  return null;
}

function confColor(s: number) {
  return s >= 90 ? 'text-green-600' : s >= 75 ? 'text-amber-600' : 'text-red-600';
}


export default function FundUploadBar({ funds, onUploaded }: Props) {
  const [file,      setFile]      = useState<File | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState<any | null>(null)
  const [matched,   setMatched]   = useState<FundOption | null>(null)
  const [overrideFund, setOverrideFund] = useState('')
  const [uploading, setUploading] = useState(false)
  const [done,      setDone]      = useState<{ fundId: string; docType: string; fundName: string } | null>(null)
  const [dragging,  setDragging]  = useState(false)
  const [duplicate, setDuplicate] = useState<{ fileName: string; uploadedAt: string } | null>(null)
  const [detectFailed,   setDetectFailed]   = useState(false)
  const [manualFundId,   setManualFundId]   = useState('')
  const [manualDocType,  setManualDocType]  = useState('OTHER')
  const inputRef = useRef<HTMLInputElement>(null)

  async function detect(f: File) {
    setFile(f); setDetection(null); setMatched(null); setDone(null); setOverrideFund('')
    setDetecting(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const res = await api.post('/ai-extract/test', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // PaddleOCR on CPU: 5s model load + 60s/page for heavily scanned PDFs.
        // Large contracts (20+ pages) may need 600s+ on CPU-only systems.
        timeout: 600_000,
      })
      const d = res.data
      setDetection(d)
      const m = matchFund(d.classification?.fund_key, d.classification?.fund_display_name, funds)
      setMatched(m)
      if (m) setOverrideFund(m.fund_id)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 422 || status === 408 || status === 504 || !status) {
        // OCR timed out or AI couldn't parse the document — offer manual save instead
        setDetectFailed(true)
      } else {
        toast.error(err?.response?.data?.detail ?? err.message ?? 'AI detection failed')
        setFile(null)
      }
      setDetection(null)
    } finally {
      setDetecting(false)
    }
  }

  async function uploadManual() {
    if (!file || !manualFundId) return
    const docType = REPORT_TYPE_MAP[manualDocType] ?? 'other_document'
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await fundReportsAPI.upload(manualFundId, form, docType)
      const fundName = funds.find(f => f.fund_id === manualFundId)?.fund_name ?? ''
      toast.success(`Saved to ${fundName}.`)
      setDone({ fundId: manualFundId, docType, fundName })
      setFile(null); setDetectFailed(false); setManualFundId(''); setManualDocType('OTHER')
      onUploaded(manualFundId, docType)
    } catch (err: any) {
      const data = err?.response?.data
      if (err?.response?.status === 409 && data?.detail === 'duplicate_report') {
        setDuplicate({ fileName: data.original_name, uploadedAt: data.uploaded_at })
        setFile(null); setDetectFailed(false); setManualFundId(''); setManualDocType('OTHER')
      } else {
        toast.error(data?.detail ?? 'Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (f?.type === 'application/pdf') detect(f)
    else if (f) toast.error('Only PDF files are accepted')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f?.type === 'application/pdf') detect(f)
    else if (f) toast.error('Only PDF files are accepted')
  }

  // ── Normal upload (capital calls, distributions, reference docs) ──────────────
  async function upload() {
    if (!file || !detection || !overrideFund) return
    const docType = REPORT_TYPE_MAP[detection.classification?.report_type] ?? 'capital_call'
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      // Send the AI-extracted data to the backend so it doesn't have to re-extract
      // This ensures the correct values from the AI extraction are used, especially
      // for SDG funds where re-extraction may fail for scanned PDFs
      if (detection.extraction) {
        form.append('extraction_data', JSON.stringify(detection.extraction))
      }
      await fundReportsAPI.upload(overrideFund, form, docType)
      const fundName = funds.find(f => f.fund_id === overrideFund)?.fund_name ?? ''
      toast.success(`Added to ${fundName} ledger.`)
      setDone({ fundId: overrideFund, docType, fundName })
      setFile(null); setDetection(null); setMatched(null)
      onUploaded(overrideFund, docType)
    } catch (err: any) {
      const data = err?.response?.data
      if (err?.response?.status === 409 && data?.detail === 'duplicate_report') {
        setDuplicate({ fileName: data.original_name, uploadedAt: data.uploaded_at })
        setFile(null); setDetection(null); setMatched(null); setOverrideFund('')
      } else {
        toast.error(data?.detail ?? 'Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setFile(null); setDetection(null); setMatched(null); setDone(null); setOverrideFund('')
    setDetectFailed(false); setManualFundId(''); setManualDocType('OTHER')
  }

  const cls = detection?.classification
  const ext = detection?.extraction
  const cal = detection?.calculation
  const typeMeta = DOC_TYPE_LABELS[cls?.report_type] ?? DOC_TYPE_LABELS.UNKNOWN
  const isTransaction  = typeMeta.isTransaction

  const B = cal?.B ?? ext?.B_capital_contribution
  const C = cal?.C ?? ext?.C_distribution_received
  const amount = B || C

  return (
    <>
    {duplicate && (
      <DuplicateModal
        fileName={duplicate.fileName}
        uploadedAt={duplicate.uploadedAt}
        onClose={() => setDuplicate(null)}
      />
    )}
    <div className="theme-card border theme-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b theme-border" style={{ background: 'rgba(99,102,241,0.04)' }}>
        <p className="text-sm font-bold theme-text">Upload Fund Document</p>
        <p className="text-xs theme-text-muted mt-0.5">Drop a PDF — AI will identify the fund, document type, and amounts automatically</p>
      </div>

      <div className="p-5 space-y-4">

        {/* ── Drop zone (only show when no detection yet) ── */}
        {!detection && !detecting && !uploading && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed cursor-pointer text-center py-10 transition-colors
              ${dragging ? 'border-indigo-400 bg-indigo-50/40' : 'hover:border-indigo-400/60'}`}
            style={{ borderColor: dragging ? undefined : 'rgba(99,102,241,0.3)', background: dragging ? undefined : 'rgba(99,102,241,0.02)' }}
          >
            <p className="text-2xl mb-2">📄</p>
            <p className="text-sm font-semibold theme-text">{file ? file.name : 'Drop a fund PDF here or click to browse'}</p>
            <p className="text-xs theme-text-muted mt-1">Capital calls · Distributions · Contract / Commitment documents</p>
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onPick} />
          </div>
        )}

        {/* ── Detecting spinner ── */}
        {(detecting || uploading) && (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium theme-text">
              {uploading ? 'Saving…' : 'Reading PDF — OCR running for scanned pages…'}
            </p>
            <p className="text-xs theme-text-muted">{file?.name}</p>
            {!uploading && (
              <p className="text-xs theme-text-muted">Large scanned PDFs may take 2–10 minutes. Please be patient.</p>
            )}
          </div>
        )}

        {/* ── AI failed — manual save fallback ── */}
        {detectFailed && file && !detection && !detecting && !uploading && (
          <div className="rounded-xl border border-amber-200 overflow-hidden" style={{ background: 'rgba(251,191,36,0.04)' }}>
            <div className="px-5 py-3 border-b border-amber-200" style={{ background: 'rgba(251,191,36,0.08)' }}>
              <p className="text-sm font-bold text-amber-800">AI could not read this document</p>
              <p className="text-xs text-amber-700 mt-0.5">The scanned PDF took too long to process. Select a fund and document type to save it manually.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs theme-text-muted font-medium truncate">{file.name}</p>
              <select
                value={manualFundId}
                onChange={e => setManualFundId(e.target.value)}
                className="theme-input rounded-lg px-3 py-2 text-sm w-full border theme-border"
              >
                <option value="">— select fund —</option>
                {funds.map(f => (
                  <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
                ))}
              </select>
              <select
                value={manualDocType}
                onChange={e => setManualDocType(e.target.value)}
                className="theme-input rounded-lg px-3 py-2 text-sm w-full border theme-border"
              >
                {Object.entries(DOC_TYPE_LABELS)
                  .filter(([k]) => k !== 'UNKNOWN')
                  .map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
              </select>
            </div>
            <div className="px-5 py-4 border-t border-amber-200 flex items-center justify-between gap-4"
                 style={{ background: 'rgba(251,191,36,0.04)' }}>
              <button onClick={reset} className="text-sm theme-text-muted hover:theme-text transition-colors">
                Cancel
              </button>
              <button
                onClick={uploadManual}
                disabled={uploading || !manualFundId}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700"
              >
                {uploading
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-1.5" />Saving…</>
                  : 'Save for Viewing'}
              </button>
            </div>
          </div>
        )}

        {/* ── Detection result — confirmation card ── */}
        {detection && cls && (
          <div className="rounded-xl border theme-border overflow-hidden" style={{ background: 'rgba(99,102,241,0.02)' }}>

            <div className="divide-y theme-border">

              {/* Fund name */}
              <div className="flex items-center px-5 py-3 gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Fund</span>
                <div className="flex-1">
                  {matched ? (
                    <p className="font-semibold theme-text">{cls.fund_display_name || cls.fund_key}</p>
                  ) : (
                    <select
                      value={overrideFund}
                      onChange={e => setOverrideFund(e.target.value)}
                      className="theme-input rounded-lg px-3 py-1.5 text-sm w-full border theme-border"
                    >
                      <option value="">— select fund —</option>
                      {funds.map(f => (
                        <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
                      ))}
                    </select>
                  )}
                </div>
                {matched && (
                  <span className={`text-xs font-semibold shrink-0 ${confColor(cls.confidence_score)}`}>
                    {cls.confidence_score}% match
                  </span>
                )}
              </div>

              {/* Document type */}
              <div className="flex items-center px-5 py-3 gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Document Type</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${typeMeta.badge}`}>
                  {typeMeta.label}
                </span>
              </div>

              {/* Date */}
              <div className="flex items-center px-5 py-3 gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Date</span>
                <p className="text-sm theme-text font-medium">
                  {ext?.transaction_date ?? ext?.commitment_date ?? '—'}
                </p>
              </div>

              {/* Transaction amount (capital calls / distributions) */}
              {isTransaction && amount != null && (
                <div className="flex items-center px-5 py-3 gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">
                    {B ? 'Capital Called' : 'Distribution'}
                  </span>
                  <p className="text-lg font-bold tabular-nums" style={{ color: B ? '#1e40af' : '#047857' }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: cls.currency || 'USD', maximumFractionDigits: 0 }).format(amount)}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm button */}
            <div className="px-5 py-4 border-t theme-border flex items-center justify-between gap-4"
                 style={{ background: 'rgba(99,102,241,0.03)' }}>
              <button onClick={reset}
                className="text-sm theme-text-muted hover:theme-text transition-colors">
                Cancel
              </button>
              <button
                onClick={upload}
                disabled={uploading || !overrideFund}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {uploading
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  : isTransaction ? 'Add to Ledger'
                  : 'Save for Viewing'}
              </button>
            </div>
          </div>
        )}

        {/* ── Success — quick navigation ── */}
        {done && (() => {
          const isTransactionDoc = ['capital_call', 'distribution', 'capital_and_distribution'].includes(done.docType)
          return (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-4 border-green-200 bg-green-50/60">
              <div>
                <p className="text-sm font-bold text-green-800">
                  {isTransactionDoc ? 'Saved to ledger' : 'Saved for viewing'}
                </p>
                <p className="text-xs mt-0.5 text-green-700">{done.fundName}</p>
              </div>
              <button
                onClick={reset}
                className="text-xs px-4 py-2 rounded-lg text-white font-semibold transition-colors bg-green-600 hover:bg-green-700"
              >
                Upload next
              </button>
            </div>
          )
        })()}
      </div>
    </div>
    </>
  )
}

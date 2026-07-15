/**
 * FundUploadBar — AI-powered PDF upload.
 * Drop a fund PDF → Qwen auto-detects fund + document type → confirm → upload to ledger.
 * Commitment (contract) documents are stored for viewing only — the commitment amount
 * is entered manually in fund settings.
 *
 * NEW: If fund is unknown, user can create a new fund from extracted data.
 * EXACT ROMAN NUMERAL MATCHING: Prevents Dover XII from matching Dover XI, etc.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api, { fundReportsAPI } from '../services/api';
import toast from 'react-hot-toast';
import ExtractedDataReviewForm from './ExtractedDataReviewForm';
import NewFundCalculationForm from './NewFundCalculationForm';
import { fundNamesMatchExact, isNewFundVariant } from '../utils/fundNameParser';

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

interface FundOption { fund_id: string; fund_name: string; manager?: string }

interface Props {
  funds:      FundOption[];
  onUploaded: (fundId: string, docType: string) => void;
}


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

function matchFund(_fundKey: string, displayName: string, funds: FundOption[]): FundOption | null {
  if (!displayName) return null;

  // EXACT ROMAN NUMERAL MATCHING:
  // Check if extracted fund name is a variant (e.g., "Dover Street XII")
  // If so, ONLY match to funds with exact same family + sequence number
  if (isNewFundVariant(displayName)) {
    // This is a new fund variant (has Roman numeral or number at end)
    // Try exact match first: "Dover Street XII" must match exactly to "Dover Street XII", never to "Dover Street XI"
    const exactMatch = funds.find(f => fundNamesMatchExact(displayName, f.fund_name));
    if (exactMatch) return exactMatch;

    // If no exact match found for a variant fund, return null
    // This forces the user to create it as a new fund (with human-in-the-loop correction)
    return null;
  }

  // For non-variant funds (no Roman numeral/number at end), use fuzzy matching
  const normalizedDisplay = displayName.toLowerCase().trim();

  // 1. Try exact match
  if (normalizedDisplay) {
    const exactMatch = funds.find(f =>
      f.fund_name.toLowerCase().trim() === normalizedDisplay
    );
    if (exactMatch) return exactMatch;
  }

  // 2. Try substring match for non-variant funds
  if (normalizedDisplay && normalizedDisplay.length > 5) {
    const substringMatch = funds.find(f => {
      const dbName = f.fund_name.toLowerCase();
      const nameSimilarity = Math.abs(dbName.length - normalizedDisplay.length);
      if (nameSimilarity > 10 && !dbName.includes(normalizedDisplay) && !normalizedDisplay.includes(dbName)) {
        return false;
      }
      return dbName.includes(normalizedDisplay) || normalizedDisplay.includes(dbName);
    });
    if (substringMatch) return substringMatch;
  }

  // 3. Keyword scoring for non-variant funds
  if (normalizedDisplay && normalizedDisplay.length > 3) {
    const displayKeywords = normalizedDisplay
      .split(/[\s\-\.(),]+/)
      .filter(w => w.length > 2);

    const scored = funds
      .map(f => {
        const fundKeywords = f.fund_name
          .toLowerCase()
          .split(/[\s\-\.(),]+/)
          .filter(w => w.length > 2);

        const matchCount = displayKeywords.filter(dk =>
          fundKeywords.some(fk => fk === dk || fk.includes(dk) || dk.includes(fk))
        ).length;

        return { fund: f, score: matchCount };
      })
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored[0].fund;
  }

  return null;
}

function confColor(s: number) {
  return s >= 90 ? 'text-green-600' : s >= 75 ? 'text-amber-600' : 'text-red-600';
}


export default function FundUploadBar({ funds, onUploaded }: Props) {
  const { t } = useTranslation();
  const [file,      setFile]      = useState<File | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState<any | null>(null)
  const [matched,   setMatched]   = useState<FundOption | null>(null)
  const [overrideFund, setOverrideFund] = useState('')
  const [uploading, setUploading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [done,      setDone]      = useState<{ fundId: string; docType: string; displayType: string; fundName: string } | null>(null)
  const [dragging,  setDragging]  = useState(false)
  const [duplicate, setDuplicate] = useState<{ fileName: string; uploadedAt: string } | null>(null)
  const [detectFailed,   setDetectFailed]   = useState(false)
  const [manualFundId,   setManualFundId]   = useState('')
  const [manualDocType,  setManualDocType]  = useState('OTHER')
  const [editingDocType, setEditingDocType] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState('')
  const [customDocTypes, setCustomDocTypes] = useState<string[]>([])
  const [showAddDocType, setShowAddDocType] = useState(false)
  const [newDocTypeName, setNewDocTypeName] = useState('')

  // Unknown fund creation states
  const [showCreateFundForm, setShowCreateFundForm] = useState(false)
  const [creatingFund, setCreatingFund] = useState(false)
  const [showNewFundCalcForm, setShowNewFundCalcForm] = useState(false)
  const [newFundData, setNewFundData] = useState<{ id: string; name: string; noticeDate?: string } | null>(null)
  const [savingNewFund, setSavingNewFund] = useState(false)
  const [createNewFromManual, setCreateNewFromManual] = useState(false)
  const [manualFundName, setManualFundName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Load custom document types from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('customDocTypes')
      if (saved) {
        setCustomDocTypes(JSON.parse(saved))
      }
    } catch (err) {
      console.error('Failed to load custom doc types from localStorage:', err)
    }
  }, [])

  async function detect(f: File) {
    setFile(f); setDetection(null); setMatched(null); setDone(null); setOverrideFund('')
    setDetecting(true)
    // Create a new abort controller for this detection
    abortControllerRef.current = new AbortController()
    try {
      const form = new FormData()
      form.append('file', f)
      const res = await api.post('/ai-extract/test', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // PaddleOCR on CPU: 5s model load + 60s/page for heavily scanned PDFs.
        // Large contracts (20+ pages) may need 600s+ on CPU-only systems.
        timeout: 600_000,
        signal: abortControllerRef.current.signal,
      })
      const d = res.data
      setDetection(d)
      // For SDG fund, match directly by database fund name (no character encoding issues)
      let m = null
      if (d.classification?.fund_key === 'SDG' || /sdg/i.test(d.classification?.fund_key ?? '')) {
        m = funds.find(f => /sdg/i.test(f.fund_name ?? ''))
      } else {
        m = matchFund(d.classification?.fund_key, d.classification?.fund_display_name, funds)
      }
      setMatched(m || null)
      if (m) {
        setOverrideFund(m.fund_id)
        // Warn if this is a fund variant (has Roman numerals) to prevent series confusion
        if (d.classification?.fund_display_name && /[IVX]+(-[A-Z])?(\s|LP|$)/i.test(d.classification?.fund_display_name)) {
          toast(`⚠️ Detected: ${d.classification?.fund_display_name} — Please verify this is the correct series before uploading.`, { duration: 6000 })
        }
      }
    } catch (err: any) {
      // Check if the error is from cancellation
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
        toast.error('Upload cancelled')
      } else {
        const status = err?.response?.status
        if (status === 422 || status === 408 || status === 504 || !status) {
          // OCR timed out or AI couldn't parse the document — offer manual save instead
          setDetectFailed(true)
        } else {
          toast.error(err?.response?.data?.detail ?? err.message ?? 'AI detection failed')
          setFile(null)
        }
        setDetection(null)
      }
    } finally {
      setDetecting(false)
      abortControllerRef.current = null
    }
  }

  // Handle creating a new fund from extracted data
  async function handleCreateFund(
    fundData: any,
    _documentData: any,
    _correctedFields: string[]
  ) {
    if (!file || !detection) return

    setCreatingFund(true)
    try {
      // Extract family name from fund name using simple pattern matching
      // E.g., "Dover Street XII" → family: "Dover Street"
      const fundName = fundData.fundName.trim()
      let familyName = fundName
      const romanMatch = fundName.match(/^(.+)\s+X{1,3}(IX|IV|V?I{0,3})$/i)
      const numberMatch = fundName.match(/^(.+)\s+(\d+)$/i)
      if (romanMatch) {
        familyName = romanMatch[1].trim()
      } else if (numberMatch) {
        familyName = numberMatch[1].trim()
      }

      // Create new fund via fund-family API
      const response = await fetch('/api/v1/fund-families/add-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName,
          familyName,
          manager: fundData.manager || '',
          strategy: fundData.strategy || '',
          currency: fundData.currency || 'USD',
          commitmentUsd: fundData.commitmentUsd || 0,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create fund')
      }

      const newFundResult = await response.json()
      const newFundId = newFundResult.data.id
      const noticeDate = detection.extraction?.transaction_date || new Date().toISOString().split('T')[0]

      toast.success(`New fund "${fundName}" created!`)

      // Show calculation form for new fund entry values
      setNewFundData({ id: newFundId, name: fundName, noticeDate })
      setShowNewFundCalcForm(true)
      setShowCreateFundForm(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Fund creation or upload failed')
    } finally {
      setCreatingFund(false)
    }
  }

  // Handle saving new fund calculation form
  async function handleSaveNewFundCalculation(
    values: any,
    _ledger: any
  ) {
    if (!file || !newFundData || !detection) return

    setSavingNewFund(true)
    try {
      const docType = REPORT_TYPE_MAP[detection.classification?.report_type] ?? 'capital_call'
      const displayType = detection.classification?.report_type || 'CAPITAL_CALL'

      // Upload document with the calculated values
      const form = new FormData()
      form.append('file', file)

      // Pass extracted data with the input values
      const extractedData = {
        B_capital_contribution: parseFloat(values.capital_distribution) || 0,
        C_distribution_received: parseFloat(values.distribution_received) || 0,
        D_reinvestable: parseFloat(values.reinvestable) || 0,
        total_commitment_amount: parseFloat(values.commitment_usd) || 0,
        transaction_date: values.transaction_date,
        interest: 0,
        gain: 0,
      }
      form.append('extraction_data', JSON.stringify(extractedData))

      await fundReportsAPI.upload(newFundData.id, form, docType)

      // Update fund commitment if provided
      const commitmentAmount = parseFloat(values.commitment_usd) || 0
      if (commitmentAmount > 0) {
        try {
          await fetch(`/api/v1/funds/${newFundData.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            },
            body: JSON.stringify({
              commitment_usd: commitmentAmount,
            }),
          })
        } catch (err) {
          console.error('Failed to update fund commitment:', err)
          // Don't fail the whole operation if commitment update fails
        }
      }

      toast.success(`Document uploaded to "${newFundData.name}" and ledger created.`)

      setDone({
        fundId: newFundData.id,
        docType,
        displayType,
        fundName: newFundData.name,
      })

      setShowNewFundCalcForm(false)
      setFile(null)
      setDetection(null)
      setMatched(null)
      setNewFundData(null)

      // Refresh funds list (parent will handle this)
      onUploaded(newFundData.id, docType)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Failed to save new fund entry')
    } finally {
      setSavingNewFund(false)
    }
  }

  async function uploadManual() {
    if (!file || !manualFundId) return
    const docType = REPORT_TYPE_MAP[manualDocType] ?? 'other_document'
    const displayType = DOC_TYPE_LABELS[manualDocType]?.label || 'Document'
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await fundReportsAPI.upload(manualFundId, form, docType)
      const fundName = funds.find(f => f.fund_id === manualFundId)?.fund_name ?? ''
      toast.success(`Saved to ${fundName}.`)
      setDone({ fundId: manualFundId, docType, displayType, fundName })
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

  // Handle creating new fund from manual fallback
  async function handleCreateNewFromManual() {
    if (!manualFundName.trim()) return

    setCreatingFund(true)
    try {
      const fundName = manualFundName.trim()
      let familyName = fundName
      const romanMatch = fundName.match(/^(.+)\s+X{1,3}(IX|IV|V?I{0,3})$/i)
      const numberMatch = fundName.match(/^(.+)\s+(\d+)$/i)
      if (romanMatch) {
        familyName = romanMatch[1].trim()
      } else if (numberMatch) {
        familyName = numberMatch[1].trim()
      }

      const response = await fetch('/api/v1/fund-families/add-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName,
          familyName,
          manager: '',
          strategy: '',
          currency: 'USD',
          commitmentUsd: 0,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create fund')
      }

      const newFundResult = await response.json()
      const newFundId = newFundResult.data.id

      toast.success(`New fund "${fundName}" created!`)

      // Show calculation form for new fund entry
      setNewFundData({ id: newFundId, name: fundName })
      setShowNewFundCalcForm(true)
      setDetectFailed(false)
      setCreateNewFromManual(false)
      setManualFundName('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Fund creation failed')
    } finally {
      setCreatingFund(false)
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
    // Use user-edited document type if available, otherwise use AI-detected type
    let docType: string
    let customDocTypeName: string | null = null

    if (selectedDocType) {
      // Check if it's a predefined type or a custom type
      if (REPORT_TYPE_MAP[selectedDocType]) {
        docType = REPORT_TYPE_MAP[selectedDocType]
      } else if (customDocTypes.includes(selectedDocType)) {
        // Custom type - use 'viewing_document' as docType and send the custom name
        docType = 'viewing_document'
        customDocTypeName = selectedDocType
      } else {
        docType = REPORT_TYPE_MAP[detection.classification?.report_type] ?? 'capital_call'
      }
    } else {
      docType = REPORT_TYPE_MAP[detection.classification?.report_type] ?? 'capital_call'
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      // Send only essential extraction fields to reduce payload size
      // Full extraction object can be very large for multi-page scanned PDFs
      if (detection.extraction) {
        const minimal = {
          B_capital_contribution: detection.extraction.B_capital_contribution,
          C_distribution_received: detection.extraction.C_distribution_received,
          D_reinvestable: detection.extraction.D_reinvestable,
          transaction_date: detection.extraction.transaction_date,
          currency: detection.extraction.currency,
        }
        form.append('extraction_data', JSON.stringify(minimal))
      }
      // Send custom document type name if it was created by user
      if (customDocTypeName) {
        form.append('custom_doc_type', customDocTypeName)
      }
      await fundReportsAPI.upload(overrideFund, form, docType)
      const fundName = funds.find(f => f.fund_id === overrideFund)?.fund_name ?? ''
      toast.success(`Added to ${fundName} ledger.`)
      // For done state, use the display name (custom type or predefined label)
      const displayType = customDocTypeName || DOC_TYPE_LABELS[selectedDocType]?.label || DOC_TYPE_LABELS[cls?.report_type]?.label || 'Document'
      setDone({ fundId: overrideFund, docType, displayType, fundName })
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
    // Abort any ongoing detection/upload request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setFile(null); setDetection(null); setMatched(null); setDone(null); setOverrideFund('')
    setDetectFailed(false); setManualFundId(''); setManualDocType('OTHER')
    setEditingDocType(false); setSelectedDocType('')
    setShowAddDocType(false); setNewDocTypeName('')
    setShowCreateFundForm(false); setCreatingFund(false)
    setCreateNewFromManual(false); setManualFundName('')
  }

  function uploadNext() {
    reset()
    // Trigger file input to open file browser
    if (inputRef.current) {
      inputRef.current.click()
    }
  }

  function addNewDocType() {
    if (!newDocTypeName.trim()) return
    const newType = newDocTypeName.trim()
    if (!customDocTypes.includes(newType)) {
      const updatedTypes = [...customDocTypes, newType]
      setCustomDocTypes(updatedTypes)
      // Save to localStorage for persistence across sessions
      try {
        localStorage.setItem('customDocTypes', JSON.stringify(updatedTypes))
      } catch (err) {
        console.error('Failed to save custom doc types to localStorage:', err)
      }
      setSelectedDocType(newType)
    }
    setShowAddDocType(false)
    setNewDocTypeName('')
  }

  const cls = detection?.classification
  const ext = detection?.extraction
  const cal = detection?.calculation
  const typeMeta = DOC_TYPE_LABELS[cls?.report_type] ?? DOC_TYPE_LABELS.UNKNOWN

  const B = cal?.B ?? ext?.B_capital_contribution
  const C = cal?.C ?? ext?.C_distribution_received
  const amount = B || C

  // Trust the AI's document type classification as the source of truth
  // If AI says it's CAPITAL_CALL, DISTRIBUTION, or CAPITAL_AND_DISTRIBUTION → show transaction UI
  // Otherwise (AUDIT, FINANCIAL_STATEMENT, etc.) → show viewing UI
  const isTransaction = typeMeta.isTransaction

  // Direct save for new funds (extracted name without editing)
  async function saveNewFundDirect() {
    if (!file || !detection || !cls.fund_display_name) return

    const fundName = cls.fund_display_name.trim()
    let familyName = fundName
    const romanMatch = fundName.match(/^(.+)\s+X{1,3}(IX|IV|V?I{0,3})$/i)
    const numberMatch = fundName.match(/^(.+)\s+(\d+)$/i)
    if (romanMatch) {
      familyName = romanMatch[1].trim()
    } else if (numberMatch) {
      familyName = numberMatch[1].trim()
    }

    setCreatingFund(true)
    try {
      const response = await fetch('/api/v1/fund-families/add-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundName,
          familyName,
          manager: '',
          strategy: '',
          currency: cls.currency || 'USD',
          commitmentUsd: 0,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create fund')
      }

      const newFundResult = await response.json()
      const newFundId = newFundResult.data.id

      // Now upload the document to this new fund
      const docType = REPORT_TYPE_MAP[cls?.report_type] ?? 'capital_call'
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        if (detection.extraction) {
          const minimal = {
            B_capital_contribution: detection.extraction.B_capital_contribution,
            C_distribution_received: detection.extraction.C_distribution_received,
            D_reinvestable: detection.extraction.D_reinvestable,
            transaction_date: detection.extraction.transaction_date,
            currency: detection.extraction.currency,
          }
          form.append('extraction_data', JSON.stringify(minimal))
        }
        await fundReportsAPI.upload(newFundId, form, docType)

        const displayType = DOC_TYPE_LABELS[cls?.report_type]?.label || 'Document'
        setDone({ fundId: newFundId, docType, displayType, fundName })
        setFile(null); setDetection(null); setMatched(null)
        toast.success(`New fund "${fundName}" created and saved!`)
        onUploaded(newFundId, docType)
      } finally {
        setUploading(false)
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Failed to create and save fund')
    } finally {
      setCreatingFund(false)
    }
  }

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
        <p className="text-sm font-bold theme-text">{t('manageFunds.uploadFundDocument')}</p>
        <p className="text-xs theme-text-muted mt-0.5">{t('manageFunds.dropPdfDescription')}</p>
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
            <svg className="w-12 h-12 mx-auto mb-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-semibold theme-text">{file ? file.name : t('manageFunds.dropPdfHere')}</p>
            <p className="text-xs theme-text-muted mt-1">{t('manageFunds.capitalCallsDistributions')}</p>
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
            <button
              onClick={reset}
              className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-300/50 hover:bg-red-500/10 transition-colors"
            >
              Cancel Upload
            </button>
          </div>
        )}

        {/* ── AI failed — manual save fallback ── */}
        {detectFailed && file && !detection && !detecting && !uploading && !createNewFromManual && (
          <div className="rounded-xl border border-amber-200 overflow-hidden" style={{ background: 'rgba(251,191,36,0.04)' }}>
            <div className="px-5 py-3 border-b border-amber-200" style={{ background: 'rgba(251,191,36,0.08)' }}>
              <p className="text-sm font-bold text-amber-800">AI could not read this document</p>
              <p className="text-xs text-amber-700 mt-0.5">The scanned PDF took too long to process. Choose an option below:</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs theme-text-muted font-medium truncate">{file.name}</p>

              {/* Existing fund option */}
              <div className="border-l-4 border-blue-400 pl-4 py-2">
                <p className="text-xs font-semibold theme-text mb-2">Save to Existing Fund</p>
                <select
                  value={manualFundId}
                  onChange={e => setManualFundId(e.target.value)}
                  className="theme-input rounded-lg px-3 py-2 text-sm w-full border theme-border mb-2"
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

              {/* New fund option */}
              <button
                onClick={() => setCreateNewFromManual(true)}
                className="w-full px-4 py-3 rounded-lg border-2 border-emerald-300 hover:bg-emerald-50/50 transition-colors text-left"
              >
                <p className="text-xs font-semibold text-emerald-700">+ Create New Fund</p>
                <p className="text-xs text-emerald-600 mt-1">Enter fund name and manually set values</p>
              </button>
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

        {/* ── Create new fund from manual fallback ── */}
        {detectFailed && file && !detection && !detecting && !uploading && createNewFromManual && (
          <div className="rounded-xl border border-emerald-200 overflow-hidden" style={{ background: 'rgba(16,185,129,0.04)' }}>
            <div className="px-5 py-3 border-b border-emerald-200" style={{ background: 'rgba(16,185,129,0.08)' }}>
              <p className="text-sm font-bold text-emerald-800">Create New Fund</p>
              <p className="text-xs text-emerald-700 mt-0.5">Enter the fund name, then set transaction values.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs theme-text-muted font-medium truncate">{file.name}</p>
              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase mb-1 block">Fund Name</label>
                <input
                  type="text"
                  placeholder="e.g., Everstone Capital Partners Fund IV LP"
                  value={manualFundName}
                  onChange={e => setManualFundName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-emerald-200 flex items-center justify-between gap-4"
                 style={{ background: 'rgba(16,185,129,0.04)' }}>
              <button
                onClick={() => {
                  setCreateNewFromManual(false)
                  setManualFundName('')
                }}
                className="text-sm theme-text-muted hover:theme-text transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateNewFromManual}
                disabled={creatingFund || !manualFundName.trim()}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700"
              >
                {creatingFund
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-1.5" />Creating…</>
                  : 'Create Fund'}
              </button>
            </div>
          </div>
        )}

        {/* ── Detection result — confirmation card ── */}
        {detection && cls && (
          <div className="rounded-xl border theme-border overflow-hidden" style={{ background: 'rgba(99,102,241,0.02)' }}>

            {/* Hybrid detection warning for SDG */}
            {detection.hybrid_warning && (
              <div className="px-5 py-3 border-b border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {detection.hybrid_warning}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Please review the extracted data below and confirm it's correct before saving.
                </p>
              </div>
            )}

            <div className="divide-y theme-border">

              {/* Fund name */}
              <div className="flex items-center px-5 py-3 gap-4 justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Fund</span>
                  <div className="flex-1">
                    {matched ? (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold theme-text">{matched.fund_name}</p>
                        <button
                          onClick={() => { setMatched(null); setOverrideFund(''); }}
                          title="AI detected this as an existing fund, but you can correct it to create as new"
                          className="px-2 py-1 rounded text-xs font-medium text-indigo-600 hover:bg-indigo-100/50 transition-colors"
                        >
                          ✎ Correct
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-semibold theme-text">{cls.fund_display_name || '—'}</p>
                        <button
                          onClick={() => setShowCreateFundForm(true)}
                          title="Edit or confirm this fund name"
                          className="px-2 py-1 rounded text-xs font-medium text-indigo-600 hover:bg-indigo-100/50 transition-colors"
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={saveNewFundDirect}
                          disabled={creatingFund || uploading}
                          title="Save this fund with the extracted name"
                          className="px-2 py-1 rounded text-xs font-medium text-emerald-600 hover:bg-emerald-100/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✓ Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {matched && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-semibold ${confColor(cls.confidence_score)}`}>
                      {cls.confidence_score}% match
                    </span>
                    {detection.detection_method === 'hybrid' && (
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        (auto-detected)
                      </span>
                    )}
                  </div>
                )}
                {!matched && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 shrink-0">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">🆕 NEW FUND</span>
                  </span>
                )}
              </div>

              {/* Fund Manager */}
              {matched && matched.manager && (
                <div className="flex items-center px-5 py-3 gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Manager</span>
                  <p className="text-sm theme-text font-medium">{matched.manager}</p>
                </div>
              )}

              {/* Document type */}
              <div className="flex items-center px-5 py-3 gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest theme-text-muted w-28 shrink-0">Document Type</span>
                {editingDocType ? (
                  <div className="flex items-center gap-2 flex-1">
                    <select
                      value={selectedDocType || cls?.report_type || ''}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setShowAddDocType(true)
                        } else {
                          setSelectedDocType(e.target.value)
                        }
                      }}
                      className="theme-input rounded-lg px-3 py-1.5 text-sm border theme-border flex-1"
                    >
                      <option value="">— auto-detect —</option>
                      {Object.entries(DOC_TYPE_LABELS).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.label}</option>
                      ))}
                      {customDocTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                      <option value="__ADD_NEW__" className="font-bold">+ Add new document type</option>
                    </select>
                    <button
                      onClick={() => {
                        setEditingDocType(false)
                        // Ensure selectedDocType is properly set
                        if (!selectedDocType) {
                          setSelectedDocType(cls?.report_type || '')
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedDocType && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${customDocTypes.includes(selectedDocType) ? 'text-blue-400 bg-blue-500/10 border border-blue-500/25' : typeMeta.badge}`}>
                        {customDocTypes.includes(selectedDocType) ? selectedDocType : typeMeta.label}
                      </span>
                    )}
                    {!selectedDocType && (
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${typeMeta.badge}`}>
                        {typeMeta.label}
                      </span>
                    )}
                    <button
                      onClick={() => setEditingDocType(true)}
                      className="px-2 py-0.5 rounded text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-500/10 transition-all"
                      title="Edit document type"
                    >
                      ✏️
                    </button>
                  </div>
                )}
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
                    {(() => {
                      const curr = cls.currency || 'USD';
                      if (curr === 'JPY') {
                        return `¥${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(amount)}`;
                      } else {
                        const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);
                        return `$${formatted}`;
                      }
                    })()}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm button */}
            <div className="px-5 py-4 border-t theme-border flex items-center justify-between gap-4"
                 style={{ background: 'rgba(99,102,241,0.03)' }}>
              <div className="flex items-center gap-2">
                <button onClick={reset}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors">
                  Cancel
                </button>
                {file && (
                  <button
                    onClick={() => {
                      const url = URL.createObjectURL(file);
                      window.open(url, '_blank');
                      setTimeout(() => URL.revokeObjectURL(url), 100);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    title="Preview PDF"
                  >
                    👁️ View PDF
                  </button>
                )}
              </div>
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
          const matchedFund = funds.find(f => f.fund_id === done.fundId)
          return (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-4 border-green-200 bg-green-50/60">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-bold text-green-800">
                  {isTransactionDoc ? 'Saved to ledger' : 'Saved for viewing'}
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs text-green-700 mt-2">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-green-600">Fund</span>
                    <p className="font-medium">{done.fundName}</p>
                  </div>
                  {matchedFund?.manager && (
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-green-600">Manager</span>
                      <p className="font-medium">{matchedFund.manager}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-green-600">Type</span>
                    <p className="font-medium">{done.displayType}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={uploadNext}
                className="text-xs px-4 py-2 rounded-lg text-white font-semibold transition-colors bg-green-600 hover:bg-green-700"
              >
                Upload next
              </button>
            </div>
          )
        })()}

        {/* ── Add New Document Type Modal ── */}
        {showAddDocType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddDocType(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold theme-text mb-4">Add New Document Type</h3>
              <input
                type="text"
                value={newDocTypeName}
                onChange={(e) => setNewDocTypeName(e.target.value)}
                placeholder="E.g., Annual Report, Tax Document..."
                className="w-full px-4 py-2 rounded-lg border theme-border bg-transparent theme-text text-sm mb-4"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') addNewDocType()
                }}
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowAddDocType(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium theme-text-muted hover:theme-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addNewDocType}
                  disabled={!newDocTypeName.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Type
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Create New Fund Form ── */}
        {showCreateFundForm && detection && file && (
          <ExtractedDataReviewForm
            extractedData={{
              fundData: {
                fundName: detection.classification?.fund_display_name || 'New Fund',
                manager: undefined,
                strategy: undefined,
                vintageYear: undefined,
                currency: 'USD',
                commitmentUsd: detection.extraction?.total_commitment_amount,
                entryFxRate: undefined,
                managementFeePct: undefined,
                carryPct: undefined,
                hurdleRatePct: undefined,
              },
              documentData: {
                documentType: detection.classification?.report_type || 'OTHER',
                amount: detection.extraction?.C_distribution_received || detection.extraction?.B_capital_contribution,
                noticeDate: detection.extraction?.transaction_date,
                dueDate: undefined,
                transactionDate: detection.extraction?.transaction_date,
              },
              extractionConfidence: detection.classification?.confidence_score || 75,
              rawExtraction: detection.extraction || {},
            }}
            pdfFileName={file.name}
            onCancel={() => setShowCreateFundForm(false)}
            onSave={handleCreateFund}
            isLoading={creatingFund}
          />
        )}

        {/* ── New Fund Calculation Form ── */}
        {showNewFundCalcForm && newFundData && (
          <NewFundCalculationForm
            fundId={newFundData.id}
            fundName={newFundData.name}
            noticeDate={newFundData.noticeDate}
            onCancel={() => {
              setShowNewFundCalcForm(false)
              setNewFundData(null)
              setFile(null)
              setDetection(null)
            }}
            onSave={handleSaveNewFundCalculation}
            isLoading={savingNewFund}
          />
        )}
      </div>
    </div>
    </>
  )
}

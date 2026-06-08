/**
 * FundUploadBar — one shared upload control for the whole funds page.
 * The user picks which fund the PDF belongs to, then uploads; the backend parses
 * it, verifies it matches the chosen fund, and files it under that fund
 * (uploads/<fund>/ on disk + linked to the fund's ledger). On success it calls
 * onUploaded() so every fund's KPIs/ledger refresh.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fundReportsAPI } from '../services/api';
import toast from 'react-hot-toast';

interface FundOption { fund_id: string; fund_name: string }

interface Props {
  funds:      FundOption[];
  onUploaded: () => void;
}

export default function FundUploadBar({ funds, onUploaded }: Props) {
  const { t } = useTranslation();

  const DOC_TYPES: { value: string; label: string }[] = [
    { value: 'capital_call',             label: t('notices.capitalCallNotice') },
    { value: 'distribution',             label: t('notices.distributionNotice') },
    { value: 'capital_and_distribution', label: t('fundUpload.capitalAndDist') },
    { value: 'financial_statement',      label: t('notices.financialStatement') },
  ];
  const [docType, setDocType]     = useState('capital_call');
  const [fundId, setFundId]       = useState('');
  const [fileName, setFileName]   = useState('');
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

  async function doUpload(file: File) {
    if (!docType) { toast.error('Choose the document type first'); return; }
    if (!fundId)  { toast.error('Choose which fund this PDF belongs to first'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast.error('Only PDF files are accepted'); return; }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fundReportsAPI.upload(fundId, form, docType);
      const dedup = r.data?.created?.deduplicated;
      toast.success(dedup
        ? 'Uploaded — a matching record already existed, no duplicate created.'
        : `Uploaded to ${r.data?.fund_name ?? 'fund'} — parsed and added to the ledger.`);
      setFileName('');
      pendingFile.current = null;
      onUploaded();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    pendingFile.current = file;
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);
    pendingFile.current = file;
  }

  function submit() {
    if (!pendingFile.current) { toast.error('Choose a PDF to upload'); return; }
    doUpload(pendingFile.current);
  }

  return (
    <div className="theme-card border theme-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b theme-border" style={{ background: 'rgba(99,102,241,0.04)' }}>
        <p className="text-sm font-bold theme-text">{t('fundUpload.title')}</p>
        <p className="text-xs theme-text-muted mt-0.5">{t('fundUpload.subtitle')}</p>
      </div>

      <div className="p-5 flex flex-col lg:flex-row gap-4 lg:items-stretch">
        {/* Step 1 — document type */}
        <div className="lg:w-52 flex-shrink-0 space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">{t('fundUpload.docTypeLabel')}</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className="theme-input rounded-lg px-3 py-2 text-sm w-full border theme-border"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Step 2 — fund selector */}
        <div className="lg:w-60 flex-shrink-0 space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">{t('fundUpload.whichFund')}</label>
          <select
            value={fundId}
            onChange={e => setFundId(e.target.value)}
            className="theme-input rounded-lg px-3 py-2 text-sm w-full border theme-border"
          >
            <option value="">{t('capitalCalls.selectFund')}</option>
            {funds.map(f => (
              <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
            ))}
          </select>
        </div>

        {/* Drop / browse zone */}
        <div className="flex-1">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            className="rounded-xl border-2 border-dashed transition-all cursor-pointer select-none text-center h-full flex flex-col items-center justify-center"
            style={{
              borderColor: dragging ? '#6366f1' : 'rgba(99,102,241,0.3)',
              background:  dragging ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.03)',
              padding:     '18px 20px',
            }}
          >
            {fileName ? (
              <p className="text-sm font-semibold theme-text">📄 {fileName}</p>
            ) : (
              <>
                <p className="text-sm font-semibold theme-text">📄 {t('fundUpload.dropPdf')}</p>
                <p className="text-[10px] theme-text-muted mt-1">NB Real Estate, Hamilton Lane, Dover Street, SDG, Siguler Guff, Goldman Sachs or Capula notices</p>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onPick} />
        </div>

        {/* Upload button */}
        <div className="flex-shrink-0 flex items-end">
          <button
            onClick={submit}
            disabled={uploading}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full lg:w-auto"
          >
            {uploading
              ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('fundUpload.processing')}</span>
              : t('fundUpload.upload')}
          </button>
        </div>
      </div>
    </div>
  );
}

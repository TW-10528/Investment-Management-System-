/**
 * FundPdfUpload — drag-and-drop PDF uploader.
 * Auto-detects fund from PDF content, runs the fund-specific parser + compute,
 * and calls onUploaded(result) on success.
 */
import { useRef, useState } from 'react';
import { fundPdfAPI } from '../services/api';
import toast from 'react-hot-toast';

interface UploadResult {
  fund_code:    string;
  fund_name:    string;
  commitment:   number;
  file_saved:   string;
  call_created: boolean;
  this_call: {
    notice_date:    string;
    due_date:       string;
    call_pct:       number;
    cumulative_pct: number;
    net_call_usd:   number;
    is_initial:     boolean;
  };
  analysis: {
    pdf_count: number;
    totals: {
      cumulative_drawn:    number;
      investment_capacity: number;
      net_cash_flow:       number;
      non_recallable_dist: number;
    };
    calls: any[];
  };
}

interface Props {
  onUploaded?: (result: UploadResult) => void;
  compact?: boolean;
}

export default function FundPdfUpload({ onUploaded, compact = false }: Props) {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are accepted');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const r = await fundPdfAPI.upload(file);
      const data: UploadResult = r.data;
      setResult(data);
      toast.success(`${data.fund_code} — ${data.call_created ? 'New call added' : 'Duplicate skipped'}`);
      onUploaded?.(data);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  const usd = (n: number) =>
    '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

  if (compact) {
    return (
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
          style={{ borderColor: 'rgba(99,102,241,0.4)', color: '#818cf8', background: 'rgba(99,102,241,0.08)' }}
        >
          {uploading
            ? <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            : '📄'}
          {uploading ? 'Processing…' : 'Upload PDF'}
        </button>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onInputChange} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed transition-all cursor-pointer select-none"
        style={{
          borderColor:  dragging ? '#6366f1' : 'rgba(99,102,241,0.3)',
          background:   dragging ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.03)',
          padding:      '28px 20px',
          textAlign:    'center',
        }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-indigo-400">Detecting fund · parsing PDF · running formulas…</p>
          </div>
        ) : (
          <>
            <p className="text-2xl mb-2">📄</p>
            <p className="text-sm font-semibold theme-text">Drop a capital call PDF here</p>
            <p className="text-xs theme-text-muted mt-1">
              Auto-detects fund · runs parser · computes sigf.ts columns
            </p>
            <p className="text-[10px] theme-text-muted mt-2" style={{ color: 'rgba(99,102,241,0.6)' }}>
              Click to browse or drag & drop
            </p>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onInputChange} />

      {/* Result card */}
      {result && (
        <div className="rounded-xl border overflow-hidden"
             style={{ borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.04)' }}>

          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between gap-2"
               style={{ borderColor: 'rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded font-mono"
                    style={{ background: 'rgba(99,102,241,0.25)', color: '#818cf8' }}>
                {result.fund_code}
              </span>
              <p className="text-xs font-bold theme-text truncate">{result.fund_name}</p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
              result.call_created
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
            }`}>
              {result.call_created ? 'New call created' : 'Duplicate — skipped'}
            </span>
          </div>

          {/* This call */}
          <div className="px-4 py-3 grid grid-cols-3 gap-3 text-xs border-b"
               style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
            <div>
              <p className="theme-text-muted text-[9px] uppercase tracking-wide">Due Date</p>
              <p className="font-semibold theme-text">{result.this_call.due_date}</p>
            </div>
            <div>
              <p className="theme-text-muted text-[9px] uppercase tracking-wide">Amount</p>
              <p className="font-bold" style={{ color: '#4f46e5' }}>{usd(result.this_call.net_call_usd)}</p>
            </div>
            <div>
              <p className="theme-text-muted text-[9px] uppercase tracking-wide">Cumulative</p>
              <p className="font-semibold theme-text">{result.this_call.cumulative_pct?.toFixed(2)}%</p>
            </div>
          </div>

          {/* Updated totals */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { col: 'E', label: 'Cumulative Drawn',    val: usd(result.analysis.totals.cumulative_drawn),    c: '#4f46e5' },
              { col: 'F', label: 'Investment Capacity', val: usd(result.analysis.totals.investment_capacity), c: '#10b981' },
              { col: 'G', label: 'Net Cash Flow',       val: '−' + usd(result.analysis.totals.net_cash_flow), c: '#ef4444' },
              { col: 'L', label: 'Non-Recallable Dist', val: usd(result.analysis.totals.non_recallable_dist), c: '#64748b' },
            ].map(m => (
              <div key={m.col}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[8px] font-black px-1 rounded font-mono"
                        style={{ background: 'rgba(255,255,255,0.08)', color: m.c }}>
                    {m.col}
                  </span>
                  <span className="text-[9px] theme-text-muted">{m.label}</span>
                </div>
                <p className="font-bold tabular-nums" style={{ color: m.c }}>{m.val}</p>
              </div>
            ))}
          </div>

          <div className="px-4 pb-3 text-[9px] theme-text-muted">
            {result.analysis.pdf_count} PDFs total · commitment ${result.commitment.toLocaleString()} · sigf.ts computed
          </div>
        </div>
      )}
    </div>
  );
}

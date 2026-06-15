import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fundReportsAPI, noticesAPI } from '../services/api';
import toast from 'react-hot-toast';

interface FundOption { fund_id: string; fund_name: string }

interface Props {
  funds:      FundOption[];
  onUploaded: () => void;
}

interface QueueItem {
  id:       string;
  file:     File | null;   // null for restored items loaded from localStorage
  fileName: string;
  fileSize: number;
  status:   'waiting' | 'processing' | 'done' | 'failed';
  noticeId: string | null;
  error:    string | null;
  restored: boolean;
}

interface StoredItem {
  id:           string;
  fileName:     string;
  fileSize:     number;
  status:       'waiting' | 'done' | 'failed';
  noticeId:     string | null;
  error:        string | null;
  wasProcessing?: boolean;
}

const QUEUE_KEY = 'ims_upload_queue';

function readStoredQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const stored: StoredItem[] = JSON.parse(raw);
    if (!Array.isArray(stored) || stored.length === 0) return [];
    return stored.map(s => ({
      ...s,
      status:   s.wasProcessing ? 'failed'  : s.status,
      error:    s.wasProcessing ? 'Upload interrupted — add file again to retry' : s.error,
      file:     null,
      restored: true,
    }));
  } catch { return []; }
}

const GRADE = {
  high:   { dot: '#10b981', txt: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'High'   },
  medium: { dot: '#d97706', txt: '#d97706', bg: 'rgba(217,119,6,0.08)',  label: 'Medium' },
  low:    { dot: '#ef4444', txt: '#ef4444', bg: 'rgba(239,68,68,0.08)',  label: 'Low'    },
};

const TYPE_LABELS: Record<string, string> = {
  capital_call:           'Capital Call',
  distribution:           'Distribution',
  capital_and_distribution: 'Call + Dist',
  financial_statement:    'Financial Stmt',
};

function fmtSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtUsd(v: any) {
  const n = parseFloat(String(v ?? 0));
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function num(v: any) { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; }

function initFields(d: Record<string, any>) {
  return {
    noticeDate:         d.noticeDate        ?? '',
    dueDate:            d.dueDate           ?? '',
    distributionDate:   d.distributionDate  ?? d.dueDate ?? '',
    grossCallUsd:       d.grossCallUsd       ?? '',
    netCallUsd:         d.netCallUsd         ?? d.grossCallUsd ?? '',
    reinvestableUsd:    d.reinvestableUsd    ?? '',
    managementFeeUsd:   d.managementFeeUsd   ?? '',
    callPct:            d.callPct != null ? (d.callPct * 100).toFixed(3).replace(/\.?0+$/, '') : '',
    distributionUsd:    d.distributionUsd    ?? '',
    returnOfCapitalUsd: d.returnOfCapitalUsd ?? '',
    gainUsd:            d.gainUsd            ?? '',
    interestUsd:        d.interestUsd        ?? '',
    navUsd:             d.navUsd             ?? '',
    navDate:            d.navDate            ?? '',
    period:             d.period             ?? '',
    wireReference:      d.wireReference      ?? '',
  };
}

function mergedExtracted(original: Record<string, any>, fields: Record<string, any>) {
  return {
    ...original,
    noticeDate:         fields.noticeDate        || null,
    dueDate:            fields.dueDate           || null,
    distributionDate:   fields.distributionDate  || null,
    grossCallUsd:       num(fields.grossCallUsd),
    netCallUsd:         num(fields.netCallUsd),
    reinvestableUsd:    num(fields.reinvestableUsd),
    managementFeeUsd:   num(fields.managementFeeUsd),
    callPct:            fields.callPct !== '' ? num(fields.callPct) / 100 : 0,
    distributionUsd:    num(fields.distributionUsd),
    returnOfCapitalUsd: num(fields.returnOfCapitalUsd),
    gainUsd:            num(fields.gainUsd),
    interestUsd:        num(fields.interestUsd),
    navUsd:             num(fields.navUsd),
    navDate:            fields.navDate       || null,
    period:             fields.period        || null,
    wireReference:      fields.wireReference || null,
  };
}

/* ── Editable field row ─────────────────────────────────────────────────── */
function FieldRow({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: any; onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date'; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t theme-divider">
      <span className="theme-text-muted text-xs w-44 flex-shrink-0">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? (type === 'number' ? '0' : '')}
        step={type === 'number' ? 'any' : undefined}
        className="theme-input border rounded-lg px-2.5 py-1 text-xs text-right flex-1 min-w-0"
      />
    </div>
  );
}

function Section({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="px-4 py-2 theme-table-head border-b theme-divider">
      <span className="text-[10px] font-bold theme-text-muted uppercase tracking-widest">{icon} {title}</span>
    </div>
  );
}

/* ── Inline field editor (shared between single and batch review) ─────── */
function FieldEditor({
  type, fields, set,
}: {
  type:   string;
  fields: Record<string, any>;
  set:    (k: string, v: string) => void;
}) {
  const isCall = type === 'capital_call' || type === 'capital_and_distribution';
  const isDist = type === 'distribution' || type === 'capital_and_distribution';
  const isNav  = type === 'financial_statement';

  return (
    <div>
      {isCall && (
        <div>
          <Section icon="📋" title="Capital Call" />
          <FieldRow label="Notice Date"         type="date"   value={fields.noticeDate}       onChange={v => set('noticeDate', v)} />
          <FieldRow label="Due Date"            type="date"   value={fields.dueDate}          onChange={v => set('dueDate', v)} />
          <FieldRow label="Gross Call (USD)"    type="number" value={fields.grossCallUsd}     onChange={v => set('grossCallUsd', v)} />
          <FieldRow label="Net Call (USD)"      type="number" value={fields.netCallUsd}       onChange={v => set('netCallUsd', v)} />
          <FieldRow label="Reinvestable (USD)"  type="number" value={fields.reinvestableUsd}  onChange={v => set('reinvestableUsd', v)} />
          <FieldRow label="Mgmt Fee (USD)"      type="number" value={fields.managementFeeUsd} onChange={v => set('managementFeeUsd', v)} />
          <FieldRow label="Call % (e.g. 4.9)"   type="number" value={fields.callPct}          onChange={v => set('callPct', v)} placeholder="e.g. 4.9" />
          <FieldRow label="Wire Reference"                    value={fields.wireReference}    onChange={v => set('wireReference', v)} />
        </div>
      )}
      {isDist && (
        <div>
          <Section icon="💰" title="Distribution" />
          <FieldRow label="Distribution Date"       type="date"   value={fields.distributionDate}   onChange={v => set('distributionDate', v)} />
          <FieldRow label="Total Amount (USD)"      type="number" value={fields.distributionUsd}    onChange={v => set('distributionUsd', v)} />
          <FieldRow label="Return of Capital (USD)" type="number" value={fields.returnOfCapitalUsd} onChange={v => set('returnOfCapitalUsd', v)} />
          <FieldRow label="Gain (USD)"              type="number" value={fields.gainUsd}            onChange={v => set('gainUsd', v)} />
          <FieldRow label="Interest (USD)"          type="number" value={fields.interestUsd}        onChange={v => set('interestUsd', v)} />
          <FieldRow label="Reinvestable (USD)"      type="number" value={fields.reinvestableUsd}    onChange={v => set('reinvestableUsd', v)} />
        </div>
      )}
      {isNav && (
        <div>
          <Section icon="📊" title="Financial Statement" />
          <FieldRow label="NAV Date"  type="date"   value={fields.navDate} onChange={v => set('navDate', v)} />
          <FieldRow label="NAV (USD)" type="number" value={fields.navUsd}  onChange={v => set('navUsd', v)} />
          <FieldRow label="Period"                  value={fields.period}  onChange={v => set('period', v)} placeholder="e.g. Q4 2024" />
        </div>
      )}
      {!isCall && !isDist && !isNav && (
        <p className="text-xs theme-text-muted px-4 py-3">No structured fields — approve to record the notice.</p>
      )}
    </div>
  );
}

/* ── Extraction log panel (shared) ─────────────────────────────────────── */
function ExtractionLog({ lines }: { lines: string[] }) {
  return (
    <details className="border theme-divider rounded-xl overflow-hidden">
      <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none theme-table-head hover:opacity-80 transition-opacity">
        <span className="text-xs">🔍</span>
        <span className="text-[10px] font-bold theme-text-muted uppercase tracking-widest">AI Extraction Log</span>
        <span className="text-[10px] theme-text-muted ml-auto">{lines.length} entries ▾</span>
      </summary>
      <div className="px-4 py-3 space-y-0.5 max-h-48 overflow-y-auto">
        {lines.map((line, i) => (
          <p key={i} className="text-[10px] font-mono leading-relaxed"
            style={{ color: line.startsWith('ERROR') ? '#f87171' : line.startsWith('Warning') ? '#fbbf24' : line.startsWith('Note') ? '#60a5fa' : undefined }}
          >
            {line.startsWith('ERROR') ? '✗ ' : line.startsWith('Warning') ? '⚠ ' : line.startsWith('Note') ? '→ ' : '  '}
            {line}
          </p>
        ))}
      </div>
    </details>
  );
}

/* ── Batch Review Modal ────────────────────────────────────────────────── */
interface RowState {
  notice:   any;
  fields:   Record<string, any>;
  rowStatus: 'pending' | 'approved' | 'skipped' | 'busy';
  expanded: boolean;
}

function BatchReviewModal({
  noticeIds, fundId, onClose,
}: {
  noticeIds: string[];
  fundId:    string;
  onClose:   () => void;
}) {
  const [rows,    setRows]    = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => {
    Promise.all(noticeIds.map(id => noticesAPI.get(id)))
      .then(results => {
        setRows(results.map(r => {
          const n = r.data;
          const d = n.extracted_data ?? {};
          return { notice: n, fields: initFields(d), rowStatus: 'pending', expanded: false };
        }));
      })
      .catch(() => toast.error('Failed to load notices'))
      .finally(() => setLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }
  function setField(idx: number, k: string, v: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, fields: { ...r.fields, [k]: v } } : r));
  }

  async function approveRow(idx: number) {
    const row = rows[idx];
    updateRow(idx, { rowStatus: 'busy' });
    try {
      await noticesAPI.updateExtracted(row.notice.id, mergedExtracted(row.notice.extracted_data ?? {}, row.fields));
      await noticesAPI.approve(row.notice.id, fundId);
      updateRow(idx, { rowStatus: 'approved', expanded: false });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? `Approval failed for ${row.notice.file_name}`);
      updateRow(idx, { rowStatus: 'pending' });
    }
  }

  async function approveAll() {
    setApprovingAll(true);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].rowStatus === 'pending') await approveRow(i);
    }
    setApprovingAll(false);
  }

  const doneCount    = rows.filter(r => r.rowStatus === 'approved' || r.rowStatus === 'skipped').length;
  const pendingCount = rows.filter(r => r.rowStatus === 'pending').length;

  function primaryAmount(row: RowState) {
    const t = row.notice?.notice_type ?? '';
    if (t === 'capital_call' || t === 'capital_and_distribution') return fmtUsd(row.fields.grossCallUsd);
    if (t === 'distribution') return fmtUsd(row.fields.distributionUsd);
    if (t === 'financial_statement') return fmtUsd(row.fields.navUsd);
    return '—';
  }

  function primaryDate(row: RowState) {
    const t = row.notice?.notice_type ?? '';
    if (t === 'distribution') return row.fields.distributionDate || '—';
    if (t === 'financial_statement') return row.fields.navDate || '—';
    return row.fields.dueDate || '—';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        style={{ borderColor: 'rgba(99,102,241,0.35)' }}>

        {/* ── Header ── */}
        <div className="px-6 py-4 border-b theme-divider flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold theme-text">
              Batch Review
              {!loading && <span className="ml-2 text-sm font-normal theme-text-muted">· {rows.length} notice{rows.length !== 1 ? 's' : ''}</span>}
            </h2>
            <p className="text-xs theme-text-muted mt-0.5">
              Edit any fields the AI got wrong, then approve to add to the ledger.
            </p>
          </div>
          {pendingCount > 0 && !loading && (
            <button
              onClick={approveAll}
              disabled={approvingAll}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              style={{ background: '#10b981' }}
            >
              {approvingAll
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : '✓'}
              Approve All ({pendingCount})
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm theme-text-muted">Loading extractions…</span>
            </div>
          ) : (
            <div>
              {rows.map((row, idx) => {
                const grade = (row.notice?.confidence_grade ?? 'low') as keyof typeof GRADE;
                const gs    = GRADE[grade];
                const isDone = row.rowStatus === 'approved' || row.rowStatus === 'skipped';
                const isBusy = row.rowStatus === 'busy';

                return (
                  <div key={row.notice?.id ?? idx}
                    className="border-b theme-divider transition-all"
                    style={{ opacity: isDone ? 0.5 : 1 }}>

                    {/* ── Summary row ── */}
                    <div className="flex items-center gap-3 px-5 py-3">
                      {/* Status indicator */}
                      <div className="w-5 flex-shrink-0 flex items-center justify-center">
                        {isBusy && <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
                        {row.rowStatus === 'approved' && <span className="text-emerald-500 font-bold text-sm">✓</span>}
                        {row.rowStatus === 'skipped'  && <span className="text-slate-400 text-sm">–</span>}
                        {row.rowStatus === 'pending'  && <span className="w-2 h-2 rounded-full bg-indigo-400 block" />}
                      </div>

                      {/* File name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium theme-text truncate">{row.notice?.file_name ?? '—'}</p>
                      </div>

                      {/* Type badge */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'rgba(99,102,241,0.10)', color: '#6366f1' }}>
                        {TYPE_LABELS[row.notice?.notice_type] ?? row.notice?.notice_type ?? '—'}
                      </span>

                      {/* Amount */}
                      <span className="text-xs font-mono font-semibold theme-text w-24 text-right flex-shrink-0">
                        {primaryAmount(row)}
                      </span>

                      {/* Date */}
                      <span className="text-xs theme-text-muted w-24 text-right flex-shrink-0">
                        {primaryDate(row)}
                      </span>

                      {/* Confidence */}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1 flex-shrink-0"
                        style={{ background: gs.bg, color: gs.txt }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: gs.dot }} />
                        {gs.label}
                      </span>

                      {/* Actions */}
                      {!isDone && !isBusy && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => updateRow(idx, { expanded: !row.expanded })}
                            className="text-xs px-2.5 py-1 rounded-lg border theme-divider theme-text-muted hover:theme-text transition-colors"
                          >
                            {row.expanded ? 'Hide ▴' : 'Edit ▾'}
                          </button>
                          <button
                            onClick={() => approveRow(idx)}
                            className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white transition-colors"
                            style={{ background: '#10b981' }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => updateRow(idx, { rowStatus: 'skipped', expanded: false })}
                            className="text-xs px-2.5 py-1 rounded-lg border theme-divider theme-text-muted hover:theme-text transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      )}
                      {row.rowStatus === 'skipped' && (
                        <button
                          onClick={() => updateRow(idx, { rowStatus: 'pending' })}
                          className="text-[10px] theme-text-muted hover:theme-text transition-colors flex-shrink-0"
                        >
                          undo
                        </button>
                      )}
                    </div>

                    {/* ── Inline field editor (expanded) ── */}
                    {row.expanded && (
                      <div className="mx-5 mb-3 space-y-2">
                        <div className="border theme-divider rounded-xl overflow-hidden">
                          <FieldEditor
                            type={row.notice?.notice_type ?? ''}
                            fields={row.fields}
                            set={(k, v) => setField(idx, k, v)}
                          />
                        </div>
                        {/* Extraction log */}
                        {Array.isArray(row.notice?.extracted_data?.extractionLog) && row.notice.extracted_data.extractionLog.length > 0 && (
                          <ExtractionLog lines={row.notice.extracted_data.extractionLog} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t theme-divider flex items-center justify-between flex-shrink-0">
          <span className="text-xs theme-text-muted">
            {doneCount} of {rows.length} resolved
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 border theme-divider rounded-xl text-sm theme-text-muted hover:theme-text transition-colors"
          >
            {doneCount === rows.length ? 'Done' : 'Close — review remaining in Notices'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Status icon for queue rows ─────────────────────────────────────────── */
function QueueIcon({ status }: { status: QueueItem['status'] }) {
  if (status === 'processing') return <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />;
  if (status === 'done')       return <span className="text-emerald-500 text-xs font-bold flex-shrink-0">✓</span>;
  if (status === 'failed')     return <span className="text-red-400 text-xs font-bold flex-shrink-0">✗</span>;
  return <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0 mt-0.5" />;
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function FundUploadBar({ funds, onUploaded }: Props) {
  const { t } = useTranslation();

  const [fundId,     setFundId]     = useState('');
  const [dragging,   setDragging]   = useState(false);
  const [running,    setRunning]    = useState(false);
  const [queue,      setQueue]      = useState<QueueItem[]>(readStoredQueue);
  const [showBatch,  setShowBatch]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist queue to localStorage whenever it changes.
  // 'processing' items are saved as 'waiting' with wasProcessing=true so the
  // pill doesn't falsely show "failed" while a file is still uploading. If the
  // user navigates away before the upload finishes, readStoredQueue converts
  // wasProcessing items back to 'failed' on the next mount.
  useEffect(() => {
    const stored: StoredItem[] = queue.map(item => ({
      id:           item.id,
      fileName:     item.fileName,
      fileSize:     item.fileSize,
      status:       item.status === 'processing' ? 'waiting' : item.status,
      noticeId:     item.noticeId,
      error:        item.status === 'processing' ? null : item.error,
      wasProcessing: item.status === 'processing',
    }));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new CustomEvent('ims-queue-update'));
  }, [queue]);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setQueue(prev => {
      const existingNames = new Set(prev.map(q => q.fileName));
      const novel = arr
        .filter(f => f.name.toLowerCase().endsWith('.pdf') && !existingNames.has(f.name))
        .map(f => ({
          id:       Math.random().toString(36).slice(2),
          file:     f,
          fileName: f.name,
          fileSize: f.size,
          status:   'waiting' as const,
          noticeId: null,
          error:    null,
          restored: false,
        }));
      if (novel.length < arr.length - (arr.length - arr.filter(f => f.name.toLowerCase().endsWith('.pdf')).length)) {
        toast.error('Some files skipped — only PDF files are accepted or already queued');
      }
      return [...prev, ...novel];
    });
  }

  function removeItem(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  function clearDone() {
    setQueue(prev => {
      const filtered = prev.filter(q => q.status !== 'done');
      if (filtered.length === 0) localStorage.removeItem(QUEUE_KEY);
      return filtered;
    });
  }

  const runQueue = useCallback(async (currentQueue: QueueItem[], currentFundId: string) => {
    if (!currentFundId) { toast.error('Choose which fund these PDFs belong to first'); return; }
    setRunning(true);

    for (let i = 0; i < currentQueue.length; i++) {
      if (currentQueue[i].status !== 'waiting') continue;
      if (!currentQueue[i].file) continue;  // restored item — no File object, skip

      // Mark as processing
      setQueue(prev => prev.map(q => q.id === currentQueue[i].id ? { ...q, status: 'processing' } : q));

      try {
        const form = new FormData();
        form.append('file', currentQueue[i].file!);
        const r = await fundReportsAPI.upload(currentFundId, form);
        const noticeId = r.data?.id ?? null;
        setQueue(prev => prev.map(q => q.id === currentQueue[i].id
          ? { ...q, status: 'done', noticeId }
          : q));
      } catch (err: any) {
        const msg = err?.response?.data?.detail ?? 'Upload failed';
        setQueue(prev => prev.map(q => q.id === currentQueue[i].id
          ? { ...q, status: 'failed', error: msg }
          : q));
      }
    }

    setRunning(false);
  }, []);

  function startUpload() {
    runQueue(queue, fundId);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  const waitingCount    = queue.filter(q => q.status === 'waiting').length;
  const processingCount = queue.filter(q => q.status === 'processing').length;
  const doneCount       = queue.filter(q => q.status === 'done').length;
  const doneIds         = queue.filter(q => q.status === 'done' && q.noticeId).map(q => q.noticeId!);

  return (
    <>
      {/* ── Batch review modal ── */}
      {showBatch && doneIds.length > 0 && (
        <BatchReviewModal
          noticeIds={doneIds}
          fundId={fundId}
          onClose={() => { setShowBatch(false); clearDone(); onUploaded(); }}
        />
      )}

      <div className="theme-card border theme-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b theme-border" style={{ background: 'rgba(99,102,241,0.04)' }}>
          <p className="text-sm font-bold theme-text">{t('fundUpload.title')}</p>
          <p className="text-xs theme-text-muted mt-0.5">
            Select one or more PDFs — AI extracts fields, you review before the ledger updates
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Top row: fund selector + drop zone + upload button ── */}
          <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch">
            {/* Fund selector */}
            <div className="lg:w-60 flex-shrink-0 space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">
                {t('fundUpload.whichFund')}
              </label>
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

            {/* Drop zone */}
            <div className="flex-1">
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => !running && inputRef.current?.click()}
                className="rounded-xl border-2 border-dashed transition-all cursor-pointer select-none text-center h-full flex flex-col items-center justify-center"
                style={{
                  borderColor: dragging ? '#6366f1' : 'rgba(99,102,241,0.3)',
                  background:  dragging ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.03)',
                  padding:     '16px 20px',
                  minHeight:   '72px',
                }}
              >
                <p className="text-sm font-semibold theme-text">📄 {t('fundUpload.dropPdf')}</p>
                <p className="text-[10px] theme-text-muted mt-1">
                  Drop one or multiple PDFs · or click to browse
                </p>
              </div>
              <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={onPick} />
            </div>

            {/* Upload button */}
            <div className="flex-shrink-0 flex items-end">
              <button
                onClick={startUpload}
                disabled={running || waitingCount === 0 || !fundId}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full lg:w-auto whitespace-nowrap"
              >
                {running
                  ? <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing…
                    </span>
                  : waitingCount > 0
                    ? `Upload ${waitingCount} file${waitingCount !== 1 ? 's' : ''}`
                    : t('fundUpload.upload')}
              </button>
            </div>
          </div>

          {/* ── Queue list ── */}
          {queue.length > 0 && (
            <div className="rounded-xl border theme-divider overflow-hidden">
              {queue.map(item => (
                <div key={item.id}
                  className="flex items-start gap-3 px-4 py-2.5 border-b theme-divider last:border-b-0 text-sm"
                  style={{ background: item.status === 'failed' ? 'rgba(239,68,68,0.04)' : item.status === 'done' ? 'rgba(16,185,129,0.04)' : undefined }}>
                  <div className="flex items-center mt-0.5">
                    <QueueIcon status={item.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium theme-text truncate">{item.fileName}</p>
                    {item.status === 'failed' && (
                      <p className="text-[10px] text-red-400 mt-0.5 truncate">{item.error}</p>
                    )}
                    {item.restored && item.status === 'waiting' && (
                      <p className="text-[10px] theme-text-muted mt-0.5">Previously queued — add file again to retry</p>
                    )}
                  </div>
                  <span className="text-[10px] theme-text-muted flex-shrink-0 mt-0.5">{fmtSize(item.fileSize)}</span>
                  {(item.status === 'waiting' || item.status === 'failed') && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-[10px] theme-text-muted hover:text-red-400 transition-colors flex-shrink-0 ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {/* Queue footer actions */}
              <div className="flex items-center justify-between px-4 py-2 border-t theme-divider"
                style={{ background: 'rgba(99,102,241,0.02)' }}>
                <div className="flex items-center gap-3">
                  {doneCount > 0 && (
                    <button onClick={clearDone} className="text-[10px] theme-text-muted hover:theme-text transition-colors">
                      Clear done ({doneCount})
                    </button>
                  )}
                  {processingCount > 0 && (
                    <span className="text-[10px] theme-text-muted">
                      Processing {processingCount}…
                    </span>
                  )}
                </div>
                {doneIds.length > 0 && (
                  <button
                    onClick={() => setShowBatch(true)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-colors"
                    style={{ background: '#10b981' }}
                  >
                    Review &amp; Approve {doneIds.length} notice{doneIds.length !== 1 ? 's' : ''} →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

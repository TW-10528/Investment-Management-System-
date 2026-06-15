/**
 * FundDocuments — per-fund document list (read + delete + review pending).
 * Uploading is handled by the shared FundUploadBar at the top of the funds page.
 * Documents are shown OLDEST first → latest last (by notice/due date).
 * Deleting a document reverses the capital call / distribution it created.
 */
import { useCallback, useEffect, useState } from 'react';
import { fundReportsAPI, noticesAPI } from '../services/api';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

interface Props {
  fundId:   string;
  canEdit:  boolean;
  onChanged: () => void;
}

const C = { indigo: '#4f46e5', emerald: '#10b981', red: '#ef4444', violet: '#8b5cf6' };

const TYPE_META: Record<string, { label: string; badge: string; color: string }> = {
  capital_call:             { label: 'Capital Call',          badge: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',  color: C.indigo  },
  distribution:             { label: 'Distribution',          badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', color: C.emerald },
  capital_and_distribution: { label: 'Capital & Distribution', badge: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',       color: '#06b6d4' },
  financial_statement:      { label: 'Financial Statement',   badge: 'text-violet-400 bg-violet-500/10 border-violet-500/25',  color: C.violet  },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Pending Review', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25'     },
  approved: { label: 'Approved',       cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  rejected: { label: 'Rejected',       cls: 'text-red-400 bg-red-500/10 border-red-500/25'           },
};

function gradeStyle(grade: string) {
  if (grade === 'high')   return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  if (grade === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  return 'text-slate-400 bg-slate-500/10 border-slate-500/25';
}

function docTime(d: any): number {
  const t = new Date(d.due_date || d.notice_date || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/* ── Review modal helpers ─────────────────────────────────────────────────── */
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

function FieldRow({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: any; onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date'; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t theme-divider">
      <span className="theme-text-muted text-xs w-44 flex-shrink-0">{label}</span>
      <input
        type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? (type === 'number' ? '0' : '')}
        step={type === 'number' ? 'any' : undefined}
        className="theme-input border rounded-lg px-2.5 py-1 text-xs text-right flex-1 min-w-0"
      />
    </div>
  );
}

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="px-4 py-2 theme-table-head border-b theme-divider">
      <span className="text-[10px] font-bold theme-text-muted uppercase tracking-widest">{icon} {title}</span>
    </div>
  );
}

function DocFieldEditor({ type, fields, set }: {
  type: string; fields: Record<string, any>; set: (k: string, v: string) => void;
}) {
  const isCall = type === 'capital_call' || type === 'capital_and_distribution';
  const isDist = type === 'distribution' || type === 'capital_and_distribution';
  const isNav  = type === 'financial_statement';
  return (
    <div>
      {isCall && (
        <div>
          <SectionHead icon="📋" title="Capital Call" />
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
          <SectionHead icon="💰" title="Distribution" />
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
          <SectionHead icon="📊" title="Financial Statement" />
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

/* ── Extraction log panel ────────────────────────────────────────────────── */
function ExtractionLog({ lines }: { lines: string[] }) {
  return (
    <details className="border-t theme-divider">
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

/* ── Inline review modal ─────────────────────────────────────────────────── */
function ReviewModal({ noticeId, fundId, onDone, onClose }: {
  noticeId: string; fundId: string; onDone: () => void; onClose: () => void;
}) {
  const [notice,  setNotice]  = useState<any>(null);
  const [fields,  setFields]  = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    noticesAPI.get(noticeId)
      .then(r => {
        const n = r.data;
        setNotice(n);
        setFields(initFields(n.extracted_data ?? {}));
      })
      .catch(() => toast.error('Failed to load notice'))
      .finally(() => setLoading(false));
  }, [noticeId]);

  function setField(k: string, v: string) {
    setFields(prev => ({ ...prev, [k]: v }));
  }

  async function approve() {
    if (!notice) return;
    setSaving(true);
    try {
      await noticesAPI.updateExtracted(notice.id, mergedExtracted(notice.extracted_data ?? {}, fields));
      await noticesAPI.approve(notice.id, fundId);
      toast.success('Approved — ledger updated.');
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Approval failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        style={{ borderColor: 'rgba(99,102,241,0.35)' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b theme-divider flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold theme-text">Review Document</h2>
            {notice && <p className="text-xs theme-text-muted mt-0.5 truncate max-w-xs">{notice.file_name}</p>}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center theme-text-muted hover:theme-text transition-colors"
            style={{ background: 'rgba(100,116,139,0.1)' }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm theme-text-muted">Loading…</span>
            </div>
          ) : notice && (
            <>
              <DocFieldEditor type={notice.notice_type ?? ''} fields={fields} set={setField} />
              {Array.isArray(notice.extracted_data?.extractionLog) && notice.extracted_data.extractionLog.length > 0 && (
                <ExtractionLog lines={notice.extracted_data.extractionLog} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t theme-divider flex items-center justify-end gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 border theme-divider rounded-xl text-sm theme-text-muted hover:theme-text transition-colors">
            Close
          </button>
          <button onClick={approve} disabled={saving || loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2"
            style={{ background: '#10b981' }}>
            {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Approve &amp; Add to Ledger
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function FundDocuments({ fundId, canEdit, onChanged }: Props) {
  const [docs,        setDocs]        = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fundReportsAPI.list(fundId)
      .then(r => setDocs([...(r.data ?? [])].sort((a, b) => docTime(a) - docTime(b))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fundId]);

  useEffect(() => { load(); }, [load]);

  async function del(doc: any) {
    if (!confirm('Delete this document? The capital call / distribution it created will also be removed and the ledger recalculated.')) return;
    try {
      await fundReportsAPI.delete(doc.id);
      toast.success('Document deleted — ledger updated.');
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Failed to delete');
    }
  }

  const pendingCount = docs.filter(d => d.status === 'pending').length;

  return (
    <div>
      {/* Inline review modal */}
      {reviewDocId && (
        <ReviewModal
          noticeId={reviewDocId}
          fundId={fundId}
          onDone={() => { setReviewDocId(null); load(); onChanged(); }}
          onClose={() => setReviewDocId(null)}
        />
      )}

      {/* Toolbar */}
      <div className="px-5 py-3 flex items-center justify-between border-b theme-border"
           style={{ background: 'rgba(99,102,241,0.06)' }}>
        <p className="text-sm font-semibold theme-text">
          Documents
          <span className="ml-2 text-xs font-normal theme-text-muted">{docs.length} uploaded · oldest first</span>
        </p>
      </div>

      {/* Pending banner */}
      {!loading && pendingCount > 0 && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <span className="text-amber-400 text-base flex-shrink-0">⚠</span>
          <p className="text-sm text-amber-400 font-medium">
            {pendingCount} document{pendingCount !== 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} review —
            approve {pendingCount === 1 ? 'it' : 'them'} below to update the ledger.
          </p>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <p className="px-5 py-8 text-sm theme-text-muted text-center">Loading documents…</p>
      ) : docs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm theme-text-muted">No documents uploaded yet.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Use "Upload a fund document" at the top of the page to add one.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['File', 'Type / Status', 'Due Date', 'Amount (USD)', 'Confidence', ''].map(h => (
                  <th key={h} className={`px-3 py-2.5 font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h === 'File' || h === '' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {docs.map(doc => {
                const t   = TYPE_META[doc.notice_type] ?? TYPE_META.capital_call;
                const sm  = STATUS_META[doc.status]    ?? STATUS_META.approved;
                const amount = doc.notice_type === 'distribution'        ? doc.distribution_usd
                             : doc.notice_type === 'financial_statement'  ? null
                             : doc.gross_call_usd;
                return (
                  <tr key={doc.id} className="theme-row-hover"
                    style={{ background: doc.status === 'pending' ? 'rgba(245,158,11,0.03)' : undefined }}>
                    <td className="px-3 py-3 theme-text max-w-[22rem] truncate" title={doc.file_name}>
                      📄 {doc.file_name}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col gap-1 items-end">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${t.badge}`}>
                          {t.label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sm.cls}`}>
                          {sm.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right theme-text-muted whitespace-nowrap">{doc.due_date ?? doc.notice_date ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: t.color }}>
                      {amount ? fmt.usd(Number(amount)) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${gradeStyle(doc.confidence_grade)}`}>
                        {doc.confidence_grade ?? 'low'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {canEdit && doc.status === 'pending' && (
                          <button
                            onClick={() => setReviewDocId(doc.id)}
                            className="px-2.5 py-1 rounded text-xs font-semibold border transition-colors"
                            style={{ borderColor: '#6366f1', color: '#6366f1' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                          >
                            Review
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => del(doc)}
                            className="px-2 py-1 rounded text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

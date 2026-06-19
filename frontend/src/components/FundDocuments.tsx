/**
 * FundDocuments — per-fund document list (read + delete).
 * Uploading is handled by the shared FundUploadBar at the top of the funds page.
 * Documents are shown OLDEST first → latest last (by notice/due date).
 * Deleting a document reverses the capital call / distribution it created.
 */
import { useCallback, useEffect, useState } from 'react';
import { fundReportsAPI } from '../services/api';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

function PdfModal({ docId, fileName, onClose }: { docId: string; fileName: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objUrl = '';
    fundReportsAPI.file(docId)
      .then(r => { objUrl = URL.createObjectURL(r.data); setUrl(objUrl); })
      .catch(() => toast.error('Could not load file'));
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [docId]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b theme-border flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-sm font-semibold theme-text truncate">📄 {fileName}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                 className="px-3 py-1.5 rounded-lg text-xs font-medium border theme-border theme-text-muted hover:theme-text transition-colors">
                Open in new tab ↗
              </a>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center theme-text-muted hover:theme-text text-lg">×</button>
          </div>
        </div>
        <div className="flex-1 min-h-0" style={{ background: '#525659' }}>
          {url
            ? <iframe src={url} title={fileName} className="w-full h-full" />
            : <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white/30 border-t-transparent rounded-full animate-spin" />
              </div>
          }
        </div>
      </div>
    </div>
  );
}

interface Props {
  fundId:    string;
  canEdit:   boolean;
  onChanged: () => void;
  currency?: string;
}

const C = { indigo: '#4f46e5', emerald: '#10b981', red: '#ef4444', violet: '#8b5cf6' };

const TYPE_META: Record<string, { label: string; badge: string; color: string }> = {
  capital_call:             { label: 'Capital Call',          badge: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',  color: C.indigo  },
  distribution:             { label: 'Distribution',          badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', color: C.emerald },
  capital_and_distribution: { label: 'Capital & Distribution', badge: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',       color: '#06b6d4' },
  financial_statement:      { label: 'Financial Statement',   badge: 'text-violet-400 bg-violet-500/10 border-violet-500/25',  color: C.violet  },
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

export default function FundDocuments({ fundId, canEdit, onChanged, currency }: Props) {
  const [docs, setDocs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState<{ id: string; name: string } | null>(null);

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

  return (
    <div>
      {/* Toolbar */}
      <div className="px-5 py-3 flex items-center justify-between border-b theme-border"
           style={{ background: 'rgba(99,102,241,0.06)' }}>
        <p className="text-sm font-semibold theme-text">
          Documents
          <span className="ml-2 text-xs font-normal theme-text-muted">{docs.length} uploaded · oldest first</span>
        </p>
      </div>

      {/* Document list */}
      {loading ? (
        <p className="px-5 py-8 text-sm theme-text-muted text-center">Loading documents…</p>
      ) : docs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm theme-text-muted">No documents uploaded yet.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Use "Upload a fund document" at the top of the page to add one.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['File', 'Type', 'Notice Date', 'Due Date', currency === 'JPY' ? 'Amount (JPY)' : 'Amount (USD)', 'Confidence', ''].map(h => (
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h === 'File' || h === '' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {docs.map(doc => {
                const t = TYPE_META[doc.notice_type] ?? TYPE_META.capital_call;
                const amount = doc.notice_type === 'distribution' ? doc.distribution_usd
                             : doc.notice_type === 'financial_statement' ? null
                             : doc.gross_call_usd;
                return (
                  <tr key={doc.id} className="theme-row-hover">
                    <td className="px-4 py-3 theme-text max-w-[18rem] truncate" title={doc.file_name}>
                      📄 {doc.file_name}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${t.badge}`}>
                        {t.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right theme-text-muted whitespace-nowrap">{doc.notice_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right theme-text-muted whitespace-nowrap">{doc.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: t.color }}>
                      {amount ? (currency === 'JPY' ? fmt.jpy(Number(amount)) : fmt.usd(Number(amount))) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${gradeStyle(doc.confidence_grade)}`}>
                        {doc.confidence_grade ?? 'low'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button onClick={() => setViewDoc({ id: doc.id, name: doc.file_name })}
                        className="px-2 py-1 rounded text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                        View
                      </button>
                      {canEdit && (
                        <button onClick={() => del(doc)}
                          className="px-2 py-1 rounded text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewDoc && (
        <PdfModal docId={viewDoc.id} fileName={viewDoc.name} onClose={() => setViewDoc(null)} />
      )}
    </div>
  );
}

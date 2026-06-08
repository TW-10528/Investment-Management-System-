/**
 * FundDocuments — per-fund document list (read + delete).
 * Uploading is handled by the shared FundUploadBar at the top of the funds page.
 * Documents are shown OLDEST first → latest last (by notice/due date).
 * Deleting a document reverses the capital call / distribution it created, so the
 * fund's ledger/KPIs and the dashboard refresh via onChanged().
 */
import { useCallback, useEffect, useState } from 'react';
import { fundReportsAPI } from '../services/api';
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

function gradeStyle(grade: string) {
  if (grade === 'high')   return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  if (grade === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  return 'text-slate-400 bg-slate-500/10 border-slate-500/25';
}

// Oldest first: sort by due date, then notice date.
function docTime(d: any): number {
  const t = new Date(d.due_date || d.notice_date || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function FundDocuments({ fundId, canEdit, onChanged }: Props) {
  const [docs, setDocs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
          {canEdit && <p className="text-xs theme-text-muted mt-1">Use “Upload a fund document” at the top of the page to add one.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['File', 'Type', 'Notice Date', 'Due Date', 'Amount (USD)', 'Confidence', ''].map(h => (
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
                      {amount ? fmt.usd(Number(amount)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${gradeStyle(doc.confidence_grade)}`}>
                        {doc.confidence_grade ?? 'low'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
    </div>
  );
}

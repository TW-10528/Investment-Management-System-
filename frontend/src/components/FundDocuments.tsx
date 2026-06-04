/**
 * FundDocuments — per-fund document list (read + delete + NB detail).
 * Uploading is handled by the shared FundUploadBar at the top of the funds page.
 * Documents are shown OLDEST first → latest last (by notice/due date).
 * Deleting a document reverses the capital call / distribution it created, so the
 * fund's ledger/KPIs and the dashboard refresh via onChanged().
 *
 * NB Real Estate documents can be expanded to reveal the rich extractor output
 * (capital-call / distribution breakdown, calculated Excel fields, validation).
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
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

const money = (v: any) => (v == null || v === '' ? '—' : fmt.usd(Number(v)));

// ── NB rich-report detail panel ────────────────────────────────────────────────
function Bool({ v }: { v: boolean | null | undefined }) {
  if (v == null) return <span className="theme-text-muted">—</span>;
  return v
    ? <span className="text-emerald-400 font-bold">✓ match</span>
    : <span className="text-red-400 font-bold">✗ mismatch</span>;
}

function BreakdownTable({ title, rows, color }: { title: string; rows: any[]; color: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest theme-text-muted mb-1.5">{title}</p>
      <div className="rounded-lg border theme-border overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y theme-border">
            {rows.map((it, i) => (
              <tr key={i} className="theme-row-hover">
                <td className="px-3 py-2 theme-text">{it.label}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap"
                    style={{ color: Number(it.amount) < 0 ? C.red : color }}>
                  {money(it.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NbReportPanel({ report }: { report: any }) {
  const f      = report?.final_excel_fields ?? {};
  const bd     = report?.breakdown ?? {};
  const val    = report?.validation ?? {};
  const checks = val?.calculation_checks ?? {};

  const excelRows: [string, any][] = [
    ['B · Capital Contribution',    f.capital_contribution_amount],
    ['C · Distribution Received',   f.distribution_amount_received],
    ['D · Reinvestable',            f.reinvestable_amount],
    ['E · Cumulative Contributions', f.cumulative_capital_contributions],
    ['F · Remaining Commitment',    f.remaining_commitment],
    ['G · Current Cash Flow',       f.current_transaction_cash_flow],
    ['Cumulative Cash Flow',        f.cumulative_cash_flow],
    ['Net Management Fee',          f.net_management_fee],
    ['Management Fee Rebate',       f.management_fee_rebate],
    ['Additional Payment',          f.additional_payment_due_to_subsequent_closing],
    ['Tax Expense (excl. cash flow)', f.tax_expense],
    ['Amount Due from LP',          f.amount_due_from_limited_partner],
  ];

  const checkRows: [string, boolean | null | undefined][] = [
    ['Capital-call breakdown total matches', checks.is_capital_call_breakdown_matched],
    ['Distribution breakdown total matches', checks.is_distribution_breakdown_matched],
    ['Reported amount due matches',          checks.is_amount_due_matched],
    ['Cumulative contributions vs report',   checks.is_cumulative_capital_contributions_matched_with_report],
    ['Remaining commitment vs report',       checks.is_remaining_commitment_matched_with_report],
  ];

  return (
    <div className="p-5 space-y-5" style={{ background: 'rgba(99,102,241,0.04)' }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BreakdownTable title="Capital Call Breakdown" rows={bd.capital_call_breakdown} color={C.indigo} />
        <BreakdownTable title="Distribution Breakdown" rows={bd.distribution_breakdown} color={C.emerald} />
      </div>

      {/* Calculated Excel fields */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest theme-text-muted mb-1.5">Calculated Excel Fields</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px rounded-lg overflow-hidden border theme-border"
             style={{ background: 'var(--color-card-border)' }}>
          {excelRows.map(([label, value]) => (
            <div key={label} className="px-3 py-2 theme-card">
              <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{label}</p>
              <p className="text-sm font-bold tabular-nums theme-text mt-0.5"
                 style={{ color: Number(value) < 0 ? C.red : undefined }}>{money(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Validation */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest theme-text-muted mb-1.5">Validation</p>
        <div className="rounded-lg border theme-border divide-y theme-border">
          {checkRows.map(([label, v]) => (
            <div key={label} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="theme-text">{label}</span>
              <Bool v={v} />
            </div>
          ))}
        </div>
        {Array.isArray(val.missing_excel_fields) && val.missing_excel_fields.length > 0 && (
          <p className="text-[11px] text-amber-400 mt-2">
            Missing fields: {val.missing_excel_fields.join(', ')}
          </p>
        )}
        {f.remarks && <p className="text-[11px] theme-text-muted mt-2 italic">{f.remarks}</p>}
      </div>
    </div>
  );
}

export default function FundDocuments({ fundId, canEdit, onChanged }: Props) {
  const [docs, setDocs]         = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reports, setReports]   = useState<Record<string, any>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fundReportsAPI.list(fundId)
      .then(r => setDocs([...(r.data ?? [])].sort((a, b) => docTime(a) - docTime(b))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fundId]);

  useEffect(() => { load(); }, [load]);

  async function toggleExpand(doc: any) {
    if (expandedId === doc.id) { setExpandedId(null); return; }
    setExpandedId(doc.id);
    if (!reports[doc.id]) {
      setLoadingDetail(true);
      try {
        const r = await fundReportsAPI.get(doc.id);
        setReports(prev => ({ ...prev, [doc.id]: r.data?.nb_report ?? null }));
      } catch {
        setReports(prev => ({ ...prev, [doc.id]: null }));
      } finally {
        setLoadingDetail(false);
      }
    }
  }

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
                const isNb = doc.fund_key === 'nb-real-estate';
                const open = expandedId === doc.id;
                return (
                  <Fragment key={doc.id}>
                  <tr className="theme-row-hover">
                    <td className="px-4 py-3 theme-text max-w-[18rem] truncate" title={doc.file_name}>
                      {isNb && (
                        <button onClick={() => toggleExpand(doc)}
                          className="mr-1.5 text-xs theme-text-muted hover:text-indigo-400 transition-colors"
                          title={open ? 'Hide details' : 'Show extractor details'}>
                          {open ? '▾' : '▸'}
                        </button>
                      )}
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
                  {open && (
                    <tr>
                      <td colSpan={7} className="p-0 border-t theme-border">
                        {loadingDetail && !reports[doc.id]
                          ? <p className="px-5 py-6 text-sm theme-text-muted text-center">Loading extractor details…</p>
                          : reports[doc.id]
                            ? <NbReportPanel report={reports[doc.id]} />
                            : <p className="px-5 py-6 text-sm theme-text-muted text-center">No detailed extractor data for this document.</p>}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

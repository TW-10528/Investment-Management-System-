import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { noticesAPI, fundsAPI } from '../services/api';
import type { NoticeUpload } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

/* ── Constants ───────────────────────────────────────────────────────────── */
const NOTICE_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  capital_call:        { label: 'Capital Call',       icon: '📋', color: 'text-blue-600 dark:text-blue-400' },
  distribution:        { label: 'Distribution',       icon: '💰', color: 'text-emerald-600 dark:text-emerald-400' },
  financial_statement: { label: 'Financial Statement', icon: '📊', color: 'text-violet-600 dark:text-violet-400' },
};

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700',
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-emerald-500', medium: 'bg-amber-500', low: 'bg-red-500',
};

function currentUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}
function canEdit() {
  const r = currentUser().role;
  return r === 'admin' || r === 'finance_manager' || r === 'finance_staff';
}
function isAdmin() { return currentUser().role === 'admin'; }

/* ── Upload Modal ────────────────────────────────────────────────────────── */
function UploadModal({
  funds, onClose, onSuccess,
}: {
  funds: { id: string; fund_name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [noticeType,  setNoticeType]  = useState('capital_call');
  const [fundId,      setFundId]      = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [dragging,    setDragging]    = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') setFile(f);
    else toast.error('Please drop a PDF file');
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!file) { toast.error('Please select a PDF file.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('notice_type', noticeType);
    if (fundId) fd.append('fund_id', fundId);
    setUploading(true);
    try {
      const r = await noticesAPI.upload(fd);
      const conf = r.data.confidence as string;
      toast.success(`Uploaded! Confidence: ${conf.toUpperCase()} — awaiting admin review.`, { duration: 5000 });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Upload failed.');
    } finally { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b theme-divider">
          <div>
            <h2 className="font-bold theme-text">⬆ Upload Notice PDF</h2>
            <p className="text-xs theme-text-muted mt-0.5">Data is extracted automatically for admin review</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500 transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                : file
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/10'
                : 'border-[var(--color-card-border)] hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10'
            }`}
          >
            {file ? (
              <>
                <div className="text-3xl mb-2">📄</div>
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">{file.name}</p>
                <p className="theme-text-muted text-xs mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : (
              <>
                <div className="text-3xl mb-2 opacity-50">📁</div>
                <p className="theme-text-muted text-sm font-medium">Drop PDF here or click to browse</p>
                <p className="theme-text-sub text-xs mt-1">Max 20 MB · PDF only</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Notice type */}
          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-2">Notice Type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(NOTICE_TYPE_META).map(([v, m]) => (
                <button key={v} type="button" onClick={() => setNoticeType(v)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    noticeType === v
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'theme-card theme-divider theme-text-muted hover:border-indigo-300'
                  }`}>
                  <span className="text-lg">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fund */}
          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              Fund <span className="text-xs theme-text-sub font-normal normal-case">(optional — can assign during approval)</span>
            </label>
            <select value={fundId} onChange={e => setFundId(e.target.value)}
              className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm">
              <option value="">— Select a fund —</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border theme-divider rounded-xl text-sm theme-text-muted hover:theme-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={uploading || !file}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20">
              {uploading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
                : '⬆ Upload & Parse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Notice Detail Modal ─────────────────────────────────────────────────── */
function NoticeDetailModal({
  notice, funds, onClose, onRefresh,
}: {
  notice: NoticeUpload;
  funds: { id: string; fund_name: string }[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [fundId, setFundId] = useState(notice.fund_id || '');
  const [notes,  setNotes]  = useState('');
  const [busy,   setBusy]   = useState(false);

  const ext  = notice.extracted_data as Record<string, unknown>;
  const conf = (ext._confidence as string) || 'low';
  const meta = NOTICE_TYPE_META[notice.notice_type] || { label: notice.notice_type, icon: '📄', color: 'theme-text' };

  async function doApprove() {
    if (!fundId) { toast.error('Please select a fund before approving.'); return; }
    setBusy(true);
    try {
      await noticesAPI.approve(notice.id, fundId, notes || undefined);
      toast.success('✓ Notice approved — CF records created!');
      onRefresh(); onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Approval failed.');
    } finally { setBusy(false); }
  }

  async function doReject() {
    setBusy(true);
    try {
      await noticesAPI.reject(notice.id, notes || undefined);
      toast.success('Notice rejected.');
      onRefresh(); onClose();
    } catch { toast.error('Rejection failed.'); }
    finally { setBusy(false); }
  }

  function fmtKey(k: string) { return k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }
  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v > 1000 ? fmt.usd(v) : String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return `${v.length} item${v.length !== 1 ? 's' : ''}`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  const investmentRows = (ext.investments as unknown[]) as Array<{
    project_name: string; amount_usd: number; investment_type?: string;
  }> | undefined;
  const typeBreakdown = ext.type_breakdown as Record<string, number> | undefined;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 theme-card border-b theme-divider px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold theme-text truncate">{notice.file_name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs font-medium ${meta.color}`}>{meta.icon} {meta.label}</span>
                <span className="theme-text-sub text-xs">·</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[notice.status]}`}>
                  {notice.status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${CONFIDENCE_BADGE[conf]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[conf]}`} />
                  {conf} confidence
                </span>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500 transition-colors flex-shrink-0">×</button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Extracted fields */}
          <div>
            <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">📋 Extracted Data</h3>
            <div className="theme-table-head border theme-divider rounded-xl overflow-hidden">
              {Object.entries(ext)
                .filter(([k]) => !['investments', 'type_breakdown', '_confidence', 'notice_type'].includes(k))
                .map(([k, v], i) => (
                  <div key={k} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? 'border-t theme-divider' : ''}`}>
                    <span className="theme-text-muted">{fmtKey(k)}</span>
                    <span className="font-semibold theme-text ml-4 text-right">{fmtVal(v)}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Investment targets */}
          {investmentRows && investmentRows.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">🏢 Investment Targets Detected</h3>
              <div className="theme-card border theme-divider rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="theme-table-head border-b theme-divider">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Project / Company</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Amount</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentRows.map((inv, i) => (
                      <tr key={i} className="border-t theme-divider">
                        <td className="px-4 py-2.5 font-medium theme-text">{inv.project_name}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-indigo-600 dark:text-indigo-400">{fmt.usd(inv.amount_usd)}</td>
                        <td className="px-4 py-2.5 theme-text-muted text-xs">{inv.investment_type || 'Equity'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Distribution breakdown */}
          {typeBreakdown && Object.keys(typeBreakdown).length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">💰 Distribution Breakdown</h3>
              <div className="theme-table-head border theme-divider rounded-xl overflow-hidden">
                {Object.entries(typeBreakdown).map(([k, v], i) => (
                  <div key={k} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? 'border-t theme-divider' : ''}`}>
                    <span className="theme-text-muted">{k}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmt.usd(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin approval section */}
          {notice.status === 'pending' && isAdmin() && (
            <div className="border-t theme-divider pt-5 space-y-4">
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">Admin Action</h3>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">
                  Assign to Fund <span className="text-red-500">*</span>
                </label>
                <select value={fundId} onChange={e => setFundId(e.target.value)}
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm">
                  <option value="">— Select a fund —</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">Admin Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Optional notes…"
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>

              <div className="flex gap-3">
                <button onClick={doReject} disabled={busy}
                  className="flex-1 px-4 py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
                  ✗ Reject
                </button>
                <button onClick={doApprove} disabled={busy || !fundId}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20">
                  {busy
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : '✓'
                  }
                  Approve & Create Records
                </button>
              </div>
            </div>
          )}

          {notice.status !== 'pending' && notice.admin_notes && (
            <div className="theme-table-head border theme-divider rounded-xl p-4">
              <p className="text-xs font-semibold theme-text-muted mb-1">Admin Notes</p>
              <p className="text-sm theme-text">{notice.admin_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function Notices() {
  const { t } = useTranslation();
  const [notices,    setNotices]    = useState<NoticeUpload[]>([]);
  const [funds,      setFunds]      = useState<{ id: string; fund_name: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [selected,   setSelected]   = useState<NoticeUpload | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [nr, fr] = await Promise.all([
        noticesAPI.list(filter !== 'all' ? { status: filter } : {}),
        fundsAPI.list(),
      ]);
      setNotices(nr.data);
      setFunds(fr.data);
    } catch { toast.error('Failed to load notices.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filter]);

  const pendingCount  = notices.filter(n => n.status === 'pending').length;
  const approvedCount = notices.filter(n => n.status === 'approved').length;

  const FILTER_TABS = [
    { key: 'all',      label: 'All',      count: notices.length },
    { key: 'pending',  label: 'Pending',  count: pendingCount },
    { key: 'approved', label: 'Approved', count: approvedCount },
    { key: 'rejected', label: 'Rejected', count: notices.filter(n => n.status === 'rejected').length },
  ] as const;

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text flex items-center gap-2">
            📄 {t('notices.title')}
            {pendingCount > 0 && (
              <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-semibold">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="theme-text-muted text-sm mt-0.5">
            Upload GP notices — data is auto-extracted and awaits admin approval
          </p>
        </div>
        {canEdit() && (
          <button onClick={() => setShowUpload(true)}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20">
            ⬆ Upload PDF
          </button>
        )}
      </div>

      {/* Stats */}
      {notices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Notices', value: notices.length, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Pending Review', value: pendingCount, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Approved', value: approvedCount, color: 'text-emerald-600 dark:text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="theme-card border rounded-xl p-4">
              <p className="text-xs theme-text-muted font-medium uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTER_TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'theme-card border theme-divider theme-text-muted hover:border-indigo-300 dark:hover:border-indigo-700'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold ${
                filter === key ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 theme-text-muted'
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {notices.length === 0 && !loading && (
        <div className="theme-card border rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-3xl mx-auto mb-4">📄</div>
          <h3 className="font-bold theme-text mb-1">Upload your first notice</h3>
          <p className="theme-text-muted text-sm max-w-sm mx-auto">
            Upload a Capital Call, Distribution, or Financial Statement PDF.
            The system automatically extracts key data for admin review.
          </p>
          <div className="mt-5 flex items-center justify-center gap-6 text-xs theme-text-muted">
            <span className="flex items-center gap-1.5">📋 Capital Calls → CF records</span>
            <span className="flex items-center gap-1.5">💰 Distributions → CF records</span>
            <span className="flex items-center gap-1.5">📊 Financials → NAV records</span>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notices.length > 0 ? (
        <div className="theme-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="theme-table-head border-b theme-divider">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">File</th>
                <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Fund</th>
                <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-semibold theme-text-muted uppercase tracking-wide">Uploaded</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {notices.map(n => {
                const conf = ((n.extracted_data as Record<string, unknown>)._confidence as string) || 'low';
                const meta = NOTICE_TYPE_META[n.notice_type] || { label: n.notice_type, icon: '📄', color: 'theme-text' };
                return (
                  <tr key={n.id} className="theme-row-hover border-b theme-divider last:border-0 transition-colors">
                    <td className="px-5 py-3 max-w-[200px]">
                      <p className="font-semibold theme-text truncate text-sm">{n.file_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${meta.color}`}>{meta.icon} {meta.label}</span>
                    </td>
                    <td className="px-4 py-3 theme-text-muted text-xs">{n.fund_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[n.status]}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit ${CONFIDENCE_BADGE[conf]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[conf]}`} />
                        {conf}
                      </span>
                    </td>
                    <td className="px-4 py-3 theme-text-muted text-xs">
                      {n.created_at ? fmt.date(n.created_at.slice(0, 10)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(n)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-semibold"
                      >
                        {n.status === 'pending' && isAdmin() ? 'Review →' : 'View →'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Modals */}
      {showUpload && (
        <UploadModal funds={funds} onClose={() => setShowUpload(false)} onSuccess={load} />
      )}
      {selected && (
        <NoticeDetailModal notice={selected} funds={funds} onClose={() => setSelected(null)} onRefresh={load} />
      )}
    </div>
  );
}

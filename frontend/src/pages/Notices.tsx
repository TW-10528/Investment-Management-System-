/**
 * Notices — PDF upload, auto-extraction, and admin approval flow.
 *
 * Upload a GP notice PDF → backend extracts key fields → admin reviews →
 * approve creates capital-call / distribution / NAV records automatically.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { noticesAPI, fundsAPI } from '../services/api';
import type { NoticeUpload, ExtractedNoticeData } from '../types/index';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

/* ── Colours ─────────────────────────────────────────────────────────────── */
const C = {
  indigo:    '#4f46e5', indigoBg:  'rgba(79,70,229,0.08)',  indigoBdr: 'rgba(79,70,229,0.20)',
  emerald:   '#10b981', emeraldBg: 'rgba(16,185,129,0.08)', emeraldBdr:'rgba(16,185,129,0.20)',
  amber:     '#d97706', amberBg:   'rgba(217,119,6,0.08)',  amberBdr:  'rgba(217,119,6,0.20)',
  red:       '#ef4444', redBg:     'rgba(239,68,68,0.08)',  redBdr:    'rgba(239,68,68,0.20)',
  violet:    '#7c3aed', violetBg:  'rgba(124,58,237,0.08)', violetBdr: 'rgba(124,58,237,0.20)',
  slate:     '#64748b', slateBg:   'rgba(100,116,139,0.06)',slateBdr:  'rgba(100,116,139,0.15)',
};

/* ── Constants ───────────────────────────────────────────────────────────── */
const TYPE_META = {
  capital_call:        { label: 'Capital Call',        icon: '📋', accentBg: C.indigoBg,  accentBdr: C.indigoBdr,  accentTxt: C.indigo  },
  distribution:        { label: 'Distribution',        icon: '💰', accentBg: C.emeraldBg, accentBdr: C.emeraldBdr, accentTxt: C.emerald },
  financial_statement: { label: 'Financial Statement', icon: '📊', accentBg: C.violetBg,  accentBdr: C.violetBdr,  accentTxt: C.violet  },
} as const;

const GRADE_STYLE: Record<'high' | 'medium' | 'low', { bg: string; txt: string; dot: string; label: string }> = {
  high:   { bg: C.emeraldBg, txt: C.emerald, dot: C.emerald, label: 'High' },
  medium: { bg: C.amberBg,   txt: C.amber,   dot: C.amber,   label: 'Medium' },
  low:    { bg: C.redBg,     txt: C.red,     dot: C.red,     label: 'Low' },
};

/* ── Auth helpers ────────────────────────────────────────────────────────── */
function currentUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}
function canEdit() {
  const r = currentUser().role;
  return ['admin', 'finance_manager', 'finance_staff'].includes(r);
}
function isAdmin() { return currentUser().role === 'admin'; }

/* ── Confidence badge ────────────────────────────────────────────────────── */
function ConfBadge({ n }: { n: NoticeUpload }) {
  const grade = n.confidence_grade
    ?? (n.extracted_data as ExtractedNoticeData)?.confidenceGrade
    ?? ((): 'high' | 'medium' | 'low' => {
      const c = n.confidence ?? 0;
      return c >= 0.65 ? 'high' : c >= 0.35 ? 'medium' : 'low';
    })();
  const g = GRADE_STYLE[grade] ?? GRADE_STYLE.low;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 w-fit"
      style={{ background: g.bg, color: g.txt }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.dot }} />
      {g.label}
    </span>
  );
}

/* ── Status badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; txt: string }> = {
    pending:  { bg: C.amberBg,   txt: C.amber   },
    approved: { bg: C.emeraldBg, txt: C.emerald },
    rejected: { bg: C.redBg,     txt: C.red     },
  };
  const s = styles[status] ?? { bg: C.slateBg, txt: C.slate };
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize"
      style={{ background: s.bg, color: s.txt }}>
      {status}
    </span>
  );
}

/* ── Upload Modal ────────────────────────────────────────────────────────── */
function UploadModal({
  funds, onClose, onSuccess,
}: { funds: { id: string; fund_name: string }[]; onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [fundId,     setFundId]     = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [dragging,   setDragging]   = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') setFile(f);
    else toast.error('Please drop a PDF file');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error('Please select a PDF file.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    if (fundId) fd.append('fund_id', fundId);
    setUploading(true);
    try {
      const r  = await noticesAPI.upload(fd);
      const conf: string = r.data.confidence_grade ?? 'low';
      toast.success(`✓ Uploaded — ${conf.toUpperCase()} confidence extraction. Awaiting admin review.`, { duration: 5000 });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Upload failed.');
    } finally { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up"
        style={{ borderColor: C.indigoBdr }}>

        <div className="flex items-center justify-between px-6 py-4 border-b theme-divider">
          <div>
            <h2 className="font-bold theme-text">⬆ Upload Notice PDF</h2>
            <p className="text-xs theme-text-muted mt-0.5">
              Data is auto-extracted by the parser — admin reviews before any records are created
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500 transition-colors">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
            style={{
              borderColor: dragging ? C.indigo : file ? C.emerald : C.slateBdr,
              background:  dragging ? C.indigoBg : file ? C.emeraldBg : undefined,
            }}
          >
            {file ? (
              <>
                <div className="text-3xl mb-2">📄</div>
                <p className="font-semibold text-sm" style={{ color: C.emerald }}>{file.name}</p>
                <p className="theme-text-muted text-xs mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : (
              <>
                <div className="text-3xl mb-2 opacity-40">📁</div>
                <p className="theme-text-muted text-sm font-medium">Drop PDF here or click to browse</p>
                <p className="theme-text-sub text-xs mt-1">Max 20 MB · PDF only</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Fund */}
          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              Fund <span className="text-xs font-normal normal-case theme-text-sub">(optional — assign during approval)</span>
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
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              style={{ background: C.indigo }}>
              {uploading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
                : '⬆ Upload & Parse'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Editable field ──────────────────────────────────────────────────────── */
function EditableRow({
  label, value, type = 'text', onChange,
}: {
  label: string;
  value: string | number | undefined;
  type?: 'text' | 'number' | 'date';
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(String(value ?? ''));

  function commit() {
    setEditing(false);
    onChange(local);
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="theme-text-muted min-w-[180px]">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2 ml-4 flex-1 justify-end">
          <input
            type={type}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => e.key === 'Enter' && commit()}
            autoFocus
            className="theme-input border rounded-lg px-2.5 py-1 text-sm text-right w-44"
          />
        </div>
      ) : (
        <button
          onClick={() => { setLocal(String(value ?? '')); setEditing(true); }}
          className="font-semibold theme-text ml-4 text-right hover:opacity-70 transition-opacity group flex items-center gap-1"
        >
          {value != null && value !== '' ? (
            type === 'number' && typeof value === 'number' && value > 1000
              ? fmt.usd(value)
              : String(value)
          ) : <span className="text-xs theme-text-sub italic">— click to set</span>}
          <span className="opacity-0 group-hover:opacity-50 text-xs">✏</span>
        </button>
      )}
    </div>
  );
}

/* ── Notice Detail / Review Modal ────────────────────────────────────────── */
function NoticeDetailModal({
  notice, funds, onClose, onRefresh,
}: {
  notice: NoticeUpload;
  funds:  { id: string; fund_name: string }[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [fundId,  setFundId]  = useState(notice.fund_id || '');
  const [notes,   setNotes]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [editExt, setEditExt] = useState<ExtractedNoticeData>({ ...(notice.extracted_data ?? {}) });
  const [saving,  setSaving]  = useState(false);

  const meta = TYPE_META[notice.notice_type] ?? TYPE_META.capital_call;

  // ── Approve ──
  async function doApprove() {
    if (!fundId) { toast.error('Please select a fund before approving.'); return; }
    setBusy(true);
    try {
      // Save any edits to extracted data first
      if (JSON.stringify(editExt) !== JSON.stringify(notice.extracted_data)) {
        await noticesAPI.updateExtracted(notice.id, editExt as Record<string, unknown>);
      }
      await noticesAPI.approve(notice.id, fundId, notes || undefined);
      toast.success('✓ Notice approved — records created!', { duration: 5000 });
      onRefresh(); onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Approval failed.');
    } finally { setBusy(false); }
  }

  // ── Reject ──
  async function doReject() {
    setBusy(true);
    try {
      await noticesAPI.reject(notice.id, notes || undefined);
      toast.success('Notice rejected.');
      onRefresh(); onClose();
    } catch { toast.error('Rejection failed.'); }
    finally { setBusy(false); }
  }

  // ── Save edits ──
  async function saveEdits() {
    setSaving(true);
    try {
      await noticesAPI.updateExtracted(notice.id, editExt as Record<string, unknown>);
      toast.success('Extracted data saved.');
    } catch { toast.error('Save failed.'); }
    finally { setSaving(false); }
  }

  function setField(key: keyof ExtractedNoticeData, val: string) {
    setEditExt(prev => ({
      ...prev,
      [key]: (typeof prev[key] === 'number' && val !== '') ? parseFloat(val) : (val || undefined),
    }));
  }

  const bd = editExt.distributionBreakdown;

  // ── What gets created preview ──
  function WillCreate() {
    if (notice.status !== 'pending') return null;
    if (notice.notice_type === 'capital_call') {
      return (
        <div className="rounded-xl border p-3 text-xs space-y-1.5"
          style={{ background: C.indigoBg, borderColor: C.indigoBdr, color: C.indigo }}>
          <p className="font-bold">📋 On approval will create:</p>
          <p>· Capital Call record  — Net: <b>{fmt.usd(editExt.netCallUsd ?? editExt.grossCallUsd ?? 0)}</b></p>
          {editExt.investmentTargets?.length
            ? <p>· {editExt.investmentTargets.length} Investment Target(s)</p>
            : null}
        </div>
      );
    }
    if (notice.notice_type === 'distribution') {
      const cap = bd?.capitalReturnUsd;
      const inc = bd?.incomeUsd;
      return (
        <div className="rounded-xl border p-3 text-xs space-y-1.5"
          style={{ background: C.emeraldBg, borderColor: C.emeraldBdr, color: C.emerald }}>
          <p className="font-bold">💰 On approval will create:</p>
          {cap ? <p>· Distribution (Capital Return): <b>{fmt.usd(cap)}</b></p> : null}
          {inc ? <p>· Distribution (Income): <b>{fmt.usd(inc)}</b></p> : null}
          {!cap && !inc ? <p>· Distribution: <b>{fmt.usd(editExt.distributionUsd ?? 0)}</b></p> : null}
        </div>
      );
    }
    if (notice.notice_type === 'financial_statement') {
      return (
        <div className="rounded-xl border p-3 text-xs space-y-1.5"
          style={{ background: C.violetBg, borderColor: C.violetBdr, color: C.violet }}>
          <p className="font-bold">📊 On approval will create:</p>
          {editExt.navUsd
            ? <p>· NAV Record: <b>{fmt.usd(editExt.navUsd)}</b>{editExt.period ? ` (${editExt.period})` : ''}</p>
            : <p className="opacity-70">⚠ No NAV value extracted — set NAV below</p>}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-slide-up">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-10 theme-card border-b theme-divider px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold theme-text truncate">{notice.file_name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: meta.accentTxt }}>
                  {meta.icon} {meta.label}
                </span>
                <span className="theme-text-sub text-xs">·</span>
                <StatusBadge status={notice.status} />
                <ConfBadge n={notice} />
                {notice.uploaded_by && (
                  <span className="text-xs theme-text-sub">by {notice.uploaded_by}</span>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500 transition-colors flex-shrink-0">
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Will-create preview ── */}
          <WillCreate />

          {/* ── Capital Call fields ── */}
          {notice.notice_type === 'capital_call' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">📋 Capital Call Data</h3>
                {notice.status === 'pending' && canEdit() && (
                  <button onClick={saveEdits} disabled={saving}
                    className="text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background: C.slateBg, color: C.slate }}>
                    {saving ? 'Saving…' : '💾 Save edits'}
                  </button>
                )}
              </div>
              <div className="theme-table-head border theme-divider rounded-xl overflow-hidden divide-y theme-divider">
                <EditableRow label="Gross Call (USD)" type="number" value={editExt.grossCallUsd}
                  onChange={v => setField('grossCallUsd', v)} />
                <EditableRow label="Net Call (USD)" type="number" value={editExt.netCallUsd}
                  onChange={v => setField('netCallUsd', v)} />
                <EditableRow label="Management Fee (USD)" type="number" value={editExt.managementFeeUsd}
                  onChange={v => setField('managementFeeUsd', v)} />
                <EditableRow label="Investment Amount (USD)" type="number" value={editExt.investmentAmountUsd}
                  onChange={v => setField('investmentAmountUsd', v)} />
                <EditableRow label="Reinvestable (USD)" type="number" value={editExt.reinvestableUsd}
                  onChange={v => setField('reinvestableUsd', v)} />
                <EditableRow label="Call Number" type="number" value={editExt.callNumber}
                  onChange={v => setField('callNumber', v)} />
                <EditableRow label="Due Date" type="date" value={editExt.dueDate}
                  onChange={v => setField('dueDate', v)} />
                <EditableRow label="FX Rate (JPY/USD)" type="number" value={editExt.fxRate}
                  onChange={v => setField('fxRate', v)} />
                {editExt.wireReference && (
                  <EditableRow label="Wire Reference" value={editExt.wireReference}
                    onChange={v => setField('wireReference', v)} />
                )}
                {editExt.fundName && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="theme-text-muted">Fund (from document)</span>
                    <span className="font-semibold theme-text">{editExt.fundName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Distribution fields ── */}
          {notice.notice_type === 'distribution' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">💰 Distribution Data</h3>
                {notice.status === 'pending' && canEdit() && (
                  <button onClick={saveEdits} disabled={saving}
                    className="text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background: C.slateBg, color: C.slate }}>
                    {saving ? 'Saving…' : '💾 Save edits'}
                  </button>
                )}
              </div>
              <div className="theme-table-head border theme-divider rounded-xl overflow-hidden divide-y theme-divider">
                <EditableRow label="Total Distribution (USD)" type="number" value={editExt.distributionUsd}
                  onChange={v => setField('distributionUsd', v)} />
                <EditableRow label="Distribution Date" type="date" value={editExt.distributionDate}
                  onChange={v => setField('distributionDate', v)} />
                <EditableRow label="Return of Capital (USD)" type="number" value={bd?.capitalReturnUsd}
                  onChange={v => setEditExt(p => ({
                    ...p,
                    distributionBreakdown: { ...(p.distributionBreakdown ?? {}), capitalReturnUsd: parseFloat(v) || undefined },
                  }))} />
                <EditableRow label="Income / Profit (USD)" type="number" value={bd?.incomeUsd}
                  onChange={v => setEditExt(p => ({
                    ...p,
                    distributionBreakdown: { ...(p.distributionBreakdown ?? {}), incomeUsd: parseFloat(v) || undefined },
                  }))} />
                <EditableRow label="Recallable Amount (USD)" type="number" value={editExt.reinvestableUsd}
                  onChange={v => setField('reinvestableUsd', v)} />
                <EditableRow label="FX Rate (JPY/USD)" type="number" value={editExt.fxRate}
                  onChange={v => setField('fxRate', v)} />
              </div>
              {/* Breakdown bar */}
              {bd && (bd.capitalReturnUsd || bd.incomeUsd) ? (() => {
                const cap = bd.capitalReturnUsd ?? 0;
                const inc = bd.incomeUsd ?? 0;
                const tot = cap + inc;
                if (!tot) return null;
                const capPct = (cap / tot) * 100;
                return (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold theme-text-muted">Distribution Breakdown</p>
                    <div className="h-3 rounded-full overflow-hidden flex" style={{ background: C.slateBg }}>
                      <div style={{ width: `${capPct}%`, background: C.indigo }} className="transition-all" />
                      <div style={{ width: `${100 - capPct}%`, background: C.emerald }} className="transition-all" />
                    </div>
                    <div className="flex justify-between text-xs theme-text-muted">
                      <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: C.indigo }} />Return of Capital: {fmt.usd(cap)} ({capPct.toFixed(0)}%)</span>
                      <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: C.emerald }} />Income: {fmt.usd(inc)} ({(100 - capPct).toFixed(0)}%)</span>
                    </div>
                  </div>
                );
              })() : null}
            </div>
          )}

          {/* ── Financial Statement fields ── */}
          {notice.notice_type === 'financial_statement' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">📊 Financial Statement Data</h3>
                {notice.status === 'pending' && canEdit() && (
                  <button onClick={saveEdits} disabled={saving}
                    className="text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background: C.slateBg, color: C.slate }}>
                    {saving ? 'Saving…' : '💾 Save edits'}
                  </button>
                )}
              </div>
              <div className="theme-table-head border theme-divider rounded-xl overflow-hidden divide-y theme-divider">
                <EditableRow label="NAV (USD)" type="number" value={editExt.navUsd}
                  onChange={v => setField('navUsd', v)} />
                <EditableRow label="NAV Date" type="date" value={editExt.navDate}
                  onChange={v => setField('navDate', v)} />
                <EditableRow label="Period" value={editExt.period}
                  onChange={v => setField('period', v)} />
                {editExt.irr != null && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="theme-text-muted">Since-Inception IRR</span>
                    <span className="font-semibold theme-text">{editExt.irr.toFixed(1)}%</span>
                  </div>
                )}
                {editExt.tvpi != null && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="theme-text-muted">TVPI</span>
                    <span className="font-semibold theme-text">{editExt.tvpi.toFixed(2)}×</span>
                  </div>
                )}
                {editExt.dpi != null && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="theme-text-muted">DPI</span>
                    <span className="font-semibold theme-text">{editExt.dpi.toFixed(2)}×</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Investment targets ── */}
          {editExt.investmentTargets && editExt.investmentTargets.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">
                🏢 Investment Targets Detected ({editExt.investmentTargets.length})
              </h3>
              <div className="border theme-divider rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="theme-table-head border-b theme-divider">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Company / Project</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Amount (USD)</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold theme-text-muted uppercase tracking-wide">Sector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editExt.investmentTargets.map((it, i) => (
                      <tr key={i} className="border-t theme-divider">
                        <td className="px-4 py-2.5 font-medium theme-text">{it.projectName}</td>
                        <td className="px-4 py-2.5 text-right font-mono" style={{ color: C.indigo }}>
                          {it.amountUsd ? fmt.usd(it.amountUsd) : '—'}
                        </td>
                        <td className="px-4 py-2.5 theme-text-muted text-xs">{it.investmentType ?? 'Equity'}</td>
                        <td className="px-4 py-2.5 theme-text-muted text-xs">{it.sector ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Misc extracted keywords ── */}
          {editExt.keywords && editExt.keywords.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-2">🔑 Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {editExt.keywords.map(k => (
                  <span key={k} className="text-xs px-2.5 py-1 rounded-full font-medium capitalize"
                    style={{ background: C.slateBg, color: C.slate }}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Dates detected ── */}
          {editExt.dates && editExt.dates.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-2">📅 Dates in Document</h3>
              <div className="flex flex-wrap gap-2">
                {editExt.dates.map((d, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full font-mono"
                    style={{ background: C.slateBg, color: C.slate }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Admin approval ── */}
          {notice.status === 'pending' && (canEdit() || isAdmin()) && (
            <div className="border-t theme-divider pt-5 space-y-4">
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">
                {isAdmin() ? '✅ Admin Approval' : '📤 Submit for Approval'}
              </h3>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">
                  Assign to Fund <span style={{ color: C.red }}>*</span>
                </label>
                <select value={fundId} onChange={e => setFundId(e.target.value)}
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm">
                  <option value="">— Select a fund —</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">Admin Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Optional review notes…"
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>

              {isAdmin() && (
                <div className="flex gap-3">
                  <button onClick={doReject} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50 transition-colors"
                    style={{ borderColor: C.redBdr, color: C.red, background: busy ? C.redBg : undefined }}>
                    ✗ Reject
                  </button>
                  <button onClick={doApprove} disabled={busy || !fundId}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    style={{ background: C.emerald }}>
                    {busy
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : '✓'
                    }
                    Approve &amp; Create Records
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Already processed admin notes ── */}
          {notice.status !== 'pending' && notice.admin_notes && (
            <div className="rounded-xl border p-4 theme-divider theme-table-head">
              <p className="text-xs font-semibold theme-text-muted mb-1">Admin Notes</p>
              <p className="text-sm theme-text">{notice.admin_notes}</p>
            </div>
          )}
          {notice.status === 'approved' && (
            <div className="rounded-xl border p-3 text-xs"
              style={{ background: C.emeraldBg, borderColor: C.emeraldBdr, color: C.emerald }}>
              ✓ Approved {notice.approved_at ? `on ${fmt.date(notice.approved_at.slice(0, 10))}` : ''} — records have been created
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
/* ── Excel Upload Modal ──────────────────────────────────────────────────── */
function ExcelUploadModal({
  funds, onClose, onSuccess,
}: { funds: { id: string; fund_name: string }[]; onClose: () => void; onSuccess: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,      setFile]      = useState<File | null>(null);
  const [fundId,    setFundId]    = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging,  setDragging]  = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    const ok = ['xlsx','xls','xlsm','csv'].some(x => f?.name.toLowerCase().endsWith(x));
    if (ok) setFile(f);
    else toast.error('Please drop an Excel file (.xlsx / .xls)');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error('Please select an Excel file.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    if (fundId) fd.append('fund_id', fundId);
    setUploading(true);
    try {
      const r = await noticesAPI.uploadExcel(fd);
      const { totalCalls, totalDists, notices: created } = r.data;
      toast.success(
        `✓ Parsed ${created.length} sheet(s) — ${totalCalls} capital call rows, ${totalDists} distribution rows extracted. Pending admin review.`,
        { duration: 7000 }
      );
      onSuccess(); onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'Upload failed.');
    } finally { setUploading(false); }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up"
        style={{ borderColor: C.emeraldBdr }}>

        <div className="flex items-center justify-between px-6 py-4 border-b theme-divider">
          <div>
            <h2 className="font-bold theme-text">📊 Upload Fund Cashflow Excel</h2>
            <p className="text-xs theme-text-muted mt-0.5">
              投資キャッシュフロー workbooks — each sheet becomes one fund's capital call + distribution records
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
            style={{
              borderColor: dragging ? C.emerald : file ? C.emerald : C.slateBdr,
              background:  dragging ? C.emeraldBg : file ? C.emeraldBg : undefined,
            }}>
            {file ? (
              <>
                <div className="text-3xl mb-2">📊</div>
                <p className="font-semibold text-sm" style={{ color: C.emerald }}>{file.name}</p>
                <p className="theme-text-muted text-xs mt-1">{(file.size/1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : (
              <>
                <div className="text-3xl mb-2 opacity-40">📊</div>
                <p className="theme-text-muted text-sm font-medium">Drop Excel here or click to browse</p>
                <p className="theme-text-sub text-xs mt-1">.xlsx / .xls / .xlsm · Max 50 MB</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Hint */}
          <div className="rounded-xl border p-3 text-xs space-y-1"
            style={{ background: C.amberBg, borderColor: C.amberBdr, color: C.amber }}>
            <p className="font-bold">📋 Expected format</p>
            <p>Each sheet = one fund. Columns: 支払日 (date) · FX/TTM rate · 出資金額 (call amount) · 管理費 (mgmt fee) · 分配 (distribution)</p>
          </div>

          {/* Fund (optional) */}
          <div>
            <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
              Default Fund <span className="text-xs font-normal normal-case theme-text-sub">(optional — assign per-sheet during approval)</span>
            </label>
            <select value={fundId} onChange={e => setFundId(e.target.value)}
              className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm">
              <option value="">— Select a fund —</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
            </select>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border theme-divider rounded-xl text-sm theme-text-muted">Cancel</button>
            <button type="submit" disabled={uploading || !file}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: C.emerald }}>
              {uploading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
                : '📊 Upload & Parse'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Excel Detail / Approval Modal ───────────────────────────────────────── */
function ExcelDetailModal({
  notice, funds, onClose, onRefresh,
}: { notice: NoticeUpload; funds: { id: string; fund_name: string }[]; onClose: () => void; onRefresh: () => void }) {
  const [fundId, setFundId] = useState(notice.fund_id || '');
  const [notes,  setNotes]  = useState('');
  const [busy,   setBusy]   = useState(false);

  const data = notice.extracted_data as ExtractedNoticeData & {
    sourceType?: string;
    sheetName?: string;
    fundNameHint?: string;
    commitmentUsd?: number;
    capitalCalls?: Array<{
      rowType: string; date: string; callNumber?: number; fxRate?: number;
      grossCallUsd: number; netCallUsd: number; managementFeeUsd?: number; notes?: string;
    }>;
    distributions?: Array<{
      rowType: string; date: string; fxRate?: number;
      totalUsd: number; capitalReturnUsd?: number; incomeUsd?: number; notes?: string;
    }>;
    parseWarnings?: string[];
  };

  const ccs   = data.capitalCalls   ?? [];
  const dists = data.distributions  ?? [];

  async function doApprove() {
    if (!fundId) { toast.error('Please select a fund.'); return; }
    setBusy(true);
    try {
      const r = await noticesAPI.approveExcel(notice.id, fundId, notes || undefined);
      const { capital_calls: cc, distributions: di } = r.data;
      toast.success(`✓ ${cc?.length ?? 0} capital call(s) + ${di?.length ?? 0} distribution(s) created!`, { duration: 6000 });
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
      toast.success('Notice rejected.'); onRefresh(); onClose();
    } catch { toast.error('Rejection failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="theme-card border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto animate-slide-up">

        {/* Header */}
        <div className="sticky top-0 z-10 theme-card border-b theme-divider px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold theme-text truncate">📊 {notice.file_name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: C.emerald }}>Excel Cashflow</span>
                {data.sheetName && <span className="text-xs theme-text-muted">Sheet: {data.sheetName}</span>}
                {data.fundNameHint && <span className="text-xs theme-text-muted">· {data.fundNameHint}</span>}
                <StatusBadge status={notice.status} />
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center theme-text-muted hover:text-red-500 flex-shrink-0">×</button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Capital Calls',  value: ccs.length,   color: C.indigo,  bg: C.indigoBg  },
              { label: 'Distributions',  value: dists.length, color: C.emerald, bg: C.emeraldBg },
              { label: 'Commitment',     value: data.commitmentUsd ? fmt.usd(data.commitmentUsd) : '—', color: C.violet, bg: C.violetBg },
            ].map(s => (
              <div key={s.label} className="rounded-xl border p-3 text-center"
                style={{ background: s.bg, borderColor: 'transparent' }}>
                <p className="text-xs font-semibold theme-text-muted">{s.label}</p>
                <p className="font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Capital Calls table */}
          {ccs.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">
                📋 Capital Calls ({ccs.length} rows)
              </h3>
              <div className="border theme-divider rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="theme-table-head border-b theme-divider">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Date</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold theme-text-muted">#</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Gross (USD)</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Net (USD)</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Mgmt Fee</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted">FX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ccs.map((r, i) => (
                        <tr key={i} className="border-t theme-divider hover:bg-slate-50 dark:hover:bg-slate-800/20">
                          <td className="px-3 py-2 font-mono text-xs theme-text">{r.date}</td>
                          <td className="px-3 py-2 theme-text-muted text-xs">{r.callNumber ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: C.indigo }}>{fmt.usd(r.grossCallUsd)}</td>
                          <td className="px-3 py-2 text-right theme-text">{fmt.usd(r.netCallUsd)}</td>
                          <td className="px-3 py-2 text-right theme-text-muted text-xs">{r.managementFeeUsd ? fmt.usd(r.managementFeeUsd) : '—'}</td>
                          <td className="px-3 py-2 text-right theme-text-muted text-xs">{r.fxRate?.toFixed(2) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 theme-divider theme-table-head">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-xs font-bold theme-text-muted">TOTAL</td>
                        <td className="px-3 py-2 text-right font-bold text-sm" style={{ color: C.indigo }}>
                          {fmt.usd(ccs.reduce((s, r) => s + r.grossCallUsd, 0))}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold theme-text">
                          {fmt.usd(ccs.reduce((s, r) => s + r.netCallUsd, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Distributions table */}
          {dists.length > 0 && (
            <div>
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider mb-3">
                💰 Distributions ({dists.length} rows)
              </h3>
              <div className="border theme-divider rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="theme-table-head border-b theme-divider">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Date</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Total (USD)</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted whitespace-nowrap">Capital Return</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted">Income</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold theme-text-muted">FX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dists.map((r, i) => (
                        <tr key={i} className="border-t theme-divider hover:bg-slate-50 dark:hover:bg-slate-800/20">
                          <td className="px-3 py-2 font-mono text-xs theme-text">{r.date}</td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: C.emerald }}>{fmt.usd(r.totalUsd)}</td>
                          <td className="px-3 py-2 text-right theme-text-muted text-xs">{r.capitalReturnUsd ? fmt.usd(r.capitalReturnUsd) : '—'}</td>
                          <td className="px-3 py-2 text-right theme-text-muted text-xs">{r.incomeUsd ? fmt.usd(r.incomeUsd) : '—'}</td>
                          <td className="px-3 py-2 text-right theme-text-muted text-xs">{r.fxRate?.toFixed(2) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 theme-divider theme-table-head">
                      <tr>
                        <td className="px-3 py-2 text-xs font-bold theme-text-muted">TOTAL</td>
                        <td className="px-3 py-2 text-right font-bold text-sm" style={{ color: C.emerald }}>
                          {fmt.usd(dists.reduce((s, r) => s + r.totalUsd, 0))}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-xs theme-text">
                          {fmt.usd(dists.reduce((s, r) => s + (r.capitalReturnUsd ?? 0), 0))}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-xs theme-text">
                          {fmt.usd(dists.reduce((s, r) => s + (r.incomeUsd ?? 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Parse warnings */}
          {data.parseWarnings && data.parseWarnings.length > 0 && (
            <div className="rounded-xl border p-3 text-xs"
              style={{ background: C.amberBg, borderColor: C.amberBdr, color: C.amber }}>
              <p className="font-bold mb-1">⚠ Parse Notes</p>
              {data.parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          )}

          {/* Admin approval */}
          {notice.status === 'pending' && (canEdit() || isAdmin()) && (
            <div className="border-t theme-divider pt-5 space-y-4">
              <h3 className="text-xs font-bold theme-text-muted uppercase tracking-wider">✅ Approve & Import Records</h3>

              <div className="rounded-xl border p-3 text-xs space-y-1"
                style={{ background: C.emeraldBg, borderColor: C.emeraldBdr, color: C.emerald }}>
                <p className="font-bold">On approval will create:</p>
                <p>· {ccs.length} Capital Call record(s) — Total: {fmt.usd(ccs.reduce((s,r) => s+r.grossCallUsd,0))}</p>
                <p>· {dists.length} Distribution record(s) — Total: {fmt.usd(dists.reduce((s,r) => s+r.totalUsd,0))}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">
                  Assign to Fund <span style={{ color: C.red }}>*</span>
                </label>
                <select value={fundId} onChange={e => setFundId(e.target.value)}
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm">
                  <option value="">— Select a fund —</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5">Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="theme-input w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                  placeholder="Optional review notes…" />
              </div>

              {isAdmin() && (
                <div className="flex gap-3">
                  <button onClick={doReject} disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
                    style={{ borderColor: C.redBdr, color: C.red }}>
                    ✗ Reject
                  </button>
                  <button onClick={doApprove} disabled={busy || !fundId}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: C.emerald }}>
                    {busy
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : '✓'
                    }
                    Import All Records
                  </button>
                </div>
              )}
            </div>
          )}

          {notice.status === 'approved' && (
            <div className="rounded-xl border p-3 text-xs"
              style={{ background: C.emeraldBg, borderColor: C.emeraldBdr, color: C.emerald }}>
              ✓ Approved {notice.approved_at ? `on ${fmt.date(notice.approved_at.slice(0,10))}` : ''} — all records have been imported
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
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [selected,   setSelected]   = useState<NoticeUpload | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nr, fr] = await Promise.all([
        noticesAPI.list(filter !== 'all' ? { status: filter } : {}),
        fundsAPI.list(),
      ]);
      setNotices(nr.data);
      setFunds(fr.data);
    } catch { if (!silent) toast.error('Failed to load notices.'); }
    finally { if (!silent) setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll every 30 s so newly-uploaded notices appear
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const pending  = notices.filter(n => n.status === 'pending');
  const approved = notices.filter(n => n.status === 'approved');
  const rejected = notices.filter(n => n.status === 'rejected');

  const TABS = [
    { key: 'all',      label: t('notices.all'),      count: notices.length },
    { key: 'pending',  label: t('notices.pending'),  count: pending.length  },
    { key: 'approved', label: t('notices.approved'), count: approved.length },
    { key: 'rejected', label: t('notices.rejected'), count: rejected.length },
  ] as const;

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text flex items-center gap-2">
            📄 {t('notices.title')}
            {pending.length > 0 && (
              <span className="text-xs text-white px-2 py-0.5 rounded-full font-semibold"
                style={{ background: C.amber }}>
                {pending.length} pending
              </span>
            )}
          </h1>
          <p className="theme-text-muted text-sm mt-0.5">
            Upload GP notices — data is auto-extracted and populated into capital calls, distributions, and NAV
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => load()}
            className="px-3 py-2.5 border theme-divider rounded-xl text-sm theme-text-muted hover:theme-text transition-colors">
            ↻ Refresh
          </button>
          {canEdit() && (
            <>
              <button onClick={() => setShowExcelUpload(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-colors"
                style={{ background: C.emerald }}>
                📊 Upload Excel
              </button>
              <button onClick={() => setShowUpload(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-colors"
                style={{ background: C.indigo }}>
                ⬆ Upload PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Notices',    value: notices.length, accentTxt: C.indigo,  accentBg: C.indigoBg  },
          { label: 'Pending Review',   value: pending.length, accentTxt: C.amber,   accentBg: C.amberBg   },
          { label: 'Approved',         value: approved.length,accentTxt: C.emerald, accentBg: C.emeraldBg },
          { label: 'Rejected',         value: rejected.length,accentTxt: C.red,     accentBg: C.redBg     },
        ].map(s => (
          <div key={s.label} className="theme-card border rounded-xl p-4">
            <p className="text-xs theme-text-muted font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.accentTxt }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2">
        {TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={filter === key
              ? { background: C.indigo, color: '#fff' }
              : { color: C.slate }}>
            {label}
            {count > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold"
                style={filter === key
                  ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                  : { background: C.slateBg, color: C.slate }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {notices.length === 0 && !loading && (
        <div className="theme-card border rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
            style={{ background: C.indigoBg }}>
            📄
          </div>
          <h3 className="font-bold theme-text mb-1">Upload your first GP notice</h3>
          <p className="theme-text-muted text-sm max-w-sm mx-auto">
            Upload a Capital Call, Distribution, or Financial Statement PDF.
            The system automatically extracts key data — an admin reviews it before any records are created.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-lg mx-auto">
            {Object.entries(TYPE_META).map(([k, m]) => (
              <div key={k} className="rounded-xl border p-3 text-center text-xs"
                style={{ background: m.accentBg, borderColor: m.accentBdr, color: m.accentTxt }}>
                <div className="text-2xl mb-1">{m.icon}</div>
                <p className="font-semibold">{m.label}</p>
                <p className="opacity-70 mt-0.5">
                  {k === 'capital_call' ? '→ Capital Call + Investments' :
                   k === 'distribution' ? '→ Distribution records' :
                   '→ NAV records'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: C.indigo, borderTopColor: 'transparent' }} />
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
                const meta = TYPE_META[n.notice_type] ?? TYPE_META.capital_call;
                return (
                  <tr key={n.id} className="theme-row-hover border-b theme-divider last:border-0 transition-colors">
                    <td className="px-5 py-3 max-w-[200px]">
                      <p className="font-semibold theme-text truncate text-sm">{n.file_name}</p>
                      {n.extracted_data?.fundName && (
                        <p className="text-xs theme-text-muted truncate">{n.extracted_data.fundName as string}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(n.extracted_data as ExtractedNoticeData & { sourceType?: string })?.sourceType === 'excel' ? (
                        <span className="text-xs font-semibold" style={{ color: C.emerald }}>📊 Excel Cashflow</span>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: meta.accentTxt }}>
                          {meta.icon} {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 theme-text-muted text-xs">
                      {funds.find(f => f.id === n.fund_id)?.fund_name || '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                    <td className="px-4 py-3"><ConfBadge n={n} /></td>
                    <td className="px-4 py-3 theme-text-muted text-xs">
                      {n.created_at ? fmt.date(n.created_at.slice(0, 10)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(n)}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: (n.extracted_data as ExtractedNoticeData & { sourceType?: string })?.sourceType === 'excel' ? C.emerald : C.indigo }}>
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

      {/* ── Modals ── */}
      {showUpload && (
        <UploadModal funds={funds} onClose={() => setShowUpload(false)} onSuccess={() => load()} />
      )}
      {showExcelUpload && (
        <ExcelUploadModal funds={funds} onClose={() => setShowExcelUpload(false)} onSuccess={() => load()} />
      )}
      {selected && (() => {
        const isExcel = (selected.extracted_data as ExtractedNoticeData & { sourceType?: string })?.sourceType === 'excel';
        return isExcel ? (
          <ExcelDetailModal notice={selected} funds={funds} onClose={() => setSelected(null)} onRefresh={() => load()} />
        ) : (
          <NoticeDetailModal notice={selected} funds={funds} onClose={() => setSelected(null)} onRefresh={() => load()} />
        );
      })()}
    </div>
  );
}

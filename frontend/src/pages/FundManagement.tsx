/**
 * Fund Management Page
 * Shows ALL funds (active + inactive) as full sections.
 * Each section has tabs: Overview · Capital Calls · Distributions · NAV · Ledger · Details · Wire
 * Everything is inline-editable. Edit/delete available for admin and finance roles.
 */
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fundsAPI } from '../services/api';
import type { FundDetail, FundSummary, LedgerRow, LedgerSnapshot } from '../types/index';
import { fmt, strategyBg, strategyColor } from '../lib/format';
import AddFundWizard from '../components/AddFundWizard';
import FundDocuments from '../components/FundDocuments';
import FundUploadBar from '../components/FundUploadBar';
import toast from 'react-hot-toast';

// ── Role helpers ──────────────────────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}
function useCanEdit() {
  return ['admin', 'finance_manager', 'finance_staff'].includes(getUser().role ?? '');
}

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  indigo:  '#4f46e5', indigoBg:  'rgba(79,70,229,0.1)',  indigoBdr:  'rgba(79,70,229,0.25)',
  emerald: '#10b981', emeraldBg: 'rgba(16,185,129,0.1)', emeraldBdr: 'rgba(16,185,129,0.25)',
  red:     '#ef4444', redBg:     'rgba(239,68,68,0.08)', redBdr:     'rgba(239,68,68,0.2)',
  violet:  '#8b5cf6', amber:     '#d97706', slate:       '#64748b',
};

const STRATEGIES = ['Small Buyout','Buyout','Growth','Venture','Secondaries',
  'Private Credit','Real Estate','Infrastructure','Hedge Fund','Other'];
const CALL_STATUSES = ['pending','approved','paid','cancelled'];
const DIST_TYPES    = ['Income','Capital Return','Recallable','Deemed','Other'];

// ── Common UI atoms ───────────────────────────────────────────────────────────
const inp = 'theme-input rounded-lg px-3 py-1.5 text-sm w-full border theme-border';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">{label}</p>
      {children}
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const m: Record<string,string> = {
    paid:'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    approved:'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    pending:'text-amber-400 bg-amber-500/10 border-amber-500/25',
    cancelled:'text-red-400 bg-red-500/10 border-red-500/25',
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m[s]??m.pending}`}>{s}</span>;
}

function SaveBtn({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50">
      {loading ? 'Saving…' : 'Save'}
    </button>
  );
}
function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-4 py-1.5 rounded-lg text-sm font-medium theme-text-muted hover:bg-white/5 transition-colors">
      Cancel
    </button>
  );
}
function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-medium theme-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 border theme-border transition-colors">
      Edit
    </button>
  );
}
function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-2 py-1 rounded text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
      Remove
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL CALLS TAB
// ─────────────────────────────────────────────────────────────────────────────
function CallsTab({ fundId, canEdit, onChanged }: { fundId:string; canEdit:boolean; onChanged:()=>void }) {
  const [calls, setCalls] = useState<any[]>([]);
  const [form,  setForm]  = useState<any|null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() =>
    fundsAPI.getCalls(fundId).then(r => setCalls(r.data)).catch(() => {}), [fundId]);
  useEffect(() => { load(); }, [load]);

  const sf = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Cash flow: manual value if entered, else the formula G = -B + C.
  const hasManualCf  = form?.manual_cash_flow_usd !== undefined
                    && form?.manual_cash_flow_usd !== ''
                    && form?.manual_cash_flow_usd !== null;
  const cashFlowPreview = hasManualCf
    ? Number(form.manual_cash_flow_usd)
    : (Number(form?.distribution_usd) || 0) - (Number(form?.gross_call_usd) || 0);

  async function submit() {
    setSaving(true);
    try {
      if (form.id) { await fundsAPI.updateCall(fundId, form.id, form); toast.success('Capital call updated'); }
      else         { await fundsAPI.createCall(fundId, form);          toast.success('Capital call added');   }
      setForm(null); load(); onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to save capital call');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Remove this capital call permanently?')) return;
    try { await fundsAPI.deleteCall(fundId, id); load(); onChanged(); toast.success('Capital call removed'); }
    catch { toast.error('Failed to remove'); }
  }

  return (
    <div>
      {/* toolbar */}
      <div className="px-5 py-3 flex items-center justify-between border-b theme-border"
           style={{ background: C.indigoBg }}>
        <p className="text-sm font-semibold theme-text">
          Capital Calls
          <span className="ml-2 text-xs font-normal theme-text-muted">{calls.length} records</span>
        </p>
        {canEdit && !form && (
          <button onClick={() => setForm({ status: 'pending' })}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            + Add Capital Call
          </button>
        )}
      </div>

      {/* inline form */}
      {form && (
        <div className="p-5 border-b theme-border" style={{ background: 'rgba(79,70,229,0.03)' }}>
          <p className="text-[11px] theme-text-muted mb-3">
            Enter the ledger inputs manually. Cash flow is computed as <b>G = −B + C</b> (capital contribution out, distribution in).
            Tax and amount-due are not part of the cash flow.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="Due / Transaction Date">
              <input type="date" className={inp} value={form.due_date??''} onChange={e=>sf('due_date',e.target.value)} />
            </Field>
            <Field label="B · Capital Contribution (USD)">
              <input type="number" className={inp} placeholder="49000" value={form.gross_call_usd??''} onChange={e=>sf('gross_call_usd',e.target.value)} />
            </Field>
            <Field label="C · Distribution Received (USD)">
              <input type="number" className={inp} placeholder="0" value={form.distribution_usd??''} onChange={e=>sf('distribution_usd',e.target.value)} />
            </Field>
            <Field label="D · Reinvestable (USD)">
              <input type="number" className={inp} placeholder="0" value={form.reinvestable_usd??''} onChange={e=>sf('reinvestable_usd',e.target.value)} />
            </Field>
            <Field label="Call % of Commitment">
              <input type="number" className={inp} placeholder="4.90" step="0.01" value={form.call_pct??''} onChange={e=>sf('call_pct',e.target.value)} />
            </Field>
            <Field label="Status">
              <select className={inp} value={form.status??'pending'} onChange={e=>sf('status',e.target.value)}>
                {CALL_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Notice Date">
              <input type="date" className={inp} value={form.notice_date??''} onChange={e=>sf('notice_date',e.target.value)} />
            </Field>
            <Field label="FX Rate (USD/JPY)">
              <input type="number" className={inp} placeholder="154.20" step="0.01" value={form.fx_rate??''} onChange={e=>sf('fx_rate',e.target.value)} />
            </Field>
            <Field label="Cash Flow G (manual — leave blank to auto −B + C)">
              <input type="number" className={inp} placeholder="auto"
                value={form.manual_cash_flow_usd??''} onChange={e=>sf('manual_cash_flow_usd',e.target.value)} />
            </Field>
            <Field label="Notes">
              <input className={inp} value={form.notes??''} onChange={e=>sf('notes',e.target.value)} />
            </Field>
            <div className="flex items-end">
              <div className="rounded-lg px-3 py-2 border theme-border w-full" style={{ background: 'rgba(16,185,129,0.06)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">
                  Cash Flow G {hasManualCf ? '(manual)' : '= −B + C'}
                </p>
                <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: cashFlowPreview < 0 ? C.red : C.emerald }}>
                  {cashFlowPreview < 0 ? '−$' : '$'}{Math.abs(cashFlowPreview).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <SaveBtn loading={saving} onClick={submit} />
              <CancelBtn onClick={() => setForm(null)} />
            </div>
          </div>
        </div>
      )}

      {/* table */}
      {calls.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background:'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['#','Notice Date','Due Date','Call %','B · Capital','C · Dist','G · Cash Flow','FX Rate','Status',''].map(h=>(
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h===''||h==='#'?'text-left':'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {calls.map((cc:any)=>{
                const cf = cc.cash_flow_usd ?? (Number(cc.distribution_usd??0) - Number(cc.gross_call_usd??0));
                return (
                <tr key={cc.id} className="theme-row-hover transition-colors">
                  <td className="px-4 py-3 font-bold theme-text">#{cc.call_number}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">{cc.notice_date}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">{cc.due_date}</td>
                  <td className="px-4 py-3 text-right theme-text">{cc.call_pct!=null ? `${Number(cc.call_pct).toFixed(2)}%` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color:C.indigo}}>${Number(cc.gross_call_usd??cc.net_call_usd).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right" style={{color:C.emerald}}>{Number(cc.distribution_usd??0)>0 ? `$${Number(cc.distribution_usd).toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color: cf<0?C.red:C.emerald}}>
                    {cf<0?'−$':'$'}{Math.abs(cf).toLocaleString()}
                    {cc.manual_cash_flow_usd!=null && <span className="ml-1 text-[9px] font-bold px-1 rounded" style={{color:C.amber,background:'rgba(217,119,6,0.12)'}} title="Manual cash-flow entry">M</span>}
                  </td>
                  <td className="px-4 py-3 text-right theme-text-muted">{cc.fx_rate ? Number(cc.fx_rate).toFixed(2) : '—'}</td>
                  <td className="px-4 py-3 text-right"><StatusPill s={cc.status} /></td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex gap-1.5 items-center">
                        <EditBtn onClick={()=>setForm({id:cc.id,due_date:cc.due_date,notice_date:cc.notice_date,gross_call_usd:cc.gross_call_usd,distribution_usd:cc.distribution_usd,reinvestable_usd:cc.reinvestable_usd,manual_cash_flow_usd:cc.manual_cash_flow_usd,call_pct:cc.call_pct,status:cc.status,fx_rate:cc.fx_rate,notes:cc.notes})} />
                        <DelBtn onClick={()=>del(cc.id)} />
                      </div>
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm theme-text-muted">No capital calls yet.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Click "+ Add Capital Call" to create one.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTRIBUTIONS TAB
// ─────────────────────────────────────────────────────────────────────────────
function DistsTab({ fundId, canEdit, onChanged }: { fundId:string; canEdit:boolean; onChanged:()=>void }) {
  const [dists, setDists] = useState<any[]>([]);
  const [form,  setForm]  = useState<any|null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() =>
    fundsAPI.getDists(fundId).then(r => setDists(r.data)).catch(() => {}), [fundId]);
  useEffect(() => { load(); }, [load]);

  const sf = (k:string, v:any) => setForm((f:any)=>({...f,[k]:v}));
  const total = dists.reduce((s,d) => s + Number(d.amount_usd??0), 0);

  async function submit() {
    setSaving(true);
    try {
      if (form.id) { await fundsAPI.updateDist(fundId, form.id, form); toast.success('Distribution updated'); }
      else         { await fundsAPI.createDist(fundId, form);          toast.success('Distribution added');   }
      setForm(null); load(); onChanged();
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Remove this distribution?')) return;
    try { await fundsAPI.deleteDist(fundId, id); load(); onChanged(); toast.success('Removed'); }
    catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="px-5 py-3 flex items-center justify-between border-b theme-border"
           style={{ background: C.emeraldBg }}>
        <p className="text-sm font-semibold theme-text">
          Distributions
          <span className="ml-2 text-xs font-normal theme-text-muted">{dists.length} records</span>
          {total > 0 && <span className="ml-3 font-semibold" style={{color:C.emerald}}>${total.toLocaleString()}</span>}
        </p>
        {canEdit && !form && (
          <button onClick={() => setForm({dist_type:'Income'})}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            + Add Distribution
          </button>
        )}
      </div>

      {form && (
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 border-b theme-border"
             style={{ background:'rgba(16,185,129,0.03)' }}>
          <Field label="Date">
            <input type="date" className={inp} value={form.distribution_date??''} onChange={e=>sf('distribution_date',e.target.value)} />
          </Field>
          <Field label="Amount (USD)">
            <input type="number" className={inp} placeholder="0" value={form.amount_usd??''} onChange={e=>sf('amount_usd',e.target.value)} />
          </Field>
          <Field label="Type">
            <select className={inp} value={form.dist_type??'Income'} onChange={e=>sf('dist_type',e.target.value)}>
              {DIST_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Reinvestable (USD)">
            <input type="number" className={inp} placeholder="0" value={form.reinvestable_usd??''} onChange={e=>sf('reinvestable_usd',e.target.value)} />
          </Field>
          <Field label="FX Rate">
            <input type="number" className={inp} placeholder="154.20" step="0.01" value={form.fx_rate??''} onChange={e=>sf('fx_rate',e.target.value)} />
          </Field>
          <div className="flex items-end gap-2 col-span-2">
            <SaveBtn loading={saving} onClick={submit} />
            <CancelBtn onClick={() => setForm(null)} />
          </div>
        </div>
      )}

      {dists.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background:'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['Date','Type','Amount (USD)','Amount (JPY)','Reinvestable','FX Rate',''].map(h=>(
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide ${h===''?'text-left':'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {dists.map((d:any)=>(
                <tr key={d.id} className="theme-row-hover">
                  <td className="px-4 py-3 text-right theme-text-muted">{d.distribution_date}</td>
                  <td className="px-4 py-3 text-right theme-text">{d.dist_type}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color:C.emerald}}>${Number(d.amount_usd).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">¥{Number(d.amount_jpy).toLocaleString('ja-JP')}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">${Number(d.reinvestable_usd).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">{d.fx_rate ? Number(d.fx_rate).toFixed(2):'—'}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex gap-1.5">
                        <EditBtn onClick={()=>setForm({id:d.id,distribution_date:d.distribution_date,amount_usd:d.amount_usd,dist_type:d.dist_type,reinvestable_usd:d.reinvestable_usd,fx_rate:d.fx_rate})} />
                        <DelBtn onClick={()=>del(d.id)} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm theme-text-muted">No distributions recorded yet.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Click "+ Add Distribution" to record one.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAV RECORDS TAB
// ─────────────────────────────────────────────────────────────────────────────
function NavTab({ fundId, canEdit, onChanged }: { fundId:string; canEdit:boolean; onChanged:()=>void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [form, setForm]       = useState<any|null>(null);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(() =>
    fundsAPI.getNavRecords(fundId).then(r => setRecords(r.data)).catch(() => {}), [fundId]);
  useEffect(() => { load(); }, [load]);

  const sf = (k:string, v:any) => setForm((f:any)=>({...f,[k]:v}));

  async function submit() {
    setSaving(true);
    try {
      if (form.id) { await fundsAPI.updateNavRecord(fundId, form.id, form); toast.success('NAV updated'); }
      else         { await fundsAPI.createNavRecord(fundId, form);           toast.success('NAV added');   }
      setForm(null); load(); onChanged();
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Remove this NAV record?')) return;
    try { await fundsAPI.deleteNavRecord(fundId, id); load(); onChanged(); toast.success('Removed'); }
    catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="px-5 py-3 flex items-center justify-between border-b theme-border"
           style={{ background:'rgba(139,92,246,0.08)' }}>
        <p className="text-sm font-semibold theme-text">
          NAV Records
          <span className="ml-2 text-xs font-normal theme-text-muted">{records.length} records</span>
        </p>
        {canEdit && !form && (
          <button onClick={() => setForm({})}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            + Add NAV Record
          </button>
        )}
      </div>

      {form && (
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b theme-border"
             style={{ background:'rgba(139,92,246,0.03)' }}>
          <Field label="NAV Date">
            <input type="date" className={inp} value={form.nav_date??''} onChange={e=>sf('nav_date',e.target.value)} />
          </Field>
          <Field label="NAV (USD)">
            <input type="number" className={inp} placeholder="1000000" value={form.nav_usd??''} onChange={e=>sf('nav_usd',e.target.value)} />
          </Field>
          <Field label="Period">
            <input className={inp} placeholder="Q4 2025" value={form.period??''} onChange={e=>sf('period',e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <SaveBtn loading={saving} onClick={submit} />
            <CancelBtn onClick={() => setForm(null)} />
          </div>
        </div>
      )}

      {records.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background:'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['NAV Date','Period','NAV (USD)',''].map(h=>(
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide ${h===''?'text-left':'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {records.map((n:any)=>(
                <tr key={n.id} className="theme-row-hover">
                  <td className="px-4 py-3 text-right theme-text-muted">{n.nav_date}</td>
                  <td className="px-4 py-3 text-right theme-text">{n.period??'—'}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color:C.violet}}>${Number(n.nav_usd).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex gap-1.5">
                        <EditBtn onClick={()=>setForm({id:n.id,nav_date:n.nav_date,nav_usd:n.nav_usd,period:n.period})} />
                        <DelBtn onClick={()=>del(n.id)} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm theme-text-muted">No NAV records yet.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Click "+ Add NAV Record" to add one.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER TAB (read-only computed columns B C D E F G H)
// ─────────────────────────────────────────────────────────────────────────────
function LedgerTab({ fundId }: { fundId:string }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [snap, setSnap] = useState<LedgerSnapshot|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fundsAPI.ledger(fundId)
      .then(r => { setRows(r.data.rows??[]); setSnap(r.data.snapshot??null); })
      .finally(() => setLoading(false));
  }, [fundId]);

  if (loading) return <p className="px-5 py-8 text-sm theme-text-muted">Loading ledger…</p>;

  return (
    <div>
      {/* Snapshot */}
      {snap && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x theme-border border-b theme-border"
             style={{ background:'rgba(79,70,229,0.04)' }}>
          {[
            ['Commitment',  fmt.usd(snap.commitment_usd, true)],
            ['Paid-in',     fmt.usd(snap.total_called_usd, true)],
            ['Received',    fmt.usd(snap.total_received_usd, true)],
            ['Drawn %',     fmt.pct(snap.drawn_pct)],
            ['Unfunded',    fmt.usd(snap.unfunded_usd, true)],
            ['F Inv.Cap',   fmt.usd(snap.investment_capacity, true)],
            ['H Net Cash',  fmt.usd(snap.net_cash_position, true)],
            ['DPI',         snap.dpi.toFixed(3)+'×'],
          ].map(([label, value])=>(
            <div key={String(label)} className="px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{label}</p>
              <p className="text-sm font-bold tabular-nums theme-text mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-3xl mb-3 opacity-20">📋</p>
          <p className="text-sm theme-text-muted">No paid transactions yet.</p>
          <p className="text-xs theme-text-muted mt-1">Add capital calls or distributions and mark them as paid.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead style={{ background:'var(--color-header-bg)' }}>
              <tr className="border-b theme-border">
                {['Date','Description','FX','B Called','C Received','D Reinvest',
                  'E Cum.Called','F Inv.Cap','G Cash Flow','H Net Cash','L Dist Not Reinv',
                  'Return of Capital','Gain','Interest'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-[9px] font-semibold theme-text-muted uppercase tracking-wide text-right first:text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {rows.map((row,i) => {
                const isCall = row.tx_type === 'capital_call';
                return (
                  <tr key={i} className="theme-row-hover">
                    <td className="px-3 py-2.5 theme-text-muted whitespace-nowrap">{fmt.date(row.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded mr-1.5 ${isCall?'bg-red-500/15 text-red-400':'bg-emerald-500/15 text-emerald-400'}`}>
                        {isCall?'↓ Call':'↑ Dist'}
                      </span>
                      <span className="theme-text-muted">{row.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{fmt.rate(row.fx_rate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:row.capital_paid_in?C.red:'inherit'}}>{row.capital_paid_in?fmt.usd(row.capital_paid_in):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:row.capital_received?C.emerald:'inherit'}}>{row.capital_received?fmt.usd(row.capital_received):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{row.reinvestable?fmt.usd(row.reinvestable):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:C.indigo}}>{fmt.usd(row.cumulative_called)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:C.violet}}>{fmt.usd(row.investment_capacity)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:row.cash_flow<0?C.red:C.emerald}}>{fmt.usd(row.cash_flow)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{color:row.net_cash_position<0?C.red:C.emerald}}>{fmt.usd(row.net_cash_position)}</td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{row.capital_received?fmt.usd(row.capital_received-(row.reinvestable??0)):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{row.return_of_capital?fmt.usd(row.return_of_capital):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{row.gain?fmt.usd(row.gain):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono theme-text-muted">{row.interest?fmt.usd(row.interest):'—'}</td>
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

// ─────────────────────────────────────────────────────────────────────────────
// FUND DETAILS TAB (all fields editable)
// ─────────────────────────────────────────────────────────────────────────────
function DetailsTab({ detail, canEdit, fundId, onSaved }: { detail: FundDetail; canEdit:boolean; fundId:string; onSaved:()=>void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<any>({});
  const [saving, setSaving]   = useState(false);
  const sf = (k:string, v:any) => setForm((f:any)=>({...f,[k]:v}));

  function startEdit() {
    setForm({
      fund_name:               detail.fund_name,
      fund_name_jp:            detail.fund_name_jp??'',
      manager:                 detail.manager??'',
      administrator:           detail.administrator??'',
      strategy:                detail.strategy??'',
      vintage_year:            detail.vintage_year??'',
      currency:                detail.currency??'USD',
      commitment_usd:          detail.commitment_usd??'',
      entry_fx_rate:           detail.entry_fx_rate??'',
      contract_date:           detail.contract_date??'',
      investment_period_start: detail.investment_period_start??'',
      investment_period_end:   detail.investment_period_end??'',
      fund_term_years:         detail.fund_term_years??'',
      management_fee_pct:      detail.management_fee_pct??'',
      carry_pct:               detail.carry_pct??'',
      hurdle_rate_pct:         detail.hurdle_rate_pct??'',
      notes:                   detail.notes??'',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await fundsAPI.update(fundId, form);
      toast.success('Fund details saved');
      setEditing(false);
      onSaved();
    } catch { toast.error('Failed to save fund details'); }
    finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="p-5">
        {canEdit && (
          <div className="flex justify-end mb-5">
            <button onClick={startEdit}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              Edit Fund Details
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y theme-border">
          {[
            ['Fund Name',           detail.fund_name],
            ['Japanese Name',       detail.fund_name_jp],
            ['Manager',             detail.manager],
            ['Administrator',       detail.administrator],
            ['Strategy',            detail.strategy],
            ['Vintage Year',        detail.vintage_year],
            ['Currency',            detail.currency],
            ['Commitment (USD)',    detail.commitment_usd ? fmt.usd(Number(detail.commitment_usd)) : '—'],
            ['Entry FX Rate',       detail.entry_fx_rate  ? Number(detail.entry_fx_rate).toFixed(4)  : '—'],
            ['Contract Date',       detail.contract_date],
            ['Inv. Period Start',   detail.investment_period_start],
            ['Inv. Period End',     detail.investment_period_end],
            ['Fund Term (years)',   detail.fund_term_years],
            ['Management Fee %',   detail.management_fee_pct != null ? `${detail.management_fee_pct}%` : '—'],
            ['Carry %',            detail.carry_pct        != null ? `${detail.carry_pct}%`        : '—'],
            ['Hurdle Rate %',      detail.hurdle_rate_pct  != null ? `${detail.hurdle_rate_pct}%`  : '—'],
          ].map(([label, value])=>(
            <div key={String(label)} className="flex items-start gap-4 py-3 px-1">
              <p className="text-xs font-semibold theme-text-muted w-44 flex-shrink-0">{label}</p>
              <p className="text-sm theme-text flex-1">{value ?? <span className="theme-text-muted text-xs">—</span>}</p>
            </div>
          ))}
          {detail.notes && (
            <div className="flex items-start gap-4 py-3 px-1 md:col-span-2">
              <p className="text-xs font-semibold theme-text-muted w-44 flex-shrink-0">Notes</p>
              <p className="text-sm theme-text flex-1 whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Field label="Fund Name"><input className={inp} value={form.fund_name??''} onChange={e=>sf('fund_name',e.target.value)} /></Field>
        <Field label="Japanese Name"><input className={inp} value={form.fund_name_jp??''} onChange={e=>sf('fund_name_jp',e.target.value)} /></Field>
        <Field label="Manager"><input className={inp} value={form.manager??''} onChange={e=>sf('manager',e.target.value)} /></Field>
        <Field label="Administrator"><input className={inp} value={form.administrator??''} onChange={e=>sf('administrator',e.target.value)} /></Field>
        <Field label="Strategy">
          <select className={inp} value={form.strategy??''} onChange={e=>sf('strategy',e.target.value)}>
            <option value="">Select…</option>
            {STRATEGIES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Vintage Year"><input type="number" className={inp} value={form.vintage_year??''} onChange={e=>sf('vintage_year',e.target.value)} /></Field>
        <Field label="Currency">
          <select className={inp} value={form.currency??'USD'} onChange={e=>sf('currency',e.target.value)}>
            <option>USD</option><option>EUR</option><option>JPY</option>
          </select>
        </Field>
        <Field label="Commitment (USD)"><input type="number" className={inp} value={form.commitment_usd??''} onChange={e=>sf('commitment_usd',e.target.value)} /></Field>
        <Field label="Entry FX Rate"><input type="number" step="0.0001" className={inp} value={form.entry_fx_rate??''} onChange={e=>sf('entry_fx_rate',e.target.value)} /></Field>
        <Field label="Contract Date"><input type="date" className={inp} value={form.contract_date??''} onChange={e=>sf('contract_date',e.target.value)} /></Field>
        <Field label="Inv. Period Start"><input type="date" className={inp} value={form.investment_period_start??''} onChange={e=>sf('investment_period_start',e.target.value)} /></Field>
        <Field label="Inv. Period End"><input type="date" className={inp} value={form.investment_period_end??''} onChange={e=>sf('investment_period_end',e.target.value)} /></Field>
        <Field label="Fund Term (yrs)"><input type="number" className={inp} value={form.fund_term_years??''} onChange={e=>sf('fund_term_years',e.target.value)} /></Field>
        <Field label="Mgmt Fee %"><input type="number" step="0.01" className={inp} value={form.management_fee_pct??''} onChange={e=>sf('management_fee_pct',e.target.value)} /></Field>
        <Field label="Carry %"><input type="number" step="0.01" className={inp} value={form.carry_pct??''} onChange={e=>sf('carry_pct',e.target.value)} /></Field>
        <Field label="Hurdle Rate %"><input type="number" step="0.01" className={inp} value={form.hurdle_rate_pct??''} onChange={e=>sf('hurdle_rate_pct',e.target.value)} /></Field>
        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <Field label="Notes"><textarea className={`${inp} resize-none`} rows={2} value={form.notes??''} onChange={e=>sf('notes',e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex gap-3">
        <SaveBtn loading={saving} onClick={save} />
        <CancelBtn onClick={() => setEditing(false)} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WIRE TAB (editable)
// ─────────────────────────────────────────────────────────────────────────────
function WireTab({ detail, canEdit, fundId, onSaved }: { detail:FundDetail; canEdit:boolean; fundId:string; onSaved:()=>void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<any>({});
  const [saving, setSaving]   = useState(false);
  const sf = (k:string, v:any) => setForm((f:any)=>({...f,[k]:v}));

  function startEdit() {
    setForm({
      wire_bank:           detail.wire_bank??'',
      wire_account_name:   detail.wire_account_name??'',
      wire_account_number: detail.wire_account_number??'',
      wire_aba:            detail.wire_aba??'',
      wire_swift:          detail.wire_swift??'',
      wire_reference:      detail.wire_reference??'',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await fundsAPI.update(fundId, form);
      toast.success('Wire instructions saved');
      setEditing(false);
      onSaved();
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  }

  const wireFields: [string, string, string][] = [
    ['Beneficiary Bank',  'wire_bank',           detail.wire_bank??''],
    ['Account Name',      'wire_account_name',   detail.wire_account_name??''],
    ['Account Number',    'wire_account_number', detail.wire_account_number??''],
    ['ABA Routing No.',   'wire_aba',            detail.wire_aba??''],
    ['SWIFT / BIC',       'wire_swift',          detail.wire_swift??''],
    ['Wire Reference',    'wire_reference',      detail.wire_reference??''],
  ];

  if (!editing) return (
    <div className="p-5">
      {canEdit && (
        <div className="flex justify-end mb-5">
          <button onClick={startEdit}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
            Edit Wire Instructions
          </button>
        </div>
      )}
      {detail.wire_bank ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wireFields.filter(([,,v])=>v).map(([label,,value])=>(
            <div key={label} className="rounded-xl px-4 py-3 border theme-border"
                 style={{ background:'rgba(255,255,255,0.02)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{label}</p>
              <p className="text-sm font-mono font-medium theme-text mt-1 break-all">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-3xl opacity-20 mb-3">🏦</p>
          <p className="text-sm theme-text-muted">No wire instructions on file.</p>
          {canEdit && <p className="text-xs theme-text-muted mt-1">Click "Edit Wire Instructions" to add them.</p>}
        </div>
      )}
      {detail.wire_bank && (
        <p className="text-xs theme-text-muted mt-4 px-1">Always confirm wire instructions directly with the fund manager before wiring funds.</p>
      )}
    </div>
  );

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wireFields.map(([label, key])=>(
          <Field key={key} label={label}>
            <input className={inp} value={form[key]??''} onChange={e=>sf(key,e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="flex gap-3">
        <SaveBtn loading={saving} onClick={save} />
        <CancelBtn onClick={() => setEditing(false)} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL FUND SECTION
// ─────────────────────────────────────────────────────────────────────────────
type TabKey = 'documents' | 'calls' | 'distributions' | 'nav' | 'ledger' | 'details' | 'wire';

function FundSection({
  fund, detail, canEdit, onChanged,
}: {
  fund: FundSummary; detail: FundDetail;
  canEdit: boolean; onChanged: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('documents');
  const fundId   = fund.fund_id;
  const isActive = fund.is_active !== false;
  const dotColor = strategyColor[fund.strategy??''] ?? '#6b7280';
  const badge    = strategyBg[fund.strategy??'']   ?? 'bg-gray-100 text-gray-700';
  const summary  = (detail as any).summary ?? {};
  const paidIn   = Number(summary.total_called_usd  ?? 0);
  const powder   = Number(summary.unfunded_usd       ?? (Number(detail.commitment_usd) - paidIn));
  const drawn    = Number(summary.drawn_pct          ?? 0);

  async function toggleActive() {
    if (!confirm(isActive ? 'Deactivate this fund?' : 'Reactivate this fund?')) return;
    try {
      if (isActive) await fundsAPI.deactivate(fundId);
      else          await fundsAPI.reactivate(fundId);
      toast.success(isActive ? 'Fund deactivated' : 'Fund reactivated');
      onChanged();
    } catch { toast.error('Action failed'); }
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key:'documents',     label:'Documents'      },
    { key:'calls',         label:'Capital Calls'  },
    { key:'distributions', label:'Distributions'  },
    { key:'nav',           label:'NAV Records'    },
    { key:'ledger',        label:'Ledger'         },
    { key:'details',       label:'Fund Details'   },
    { key:'wire',          label:'Wire Instructions'},
  ];

  return (
    <div className="theme-card border theme-border rounded-2xl overflow-hidden"
         style={{ opacity: isActive ? 1 : 0.6 }}>

      {/* ── header ── */}
      <div className="px-6 py-5"
           style={{ background:'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.03) 100%)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: dotColor }} />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold theme-text leading-snug">{detail.fund_name}</h2>
                {!isActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-slate-400 bg-slate-500/10 border-slate-500/20">
                    Inactive
                  </span>
                )}
              </div>
              {detail.fund_name_jp && <p className="text-sm theme-text-muted mt-0.5">{detail.fund_name_jp}</p>}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {detail.strategy && <span className={`text-xs font-medium px-2.5 py-0.5 rounded ${badge}`}>{detail.strategy}</span>}
                {detail.vintage_year && <span className="text-xs theme-text-muted">Vintage {detail.vintage_year}</span>}
                {detail.manager && <span className="text-xs theme-text-muted">· {detail.manager}</span>}
                {detail.administrator && <span className="text-xs theme-text-muted">· Admin: {detail.administrator}</span>}
              </div>
            </div>
          </div>
          {canEdit && (
            <button onClick={toggleActive}
              className={`flex-shrink-0 text-sm px-4 py-1.5 rounded-lg font-medium border transition-colors ${
                isActive
                  ? 'text-red-400 border-red-500/25 hover:bg-red-500/10'
                  : 'text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/10'
              }`}>
              {isActive ? 'Deactivate Fund' : 'Reactivate Fund'}
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t theme-border divide-x theme-border">
        {[
          { label:'LP Commitment',  value: fmt.usd(Number(detail.commitment_usd), true), note:'gross' },
          { label:'Paid-in (E)',    value: fmt.usd(paidIn, true),                        note:`${drawn.toFixed(2)}% drawn` },
          { label:'Dry Powder (F)', value: fmt.usd(powder, true),                        note:'unfunded' },
          { label:'DPI',            value: `${Number(summary.dpi??0).toFixed(3)}×`,     note:'dist / paid-in' },
        ].map(m=>(
          <div key={m.label} className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted">{m.label}</p>
            <p className="text-lg font-bold tabular-nums theme-text mt-1">{m.value}</p>
            <p className="text-[10px] theme-text-muted mt-0.5">{m.note}</p>
          </div>
        ))}
      </div>

      {/* ── deployment bar ── */}
      <div className="px-6 py-3 border-t theme-border">
        <div className="flex justify-between text-xs theme-text-muted mb-1.5">
          <span>Commitment utilization</span>
          <span className="font-semibold" style={{ color: C.indigo }}>{drawn.toFixed(2)}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background:'var(--color-card-border)' }}>
          <div className="h-full rounded-full transition-all duration-700"
               style={{ width:`${Math.min(drawn,100)}%`, background: drawn>=90?C.red:C.indigo }} />
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="border-t theme-border">
        <div className="flex overflow-x-auto border-b theme-border"
             style={{ background:'rgba(255,255,255,0.02)' }}>
          {TABS.map(({ key, label })=>(
            <button key={key} onClick={()=>setTab(key)}
              className={`px-5 py-3 text-sm font-semibold flex-shrink-0 transition-colors border-b-2 ${
                tab===key ? 'theme-text' : 'theme-text-muted hover:theme-text'
              }`}
              style={{ borderColor: tab===key ? C.indigo : 'transparent' }}>
              {label}
            </button>
          ))}
        </div>

        {tab==='documents'     && <FundDocuments fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='calls'         && <CallsTab    fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='distributions' && <DistsTab    fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='nav'           && <NavTab      fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='ledger'        && <LedgerTab   fundId={fundId} />}
        {tab==='details'       && <DetailsTab  detail={detail} canEdit={canEdit} fundId={fundId} onSaved={onChanged} />}
        {tab==='wire'          && <WireTab     detail={detail} canEdit={canEdit} fundId={fundId} onSaved={onChanged} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FUND CARD (list view — name + a few headline stats, click to open)
// ─────────────────────────────────────────────────────────────────────────────
function FundCard({ fund, detail, onClick }: { fund: FundSummary; detail?: FundDetail; onClick: () => void }) {
  const isActive = fund.is_active !== false;
  const dotColor = strategyColor[fund.strategy ?? ''] ?? '#6b7280';
  const badge    = strategyBg[fund.strategy ?? '']   ?? 'bg-gray-100 text-gray-700';
  const summary  = (detail as any)?.summary ?? {};
  const commitment = Number(detail?.commitment_usd ?? 0);
  const drawn      = Number(summary.drawn_pct ?? 0);

  return (
    <button onClick={onClick}
      className="theme-card border theme-border rounded-2xl p-5 text-left w-full transition-colors hover:border-indigo-500/50"
      style={{ opacity: isActive ? 1 : 0.6 }}>
      <div className="flex items-start gap-3">
        <span className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold theme-text leading-snug">{fund.fund_name}</h2>
            {!isActive && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border text-slate-400 bg-slate-500/10 border-slate-500/20">Inactive</span>
            )}
          </div>
          {detail?.fund_name_jp && <p className="text-xs theme-text-muted mt-0.5">{detail.fund_name_jp}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {fund.strategy && <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${badge}`}>{fund.strategy}</span>}
            {detail?.vintage_year && <span className="text-[11px] theme-text-muted">Vintage {detail.vintage_year}</span>}
            {fund.manager && <span className="text-[11px] theme-text-muted truncate">· {fund.manager}</span>}
          </div>
        </div>
        <span className="theme-text-muted text-lg flex-shrink-0">→</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t theme-border">
        {(() => {
          const netCash = Number(summary.net_cash_position ?? (Number(summary.total_received_usd ?? 0) - Number(summary.total_called_usd ?? 0)));
          const cells: [string, string, string?][] = [
            ['Commitment', fmt.usd(commitment, true)],
            ['Net Cash',   fmt.usd(netCash, true), netCash < 0 ? '#ef4444' : '#10b981'],
            ['Drawn',      `${drawn.toFixed(1)}%`],
            ['DPI',        `${Number(summary.dpi ?? 0).toFixed(2)}×`],
          ];
          return cells.map(([label, value, color]) => (
            <div key={label}>
              <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{label}</p>
              <p className="text-sm font-bold tabular-nums mt-0.5" style={color ? { color } : undefined}>
                <span className={color ? '' : 'theme-text'}>{value}</span>
              </p>
            </div>
          ));
        })()}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function FundManagement() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [funds,       setFunds]       = useState<FundSummary[]>([]);
  const [details,     setDetails]     = useState<Record<string, FundDetail>>({});
  const [loading,     setLoading]     = useState(true);
  const [showWizard,  setShowWizard]  = useState(false);
  const [showInactive,setShowInactive]= useState(true);
  const [search,      setSearch]      = useState('');
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);

  const loadFunds = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fundsAPI.list();   // backend returns all (active + inactive)
      const list: FundSummary[] = r.data;
      setFunds(list);
      // Fetch full detail for each fund (has wire, administrator, dates, etc.)
      await Promise.all(list.map(async f => {
        try {
          const dr = await fundsAPI.get(f.fund_id);
          setDetails(prev => ({ ...prev, [f.fund_id]: dr.data }));
        } catch { /* keep loading others */ }
      }));
    } catch { toast.error('Failed to load funds'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  const activeCount   = funds.filter(f => f.is_active !== false).length;
  const inactiveCount = funds.length - activeCount;

  const filtered = funds
    .filter(f => showInactive || f.is_active !== false)
    .filter(f =>
      f.fund_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.manager  ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (f.strategy ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const selectedFund   = selectedFundId ? funds.find(f => f.fund_id === selectedFundId) ?? null : null;
  const selectedDetail = selectedFundId ? details[selectedFundId] : undefined;

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {selectedFund && (
            <button onClick={() => setSelectedFundId(null)}
              className="text-sm theme-text-muted hover:theme-text transition-colors mb-1">
              ← All funds
            </button>
          )}
          <h1 className="text-xl font-bold theme-text">
            {selectedFund ? selectedFund.fund_name : t('funds.title')}
          </h1>
          {!selectedFund && (
            <p className="text-sm theme-text-muted mt-0.5">
              {activeCount} active fund{activeCount!==1?'s':''}
              {inactiveCount>0 && ` · ${inactiveCount} inactive`}
              {' · select a fund to view its details'}
            </p>
          )}
        </div>
        {!selectedFund && (
          <div className="flex items-center gap-2">
            {inactiveCount > 0 && (
              <button onClick={() => setShowInactive(v=>!v)}
                className="text-sm px-3 py-1.5 rounded-lg border theme-border theme-text-muted hover:theme-text transition-colors">
                {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
              </button>
            )}
            {canEdit && (
              <button onClick={() => setShowWizard(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
                + Add Fund
              </button>
            )}
          </div>
        )}
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span>🔒</span>
          <span>You are in view-only mode. Log in as Admin or Finance Manager to edit.</span>
        </div>
      )}

      {selectedFund ? (
        /* ── DETAIL VIEW — one fund's full sections ── */
        selectedDetail ? (
          <FundSection
            fund={selectedFund}
            detail={selectedDetail}
            canEdit={canEdit}
            onChanged={() => { loadFunds(); }}
          />
        ) : (
          <div className="theme-card border theme-border rounded-2xl p-8 flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm theme-text-muted">Loading {selectedFund.fund_name}…</p>
          </div>
        )
      ) : (
        /* ── LIST VIEW — upload bar + fund name cards ── */
        <>
          {canEdit && funds.length > 0 && (
            <FundUploadBar
              funds={funds.map(f => ({ fund_id: f.fund_id, fund_name: f.fund_name }))}
              onUploaded={() => loadFunds()}
            />
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-sub">🔍</span>
            <input type="text" placeholder="Search funds…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 theme-input rounded-xl text-sm" />
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-9 h-9 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 theme-text-muted">
              <p className="text-5xl mb-4">🏦</p>
              <p className="text-base font-medium">No funds found</p>
              {canEdit && <p className="text-sm mt-2">Click "+ Add Fund" to create your first fund.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map(fund => (
                <FundCard
                  key={fund.fund_id}
                  fund={fund}
                  detail={details[fund.fund_id]}
                  onClick={() => setSelectedFundId(fund.fund_id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showWizard && (
        <AddFundWizard onClose={() => { setShowWizard(false); loadFunds(); }} />
      )}
    </div>
  );
}

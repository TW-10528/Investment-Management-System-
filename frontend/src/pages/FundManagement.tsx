/**
 * Fund Management Page
 * Shows ALL funds (active + inactive) as full sections.
 * Each section has tabs: Overview · Capital Calls · Distributions · NAV · Ledger · Details · Wire
 * Everything is inline-editable. Edit/delete available for admin and finance roles.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fundsAPI, fxRatesAPI, fundReportsAPI } from '../services/api';
import type { FundDetail, FundSummary, LedgerRow, LedgerSnapshot } from '../types/index';
import { fmt, strategyBg, strategyColor } from '../lib/format';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import AddFundWizard from '../components/AddFundWizard';
import FundDocuments from '../components/FundDocuments';
import FundUploadBar from '../components/FundUploadBar';
import PortfolioOverview from '../components/PortfolioOverview';
import toast from 'react-hot-toast';

// ── Edit access — every signed-in user can edit (no role differentiation) ───────
function useCanEdit() {
  return true;
}

// ── Colours ───────────────────────────────────────────────────────────────────
// Formal / corporate palette — deep navy primary, muted green, teal, slate
const C = {
  indigo:  '#1e40af', indigoBg:  'rgba(30,64,175,0.09)', indigoBdr:  'rgba(30,64,175,0.22)',
  emerald: '#047857', emeraldBg: 'rgba(4,120,87,0.09)',  emeraldBdr: 'rgba(4,120,87,0.22)',
  red:     '#b91c1c', redBg:     'rgba(185,28,28,0.08)', redBdr:     'rgba(185,28,28,0.2)',
  violet:  '#0f766e', amber:     '#b45309', slate:       '#475569',
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

function PenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL CALLS TAB
// ─────────────────────────────────────────────────────────────────────────────
function CallsTab({ fundId, canEdit, onChanged }: { fundId:string; canEdit:boolean; onChanged:()=>void }) {
  const [calls, setCalls] = useState<any[]>([]);
  const [form,  setForm]  = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<'USD'|'JPY'>('USD');
  const [murcRate, setMurcRate] = useState<number>(() => {
    const s = localStorage.getItem('murc_fx_rate');
    return s ? Number(s) : 0;
  });
  const [murcEditing, setMurcEditing] = useState(false);
  const [murcInput, setMurcInput] = useState('');

  function saveMurcRate() {
    const val = Number(murcInput);
    if (val > 0) {
      setMurcRate(val);
      localStorage.setItem('murc_fx_rate', String(val));
      toast.success('MURC rate saved');
    }
    setMurcEditing(false);
  }

  function fmtCallAmt(usd: number, rowFx?: number | string | null) {
    if (currency === 'JPY') {
      const rate = rowFx ? Number(rowFx) : murcRate;
      if (!rate) return '¥—';
      return '¥' + Math.round(usd * rate).toLocaleString('ja-JP');
    }
    return fmt.usd(usd);
  }

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
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap border-b theme-border"
           style={{ background: C.indigoBg }}>
        <p className="text-sm font-semibold theme-text">
          Capital Calls
          <span className="ml-2 text-xs font-normal theme-text-muted">{calls.length} records</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* MURC rate editor */}
          {murcEditing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs theme-text-muted whitespace-nowrap">MURC Rate (¥/USD):</span>
              <input
                type="number"
                className="theme-input rounded px-2 py-1 text-xs w-24 border theme-border"
                placeholder="154.20"
                step="0.01"
                value={murcInput}
                onChange={e => setMurcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveMurcRate(); if (e.key === 'Escape') setMurcEditing(false); }}
                autoFocus
              />
              <button onClick={saveMurcRate}
                className="px-2 py-1 rounded text-xs bg-indigo-600 text-white font-semibold">Save</button>
              <button onClick={() => setMurcEditing(false)}
                className="text-xs theme-text-muted px-1 hover:text-red-400">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setMurcInput(murcRate > 0 ? String(murcRate) : ''); setMurcEditing(true); }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors theme-text-muted hover:text-amber-400"
              title={murcRate > 0 ? `MURC Rate: ¥${murcRate.toFixed(2)} / USD — click to edit` : 'Set MURC FX Rate'}>
              <PenIcon />
            </button>
          )}
          {/* Currency toggle */}
          <button
            onClick={() => setCurrency(c => c === 'USD' ? 'JPY' : 'USD')}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
              currency === 'JPY'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25 hover:bg-indigo-500/20'
            }`}>
            {currency === 'USD' ? 'USD → JPY' : 'JPY → USD'}
          </button>
          {canEdit && !form && (
            <button onClick={() => setForm({ status: 'pending' })}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              + Add Capital Call
            </button>
          )}
        </div>
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
                  {cashFlowPreview < 0 ? '−' : ''}{fmt.usd(Math.abs(cashFlowPreview))}
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
                {['#','Notice Date','Due Date','Call %',
                  currency==='USD' ? 'B · Capital (USD)' : 'B · Capital (JPY)',
                  currency==='USD' ? 'C · Dist (USD)'    : 'C · Dist (JPY)',
                  'G · Cash Flow','FX Rate','Status',''].map(h=>(
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
                  <td className="px-4 py-3 text-right font-semibold" style={{color:C.indigo}}>
                    {fmtCallAmt(Number(cc.gross_call_usd??cc.net_call_usd), cc.fx_rate)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{color:C.emerald}}>
                    {Number(cc.distribution_usd??0)>0 ? fmtCallAmt(Number(cc.distribution_usd), cc.fx_rate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color: cf<0?C.red:C.emerald}}>
                    {cf<0?'−':''}{fmt.usd(Math.abs(cf))}
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
            {murcRate > 0 && (
              <tfoot>
                <tr style={{ background:'rgba(217,119,6,0.06)' }}>
                  <td colSpan={10} className="px-4 py-2 text-xs border-t theme-border">
                    <span className="font-semibold" style={{color:C.amber}}>MURC FX Rate:</span>
                    <span className="theme-text-muted ml-1.5">1 USD = ¥{murcRate.toFixed(2)}</span>
                    {currency==='JPY' && <span className="ml-2 text-[10px] theme-text-muted">(applied to Capital &amp; Distribution columns)</span>}
                  </td>
                </tr>
              </tfoot>
            )}
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
  const [currency, setCurrency] = useState<'USD'|'JPY'>('USD');
  const [murcRate, setMurcRate] = useState<number>(() => {
    const s = localStorage.getItem('murc_fx_rate');
    return s ? Number(s) : 0;
  });
  const [murcEditing, setMurcEditing] = useState(false);
  const [murcInput, setMurcInput] = useState('');

  function saveMurcRate() {
    const val = Number(murcInput);
    if (val > 0) {
      setMurcRate(val);
      localStorage.setItem('murc_fx_rate', String(val));
      toast.success('MURC rate saved');
    }
    setMurcEditing(false);
  }

  function fmtDistAmt(d: any) {
    if (currency === 'JPY') {
      if (d.amount_jpy) return '¥' + Number(d.amount_jpy).toLocaleString('ja-JP');
      const rate = d.fx_rate ? Number(d.fx_rate) : murcRate;
      if (!rate) return '¥—';
      return '¥' + Math.round(Number(d.amount_usd) * rate).toLocaleString('ja-JP');
    }
    return fmt.usd(Number(d.amount_usd));
  }

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
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap border-b theme-border"
           style={{ background: C.emeraldBg }}>
        <p className="text-sm font-semibold theme-text">
          Distributions
          <span className="ml-2 text-xs font-normal theme-text-muted">{dists.length} records</span>
          {total > 0 && <span className="ml-3 font-semibold" style={{color:C.emerald}}>{fmt.usd(total)}</span>}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* MURC rate editor */}
          {murcEditing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs theme-text-muted whitespace-nowrap">MURC Rate (¥/USD):</span>
              <input
                type="number"
                className="theme-input rounded px-2 py-1 text-xs w-24 border theme-border"
                placeholder="154.20"
                step="0.01"
                value={murcInput}
                onChange={e => setMurcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveMurcRate(); if (e.key === 'Escape') setMurcEditing(false); }}
                autoFocus
              />
              <button onClick={saveMurcRate}
                className="px-2 py-1 rounded text-xs bg-indigo-600 text-white font-semibold">Save</button>
              <button onClick={() => setMurcEditing(false)}
                className="text-xs theme-text-muted px-1 hover:text-red-400">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setMurcInput(murcRate > 0 ? String(murcRate) : ''); setMurcEditing(true); }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors theme-text-muted hover:text-amber-400"
              title={murcRate > 0 ? `MURC Rate: ¥${murcRate.toFixed(2)} / USD — click to edit` : 'Set MURC FX Rate'}>
              <PenIcon />
            </button>
          )}
          {/* Currency toggle */}
          <button
            onClick={() => setCurrency(c => c === 'USD' ? 'JPY' : 'USD')}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
              currency === 'JPY'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20'
            }`}>
            {currency === 'USD' ? 'USD → JPY' : 'JPY → USD'}
          </button>
          {canEdit && !form && (
            <button onClick={() => setForm({dist_type:'Income'})}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              + Add Distribution
            </button>
          )}
        </div>
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
                {['Date','Type',
                  currency==='USD' ? 'Amount (USD)' : 'Amount (JPY)',
                  'Reinvestable','FX Rate',''].map(h=>(
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide ${h===''?'text-left':'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {dists.map((d:any)=>(
                <tr key={d.id} className="theme-row-hover">
                  <td className="px-4 py-3 text-right theme-text-muted">{d.distribution_date}</td>
                  <td className="px-4 py-3 text-right theme-text">{d.dist_type}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{color:C.emerald}}>{fmtDistAmt(d)}</td>
                  <td className="px-4 py-3 text-right theme-text-muted">{fmt.usd(Number(d.reinvestable_usd))}</td>
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
            {murcRate > 0 && (
              <tfoot>
                <tr style={{ background:'rgba(217,119,6,0.06)' }}>
                  <td colSpan={6} className="px-4 py-2 text-xs border-t theme-border">
                    <span className="font-semibold" style={{color:C.amber}}>MURC FX Rate:</span>
                    <span className="theme-text-muted ml-1.5">1 USD = ¥{murcRate.toFixed(2)}</span>
                    {currency==='JPY' && <span className="ml-2 text-[10px] theme-text-muted">(applied to Amount column)</span>}
                  </td>
                </tr>
              </tfoot>
            )}
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
// Pure UTC date shift — module-level so it works for any fund/row count without re-creation
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// CASH FLOW TAB — period cash flow (G) bars + cumulative net cash (H) line + table
// ─────────────────────────────────────────────────────────────────────────────
function CashFlowTab({ fundId, currency }: { fundId: string; currency?: string }) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [snap, setSnap] = useState<LedgerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const money = (n: any) =>
    n == null ? '—'
    : currency === 'JPY' ? '¥' + Math.round(Number(n)).toLocaleString('en-US')
    : fmt.usd(Number(n));

  useEffect(() => {
    setLoading(true);
    fundsAPI.ledger(fundId)
      .then(r => { setRows(r.data.rows ?? []); setSnap(r.data.snapshot ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fundId]);

  if (loading) return <p className="px-5 py-8 text-sm theme-text-muted">Loading cash flow…</p>;
  if (rows.length === 0) return (
    <div className="px-5 py-12 text-center">
      <p className="text-3xl mb-3 opacity-20">💸</p>
      <p className="text-sm theme-text-muted">No cash flow yet — add capital calls or distributions.</p>
    </div>
  );

  const totalOut = rows.reduce((s, r) => s + (r.capital_paid_in || 0), 0);
  const totalIn  = rows.reduce((s, r) => s + (r.capital_received || 0), 0);
  const net      = totalIn - totalOut;

  // One point per transaction date: contributions (−B), distributions (+C), cumulative net (H).
  const chartData = rows.map(r => ({
    date:        fmt.date(r.date),
    contributions: -(r.capital_paid_in || 0),
    distributions: r.capital_received || 0,
    cumulative:  r.net_cash_position,
  }));

  return (
    <div className="p-5 space-y-5">
      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Contributions (out)', val: money(totalOut),       color: C.red },
          { label: 'Total Distributions (in)',  val: money(totalIn),        color: C.emerald },
          { label: 'Net Cash Flow',             val: money(net),            color: net < 0 ? C.red : C.emerald },
          { label: 'Net Cash Position (H)',     val: money(snap?.net_cash_position ?? net), color: (snap?.net_cash_position ?? net) < 0 ? C.red : C.emerald },
        ].map(m => (
          <div key={m.label} className="theme-card border theme-border rounded-xl p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest theme-text-muted">{m.label}</p>
            <p className="text-lg font-bold tabular-nums mt-1" style={{ color: m.color }}>{m.val}</p>
          </div>
        ))}
      </div>

      {/* chart */}
      <div className="theme-card border theme-border rounded-xl p-4">
        <p className="text-xs font-bold theme-text mb-3">Cash Flow Overview — contributions vs distributions, with cumulative net</p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 12 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                     tickFormatter={(v: number) => (currency === 'JPY' ? '¥' : '$') + (Math.abs(v) >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'k')} />
              <Tooltip formatter={(v: any) => money(v)} contentStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="var(--color-card-border)" />
              <Bar dataKey="contributions" name="Contributions" fill={C.red} radius={[2,2,0,0]} />
              <Bar dataKey="distributions" name="Distributions" fill={C.emerald} radius={[2,2,0,0]} />
              <Line dataKey="cumulative" name="Cumulative net" stroke={C.indigo} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* period table (G / H) */}
      <div className="overflow-x-auto rounded-xl border theme-border">
        <table className="w-full text-xs">
          <thead style={{ background: 'var(--color-header-bg)' }}>
            <tr className="border-b theme-border text-[10px] uppercase tracking-wide theme-text-muted">
              {['Date','Type','Contribution (B)','Distribution (C)','Cash Flow (G)','Net Position (H)'].map((h, i) => (
                <th key={h} className={`px-3 py-2 font-semibold whitespace-nowrap ${i<2?'text-left':'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y theme-border">
            {rows.map((r, i) => (
              <tr key={i} className="theme-row-hover">
                <td className="px-3 py-2 theme-text-muted whitespace-nowrap">{fmt.date(r.date)}</td>
                <td className="px-3 py-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${r.tx_type==='distribution'?'text-emerald-400 border-emerald-500/25 bg-emerald-500/10':'text-indigo-400 border-indigo-500/25 bg-indigo-500/10'}`}>
                    {r.tx_type==='distribution'?'Distribution':'Capital Call'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.capital_paid_in?C.red:undefined }}>{r.capital_paid_in?money(r.capital_paid_in):'—'}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.capital_received?C.emerald:undefined }}>{r.capital_received?money(r.capital_received):'—'}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.cash_flow<0?C.red:C.emerald }}>{money(r.cash_flow)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: r.net_cash_position<0?C.red:C.emerald }}>{money(r.net_cash_position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// LEDGER TAB — B Called / B (¥) / C Received / C (¥) adjacent columns, notes edit
// FX column shows the MURC TTM rate for each transaction date (auto-fetched)
// ─────────────────────────────────────────────────────────────────────────────
function LedgerTab({ fundId, canEdit, currency }: { fundId:string; canEdit:boolean; currency?:string }) {
  const [rows, setRows]           = useState<LedgerRow[]>([]);
  const [snap, setSnap]           = useState<LedgerSnapshot|null>(null);
  const [fundName, setFundName]   = useState('');
  const [fundDetail, setFundDetail] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [editIdx, setEditIdx]     = useState<number|null>(null);
  const [noteText, setNoteText]   = useState('');
  const [saving, setSaving]       = useState(false);
  // murcRates: MURC TTM USD/JPY rate keyed by YYYY-MM-DD, fetched per transaction date
  const [murcRates, setMurcRates]     = useState<Record<string, number>>({});
  const [rateLoading, setRateLoading] = useState(false);
  const [editDateIdx, setEditDateIdx] = useState<number|null>(null);
  const [editDateVal, setEditDateVal] = useState('');
  const [dateSaving,  setDateSaving]  = useState(false);

  const fetchMurcRates = useCallback(async (loaded: LedgerRow[]) => {
    if (!loaded.length) return;
    const uniqueDates = [...new Set(loaded.map(r => r.date))];
    setRateLoading(true);
    const results = await Promise.allSettled(
      uniqueDates.map(date =>
        fxRatesAPI.historical(date, 'USD', 'JPY')
          .then((r: any) => ({ date, rate: r.data.usd_jpy as number }))
      )
    );
    const map: Record<string, number> = {};
    results.forEach(r => { if (r.status === 'fulfilled' && r.value.rate) map[r.value.date] = r.value.rate; });
    setMurcRates(map);
    setRateLoading(false);
  }, []);

  const loadLedger = useCallback(() => {
    setLoading(true);
    Promise.all([
      fundsAPI.ledger(fundId),
      fundsAPI.get(fundId)
    ])
      .then(([r, detailsR]) => {
        const loaded = r.data.rows ?? [];
        setRows(loaded);
        setSnap(r.data.snapshot ?? null);
        setFundName(r.data.fund_name ?? '');
        setFundDetail(detailsR.data ?? null);
        fetchMurcRates(loaded);
      })
      .finally(() => setLoading(false));
  }, [fundId, fetchMurcRates]);

  useEffect(() => {
    setEditIdx(null);
    setEditDateIdx(null);
    setEditDateVal('');
    loadLedger();
  }, [loadLedger]);

  function jpyStr(usd: number, rate: number | null | undefined): string {
    if (!usd || !rate) return '—';
    return '¥' + Math.round(usd * rate).toLocaleString('ja-JP');
  }

  const fmtAmt = (n: any) =>
    n == null ? '—'
    : currency === 'JPY' ? fmt.jpy(Number(n))
    : fmt.usd(Number(n));

  function openNote(row: LedgerRow, idx: number) {
    setEditIdx(idx);
    setNoteText(row.notes ?? '');
  }

  async function saveDate(row: LedgerRow, rowIdx: number, newDate: string) {
    setDateSaving(true);
    try {
      if (row.tx_type === 'capital_call' && row.call_id) {
        await fundsAPI.updateCall(fundId, row.call_id, { due_date: newDate });
      } else if (row.tx_type === 'distribution' && row.dist_id) {
        await fundsAPI.updateDist(fundId, row.dist_id, { distribution_date: newDate });
      }
      // Optimistic: update the row date in-place without a full reload
      setRows(prev => prev.map((r, idx) => idx === rowIdx ? { ...r, date: newDate } : r));
      // Fetch MURC rate for the new date if not already cached
      if (!murcRates[newDate]) {
        fxRatesAPI.historical(newDate, 'USD', 'JPY')
          .then((r: any) => { if (r.data?.usd_jpy) setMurcRates(prev => ({ ...prev, [newDate]: r.data.usd_jpy })); })
          .catch(() => {});
      }
      toast.success('Date updated');
      setEditDateIdx(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to update date');
    } finally { setDateSaving(false); }
  }

  async function saveNote(row: LedgerRow, text: string) {
    setSaving(true);
    try {
      if (row.tx_type === 'capital_call' && row.call_id) {
        await fundsAPI.updateCall(fundId, row.call_id, { notes: text });
      } else if (row.tx_type === 'distribution' && row.dist_id) {
        await fundsAPI.updateDist(fundId, row.dist_id, { notes: text });
      }
      toast.success(text ? 'Note saved' : 'Note deleted');
      setEditIdx(null); loadLedger();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to save note');
    } finally { setSaving(false); }
  }

  // Date range per row:
  //   min = day after previous row's date (no lower bound for first row)
  //   max = day before next row's date    (no upper bound for last row)
  function getDateRange(rowIdx: number): { min: string; max: string } {
    const min = rowIdx > 0 && rows[rowIdx - 1]?.date
      ? shiftDate(rows[rowIdx - 1].date, 1)
      : '';
    const max = rowIdx < rows.length - 1 && rows[rowIdx + 1]?.date
      ? shiftDate(rows[rowIdx + 1].date, -1)
      : '';
    return { min, max };
  }

  if (loading) return <p className="px-5 py-8 text-sm theme-text-muted">Loading ledger…</p>;

  // Distribution-detail columns (Return of Capital / Gain / Interest) are shown for
  // the five core funds and hidden for Goldman Sachs / Siguler Guff / Capula.
  const showDetail = !/vintage|goldman|siguler|capula/i.test(fundName);

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="px-5 py-3 border-b theme-border" style={{ background:'rgba(79,70,229,0.04)' }}>
        <p className="text-sm font-semibold theme-text">Ledger</p>
      </div>

      {/* ── Snapshot KPIs ── */}
      {snap && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x theme-border border-b theme-border"
             style={{ background:'rgba(79,70,229,0.04)' }}>
          {(() => {
            const isSdg = /sdg/i.test(fundName ?? '');
            const commitmentValue = isSdg && fundDetail?.contract_commitment_jpy
              ? fundDetail.contract_commitment_jpy
              : snap.commitment_usd;
            return [
              ['Commitment',  fmtAmt(commitmentValue)],
              ['Paid-in',     fmtAmt(snap.total_called_usd)],
              ['Received',    fmtAmt(snap.total_received_usd)],
              ['Drawn %',     fmt.pct(snap.drawn_pct)],
              ['Unfunded',    fmtAmt(snap.unfunded_usd)],
              ['F Inv.Cap',   fmtAmt(snap.investment_capacity)],
              ['H Net Cash',  fmtAmt(snap.net_cash_position)],
              ['DPI',         snap.dpi.toFixed(3)+'×'],
            ];
          })().map(([label, value]) => (
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
          <p className="text-xs theme-text-muted mt-1">Upload a PDF or add capital calls / distributions and mark them as paid.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background:'var(--color-header-bg)' }}>
              <tr className="border-b theme-border">
                {[
                  { label: 'Date',         right: false },
                  { label: 'Description',  right: false },
                  { label: 'FX',           right: true  },
                  { label: 'B Called',     right: true  },
                  { label: 'B (¥)',        right: true  },
                  { label: 'C Received',   right: true  },
                  { label: 'C (¥)',        right: true  },
                  { label: 'D Reinvest',   right: true  },
                  { label: 'E Cum.Called', right: true  },
                  { label: 'F Inv.Cap',    right: true  },
                  { label: 'G Cash Flow',  right: true  },
                  { label: 'H Net Cash',   right: true  },
                  ...(showDetail ? [
                    { label: 'Return of Capital', right: true },
                    { label: 'Gain',              right: true },
                    { label: 'Interest',          right: true },
                  ] : []),
                  { label: 'Review',       right: false },
                ].map((h, hi) => (
                  <th key={hi}
                    className={`px-3 py-2.5 text-[10px] font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h.right ? 'text-right' : 'text-left'}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {(() => {
                // Merge adjacent rows that share the same date where one is a capital_call
                // and the other is a distribution. These come from combined notices (e.g. a
                // call + income distribution on the same settlement date). Merging them into
                // one row keeps the ledger compact: B and C appear side-by-side, E/F/G/H
                // show the final state after both legs of the transaction.
                type MergedRow =
                  | { kind: 'single'; row: LedgerRow; idx: number }
                  | { kind: 'merged'; call: LedgerRow; callIdx: number; dist: LedgerRow; distIdx: number }

                const display: MergedRow[] = []
                let i = 0
                while (i < rows.length) {
                  const curr = rows[i]
                  const next = rows[i + 1]
                  if (
                    curr.tx_type === 'capital_call' &&
                    next?.tx_type === 'distribution' &&
                    next.date === curr.date
                  ) {
                    display.push({ kind: 'merged', call: curr, callIdx: i, dist: next, distIdx: i + 1 })
                    i += 2
                  } else if (
                    curr.tx_type === 'distribution' &&
                    next?.tx_type === 'capital_call' &&
                    next.date === curr.date
                  ) {
                    // dist appears before call (unusual ordering) — still merge
                    display.push({ kind: 'merged', call: next, callIdx: i + 1, dist: curr, distIdx: i })
                    i += 2
                  } else {
                    display.push({ kind: 'single', row: curr, idx: i })
                    i++
                  }
                }

                return display.map((dr, di) => {
                  if (dr.kind === 'merged') {
                    const { call, callIdx, dist, distIdx } = dr
                    const rate      = murcRates[call.date] ?? call.fx_rate
                    const combinedG = (call.cash_flow ?? 0) + (dist.cash_flow ?? 0)
                    // Notes for merged row (call note above dist note)
                    const callEditing = editIdx === callIdx
                    const distEditing = editIdx === distIdx

                    return (
                      <tr key={`merged-${di}`} className="theme-row-hover transition-colors">
                        {/* Date */}
                        <td className="px-3 py-3 whitespace-nowrap theme-text-muted">{fmt.date(call.date)}</td>

                        {/* Description — dual badge */}
                        <td className="px-3 py-3 min-w-[220px]">
                          <div className="flex flex-col gap-0.5">
                            <div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 bg-red-500/15 text-red-400">↓ Call</span>
                              <span className="theme-text text-base">{call.description}</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 bg-emerald-500/15 text-emerald-400">↑ Dist</span>
                              <span className="theme-text text-base">{dist.description}</span>
                            </div>
                          </div>
                        </td>

                        {/* FX */}
                        <td className="px-3 py-3 text-right font-mono theme-text-muted whitespace-nowrap">
                          {rateLoading ? <span className="opacity-40 text-xs">…</span>
                            : rate ? <span title="MURC TTM rate">{rate.toFixed(2)}</span>
                            : '—'}
                        </td>

                        {/* B Called */}
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color: call.capital_paid_in ? C.red : 'inherit'}}>
                          {call.capital_paid_in ? fmtAmt(call.capital_paid_in) : <span className="theme-text-muted">—</span>}
                        </td>

                        {/* B (¥) */}
                        <td className="px-3 py-3 text-right font-mono" style={{color: call.capital_paid_in ? 'rgba(239,68,68,0.65)' : 'inherit'}}>
                          {call.capital_paid_in && currency !== 'JPY'
                            ? rateLoading ? <span className="opacity-40 text-xs">…</span> : jpyStr(call.capital_paid_in, rate)
                            : <span className="theme-text-muted">—</span>}
                        </td>

                        {/* C Received */}
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color: dist.capital_received ? C.emerald : 'inherit'}}>
                          {dist.capital_received ? fmtAmt(dist.capital_received) : <span className="theme-text-muted">—</span>}
                        </td>

                        {/* C (¥) */}
                        <td className="px-3 py-3 text-right font-mono" style={{color: dist.capital_received ? 'rgba(16,185,129,0.65)' : 'inherit'}}>
                          {dist.capital_received && currency !== 'JPY'
                            ? rateLoading ? <span className="opacity-40 text-xs">…</span> : jpyStr(dist.capital_received, rate)
                            : <span className="theme-text-muted">—</span>}
                        </td>

                        {/* D Reinvest */}
                        <td className="px-3 py-3 text-right font-mono theme-text-muted">
                          {dist.reinvestable ? fmtAmt(dist.reinvestable) : '—'}
                        </td>

                        {/* E–H: take final state from dist row (last leg of the combined tx) */}
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:C.indigo}}>{fmtAmt(dist.cumulative_called)}</td>
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:C.violet}}>{fmtAmt(dist.investment_capacity)}</td>
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:combinedG<0?C.red:C.emerald}}>{fmtAmt(combinedG)}</td>
                        <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:dist.net_cash_position<0?C.red:C.emerald}}>{fmtAmt(dist.net_cash_position)}</td>

                        {/* Distribution detail */}
                        {showDetail && (
                          <>
                            <td className="px-3 py-3 text-right font-mono theme-text-muted">{dist.return_of_capital ? fmtAmt(dist.return_of_capital) : '—'}</td>
                            <td className="px-3 py-3 text-right font-mono theme-text-muted">{dist.gain ? fmtAmt(dist.gain) : '—'}</td>
                            <td className="px-3 py-3 text-right font-mono theme-text-muted">{dist.interest ? fmtAmt(dist.interest) : '—'}</td>
                          </>
                        )}

                        {/* Review — stacked: call note on top, dist note below */}
                        <td className="px-3 py-3 min-w-[220px]">
                          {[{ row: call, rowIdx: callIdx, isEditing: callEditing, label: 'Call' },
                            { row: dist, rowIdx: distIdx, isEditing: distEditing, label: 'Dist' }].map(({ row: nr, rowIdx: ni, isEditing: isEd, label }) => (
                            <div key={label} className={label === 'Dist' ? 'mt-1.5' : ''}>
                              {isEd ? (
                                <div className="flex flex-col gap-1">
                                  <input type="text" autoFocus placeholder={`${label} review…`}
                                    className="theme-input rounded px-2 py-1 text-base border theme-border w-full"
                                    value={noteText} onChange={e => setNoteText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveNote(nr, noteText); if (e.key === 'Escape') setEditIdx(null); }} />
                                  <div className="flex gap-1">
                                    <button onClick={() => saveNote(nr, noteText)} disabled={saving}
                                      className="px-2 py-0.5 rounded text-xs bg-indigo-600 text-white disabled:opacity-50">{saving ? '…' : 'Save'}</button>
                                    {nr.notes && <button onClick={() => saveNote(nr, '')} disabled={saving}
                                      className="px-2 py-0.5 rounded text-xs text-red-400 border border-red-500/30">Delete</button>}
                                    <button onClick={() => setEditIdx(null)} className="px-2 py-0.5 text-xs theme-text-muted">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 group">
                                  <span className={`text-[10px] font-bold theme-text-muted opacity-50 w-6 flex-shrink-0`}>{label}:</span>
                                  <span className={`text-xs flex-1 ${nr.notes ? 'theme-text' : 'theme-text-muted opacity-30 italic'}`}>{nr.notes || '—'}</span>
                                  {canEdit && editIdx === null && editDateIdx === null && (
                                    <button onClick={() => openNote(nr, ni)}
                                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] theme-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 border theme-border transition-all">
                                      Edit
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )
                  }

                  // ── Single (unmerged) row ──────────────────────────────────────────
                  const { row, idx: i } = dr
                  const isCall    = row.tx_type === 'capital_call';
                  const isEditing = editIdx === i;
                  const hasId     = !!(row.call_id || row.dist_id);
                  const { min: rowDateMin, max: rowDateMax } = getDateRange(i);

                  return (
                    <tr key={`row-${i}`} className="theme-row-hover transition-colors">

                      {/* Date — click to edit */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {canEdit && hasId && editDateIdx === i ? (
                          <div className="flex items-center gap-1">
                            <input type="date" autoFocus value={editDateVal} min={rowDateMin} max={rowDateMax}
                              onChange={e => setEditDateVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && editDateVal) saveDate(row, i, editDateVal); if (e.key === 'Escape') setEditDateIdx(null); }}
                              className="theme-input border theme-border rounded px-2 py-0.5 text-xs" />
                            <button onClick={() => { if (editDateVal) saveDate(row, i, editDateVal); }} disabled={dateSaving || !editDateVal}
                              className="text-xs px-1.5 py-0.5 bg-indigo-600 text-white rounded disabled:opacity-40">
                              {dateSaving ? '…' : '✓'}
                            </button>
                            <button onClick={() => setEditDateIdx(null)} className="text-xs theme-text-muted hover:text-red-400">✕</button>
                          </div>
                        ) : (
                          <span
                            className={`theme-text-muted ${canEdit && hasId && editIdx === null && editDateIdx === null ? 'cursor-pointer hover:text-indigo-400 hover:underline' : ''}`}
                            onClick={() => { if (canEdit && hasId && editIdx === null && editDateIdx === null) { setEditDateIdx(i); setEditDateVal(row.date); } }}
                            title={canEdit && hasId && rowDateMin ? `Allowed: ${rowDateMin} → ${rowDateMax}` : undefined}
                          >
                            {fmt.date(row.date)}
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-3 min-w-[180px]">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${isCall?'bg-red-500/15 text-red-400':'bg-emerald-500/15 text-emerald-400'}`}>
                          {isCall?'↓ Call':'↑ Dist'}
                        </span>
                        <span className="theme-text text-base">{row.description}</span>
                      </td>

                      {/* FX */}
                      <td className="px-3 py-3 text-right font-mono theme-text-muted whitespace-nowrap">
                        {rateLoading
                          ? <span className="opacity-40 text-xs">…</span>
                          : murcRates[row.date]
                            ? <span title="MURC TTM rate for this date">{murcRates[row.date].toFixed(2)}</span>
                            : <span title="No MURC rate found for this date">{fmt.rate(row.fx_rate)}</span>}
                      </td>

                      {/* B Called (USD) */}
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color: row.capital_paid_in ? C.red : 'inherit'}}>
                        {row.capital_paid_in ? fmtAmt(row.capital_paid_in) : <span className="theme-text-muted">—</span>}
                      </td>

                      {/* B (¥) */}
                      <td className="px-3 py-3 text-right font-mono" style={{color: row.capital_paid_in ? 'rgba(239,68,68,0.65)' : 'inherit'}}>
                        {row.capital_paid_in && currency !== 'JPY'
                          ? rateLoading ? <span className="opacity-40 text-xs">…</span> : jpyStr(row.capital_paid_in, murcRates[row.date] ?? row.fx_rate)
                          : <span className="theme-text-muted">—</span>}
                      </td>

                      {/* C Received (USD) */}
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color: row.capital_received ? C.emerald : 'inherit'}}>
                        {row.capital_received ? fmtAmt(row.capital_received) : <span className="theme-text-muted">—</span>}
                      </td>

                      {/* C (¥) */}
                      <td className="px-3 py-3 text-right font-mono" style={{color: row.capital_received ? 'rgba(16,185,129,0.65)' : 'inherit'}}>
                        {row.capital_received && currency !== 'JPY'
                          ? rateLoading ? <span className="opacity-40 text-xs">…</span> : jpyStr(row.capital_received, murcRates[row.date] ?? row.fx_rate)
                          : <span className="theme-text-muted">—</span>}
                      </td>

                      {/* D Reinvest */}
                      <td className="px-3 py-3 text-right font-mono theme-text-muted">
                        {row.reinvestable ? fmtAmt(row.reinvestable) : '—'}
                      </td>

                      {/* E–H computed */}
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:C.indigo}}>{fmtAmt(row.cumulative_called)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:C.violet}}>{fmtAmt(row.investment_capacity)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:row.cash_flow<0?C.red:C.emerald}}>{fmtAmt(row.cash_flow)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{color:row.net_cash_position<0?C.red:C.emerald}}>{fmtAmt(row.net_cash_position)}</td>

                      {/* Distribution detail */}
                      {showDetail && (
                        <>
                          <td className="px-3 py-3 text-right font-mono theme-text-muted">{row.return_of_capital ? fmtAmt(row.return_of_capital) : '—'}</td>
                          <td className="px-3 py-3 text-right font-mono theme-text-muted">{row.gain ? fmtAmt(row.gain) : '—'}</td>
                          <td className="px-3 py-3 text-right font-mono theme-text-muted">{row.interest ? fmtAmt(row.interest) : '—'}</td>
                        </>
                      )}

                      {/* Review — inline edit */}
                      <td className="px-3 py-3 min-w-[220px]">
                        {isEditing ? (
                          <div className="flex flex-col gap-1.5">
                            <input type="text" autoFocus placeholder="Type your review…"
                              className="theme-input rounded px-2 py-1.5 text-base border theme-border w-full"
                              value={noteText} onChange={e => setNoteText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveNote(row, noteText); if (e.key === 'Escape') setEditIdx(null); }} />
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => saveNote(row, noteText)} disabled={saving}
                                className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
                                {saving ? '…' : 'Save'}
                              </button>
                              {row.notes && (
                                <button onClick={() => saveNote(row, '')} disabled={saving}
                                  className="px-2.5 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 border border-red-500/30 transition-colors">
                                  Delete
                                </button>
                              )}
                              <button onClick={() => setEditIdx(null)}
                                className="px-2 py-1 text-xs theme-text-muted hover:text-red-400 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 group">
                            <span className={`text-sm flex-1 ${row.notes ? 'theme-text' : 'theme-text-muted opacity-40 italic'}`}>
                              {row.notes || '—'}
                            </span>
                            {canEdit && hasId && editIdx === null && editDateIdx === null && (
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                                <button onClick={() => openNote(row, i)}
                                  className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium theme-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 border theme-border transition-colors">
                                  Edit
                                </button>
                                {row.notes && (
                                  <button onClick={() => saveNote(row, '')}
                                    className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/30 transition-colors"
                                    title="Delete note">
                                    🗑
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMITMENT HISTORY TAB — SDG-style time-stepped commitments
// Shows a chronological list of commitment step-ups; lets admins add a new
// tranche and warns when the current commitment is nearly fully drawn.
// ─────────────────────────────────────────────────────────────────────────────
interface CommitmentHistoryEntry {
  id: string;
  fund_id: string;
  commitment_amount: number;
  effective_date: string;   // YYYY-MM-DD
  notes: string | null;
  created_at: string;
}

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function CommitmentsTab({
  fundId, canEdit, currentCommitment, investmentCapacity, onChanged,
}: {
  fundId: string;
  canEdit: boolean;
  currentCommitment: number;
  investmentCapacity: number;
  onChanged?: () => void;
}) {
  const [history, setHistory]     = useState<CommitmentHistoryEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [adding, setAdding]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [form, setForm]           = useState({ commitment_amount: '', effective_date: '', notes: '' });
  const [saving, setSaving]       = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fundsAPI.getCommitmentHistory(fundId)
      .then((r: any) => setHistory(r.data ?? []))
      .finally(() => setLoading(false));
  }, [fundId]);

  useEffect(() => { load(); }, [load]);

  async function addCommitment() {
    const amount = parseFloat(form.commitment_amount);
    if (!amount || amount <= 0 || !form.effective_date) {
      toast.error('Enter a valid amount and effective date'); return;
    }
    setSaving(true);
    try {
      await fundsAPI.addCommitmentHistory(fundId, {
        commitment_amount: amount,
        effective_date:    form.effective_date,
        notes:             form.notes || null,
      });
      toast.success('Commitment added');
      setForm({ commitment_amount: '', effective_date: '', notes: '' });
      setAdding(false);
      load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to add commitment');
    } finally { setSaving(false); }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this commitment entry? Historical calculations that used it will change.')) return;
    setDeleting(id);
    try {
      await fundsAPI.deleteCommitmentHistory(fundId, id);
      toast.success('Entry deleted');
      load();
      onChanged?.();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(null); }
  }

  // Determine if the current commitment is nearly exhausted.
  // Always show permanent contract commitment (currentCommitment = contractCommitmentUsd), not latest history entry
  const latest   = history[history.length - 1];
  const latestAmt = currentCommitment;
  const remainPct = latestAmt > 0 ? (investmentCapacity / latestAmt) * 100 : 100;
  const nearlyFull = remainPct <= 10 && latestAmt > 0;

  const inp = 'theme-input border theme-border rounded px-3 py-2 text-sm w-full';

  return (
    <div className="px-5 py-4 space-y-5">

      {/* ── Near-full warning banner ── */}
      {nearlyFull && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border"
             style={{ background:'rgba(245,158,11,0.08)', borderColor:'rgba(245,158,11,0.3)' }}>
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold" style={{ color:'#f59e0b' }}>
              Current commitment is {remainPct.toFixed(1)}% remaining
            </p>
            <p className="text-xs theme-text-muted mt-0.5">
              The active commitment (¥{latestAmt.toLocaleString('ja-JP')}) is nearly fully drawn.
              Add the next commitment tranche below before uploading further capital call reports.
            </p>
          </div>
        </div>
      )}

      {/* ── Total commitment summary card ── */}
      {!loading && history.length > 0 && (
        <div className="rounded-xl border theme-border p-4 flex items-center justify-between gap-6"
             style={{ background:'rgba(99,102,241,0.06)' }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest theme-text-muted mb-1">
              Total Commitment ({history.length} {history.length === 1 ? 'tranche' : 'tranches'})
            </p>
            <p className="text-2xl font-bold tabular-nums" style={{ color:'#1e40af' }}>
              ¥{latestAmt.toLocaleString('ja-JP')}
            </p>
            <p className="text-xs theme-text-muted mt-0.5">
              {remainPct.toFixed(1)}% remaining · permanent contract amount
            </p>
          </div>
          {canEdit && !adding && (
            <button onClick={() => setAdding(true)}
              className="flex-shrink-0 text-sm px-4 py-2 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              + Add Tranche
            </button>
          )}
        </div>
      )}

      {/* ── Commitment list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold theme-text">Commitment Tranches</h3>
          {canEdit && !adding && history.length === 0 && (
            <button onClick={() => setAdding(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              + Add Commitment
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm theme-text-muted py-4">Loading…</p>
        ) : history.length === 0 ? (
          <div className="text-center py-8 border border-dashed theme-border rounded-xl">
            <p className="text-sm theme-text-muted">No commitment history yet.</p>
            <p className="text-xs theme-text-muted mt-1">
              Add the first entry to enable date-based commitment tracking for this fund.
            </p>
          </div>
        ) : (
          <div className="border theme-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background:'var(--color-header-bg)' }}>
                <tr className="border-b theme-border">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold theme-text-muted uppercase tracking-wide">Tranche</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold theme-text-muted uppercase tracking-wide">Effective Date</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold theme-text-muted uppercase tracking-wide">Commitment (¥)</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold theme-text-muted uppercase tracking-wide">Notes</th>
                  {canEdit && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y theme-border">
                {history.map((h, idx) => {
                  const isCurrent = idx === history.length - 1;
                  const label = `${ordinal(idx + 1)} Commitment`;
                  return (
                    <tr key={h.id} className="theme-row-hover"
                        style={isCurrent ? { background:'rgba(99,102,241,0.04)' } : {}}>
                      <td className="px-4 py-3 font-semibold theme-text whitespace-nowrap">
                        {label}
                        {isCurrent && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400">
                            Current
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 theme-text-muted">{fmt.date(h.effective_date)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold theme-text">
                        ¥{h.commitment_amount.toLocaleString('ja-JP')}
                      </td>
                      <td className="px-4 py-3 text-xs theme-text-muted">{h.notes || '—'}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => deleteEntry(h.id)} disabled={deleting === h.id}
                            className="text-xs text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 transition-colors disabled:opacity-40">
                            {deleting === h.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add commitment form ── */}
      {adding && (
        <div className="border theme-border rounded-xl p-4 space-y-3"
             style={{ background:'rgba(99,102,241,0.04)' }}>
          <h4 className="text-sm font-semibold theme-text">New Commitment Tranche</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs theme-text-muted mb-1">Commitment Amount (¥)</label>
              <input type="number" placeholder="e.g. 200000000" className={inp}
                value={form.commitment_amount}
                onChange={e => setForm(f => ({ ...f, commitment_amount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs theme-text-muted mb-1">Effective Date</label>
              <input type="date" className={inp}
                value={form.effective_date}
                onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs theme-text-muted mb-1">Notes (optional)</label>
            <input type="text" placeholder="e.g. Second close, additional LP subscription" className={inp}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {form.commitment_amount && history.length > 0 && parseFloat(form.commitment_amount) <= (latest?.commitment_amount ?? 0) && (
            <p className="text-xs" style={{ color:'#f59e0b' }}>
              ⚠️ New amount (¥{parseFloat(form.commitment_amount).toLocaleString('ja-JP')}) is not greater than the current commitment
              (¥{latest.commitment_amount.toLocaleString('ja-JP')}). Commitments should only grow.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={addCommitment} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Commitment'}
            </button>
            <button onClick={() => { setAdding(false); setForm({ commitment_amount: '', effective_date: '', notes: '' }); }}
              className="px-4 py-2 rounded-lg text-sm theme-text-muted hover:theme-text border theme-border transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── How it works explainer ── */}
      <div className="text-xs theme-text-muted space-y-1 border-t theme-border pt-3">
        <p className="font-semibold theme-text">How commitment history works</p>
        <p>Each entry defines the total LP commitment effective from that date.</p>
        <p>When calculating the ledger, the engine picks the latest entry whose date ≤ transaction date and uses <code className="font-mono">F = commitment − cumulative called + reinvestable</code>.</p>
        <p>Old entries are never overwritten — historical F values remain stable even after adding new tranches.</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FUND DETAILS TAB (all fields editable)
// ─────────────────────────────────────────────────────────────────────────────
function DetailsTab({ detail, canEdit, fundId, onSaved }: { detail: FundDetail; canEdit:boolean; fundId:string; onSaved:()=>void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<any>({});
  const [saving, setSaving]   = useState(false);
  const sf = (k:string, v:any) => setForm((f:any)=>({...f,[k]:v}));

  // Detect if this is an SDG fund
  const isSdg = /sdg/i.test(detail.fund_name ?? '');

  function startEdit() {
    setForm({
      fund_name:               detail.fund_name,
      fund_name_jp:            detail.fund_name_jp??'',
      manager:                 detail.manager??'',
      administrator:           detail.administrator??'',
      strategy:                detail.strategy??'',
      vintage_year:            detail.vintage_year??'',
      currency:                detail.currency??'USD',
      commitment_usd:          isSdg ? undefined : (detail.commitment_usd??''),
      commitment_jpy:          isSdg ? (detail.commitment_jpy??'') : undefined,
      contract_commitment_jpy: isSdg ? (detail.contract_commitment_jpy??'') : undefined,
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
      const data = { ...form };
      // Convert numeric fields to numbers (handle zero and empty values properly)
      if (data.commitment_usd !== undefined && data.commitment_usd !== '') data.commitment_usd = parseFloat(data.commitment_usd) || 0;
      if (data.commitment_jpy !== undefined && data.commitment_jpy !== '') data.commitment_jpy = parseFloat(data.commitment_jpy) || 0;
      if (data.contract_commitment_jpy !== undefined && data.contract_commitment_jpy !== '') data.contract_commitment_jpy = parseFloat(data.contract_commitment_jpy) || 0;
      if (data.entry_fx_rate !== undefined && data.entry_fx_rate !== '') data.entry_fx_rate = parseFloat(data.entry_fx_rate) || null;
      if (data.vintage_year !== undefined && data.vintage_year !== '') data.vintage_year = parseInt(data.vintage_year) || null;
      if (data.fund_term_years !== undefined && data.fund_term_years !== '') data.fund_term_years = parseInt(data.fund_term_years) || null;
      if (data.management_fee_pct !== undefined && data.management_fee_pct !== '') data.management_fee_pct = parseFloat(data.management_fee_pct) || 0;
      if (data.carry_pct !== undefined && data.carry_pct !== '') data.carry_pct = parseFloat(data.carry_pct) || 0;
      if (data.hurdle_rate_pct !== undefined && data.hurdle_rate_pct !== '') data.hurdle_rate_pct = parseFloat(data.hurdle_rate_pct) || 0;
      await fundsAPI.update(fundId, data);
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
              {t('fundDetails.editButton')}
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y theme-border">
          {[
            [t('fundDetails.fundName'),           detail.fund_name],
            [t('fundDetails.japaneseNameLabel'),       detail.fund_name_jp],
            [t('fundDetails.manager'),             detail.manager],
            [t('fundDetails.administrator'),       detail.administrator],
            [t('fundDetails.strategy'),            detail.strategy],
            [t('fundDetails.vintageYear'),        detail.vintage_year],
            [t('fundDetails.currency'),            detail.currency],
            ...(isSdg ? [['Commitment (JPY) - Variable', (detail as any).commitment_jpy ? `¥${Number((detail as any).commitment_jpy).toLocaleString()}` : '—']] : [[t('fundDetails.commitmentUsd'), detail.commitment_usd ? fmt.usd(Number(detail.commitment_usd)) : '—']]),
            ...(isSdg ? [['Contract Commitment (JPY) - Standard', (detail as any).contract_commitment_jpy ? `¥${Number((detail as any).contract_commitment_jpy).toLocaleString()}` : '—']] : []),
            [t('fundDetails.entryFxRate'),            detail.entry_fx_rate ? Number(detail.entry_fx_rate).toFixed(4) : '—'],
            [t('fundDetails.contractDate'),       detail.contract_date],
            [t('fundDetails.investmentPeriodStart'),   detail.investment_period_start],
            [t('fundDetails.investmentPeriodEnd'),     detail.investment_period_end],
            [t('fundDetails.fundTermYears'),   detail.fund_term_years],
            [t('fundDetails.managementFeePercent'),   detail.management_fee_pct != null ? `${detail.management_fee_pct}%` : '—'],
            [t('fundDetails.carryPercent'),            detail.carry_pct        != null ? `${detail.carry_pct}%`        : '—'],
            [t('fundDetails.hurdleRatePercent'),      detail.hurdle_rate_pct  != null ? `${detail.hurdle_rate_pct}%`  : '—'],
          ].map(([label, value])=>(
            <div key={String(label)} className="flex items-start gap-4 py-3 px-1">
              <p className="text-xs font-semibold theme-text-muted w-44 flex-shrink-0">{label}</p>
              <p className="text-sm theme-text flex-1">{value ?? <span className="theme-text-muted text-xs">—</span>}</p>
            </div>
          ))}
          {detail.notes && (
            <div className="flex items-start gap-4 py-3 px-1 md:col-span-2">
              <p className="text-xs font-semibold theme-text-muted w-44 flex-shrink-0">{t('fundDetails.notes')}</p>
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
        <Field label={t('fundDetails.fundName')}><input className={inp} value={form.fund_name??''} onChange={e=>sf('fund_name',e.target.value)} /></Field>
        <Field label={t('fundDetails.japaneseNameLabel')}><input className={inp} value={form.fund_name_jp??''} onChange={e=>sf('fund_name_jp',e.target.value)} /></Field>
        <Field label={t('fundDetails.manager')}><input className={inp} value={form.manager??''} onChange={e=>sf('manager',e.target.value)} /></Field>
        <Field label={t('fundDetails.administrator')}><input className={inp} value={form.administrator??''} onChange={e=>sf('administrator',e.target.value)} /></Field>
        <Field label={t('fundDetails.strategy')}>
          <select className={inp} value={form.strategy??''} onChange={e=>sf('strategy',e.target.value)}>
            <option value="">Select…</option>
            {STRATEGIES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={t('fundDetails.vintageYear')}><input type="number" className={inp} value={form.vintage_year??''} onChange={e=>sf('vintage_year',e.target.value)} /></Field>
        <Field label={t('fundDetails.currency')}>
          <select className={inp} value={form.currency??'USD'} onChange={e=>sf('currency',e.target.value)}>
            <option>USD</option><option>EUR</option><option>JPY</option>
          </select>
        </Field>
        {!isSdg && (
          <Field label={t('fundDetails.commitmentUsd')}><input type="number" className={inp} value={form.commitment_usd??''} onChange={e=>sf('commitment_usd',e.target.value)} /></Field>
        )}
        {isSdg && (
          <>
            <Field label="Commitment (JPY) - Variable"><input type="number" className={inp} value={form.commitment_jpy??''} onChange={e=>sf('commitment_jpy',e.target.value)} /></Field>
            <Field label="Contract Commitment (JPY) - Standard"><input type="number" className={inp} value={form.contract_commitment_jpy??''} onChange={e=>sf('contract_commitment_jpy',e.target.value)} /></Field>
          </>
        )}
        <Field label={t('fundDetails.entryFxRate')}><input type="number" step="0.0001" className={inp} value={form.entry_fx_rate??''} onChange={e=>sf('entry_fx_rate',e.target.value)} /></Field>
        <Field label={t('fundDetails.contractDate')}><input type="date" className={inp} value={form.contract_date??''} onChange={e=>sf('contract_date',e.target.value)} /></Field>
        <Field label={t('fundDetails.investmentPeriodStart')}><input type="date" className={inp} value={form.investment_period_start??''} onChange={e=>sf('investment_period_start',e.target.value)} /></Field>
        <Field label={t('fundDetails.investmentPeriodEnd')}><input type="date" className={inp} value={form.investment_period_end??''} onChange={e=>sf('investment_period_end',e.target.value)} /></Field>
        <Field label={t('fundDetails.fundTermYears')}><input type="number" className={inp} value={form.fund_term_years??''} onChange={e=>sf('fund_term_years',e.target.value)} /></Field>
        <Field label={t('fundDetails.managementFeePercent')}><input type="number" step="0.01" className={inp} value={form.management_fee_pct??''} onChange={e=>sf('management_fee_pct',e.target.value)} /></Field>
        <Field label={t('fundDetails.carryPercent')}><input type="number" step="0.01" className={inp} value={form.carry_pct??''} onChange={e=>sf('carry_pct',e.target.value)} /></Field>
        <Field label={t('fundDetails.hurdleRatePercent')}><input type="number" step="0.01" className={inp} value={form.hurdle_rate_pct??''} onChange={e=>sf('hurdle_rate_pct',e.target.value)} /></Field>
        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <Field label={t('fundDetails.notes')}><textarea className={`${inp} resize-none`} rows={2} value={form.notes??''} onChange={e=>sf('notes',e.target.value)} /></Field>
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
// FULL FUND SECTION
// ─────────────────────────────────────────────────────────────────────────────
type TabKey = 'overview' | 'cashflow' | 'documents' | 'calls' | 'distributions' | 'nav' | 'ledger' | 'details' | 'commitments';

function FundSection({
  fund, detail, canEdit, onChanged, initialTab,
}: {
  fund: FundSummary; detail: FundDetail;
  canEdit: boolean; onChanged: () => void; initialTab?: TabKey;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'ledger');
  const fundId   = fund.fund_id;
  const isActive = fund.is_active !== false;
  const dotColor = strategyColor[fund.strategy??''] ?? '#6b7280';
  const badge    = strategyBg[fund.strategy??'']   ?? 'bg-gray-100 text-gray-700';
  const summary  = (detail as any).summary ?? {};
  const paidIn   = Number(summary.total_called_usd  ?? 0);
  const powder   = Number(summary.unfunded_usd       ?? (Number(detail.commitment_usd) - paidIn));
  const drawn    = Number(summary.drawn_pct          ?? 0);

  const isSdg = /sdg/i.test(detail.fund_name ?? '') || /sdg/i.test((detail as any).fund_key ?? '');

  // For SDG funds, commitment grows over time. Fetch the latest history entry so
  // the dashboard KPI always shows the current total commitment, not the static seed value.
  const [latestHistCommitment, setLatestHistCommitment] = useState<number | null>(null);
  const refreshHistCommitment = useCallback(() => {
    if (!isSdg) return;
    fundsAPI.getCommitmentHistory(fundId)
      .then((r: any) => {
        const entries: CommitmentHistoryEntry[] = r.data ?? [];
        const last = entries[entries.length - 1];
        setLatestHistCommitment(last ? last.commitment_amount : null);
      })
      .catch(() => {});
  }, [fundId, isSdg]);
  useEffect(() => { refreshHistCommitment(); }, [refreshHistCommitment]);

  // For commitments page: show contract_commitment_jpy for SDG, commitment_usd for others
  // SDG: displayCommitment = contract_commitment_jpy (fixed contract amount in JPY)
  // Others: displayCommitment = commitment_usd (USD value)
  const displayCommitment = isSdg
    ? Number((detail as any).contract_commitment_jpy ?? (detail as any).commitment_jpy ?? detail.commitment_usd ?? 0)
    : Number(detail.commitment_usd ?? 0);

  async function toggleActive() {
    if (!confirm(isActive ? t('manageFunds.deactivateConfirm') : t('manageFunds.reactivateConfirm'))) return;
    try {
      if (isActive) await fundsAPI.deactivate(fundId);
      else          await fundsAPI.reactivate(fundId);
      toast.success(isActive ? t('manageFunds.fundDeactivated') : t('manageFunds.fundReactivated'));
      onChanged();
    } catch { toast.error(t('manageFunds.actionFailed')); }
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key:'ledger',        label:t('manageFunds.ledgerTab')         },
    { key:'cashflow',      label:t('manageFunds.cashFlowTab')      },
    { key:'calls',         label:t('manageFunds.capitalCallsTab')  },
    { key:'distributions', label:t('manageFunds.distributionsTab')  },
    { key:'nav',           label:t('manageFunds.navRecordsTab')    },
    { key:'documents',     label:t('manageFunds.documentsReportsTab') },
    ...(isSdg ? [{ key: 'commitments' as TabKey, label: t('manageFunds.commitmentsTab') }] : []),
    { key:'details',       label:t('manageFunds.fundDetailsTab')   },
  ];

  const fmtMoney = (n: number) => detail.currency === 'JPY' ? fmt.jpy(n) : fmt.usd(n, true);

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
                    {t('manageFunds.inactive')}
                  </span>
                )}
              </div>
              {detail.fund_name_jp && <p className="text-sm theme-text-muted mt-0.5">{detail.fund_name_jp}</p>}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {detail.strategy && <span className={`text-xs font-medium px-2.5 py-0.5 rounded ${badge}`}>{detail.strategy}</span>}
                {detail.vintage_year && <span className="text-xs theme-text-muted">{t('manageFunds.vintage')} {detail.vintage_year}</span>}
                {detail.manager && <span className="text-xs theme-text-muted">· {detail.manager}</span>}
                {detail.administrator && <span className="text-xs theme-text-muted">· {t('manageFunds.admin')}: {detail.administrator}</span>}
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
              {isActive ? t('manageFunds.deactivateFund') : t('manageFunds.reactivateFund')}
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t theme-border divide-x theme-border">
        {[
          { label:t('manageFunds.totalCommitment'), value: fmtMoney(displayCommitment), note: isSdg && latestHistCommitment ? `${latestHistCommitment > 0 ? (paidIn / latestHistCommitment * 100).toFixed(2) : '0.00'}% ${t('manageFunds.drawn')}` : t('manageFunds.gross') },
          { label:t('manageFunds.paidInE'),      value: fmtMoney(paidIn),          note:`${drawn.toFixed(2)}% ${t('manageFunds.drawn')}` },
          { label:t('manageFunds.dryPowderF'),   value: fmtMoney(powder),          note:t('manageFunds.unfunded') },
          { label:t('manageFunds.dpi'),             value: `${Number(summary.dpi??0).toFixed(3)}×`, note:t('manageFunds.distPaidIn') },
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

        {tab==='cashflow'      && <CashFlowTab  fundId={fundId} currency={detail.currency} />}
        {tab==='documents'     && <FundDocuments fundId={fundId} canEdit={canEdit} onChanged={onChanged} currency={detail.currency} />}
        {tab==='calls'         && <CallsTab    fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='distributions' && <DistsTab    fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='nav'           && <NavTab      fundId={fundId} canEdit={canEdit} onChanged={onChanged} />}
        {tab==='ledger'        && <LedgerTab   fundId={fundId} canEdit={canEdit} currency={detail.currency} />}
        {tab==='commitments'   && <CommitmentsTab
          fundId={fundId} canEdit={canEdit}
          currentCommitment={displayCommitment}
          investmentCapacity={Number(summary.investment_capacity ?? summary.unfunded_usd ?? 0)}
          onChanged={refreshHistCommitment}
        />}
        {tab==='details'       && <DetailsTab  detail={detail} canEdit={canEdit} fundId={fundId} onSaved={onChanged} />}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// REPORTS SECTION — per-fund folders; open a folder to see its files; click a
// file to view the PDF in-app. Files are grouped into Capital Calls & Distributions.
// ─────────────────────────────────────────────────────────────────────────────
function PdfViewerModal({ doc, onClose }: { doc: any; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objUrl = '';
    fundReportsAPI.file(doc.id)
      .then(r => { objUrl = URL.createObjectURL(r.data); if (!revoked) setUrl(objUrl); })
      .catch(() => setError(true));
    return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [doc.id]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b theme-border flex items-center justify-between gap-3">
          <p className="text-sm font-semibold theme-text truncate" title={doc.file_name}>📄 {doc.file_name}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                 className="px-3 py-1.5 rounded-lg text-xs font-medium border theme-border theme-text-muted hover:theme-text transition-colors">
                Open in new tab ↗
              </a>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center theme-text-muted hover:theme-text hover:bg-black/5 transition-colors text-lg">
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0" style={{ background: '#525659' }}>
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-white/70">Could not load this PDF.</div>
          ) : url ? (
            <iframe src={url} title={doc.file_name} className="w-full h-full" />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-white/30 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportFilesTile({
  title, kind, color, bg, rows, canEdit, onView, onDelete, currency,
}: {
  title: string; kind: 'call' | 'dist'; color: string; bg: string;
  rows: any[]; canEdit: boolean; onView: (doc: any) => void; onDelete: (id: string) => void; currency?: string;
}) {
  const amountHeader = currency === 'JPY' ? 'Amount (JPY)' : 'Amount (USD)';
  const fmtAmount = (amt: number) => currency === 'JPY' ? fmt.jpy(amt) : fmt.usd(amt);

  return (
    <div className="theme-card border theme-border rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b theme-border flex items-center justify-between" style={{ background: bg }}>
        <h3 className="text-sm font-bold theme-text">{title}</h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: 'rgba(255,255,255,0.5)' }}>
          {rows.length} file{rows.length !== 1 ? 's' : ''}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-2xl mb-1 opacity-20">📄</p>
          <p className="text-sm theme-text-muted">No {kind === 'call' ? 'capital call' : 'distribution'} files.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-header-bg)' }}>
              <tr className="border-b theme-border text-xs">
                {['File', 'Notice Date', 'Due Date', amountHeader, ''].map(h => (
                  <th key={h} className={`px-4 py-2.5 font-semibold theme-text-muted uppercase tracking-wide whitespace-nowrap ${h === 'File' || h === '' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y theme-border">
              {rows.map(doc => {
                const amount = kind === 'call' ? doc.gross_call_usd : doc.distribution_usd;
                return (
                  <tr key={doc.id} className="theme-row-hover cursor-pointer" onClick={() => onView(doc)}>
                    <td className="px-4 py-3 theme-text max-w-[20rem] truncate" title={doc.file_name}>📄 {doc.file_name}</td>
                    <td className="px-4 py-3 text-right theme-text-muted whitespace-nowrap">{doc.notice_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right theme-text-muted whitespace-nowrap">{doc.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color }}>{amount ? fmtAmount(Number(amount)) : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => onView(doc)}
                        className="px-2 py-1 rounded text-xs font-medium text-indigo-600 hover:bg-indigo-500/10 transition-colors">
                        View
                      </button>
                      {canEdit && (
                        <button onClick={() => onDelete(doc.id)}
                          className="ml-1 px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors">
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

function ReportsSection({ funds, canEdit, onChanged, onOpenLedger }:
  { funds: FundSummary[]; canEdit: boolean; onChanged: () => void; onOpenLedger: (fundId: string) => void }) {
  const { t } = useTranslation();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFundId, setOpenFundId] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fundReportsAPI.listAll()
      .then(r => setReports(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    if (!confirm('Delete this document? The capital call / distribution it created will also be removed and the ledger recalculated.')) return;
    try { await fundReportsAPI.delete(id); toast.success('Document deleted — ledger updated.'); load(); onChanged(); }
    catch (e: any) { toast.error(e?.response?.data?.detail ?? 'Failed to delete'); }
  }

  // Reports grouped by fund
  const byFund = useMemo(() => {
    const m: Record<string, any[]> = {};
    reports.forEach(r => { (m[r.fund_id] ??= []).push(r); });
    return m;
  }, [reports]);

  // Filter funds based on search query
  const filteredFunds = useMemo(() => {
    if (!searchQuery.trim()) return funds;
    const query = searchQuery.toLowerCase();
    return funds.filter(f =>
      f.fund_name.toLowerCase().includes(query) ||
      f.manager?.toLowerCase().includes(query)
    );
  }, [funds, searchQuery]);

  if (funds.length === 0) {
    return (
      <div className="text-center py-20 theme-text-muted">
        <p className="text-5xl mb-4">📁</p>
        <p className="text-base font-medium">No funds yet — add a fund to upload reports.</p>
      </div>
    );
  }

  const openFund = openFundId ? funds.find(f => f.fund_id === openFundId) : null;
  const fundReports = openFundId ? (byFund[openFundId] ?? []) : [];
  const calls = fundReports.filter(r => r.notice_type === 'capital_call' || r.notice_type === 'capital_and_distribution');
  const dists = fundReports.filter(r => r.notice_type === 'distribution'  || r.notice_type === 'capital_and_distribution');

  return (
    <div className="space-y-5">
      {/* Upload — pick the document type + select the fund, then drop a PDF */}
      {canEdit && (
        <FundUploadBar
          funds={funds.map(f => ({ fund_id: f.fund_id, fund_name: f.fund_name, manager: f.manager }))}
          onUploaded={(fundId) => { onChanged(); load(); setOpenFundId(fundId); }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : openFund ? (
        /* ── Inside a fund folder ── */
        <div className="space-y-4">
          <button onClick={() => setOpenFundId(null)}
            className="text-sm theme-text-muted hover:theme-text transition-colors">← All funds</button>
          <div className="flex items-center gap-2">
            <span className="text-xl">📁</span>
            <h2 className="text-lg font-bold theme-text">{openFund.fund_name}</h2>
            <span className="text-xs theme-text-muted">· {fundReports.length} file{fundReports.length !== 1 ? 's' : ''}</span>
          </div>
          <ReportFilesTile title="Capital Calls" kind="call" color={C.indigo}  bg={C.indigoBg}
            rows={calls} canEdit={canEdit} onView={setViewerDoc} onDelete={del} currency={openFund.currency} />
          <ReportFilesTile title="Distributions" kind="dist" color={C.emerald} bg={C.emeraldBg}
            rows={dists} canEdit={canEdit} onView={setViewerDoc} onDelete={del} currency={openFund.currency} />
        </div>
      ) : (
        /* ── Fund folders grid ── */
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder={t('manageFunds.searchFunds')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border theme-border bg-transparent theme-text text-sm placeholder-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Results count */}
          {searchQuery && (
            <p className="text-sm text-gray-500">
              {filteredFunds.length} {filteredFunds.length === 1 ? t('fundOverview.fund') : t('manageFunds.allFunds')}
            </p>
          )}

          {/* Fund grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredFunds.map(f => {
              const list  = byFund[f.fund_id] ?? [];
              const nCall = list.filter(r => r.notice_type === 'capital_call' || r.notice_type === 'capital_and_distribution').length;
              const nDist = list.filter(r => r.notice_type === 'distribution'  || r.notice_type === 'capital_and_distribution').length;
              return (
                <button key={f.fund_id} onClick={() => setOpenFundId(f.fund_id)}
                  className="theme-card border theme-border rounded-2xl p-5 text-left transition-colors hover:border-indigo-500/50">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">📁</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold theme-text text-sm leading-snug truncate" title={f.fund_name}>{f.fund_name}</p>
                      <p className="text-xs theme-text-muted mt-0.5">{list.length} {t('manageFunds.files')}</p>
                    </div>
                    <span className="theme-text-muted text-lg flex-shrink-0">→</span>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t theme-border flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: C.indigo,  background: C.indigoBg }}>{nCall} {t('manageFunds.calls')}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: C.emerald, background: C.emeraldBg }}>{nDist} {t('manageFunds.dists')}</span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); onOpenLedger(f.fund_id); }}
                        className="text-[11px] font-semibold px-3 py-0.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        {t('manageFunds.ledger')} →
                      </button>
                    </div>
                  </div>
              </button>
            );
            })}
          </div>
        </div>
      )}

      {viewerDoc && <PdfViewerModal doc={viewerDoc} onClose={() => setViewerDoc(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CASHFLOW SECTION — placeholder (empty for now)
// ─────────────────────────────────────────────────────────────────────────────
function CashflowSection() {
  return (
    <div className="theme-card border theme-border rounded-2xl py-24 text-center">
      <p className="text-5xl mb-4 opacity-20">💸</p>
      <p className="text-base font-medium theme-text">Cashflow</p>
      <p className="text-sm theme-text-muted mt-1">Coming soon — this section is empty for now.</p>
    </div>
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
  const [showWizard,  setShowWizard]  = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [openAtTab, setOpenAtTab]     = useState<TabKey>('ledger');

  // Section is driven by the URL (?section=…) so the left sidebar controls it
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSection = searchParams.get('section');
  const section: 'manage' | 'reports' | 'cashflow' =
    rawSection === 'reports' || rawSection === 'cashflow' ? rawSection : 'manage';

  // ?fund=<id> from dashboard fund links — auto-open that fund on mount
  const fundParam = searchParams.get('fund');
  useEffect(() => {
    if (fundParam) {
      setSelectedFundId(fundParam);
      setOpenAtTab('ledger');
    }
  }, [fundParam]);

  const loadFunds = useCallback(async () => {
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
  }, []);

  useEffect(() => { loadFunds(); }, [loadFunds]);

  const activeCount   = funds.filter(f => f.is_active !== false).length;
  const inactiveCount = funds.length - activeCount;

  const selectedFund   = selectedFundId ? funds.find(f => f.fund_id === selectedFundId) ?? null : null;
  const selectedDetail = selectedFundId ? details[selectedFundId] : undefined;

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          {section === 'manage' && selectedFund && (
            <button onClick={() => setSelectedFundId(null)}
              className="text-sm theme-text-muted hover:theme-text transition-colors mb-1">
              {t('funds.backToAll')}
            </button>
          )}
          <h1 className="text-xl font-bold theme-text">
            {section === 'manage'
              ? (selectedFund ? selectedFund.fund_name : t('funds.title'))
              : section === 'reports' ? t('manageFunds.reportsTitle')
              : 'Cashflow'}
          </h1>
          {section === 'manage' && !selectedFund && (
            <p className="text-sm theme-text-muted mt-0.5">
              {activeCount} {t('dashboard.activeFunds')}
              {inactiveCount > 0 && ` · ${t('funds.showInactive', { count: inactiveCount })}`}
            </p>
          )}
          {section === 'reports' && (
            <p className="text-sm theme-text-muted mt-0.5">{t('manageFunds.reportsSubtitle')}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {section === 'manage' && !selectedFund && (
            <>
              {canEdit && (
                <button onClick={() => setShowWizard(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
                  {t('funds.addFund')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span>🔒</span>
          <span>{t('funds.viewOnlyMode')}</span>
        </div>
      )}

      {section === 'reports' ? (
        /* ── REPORTS SECTION — upload / edit / delete documents ── */
        <ReportsSection funds={funds} canEdit={canEdit} onChanged={loadFunds} onOpenLedger={fundId => { setOpenAtTab('ledger'); setSelectedFundId(fundId); setSearchParams(p => { const n = new URLSearchParams(p); n.delete('section'); return n; }); }} />
      ) : section === 'cashflow' ? (
        /* ── CASHFLOW SECTION — empty for now ── */
        <CashflowSection />
      ) : selectedFund ? (
        /* ── DETAIL VIEW — one fund's full sections ── */
        selectedDetail ? (
          <FundSection
            fund={selectedFund}
            detail={selectedDetail}
            canEdit={canEdit}
            onChanged={() => { loadFunds(); }}
            initialTab={openAtTab}
          />
        ) : (
          <div className="theme-card border theme-border rounded-2xl p-8 flex items-center gap-4">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm theme-text-muted">Loading {selectedFund.fund_name}…</p>
          </div>
        )
      ) : (
        /* ── MANAGE FUNDS — overall totals + in-detail calculations + fund cards ── */
        <>
          {/* Portfolio-wide overall totals, per-fund table & analysis */}
          <PortfolioOverview onSelectFund={setSelectedFundId} />

          {/* Document upload lives in the Reports section — not here */}

        </>
      )}

      {showWizard && (
        <AddFundWizard onClose={() => { setShowWizard(false); loadFunds(); }} />
      )}
    </div>
  );
}

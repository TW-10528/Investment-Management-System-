/**
 * AddFundWizard — 4-step wizard for initial fund setup with live calculation preview.
 *
 * Step 1 · Fund Identity   (name, strategy, manager, vintage)
 * Step 2 · Commitment & Terms  (commitment, FX, fees, dates)
 * Step 3 · Initial Capital Calls  (historical calls with real-time E/F/G/H preview)
 * Step 4 · Review & Create
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fundsAPI, capitalCallsAPI, fxRatesAPI } from '../services/api';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CallDraft {
  call_number   : number;
  notice_date   : string;
  due_date      : string;
  gross_call_usd: number;
  distribution_usd: number;
  reinvestable_usd: number;
  fx_rate       : number;
  wire_reference: string;
  notes         : string;
  // computed
  net_call_usd  : number;
  net_call_jpy  : number;
  E             : number;   // cumulative called after this call
  F             : number;   // investment capacity after this call
  G             : number;   // cash flow this period
  H             : number;   // net cash position after this call
}

interface FundForm {
  // Step 1
  fund_name     : string;
  fund_key      : string;
  fund_name_jp  : string;
  manager       : string;
  administrator : string;
  strategy      : string;
  vintage_year  : string;
  currency      : string;
  // Step 2
  commitment_usd     : string;
  entry_fx_rate      : string;
  contract_date      : string;
  investment_period_start: string;
  investment_period_end  : string;
  fund_term_years    : string;
  management_fee_pct : string;
  carry_pct          : string;
  hurdle_rate_pct    : string;
  // Wire
  wire_bank         : string;
  wire_account_name : string;
  wire_account_number: string;
  wire_aba          : string;
  wire_swift        : string;
  wire_reference    : string;
  notes             : string;
}

const STRATEGIES = [
  'Buyout', 'Growth', 'Venture', 'Secondaries',
  'Private Credit', 'Real Estate', 'Infrastructure',
  'Hedge Fund', 'Other',
];

function toFundKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const BLANK: FundForm = {
  fund_name:'', fund_key:'', fund_name_jp:'', manager:'', administrator:'',
  strategy:'', vintage_year: String(new Date().getFullYear()), currency:'USD',
  commitment_usd:'', entry_fx_rate:'', contract_date:'',
  investment_period_start:'', investment_period_end:'',
  fund_term_years:'', management_fee_pct:'', carry_pct:'', hurdle_rate_pct:'',
  wire_bank:'', wire_account_name:'', wire_account_number:'',
  wire_aba:'', wire_swift:'', wire_reference:'', notes:'',
};

// ─── Live calc ────────────────────────────────────────────────────────────────

function recomputeLedger(calls: Omit<CallDraft,'E'|'F'|'G'|'H'>[], commitment: number): CallDraft[] {
  let E = 0, F = commitment, H = 0;
  return calls.map(c => {
    const B = c.gross_call_usd;
    const C = c.distribution_usd;   // deemed distribution on the call
    const D = c.reinvestable_usd;
    E = E + B;
    F = F - B + D;
    const G = -B + C;
    H = H + G;
    return { ...c, net_call_usd: B - C, net_call_jpy: Math.round((B - C) * c.fx_rate), E, F, G, H };
  });
}

// ─── Step indicators ─────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const steps = ['Fund Identity', 'Commitment & Terms', 'Capital Calls', 'Review'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const num   = i + 1;
        const done  = num < current;
        const active = num === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${done  ? 'bg-indigo-600 text-white' :
                  active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                           'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? 'text-indigo-700 font-semibold' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${done ? 'bg-indigo-600' : 'bg-gray-100'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type='text', placeholder='', min, step, className='' }:
  { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; min?: string; step?: string; className?: string }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder} min={min} step={step}
      onChange={e => onChange(e.target.value)}
      className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white ${className}`}
    />
  );
}

// ─── Calculation preview card ─────────────────────────────────────────────────

function CalcPreview({ label, value, sub, delta, accent=false, negative=false }:
  { label: string; value: string; sub?: string; delta?: string; accent?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${accent ? 'bg-indigo-600 text-white' : negative ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${accent ? 'text-indigo-200' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${accent ? 'text-white' : negative ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      {sub    && <p className={`text-xs mt-0.5 ${accent ? 'text-indigo-200' : 'text-gray-400'}`}>{sub}</p>}
      {delta  && <p className={`text-xs font-medium mt-0.5 ${delta.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>{delta}</p>}
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function AddFundWizard({ onClose }: { onClose: () => void }) {
  const navigate    = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FundForm>(BLANK);
  const [calls, setCalls]   = useState<CallDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // Live FX for step 2 hint
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const fetchLiveRate = async () => {
    try {
      const r = await fxRatesAPI.live();
      setLiveRate(r.data.usd_jpy);
      setForm(f => ({ ...f, entry_fx_rate: String(r.data.usd_jpy) }));
      toast.success('Live rate filled in');
    } catch { toast.error('Could not fetch live rate'); }
  };

  const set = (k: keyof FundForm, v: string) => setForm(f => ({ ...f, [k]: v }));
  const commitment = parseFloat(form.commitment_usd) || 0;
  const entryFx    = parseFloat(form.entry_fx_rate)  || 0;

  // ── Step 3: Draft call state ─────────────────────────────────────────
  const [draft, setDraft] = useState({
    notice_date: '', due_date: '',
    gross_call_usd: '', distribution_usd: '0', reinvestable_usd: '0',
    fx_rate: form.entry_fx_rate || '', wire_reference: '', notes: '',
  });
  const setD = (k: string, v: string) => setDraft(d => ({ ...d, [k]: v }));

  // Live compute for the draft call
  const lastCall   = calls[calls.length - 1];
  const prevE      = lastCall?.E ?? 0;
  const prevF      = lastCall?.F ?? commitment;
  const prevH      = lastCall?.H ?? 0;
  const dGross     = parseFloat(draft.gross_call_usd) || 0;
  const dDist      = parseFloat(draft.distribution_usd) || 0;
  const dReinvest  = parseFloat(draft.reinvestable_usd) || 0;
  const dFx        = parseFloat(draft.fx_rate) || entryFx || 143.5;
  const dNet       = dGross - dDist;
  const dNetJpy    = Math.round(dNet * dFx);
  const dNewE      = prevE + dGross;
  const dNewF      = prevF - dGross + dReinvest;
  const dG         = -dGross + dDist;
  const dNewH      = prevH + dG;
  const drawnPct   = commitment > 0 ? (dNewE / commitment * 100) : 0;

  function addCall() {
    if (!draft.due_date || dGross <= 0) {
      toast.error('Enter due date and gross call amount');
      return;
    }
    const raw = {
      call_number      : calls.length + 1,
      notice_date      : draft.notice_date || draft.due_date,
      due_date         : draft.due_date,
      gross_call_usd   : dGross,
      distribution_usd : dDist,
      reinvestable_usd : dReinvest,
      fx_rate          : dFx,
      wire_reference   : draft.wire_reference,
      notes            : draft.notes,
      net_call_usd: 0, net_call_jpy: 0, E: 0, F: 0, G: 0, H: 0,
    };
    const updated = recomputeLedger(
      [...calls.map(c => ({ ...c })), raw],
      commitment
    );
    setCalls(updated);
    setDraft(d => ({ ...d, notice_date:'', due_date:'', gross_call_usd:'', distribution_usd:'0', reinvestable_usd:'0', wire_reference:'', notes:'' }));
  }

  function removeCall(idx: number) {
    const updated = recomputeLedger(
      calls.filter((_, i) => i !== idx).map(c => ({ ...c })),
      commitment
    );
    setCalls(updated);
  }

  // ── Create fund ─────────────────────────────────────────────────────
  async function createFund() {
    if (!form.fund_name || !form.strategy) {
      toast.error('Fund name and strategy are required');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      // 1. Create fund
      const fRes = await fundsAPI.create({
        fund_name: form.fund_name, fund_key: form.fund_key || undefined, fund_name_jp: form.fund_name_jp,
        manager: form.manager, administrator: form.administrator,
        strategy: form.strategy,
        vintage_year: form.vintage_year ? parseInt(form.vintage_year) : null,
        currency: form.currency,
        commitment_usd:  parseFloat(form.commitment_usd)   || 0,
        entry_fx_rate:   parseFloat(form.entry_fx_rate)    || null,
        contract_date:   form.contract_date                || null,
        investment_period_start: form.investment_period_start || null,
        investment_period_end:   form.investment_period_end   || null,
        fund_term_years: form.fund_term_years ? parseInt(form.fund_term_years) : null,
        management_fee_pct: parseFloat(form.management_fee_pct)  || 0,
        carry_pct:          parseFloat(form.carry_pct)           || 0,
        hurdle_rate_pct:    parseFloat(form.hurdle_rate_pct)     || 0,
        wire_bank:          form.wire_bank          || null,
        wire_account_name:  form.wire_account_name  || null,
        wire_account_number:form.wire_account_number|| null,
        wire_aba:           form.wire_aba            || null,
        wire_swift:         form.wire_swift          || null,
        wire_reference:     form.wire_reference      || null,
        notes:              form.notes               || null,
      });
      const fundId = fRes.data.id;

      // 2. Create all historical capital calls as "paid"
      for (const c of calls) {
        await capitalCallsAPI.create({
          fund_id:          fundId,
          notice_date:      c.notice_date || c.due_date,
          due_date:         c.due_date,
          execution_date:   c.due_date,
          call_number:      c.call_number,
          gross_call_usd:   c.gross_call_usd,
          distribution_usd: c.distribution_usd,
          reinvestable_usd: c.reinvestable_usd,
          net_call_usd:     c.net_call_usd,
          fx_rate:          c.fx_rate,
          wire_reference:   c.wire_reference || null,
          notes:            c.notes || null,
          initial_status:   'paid',
        });
      }

      toast.success(`Fund "${form.fund_name}" created with ${calls.length} capital call${calls.length !== 1 ? 's' : ''}`);
      navigate(`/funds/${fundId}`);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr.response?.data?.detail || 'Failed to create fund');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-2 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add New Fund</h2>
            <p className="text-gray-400 text-sm mt-0.5">Step {step} of 4</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="px-8 pt-4 flex-shrink-0">
          <Steps current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 pb-6">

          {/* ══ STEP 1: Fund Identity ══════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fund Name *">
                  <Input
                    value={form.fund_name}
                    onChange={v => {
                      set('fund_name', v);
                      // Auto-generate key only while still blank or unchanged from auto-generated value
                      if (!form.fund_key || form.fund_key === toFundKey(form.fund_name)) {
                        set('fund_key', toFundKey(v));
                      }
                    }}
                    placeholder="e.g. Hamilton Lane Secondary Fund VI-B"
                  />
                </Field>
                <Field label="Fund Key" hint="Auto-generated · lowercase and hyphens · used to match uploaded PDFs">
                  <Input
                    value={form.fund_key}
                    onChange={v => set('fund_key', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. hamilton-lane"
                  />
                </Field>
                <Field label="Japanese Name">
                  <Input value={form.fund_name_jp} onChange={v => set('fund_name_jp', v)} placeholder="例: SDGs 投資事業有限責任組合" />
                </Field>
                <Field label="Strategy *">
                  <select
                    value={form.strategy}
                    onChange={e => set('strategy', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Select strategy…</option>
                    {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Vintage Year">
                  <Input value={form.vintage_year} onChange={v => set('vintage_year', v)} type="number" placeholder="2024" />
                </Field>
                <Field label="Manager / GP">
                  <Input value={form.manager} onChange={v => set('manager', v)} placeholder="e.g. Hamilton Lane" />
                </Field>
                <Field label="Administrator">
                  <Input value={form.administrator} onChange={v => set('administrator', v)} placeholder="e.g. State Street" />
                </Field>
                <Field label="Currency">
                  <select
                    value={form.currency}
                    onChange={e => set('currency', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="JPY">JPY — Japanese Yen</option>
                  </select>
                </Field>
              </div>
            </div>
          )}

          {/* ══ STEP 2: Commitment & Terms ══════════════════════════════════════ */}
          {step === 2 && (
            <div className="grid grid-cols-3 gap-6">

              {/* Left: form */}
              <div className="col-span-2 space-y-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Financial Terms</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Commitment (USD) *" hint="Total capital committed to this fund">
                    <Input value={form.commitment_usd} onChange={v => set('commitment_usd', v)} type="number" step="1000" placeholder="20000000" />
                  </Field>
                  <Field label="Entry FX Rate (USD/JPY)" hint="Rate used to convert commitment to JPY">
                    <div className="relative">
                      <Input value={form.entry_fx_rate} onChange={v => set('entry_fx_rate', v)} type="number" step="0.01" placeholder="145.00" />
                      <button
                        type="button"
                        onClick={fetchLiveRate}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Live ↗
                      </button>
                    </div>
                  </Field>
                  <Field label="Contract Date">
                    <Input value={form.contract_date} onChange={v => set('contract_date', v)} type="date" />
                  </Field>
                  <Field label="Fund Term (years)">
                    <Input value={form.fund_term_years} onChange={v => set('fund_term_years', v)} type="number" placeholder="10" />
                  </Field>
                  <Field label="Investment Period Start">
                    <Input value={form.investment_period_start} onChange={v => set('investment_period_start', v)} type="date" />
                  </Field>
                  <Field label="Investment Period End">
                    <Input value={form.investment_period_end} onChange={v => set('investment_period_end', v)} type="date" />
                  </Field>
                  <Field label="Management Fee %">
                    <Input value={form.management_fee_pct} onChange={v => set('management_fee_pct', v)} type="number" step="0.01" placeholder="1.5" />
                  </Field>
                  <Field label="Carry %">
                    <Input value={form.carry_pct} onChange={v => set('carry_pct', v)} type="number" step="0.01" placeholder="20" />
                  </Field>
                  <Field label="Hurdle Rate %">
                    <Input value={form.hurdle_rate_pct} onChange={v => set('hurdle_rate_pct', v)} type="number" step="0.01" placeholder="8" />
                  </Field>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Wire Instructions (optional)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Beneficiary Bank">
                      <Input value={form.wire_bank} onChange={v => set('wire_bank', v)} placeholder="JPMorgan Chase" />
                    </Field>
                    <Field label="Account Name">
                      <Input value={form.wire_account_name} onChange={v => set('wire_account_name', v)} placeholder="Fund LP Name" />
                    </Field>
                    <Field label="Account Number">
                      <Input value={form.wire_account_number} onChange={v => set('wire_account_number', v)} />
                    </Field>
                    <Field label="ABA Routing">
                      <Input value={form.wire_aba} onChange={v => set('wire_aba', v)} />
                    </Field>
                    <Field label="SWIFT / BIC">
                      <Input value={form.wire_swift} onChange={v => set('wire_swift', v)} />
                    </Field>
                    <Field label="Reference">
                      <Input value={form.wire_reference} onChange={v => set('wire_reference', v)} />
                    </Field>
                  </div>
                </div>
              </div>

              {/* Right: live preview */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</p>
                <CalcPreview
                  label="Commitment (USD)"
                  value={commitment ? fmt.usd(commitment) : '—'}
                  accent
                />
                <CalcPreview
                  label="Commitment (JPY)"
                  value={commitment && entryFx ? fmt.jpy(Math.round(commitment * entryFx)) : '—'}
                />
                {liveRate && (
                  <div className="bg-green-50 rounded-xl px-4 py-3 text-xs">
                    <p className="text-green-700 font-semibold">Live Rate</p>
                    <p className="text-green-900 text-lg font-bold">¥{liveRate.toFixed(2)}</p>
                    <p className="text-green-600">Source: frankfurter.dev (ECB)</p>
                  </div>
                )}
                <CalcPreview
                  label="Investment Capacity (F₀)"
                  value={commitment ? fmt.usd(commitment) : '—'}
                  sub="Starts equal to commitment"
                />
                <div className="bg-indigo-50 rounded-xl p-4 text-xs text-indigo-700 space-y-1">
                  <p className="font-semibold mb-2">Excel Formula Reference</p>
                  <p>E = prev_E + B  (cum. called)</p>
                  <p>F = prev_F − B + D  (inv. capacity)</p>
                  <p>G = −B + C  (cash flow)</p>
                  <p>H = prev_H + G  (net cash pos.)</p>
                </div>
              </div>
            </div>
          )}

          {/* ══ STEP 3: Capital Calls ══════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Enter historical capital calls for <span className="font-semibold text-gray-800">{form.fund_name}</span>.
                  {' '}Calculations update live as you type.
                </p>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium">
                  Commitment: {fmt.usd(commitment, true)}
                </span>
              </div>

              {/* Input row + live preview */}
              <div className="grid grid-cols-3 gap-5">

                {/* Draft call form */}
                <div className="col-span-2 bg-gray-50 rounded-2xl p-5 space-y-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    New Call — #{calls.length + 1}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Notice Date">
                      <Input value={draft.notice_date} onChange={v => setD('notice_date', v)} type="date" />
                    </Field>
                    <Field label="Due Date *">
                      <Input value={draft.due_date} onChange={v => setD('due_date', v)} type="date" />
                    </Field>
                    <Field label="Gross Call (USD) — B *" hint="Capital actually wired out">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input value={draft.gross_call_usd} onChange={v => setD('gross_call_usd', v)} type="number" step="1000" placeholder="0" className="pl-7" />
                      </div>
                    </Field>
                    <Field label="Distribution Offset (USD) — C" hint="Deemed distribution netted on this call">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input value={draft.distribution_usd} onChange={v => setD('distribution_usd', v)} type="number" step="100" placeholder="0" className="pl-7" />
                      </div>
                    </Field>
                    <Field label="Reinvestable (USD) — D" hint="Portion of distribution that can be reinvested">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <Input value={draft.reinvestable_usd} onChange={v => setD('reinvestable_usd', v)} type="number" step="100" placeholder="0" className="pl-7" />
                      </div>
                    </Field>
                    <Field label="FX Rate (USD/JPY)" hint="MUFG TTM on execution date">
                      <Input value={draft.fx_rate} onChange={v => setD('fx_rate', v)} type="number" step="0.01" placeholder={String(entryFx || '143.50')} />
                    </Field>
                    <Field label="Wire Reference">
                      <Input value={draft.wire_reference} onChange={v => setD('wire_reference', v)} placeholder="REF-001" />
                    </Field>
                    <Field label="Notes">
                      <Input value={draft.notes} onChange={v => setD('notes', v)} placeholder="Optional notes" />
                    </Field>
                  </div>

                  <button
                    type="button"
                    onClick={addCall}
                    disabled={!draft.due_date || dGross <= 0}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    + Add Call #{calls.length + 1}
                  </button>
                </div>

                {/* Live calc panel */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Calculation</p>
                  {dGross > 0 ? (
                    <>
                      <div className="bg-white border border-indigo-100 rounded-xl p-4 space-y-3">
                        <p className="text-xs text-gray-500 font-medium">This call (B = {fmt.usd(dGross)})</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Net USD (B−C)</span>
                            <span className="font-semibold text-red-700">{fmt.usd(dNet)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Net JPY</span>
                            <span className="font-semibold text-red-700">{fmt.jpy(dNetJpy)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Cash Flow (G)</span>
                            <span className={`font-semibold ${dG < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt.usd(dG)}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs font-medium text-gray-500">After this call →</p>
                      <CalcPreview label="E — Cumulative Called" value={fmt.usd(dNewE, true)}
                        sub={`${fmt.pct(drawnPct)} of commitment`} delta={`+${fmt.usd(dGross, true)}`} />
                      <CalcPreview label="F — Inv. Capacity" value={fmt.usd(Math.max(0, dNewF), true)}
                        sub={`Was ${fmt.usd(prevF, true)}`} delta={`−${fmt.usd(dGross - dReinvest, true)}`} negative={dNewF < 0} />
                      <CalcPreview label="H — Net Cash Position" value={fmt.usd(dNewH, true)}
                        sub={dNewH < 0 ? 'Net outflow' : 'Net inflow'} negative={dNewH < 0} />

                      {/* Drawn bar */}
                      <div className="bg-white border border-gray-100 rounded-xl p-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>Drawn</span><span>{fmt.pct(Math.min(drawnPct, 100))}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${Math.min(drawnPct, 100)}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                          <span>$0</span><span>{fmt.usd(commitment, true)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-5 text-center text-gray-400 text-xs">
                      <p className="text-2xl mb-2">🧮</p>
                      <p>Enter a gross call amount</p>
                      <p>to see live calculations</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Running ledger */}
              {calls.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-600">Capital Call History ({calls.length} calls)</p>
                    <p className="text-xs text-gray-400">All amounts in USD</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">#</th>
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">Due Date</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium bg-blue-50/60">B Called</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium bg-blue-50/60">E Cum.</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium bg-purple-50/60">F Cap.</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium bg-orange-50/60">G Flow</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium bg-red-50/60">H Net</th>
                          <th className="text-right px-3 py-2 text-gray-400 font-medium">JPY</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {calls.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{c.call_number}</td>
                            <td className="px-3 py-2 text-gray-700">{fmt.date(c.due_date)}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-700 bg-blue-50/30">{fmt.usd(c.gross_call_usd)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700 bg-blue-50/30">{fmt.usd(c.E)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-purple-700 bg-purple-50/30">{fmt.usd(c.F)}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold bg-orange-50/30 ${c.G < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt.usd(c.G)}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold bg-red-50/30 ${c.H < 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt.usd(c.H)}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-500">{fmt.jpy(c.net_call_jpy)}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeCall(i)} className="text-gray-300 hover:text-red-500 transition-colors">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {calls.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-50 border-t border-gray-200">
                            <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">Final Position</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-red-700">
                              {fmt.usd(calls.reduce((s,c) => s+c.gross_call_usd, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{fmt.usd(calls[calls.length-1].E)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-purple-700">{fmt.usd(calls[calls.length-1].F)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-700">
                              {fmt.usd(calls.reduce((s,c) => s+c.G, 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-red-700">{fmt.usd(calls[calls.length-1].H)}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {calls.length === 0 && (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm font-medium">No capital calls added yet</p>
                  <p className="text-xs mt-1">You can skip this step and add calls later from the Fund Detail page</p>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 4: Review ════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-6">

              {/* Left: fund summary */}
              <div className="space-y-4">
                <div className="bg-indigo-50 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1">Fund</p>
                  <p className="text-xl font-bold text-indigo-900">{form.fund_name}</p>
                  {form.fund_name_jp && <p className="text-indigo-600 text-sm">{form.fund_name_jp}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full">{form.strategy}</span>
                    <span className="text-xs bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full">{form.vintage_year}</span>
                    {form.manager && <span className="text-xs bg-indigo-200 text-indigo-800 px-2.5 py-1 rounded-full">{form.manager}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <CalcPreview label="Commitment" value={fmt.usd(commitment, true)} accent />
                  <CalcPreview label="JPY Equiv."
                    value={entryFx ? fmt.jpy(Math.round(commitment * entryFx)) : '—'}
                  />
                  <CalcPreview label="Mgmt Fee" value={form.management_fee_pct ? `${form.management_fee_pct}%` : '—'} />
                  <CalcPreview label="Carry / Hurdle"
                    value={form.carry_pct ? `${form.carry_pct}% / ${form.hurdle_rate_pct || 0}%` : '—'}
                  />
                </div>

                {form.wire_bank && (
                  <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-1.5">
                    <p className="font-semibold text-gray-600 uppercase tracking-wide text-xs mb-2">Wire Instructions</p>
                    <p className="text-gray-700"><span className="text-gray-400">Bank:</span> {form.wire_bank}</p>
                    {form.wire_account_name   && <p className="text-gray-700"><span className="text-gray-400">Account:</span> {form.wire_account_name}</p>}
                    {form.wire_swift          && <p className="text-gray-700"><span className="text-gray-400">SWIFT:</span> {form.wire_swift}</p>}
                  </div>
                )}
              </div>

              {/* Right: capital calls summary */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">{calls.length} Capital Call{calls.length !== 1 ? 's' : ''} to Create</p>
                  <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded-full">All marked Paid</span>
                </div>

                {calls.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <CalcPreview
                        label="Total Called (E)"
                        value={fmt.usd(calls[calls.length-1].E, true)}
                        sub={`${fmt.pct(calls[calls.length-1].E / commitment * 100)} drawn`}
                      />
                      <CalcPreview
                        label="Inv. Capacity (F)"
                        value={fmt.usd(calls[calls.length-1].F, true)}
                        sub="Remaining capacity"
                        negative={calls[calls.length-1].F < 0}
                      />
                      <CalcPreview
                        label="Net Cash (H)"
                        value={fmt.usd(calls[calls.length-1].H, true)}
                        negative={calls[calls.length-1].H < 0}
                      />
                      <CalcPreview
                        label="Total JPY"
                        value={fmt.jpy(calls.reduce((s,c) => s+c.net_call_jpy, 0))}
                      />
                    </div>

                    <div className="bg-gray-50 rounded-xl overflow-hidden text-xs">
                      {calls.map((c, i) => (
                        <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <div>
                            <span className="font-semibold text-gray-700">Call #{c.call_number}</span>
                            <span className="text-gray-400 ml-2">{fmt.date(c.due_date)}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-red-700">{fmt.usd(c.gross_call_usd)}</p>
                            <p className="text-gray-400">{fmt.jpy(c.net_call_jpy)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-xs">
                    <p>No capital calls — you can add them later from the Fund Detail page</p>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                  <p className="font-semibold mb-1">⚠️ Before creating:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>All capital calls will be created with status <strong>Paid</strong></li>
                    <li>Excel E/F/G/H calculations are pre-computed and stored</li>
                    <li>You can add more calls from the Fund Detail page</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-5 py-2.5 text-sm text-gray-600 hover:bg-white border border-gray-200 rounded-xl transition-colors"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          <div className="flex items-center gap-2">
            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && (!form.fund_name || !form.strategy)}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
              >
                Continue →
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={createFund}
                disabled={saving}
                className="flex items-center gap-2 px-7 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors"
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {saving ? 'Creating…' : `🚀 Create Fund${calls.length > 0 ? ` + ${calls.length} Call${calls.length>1?'s':''}` : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

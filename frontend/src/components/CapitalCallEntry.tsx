/**
 * CapitalCallEntry — Smart ongoing capital call form for an existing fund.
 *
 * Shows current fund position (E/F/H) from the existing ledger,
 * lets user enter the new call, and renders a live preview of
 * how the values change — before any API call is made.
 */
import { useState } from 'react';
import { capitalCallsAPI, fxRatesAPI } from '../services/api';
import { fmt } from '../lib/format';
import toast from 'react-hot-toast';

interface Props {
  fundId       : string;
  fundName     : string;
  commitment   : number;
  currentE     : number;   // cumulative called so far
  currentF     : number;   // investment capacity so far
  currentH     : number;   // net cash position so far
  nextCallNum  : number;   // call_number to pre-fill
  latestFxRate : number;   // latest stored FX rate
  onSuccess    : () => void;
  onCancel     : () => void;
}

function Row({ label, before, after, format='usd', negative=false }:
  { label: string; before: number; after: number; format?: 'usd'|'pct'; negative?: boolean }) {
  const changed = after !== before;
  const delta   = after - before;
  const fmtVal  = (v: number) => format === 'pct' ? fmt.pct(v) : fmt.usd(v);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-300 font-mono">{fmtVal(before)}</span>
        {changed && <span className="text-gray-300">→</span>}
        {changed && (
          <span className={`font-mono font-bold ${negative || after < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {fmtVal(after)}
          </span>
        )}
        {changed && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${delta < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {delta > 0 ? '+' : ''}{fmtVal(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function CapitalCallEntry({
  fundId, fundName, commitment,
  currentE, currentF, currentH,
  nextCallNum, latestFxRate,
  onSuccess, onCancel,
}: Props) {

  const [notice_date,      setNoticeDate]     = useState('');
  const [due_date,         setDueDate]        = useState('');
  const [gross_call_usd,   setGross]          = useState('');
  const [distribution_usd, setDist]           = useState('0');
  const [reinvestable_usd, setReinvest]       = useState('0');
  const [fx_rate,          setFx]             = useState(String(latestFxRate));
  const [call_pct,         setCallPct]        = useState('');
  const [wire_reference,   setWireRef]        = useState('');
  const [notes,            setNotes]          = useState('');
  const [saving,           setSaving]         = useState(false);
  const [liveLoading,      setLiveLoading]    = useState(false);
  const [submitted,        setSubmitted]      = useState(false);  // show success state

  // ── Live computation ──────────────────────────────────────────────────────
  const B    = parseFloat(gross_call_usd)   || 0;
  const C    = parseFloat(distribution_usd) || 0;
  const D    = parseFloat(reinvestable_usd) || 0;
  const rate = parseFloat(fx_rate)          || latestFxRate;

  const net_usd = B - C;
  const net_jpy = Math.round(net_usd * rate);
  const newE    = currentE + B;
  const newF    = currentF - B + D;
  const G       = -B + C;
  const newH    = currentH + G;
  const drawnPct      = commitment > 0 ? (newE / commitment * 100) : 0;
  const prevDrawnPct  = commitment > 0 ? (currentE / commitment * 100) : 0;

  const hasInput = B > 0 && due_date;

  async function fetchLive() {
    setLiveLoading(true);
    try {
      const r = await fxRatesAPI.live();
      setFx(String(r.data.usd_jpy));
      toast.success(`Live rate: ¥${r.data.usd_jpy}`);
    } catch {
      toast.error('Could not fetch live rate');
    } finally {
      setLiveLoading(false);
    }
  }

  async function submit() {
    if (!due_date || B <= 0) {
      toast.error('Enter due date and gross call amount');
      return;
    }
    setSaving(true);
    try {
      await capitalCallsAPI.create({
        fund_id:          fundId,
        notice_date:      notice_date || due_date,
        due_date,
        call_number:      nextCallNum,
        call_pct:         call_pct ? parseFloat(call_pct) : 0,
        gross_call_usd:   B,
        distribution_usd: C,
        reinvestable_usd: D,
        net_call_usd:     net_usd,
        fx_rate:          rate,
        wire_reference:   wire_reference || null,
        notes:            notes || null,
      });
      toast.success(`Capital Call #${nextCallNum} created — pending approval`);
      setSubmitted(true);
      onSuccess();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr.response?.data?.detail || 'Failed to create call');
    } finally {
      setSaving(false);
    }
  }

  if (submitted) return null;

  const inp = (value: string, setter: (v: string) => void, type='text', placeholder='', step?: string, prefix?: string) => (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
      <input
        type={type} value={value} placeholder={placeholder} step={step}
        onChange={e => setter(e.target.value)}
        className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white ${prefix ? 'pl-7' : ''}`}
      />
    </div>
  );

  return (
    <div className="bg-white border-2 border-indigo-100 rounded-2xl overflow-hidden shadow-lg">

      {/* Header */}
      <div className="flex items-center justify-between bg-indigo-600 px-5 py-3.5">
        <div>
          <p className="text-white font-semibold text-sm">New Capital Call — #{nextCallNum}</p>
          <p className="text-indigo-200 text-xs mt-0.5">{fundName}</p>
        </div>
        <button onClick={onCancel} className="text-indigo-300 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="grid grid-cols-5 divide-x divide-gray-100">

        {/* ── Left: form (3 cols) ─────────────────────────────────────────── */}
        <div className="col-span-3 p-5 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notice Date</label>
              {inp(notice_date, setNoticeDate, 'date')}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Due Date *</label>
              {inp(due_date, setDueDate, 'date')}
            </div>
          </div>

          {/* Key amounts */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Capital Call Amounts</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gross Call (B) * <span className="text-gray-400 normal-case font-normal">USD</span></label>
                {inp(gross_call_usd, setGross, 'number', '0.00', '0.01', '$')}
                {B > 0 && (
                  <p className="text-xs text-indigo-600 mt-1 font-medium">≈ {fmt.jpy(Math.round(B * rate))}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Distribution Offset (C) <span className="text-gray-400 normal-case font-normal">deemed dist.</span></label>
                {inp(distribution_usd, setDist, 'number', '0.00', '0.01', '$')}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reinvestable (D) <span className="text-gray-400 normal-case font-normal">of offset</span></label>
                {inp(reinvestable_usd, setReinvest, 'number', '0.00', '0.01', '$')}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Call % of Commitment</label>
                {inp(call_pct, setCallPct, 'number', '0.00', '0.01')}
              </div>
            </div>
          </div>

          {/* FX rate */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">FX Rate (USD/JPY) — MUFG TTM</label>
            <div className="flex gap-2">
              <div className="flex-1">{inp(fx_rate, setFx, 'number', '143.50', '0.01')}</div>
              <button
                type="button"
                onClick={fetchLive}
                disabled={liveLoading}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {liveLoading ? <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : '🔄'}
                Live
              </button>
            </div>
            {rate && B > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Net JPY: <span className="font-semibold text-red-700">{fmt.jpy(net_jpy)}</span>
              </p>
            )}
          </div>

          {/* Wire + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Wire Reference</label>
              {inp(wire_reference, setWireRef, 'text', 'REF-001')}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
              {inp(notes, setNotes, 'text', 'Optional')}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !hasInput}
              className="flex-2 flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Creating…' : 'Create Call (Pending)'}
            </button>
          </div>
        </div>

        {/* ── Right: live preview (2 cols) ───────────────────────────────── */}
        <div className="col-span-2 p-5 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Live Impact Preview</p>

          {hasInput ? (
            <div className="space-y-4">

              {/* Net amounts box */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                <p className="text-xs font-medium text-gray-500">This Call</p>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-gray-400">Net Call (B−C)</span>
                  <div className="text-right">
                    <p className="font-bold text-red-700 font-mono">{fmt.usd(net_usd)}</p>
                    <p className="text-xs text-red-500 font-mono">{fmt.jpy(net_jpy)}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Cash Flow (G)</span>
                  <span className={`font-semibold text-sm font-mono ${G < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt.usd(G)}</span>
                </div>
              </div>

              {/* Drawn bar */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Drawn</span>
                  <span>
                    <span className="text-gray-300 line-through mr-1">{fmt.pct(prevDrawnPct)}</span>
                    <span className="font-bold text-indigo-700">{fmt.pct(drawnPct)}</span>
                  </span>
                </div>
                <div className="relative w-full bg-gray-100 rounded-full h-3">
                  <div className="h-3 rounded-full bg-gray-200 transition-all" style={{ width: `${Math.min(prevDrawnPct, 100)}%` }} />
                  <div className="absolute top-0 left-0 h-3 rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${Math.min(drawnPct, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>$0</span><span>{fmt.usd(commitment, true)}</span>
                </div>
              </div>

              {/* Before → After table */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500 mb-3">Position Change</p>
                <Row label="E  Cum. Called"     before={currentE} after={newE} />
                <Row label="F  Inv. Capacity"   before={currentF} after={newF} negative={newF < 0} />
                <Row label="H  Net Cash"        before={currentH} after={newH} negative={newH < 0} />
                <Row label="Drawn %"            before={prevDrawnPct} after={drawnPct} format="pct" />
              </div>

              <div className="text-xs text-gray-400 bg-white rounded-xl border border-gray-100 p-3 space-y-1">
                <p className="font-medium text-gray-500">Workflow</p>
                <p>1. Call created → <span className="text-yellow-600 font-medium">Pending</span></p>
                <p>2. Review → click <span className="text-blue-600 font-medium">Approve</span></p>
                <p>3. After wire → click <span className="text-green-600 font-medium">Mark Paid</span></p>
                <p>4. Ledger auto-updates ✓</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-300">
              <p className="text-5xl mb-3">🧮</p>
              <p className="text-sm font-medium text-gray-400">Enter amounts to see</p>
              <p className="text-sm text-gray-400">live E / F / G / H impact</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

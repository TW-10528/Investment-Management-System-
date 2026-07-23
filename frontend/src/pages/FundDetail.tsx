import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fundsAPI, fxRatesAPI } from '../services/api';
import type { FundDetail as FundDetailType, LedgerRow, LedgerSnapshot } from '../types/index';
import { fmt, strategyBg } from '../lib/format';
import CapitalCallEntry from '../components/CapitalCallEntry';

function canEditRole() {
  return true;   // every signed-in user can edit (no role differentiation)
}

function Snap({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function FundDetail() {
  const { id } = useParams<{ id: string }>();
  const [fund, setFund]             = useState<FundDetailType | null>(null);
  const [rows, setRows]             = useState<LedgerRow[]>([]);
  const [snap, setSnap]             = useState<LedgerSnapshot | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<'ledger' | 'info' | 'wire' | 'commitments'>('ledger');
  const [showCallEntry, setShowCallEntry] = useState(false);
  const [latestFx, setLatestFx]     = useState(143.5);
  const [commitmentHistory, setCommitmentHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState(false);
  const [commitmentJpyEdit, setCommitmentJpyEdit] = useState<string>('');
  const [savingCommitment, setSavingCommitment] = useState(false);

  async function refresh() {
    if (!id) return;
    const [fRes, lRes] = await Promise.all([fundsAPI.get(id), fundsAPI.ledger(id)]);
    setFund(fRes.data);
    setRows(lRes.data.rows ?? []);
    setSnap(lRes.data.snapshot ?? null);
  }

  async function fetchCommitmentHistory() {
    if (!id) return;
    setHistoryLoading(true);
    try {
      const res = await fundsAPI.getCommitmentHistory(id);
      setCommitmentHistory(res.data ?? []);
    } catch (err) {
      console.error('Failed to fetch commitment history:', err);
    }
    setHistoryLoading(false);
  }

  async function saveCommitment() {
    if (!id || !commitmentJpyEdit) return;
    setSavingCommitment(true);
    try {
      const newCommitment = parseFloat(commitmentJpyEdit);
      // Update fund commitment
      await fundsAPI.update(id, { commitment_jpy: newCommitment });
      // Create commitment tranche entry
      await fundsAPI.addCommitmentHistory(id, {
        effective_date: new Date().toISOString().split('T')[0],
        commitment_amount: newCommitment,
        notes: `Updated via Fund Details`
      });
      // Refresh data
      await Promise.all([refresh(), fetchCommitmentHistory()]);
      setEditingCommitment(false);
      setCommitmentJpyEdit('');
    } catch (err) {
      console.error('Failed to save commitment:', err);
      alert('Failed to save commitment');
    }
    setSavingCommitment(false);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([fundsAPI.get(id), fundsAPI.ledger(id), fxRatesAPI.latest()])
      .then(([fRes, lRes, fxRes]) => {
        setFund(fRes.data);
        setRows(lRes.data.rows ?? []);
        setSnap(lRes.data.snapshot ?? null);
        if (fxRes.data.usd_jpy) setLatestFx(fxRes.data.usd_jpy);
      })
      .finally(() => setLoading(false));
    fetchCommitmentHistory();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!fund) {
    return (
      <div className="p-6">
        <p className="text-red-500">Fund not found.</p>
        <Link to="/funds" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">← Back to Funds</Link>
      </div>
    );
  }

  const badge   = strategyBg[fund.strategy ?? ''] ?? 'bg-gray-100 text-gray-700';
  const canEdit = canEditRole();

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/funds" className="hover:text-indigo-600">Funds</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{fund.fund_name}</span>
      </div>

      {/* Fund header */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{fund.fund_name}</h1>
              {fund.strategy && (
                <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${badge}`}>{fund.strategy}</span>
              )}
            </div>
            {fund.fund_name_jp && <p className="text-gray-400 text-sm">{fund.fund_name_jp}</p>}
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
              {fund.manager        && <span>Manager: <span className="font-medium text-gray-700">{fund.manager}</span></span>}
              {fund.administrator  && <span>Admin: <span className="font-medium text-gray-700">{fund.administrator}</span></span>}
              {fund.vintage_year   && <span>Vintage: <span className="font-medium text-gray-700">{fund.vintage_year}</span></span>}
              {fund.currency       && <span>Currency: <span className="font-medium text-gray-700">{fund.currency}</span></span>}
              {fund.entry_fx_rate  && <span>Entry FX: <span className="font-medium text-gray-700">{fmt.rate(fund.entry_fx_rate)}</span></span>}
            </div>
          </div>
          <Link to="/funds" className="text-xs text-gray-400 hover:text-indigo-600">← Back</Link>
        </div>
      </div>

      {/* Prepare data for ledger summary */}
      {(() => {
        const isSdg = fund && /sdg/i.test(fund.fund_name ?? '');
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
        const summaryTotalReceived = rows.reduce((sum, r) => sum + (r.capital_received ?? 0), 0);
        const summaryTotalReturnOfCapital = rows.reduce((sum, r) => sum + (r.return_of_capital ?? 0), 0);
        const summaryTotalGain = rows.reduce((sum, r) => sum + (r.gain ?? 0), 0);
        const summaryTotalInterest = rows.reduce((sum, r) => sum + (r.interest ?? 0), 0);
        (window as any).__fundDetail = { isSdg, lastRow, summaryTotalReceived, summaryTotalReturnOfCapital, summaryTotalGain, summaryTotalInterest };
        return null;
      })()}

      {/* Snapshot metrics */}
      {snap && (() => {
        const totalReturnOfCapital = rows.reduce((sum, r) => sum + (r.return_of_capital ?? 0), 0);
        const totalGain = rows.reduce((sum, r) => sum + (r.gain ?? 0), 0);
        const totalInterest = rows.reduce((sum, r) => sum + (r.interest ?? 0), 0);

        const isSdg = 'commitment_jpy' in snap;
        const commitment = isSdg ? snap.commitment_jpy : snap.commitment_usd;
        const totalCalled = isSdg ? snap.total_called_jpy : snap.total_called_usd;
        const totalReceived = isSdg ? snap.total_received_jpy : snap.total_received_usd;
        const unfunded = isSdg ? snap.unfunded_jpy : snap.unfunded_usd;
        const fmt_fn = isSdg ? fmt.jpy : (v: number) => fmt.usd(v, true);

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Snap label="Commitment"     value={fmt_fn(commitment)} />
            <Snap label="Total Called"   value={fmt_fn(totalCalled)} />
            <Snap label="Total Received" value={fmt_fn(totalReceived)} />
            <Snap label="Drawn %"        value={fmt.pct(snap.drawn_pct)} />
            <Snap label="Unfunded"       value={fmt_fn(unfunded)} />
            <Snap label="Inv. Capacity"  value={fmt.usd(snap.investment_capacity, true)} />
            <Snap label="Net Cash"       value={isSdg ? fmt.jpy(snap.net_cash_position) : fmt.usd(snap.net_cash_position, true)} sub={snap.net_cash_position < 0 ? 'Net outflow' : 'Net inflow'} />
            <Snap label="DPI"            value={snap.dpi.toFixed(2) + 'x'} />
            <Snap label="Return of Capital" value={isSdg ? fmt.jpy(totalReturnOfCapital) : fmt.usd(totalReturnOfCapital, true)} />
            <Snap label="Gain" value={isSdg ? fmt.jpy(totalGain) : fmt.usd(totalGain, true)} />
            <Snap label="Interest" value={isSdg ? fmt.jpy(totalInterest) : fmt.usd(totalInterest, true)} />
          </div>
        );
      })()}

      {/* Tabs + New Call button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(['ledger', 'info', 'wire', 'commitments'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'ledger' ? '📊 Ledger' : t === 'info' ? '📝 Fund Info' : t === 'wire' ? '🏦 Wire Instructions' : '📌 Commitments'}
            </button>
          ))}
        </div>
        {tab === 'ledger' && !showCallEntry && canEdit && (
          <button
            onClick={() => setShowCallEntry(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            + New Capital Call
          </button>
        )}
      </div>

      {/* ── Ongoing capital call entry (smart form) ── */}
      {tab === 'ledger' && showCallEntry && fund && (
        <CapitalCallEntry
          fundId={fund.id ?? fund.fund_id ?? id!}
          fundName={fund.fund_name}
          commitment={fund.commitment_usd ?? 0}
          currentE={snap?.total_called_usd ?? 0}
          currentF={snap?.investment_capacity ?? (fund.commitment_usd ?? 0)}
          currentH={snap?.net_cash_position ?? 0}
          nextCallNum={rows.filter(r => r.tx_type === 'capital_call').length + 1}
          latestFxRate={latestFx}
          onSuccess={() => { setShowCallEntry(false); refresh(); }}
          onCancel={() => setShowCallEntry(false)}
        />
      )}

      {/* ── Ledger table ── */}
      {tab === 'ledger' && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p>No paid transactions yet</p>
              <p className="text-sm mt-1">Create a capital call above, approve it, then mark as Paid</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Ledger Summary Header */}
              {snap && (
                <div className="border-b border-gray-200 pb-4">
                  <div className="grid grid-cols-7 gap-4 text-xs">
                    <div>
                      <p className="text-gray-500 font-medium mb-1">COMMITMENT (JPY)</p>
                      <p className="font-bold text-gray-900">{fmt.jpy(snap.commitment_jpy ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">PAID-IN</p>
                      <p className="font-bold text-gray-900">{fmt.jpy(snap.total_called_jpy ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">RECEIVED</p>
                      <p className="font-bold text-gray-900">{fmt.jpy(snap.total_received_jpy ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">DRAWN %</p>
                      <p className="font-bold text-gray-900">{fmt.pct(snap.drawn_pct ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">UNFUNDED</p>
                      <p className="font-bold text-gray-900">{fmt.jpy(snap.unfunded_jpy ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">H NET CASH</p>
                      <p className="font-bold text-gray-900">{fmt.jpy(snap.net_cash_position ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium mb-1">DPI</p>
                      <p className="font-bold text-gray-900">{snap.dpi?.toFixed(3)}x</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-3 font-medium text-gray-500">Date</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-500">Description</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">FX Rate</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-blue-50">
                      <span title="Capital Paid In (USD)">B — Called (USD)</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-green-50">
                      <span title="Capital Received (USD)">C — Received (USD)</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-yellow-50">
                      <span title="Reinvestable Amount">D — Reinvestable</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-blue-50">
                      <span title="E = prev.E + B">E — Cum. Called</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-purple-50">
                      <span title="F = prev.F - B + D">F — Inv. Capacity</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-orange-50">
                      <span title="G = -B + C">G — Cash Flow</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500 bg-red-50">
                      <span title="H = running net cash position">H — Net Cash</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">
                      <span title="L = C − D (distribution not allocated to reinvestment)">L — Dist Not Reinvested</span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">Return of Capital</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">Gain</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">Interest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length > 0 && (() => {
                    const d = (window as any).__fundDetail;
                    if (!d) return null;
                    return (
                      <tr className="bg-gray-100 font-semibold hover:bg-gray-100">
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">SUMMARY</td>
                        <td className="px-3 py-2.5 text-gray-700">Totals & Latest</td>
                        <td className="px-3 py-2.5 text-right text-gray-500 font-mono">—</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-800 bg-blue-50/60">
                          {d.isSdg ? fmt.jpy(d.lastRow?.cumulative_called ?? 0) : fmt.usd(d.lastRow?.cumulative_called ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-800 bg-green-50/60">
                          {d.isSdg ? fmt.jpy(d.summaryTotalReceived) : fmt.usd(d.summaryTotalReceived)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500 bg-yellow-50/60">
                          —
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-900 bg-blue-50/60">
                          {d.isSdg ? fmt.jpy(d.lastRow?.cumulative_called ?? 0) : fmt.usd(d.lastRow?.cumulative_called ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-purple-900 bg-purple-50/60">
                          {d.isSdg ? fmt.jpy(d.lastRow?.investment_capacity ?? 0) : fmt.usd(d.lastRow?.investment_capacity ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600 bg-orange-50/60">
                          —
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 bg-red-50/60">
                          {d.isSdg ? fmt.jpy(d.lastRow?.net_cash_position ?? 0) : fmt.usd(d.lastRow?.net_cash_position ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500 bg-gray-50/60">
                          —
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500 bg-gray-50/60">
                          {d.isSdg ? fmt.jpy(d.summaryTotalReturnOfCapital) : fmt.usd(d.summaryTotalReturnOfCapital)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500 bg-gray-50/60">
                          {d.isSdg ? fmt.jpy(d.summaryTotalGain) : fmt.usd(d.summaryTotalGain)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500 bg-gray-50/60">
                          {d.isSdg ? fmt.jpy(d.summaryTotalInterest) : fmt.usd(d.summaryTotalInterest)}
                        </td>
                      </tr>
                    );
                  })()}
                  {rows.map((row, i) => {
                    const isCall = row.tx_type === 'capital_call';
                    const isSdg = fund && /sdg/i.test(fund.fund_name ?? '');
                    const fmt_fn = isSdg ? fmt.jpy : (v: number) => fmt.usd(v);
                    return (
                      <tr key={i} className={`hover:bg-gray-50 ${isCall ? '' : 'bg-green-50/30'}`}>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmt.date(row.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-1.5 ${isCall ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {isCall ? '↓ Call' : '↑ Dist'}
                          </span>
                          <span className="text-gray-700">{row.description}</span>
                          {row.wire_reference && (
                            <p className="text-gray-400 text-xs mt-0.5">Ref: {row.wire_reference}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500 font-mono">{fmt.rate(row.fx_rate)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-700 bg-blue-50/40">
                          {row.capital_paid_in ? fmt_fn(row.capital_paid_in) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-green-700 bg-green-50/40">
                          {row.capital_received ? fmt_fn(row.capital_received) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600 bg-yellow-50/40">
                          {row.reinvestable ? fmt_fn(row.reinvestable) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-blue-700 bg-blue-50/40">
                          {fmt_fn(row.cumulative_called)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-purple-700 bg-purple-50/40">
                          {fmt_fn(row.investment_capacity)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold bg-orange-50/40 ${row.cash_flow < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt_fn(row.cash_flow)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold bg-red-50/40 ${row.net_cash_position < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {fmt_fn(row.net_cash_position)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.capital_received ? fmt_fn(row.capital_received - (row.reinvestable ?? 0)) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.return_of_capital ? fmt_fn(row.return_of_capital) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.gain ? fmt_fn(row.gain) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.interest ? fmt_fn(row.interest) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </div>
          )}
        </div>
      )}

      {/* ── Fund info tab ── */}
      {tab === 'info' && (
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          {editingCommitment && /sdg/i.test(fund.fund_name) ? (
            <div className="space-y-4 mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
              <h3 className="font-semibold text-gray-900">Edit Commitment (JPY)</h3>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Commitment (JPY)</label>
                <input
                  type="number"
                  value={commitmentJpyEdit}
                  onChange={(e) => setCommitmentJpyEdit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Enter commitment amount"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveCommitment}
                  disabled={savingCommitment}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {savingCommitment ? 'Saving...' : 'Save & Create Tranche'}
                </button>
                <button
                  onClick={() => setEditingCommitment(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              ['Fund Name',          fund.fund_name],
              ['Japanese Name',      fund.fund_name_jp],
              ['Manager',            fund.manager],
              ['Administrator',      fund.administrator],
              ['Strategy',           fund.strategy],
              ['Vintage Year',       fund.vintage_year],
              ['Currency',           fund.currency],
              ...((/sdg/i.test(fund.fund_name) && (fund as any).commitment_jpy) ? [
                ['Commitment (JPY)',   `¥${((fund as any).commitment_jpy || 0).toLocaleString('ja-JP')}`]
              ] : [
                ['Commitment (USD)',   fmt.usd(fund.commitment_usd ?? 0)]
              ]),
              ...((/sdg/i.test(fund.fund_name) && (fund as any).contract_commitment_jpy) ? [
                ['Contract Commitment (JPY)',   `¥${((fund as any).contract_commitment_jpy || 0).toLocaleString('ja-JP')}`]
              ] : []),
              ['Entry FX Rate',      fmt.rate(fund.entry_fx_rate)],
              ['Contract Date',      fmt.date(fund.contract_date)],
              ['Inv. Period Start',  fmt.date(fund.investment_period_start)],
              ['Inv. Period End',    fmt.date(fund.investment_period_end)],
              ['Fund Term (years)',  fund.fund_term_years],
              ['Management Fee',    fund.management_fee_pct != null ? `${fund.management_fee_pct}%` : '—'],
              ['Carry',              fund.carry_pct != null ? `${fund.carry_pct}%` : '—'],
              ['Hurdle Rate',        fund.hurdle_rate_pct != null ? `${fund.hurdle_rate_pct}%` : '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-b border-gray-50 pb-3 flex items-center justify-between group">
                <div>
                  <p className="text-gray-400 text-xs">{label}</p>
                  <p className="font-medium text-gray-800 mt-0.5">{value ?? '—'}</p>
                </div>
                {label === 'Commitment (JPY)' && /sdg/i.test(fund.fund_name) && canEdit && !editingCommitment && (
                  <button
                    onClick={() => {
                      setCommitmentJpyEdit(String((fund as any).commitment_jpy || ''));
                      setEditingCommitment(true);
                    }}
                    className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
            {fund.notes && (
              <div className="md:col-span-2 border-b border-gray-50 pb-3">
                <p className="text-gray-400 text-xs">Notes</p>
                <p className="text-gray-800 mt-0.5 whitespace-pre-wrap">{fund.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wire instructions tab ── */}
      {tab === 'wire' && (
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          {fund.wire_bank ? (
            <div className="space-y-4 text-sm">
              <h3 className="font-semibold text-gray-900 mb-4">Wire Transfer Instructions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  ['Beneficiary Bank',     fund.wire_bank],
                  ['Account Name',         fund.wire_account_name],
                  ['Account Number',       fund.wire_account_number],
                  ['ABA Routing',          fund.wire_aba],
                  ['SWIFT / BIC',          fund.wire_swift],
                  ['Wire Reference',       fund.wire_reference],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-gray-50 rounded-lg px-4 py-3">
                    <p className="text-gray-400 text-xs mb-1">{label}</p>
                    <p className="font-mono text-sm font-medium text-gray-800">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Always confirm wire instructions directly with the fund manager before sending.
              </p>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">🏦</p>
              <p>No wire instructions on file for this fund</p>
            </div>
          )}
        </div>
      )}

      {/* ── Commitments tab ── */}
      {tab === 'commitments' && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">TOTAL COMMITMENT (JPY)</p>
            <p className="text-2xl font-bold text-gray-900">
              ¥{((fund as any).commitment_jpy || (fund as any).contract_commitment_jpy || 0).toLocaleString('ja-JP')}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Current: {commitmentHistory.length > 0 ? fmt.date(commitmentHistory[commitmentHistory.length - 1].effective_date) : 'Not set'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Commitment Tranches</h3>
            {historyLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : commitmentHistory.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
                <p className="text-sm text-gray-400">No commitment history yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Edit commitment in Fund Details to create tranches.
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Tranche</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Effective Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Commitment (¥)</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {commitmentHistory.map((h, idx) => {
                      const isCurrent = idx === commitmentHistory.length - 1;
                      return (
                        <tr key={h.id} className={isCurrent ? 'bg-indigo-50' : ''}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {idx + 1}{idx === commitmentHistory.length - 1 ? <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600">Current</span> : ''}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{fmt.date(h.effective_date)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                            ¥{h.commitment_amount.toLocaleString('ja-JP')}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{h.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-4">
            💡 Tip: Edit commitment values in the Fund Details tab to create new tranches.
          </p>
        </div>
      )}
    </div>
  );
}

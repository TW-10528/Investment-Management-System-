import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fundsAPI, fxRatesAPI } from '../services/api';
import type { FundDetail as FundDetailType, LedgerRow, LedgerSnapshot } from '../types/index';
import { fmt, strategyBg } from '../lib/format';
import CapitalCallEntry from '../components/CapitalCallEntry';

function canEditRole() {
  const raw  = localStorage.getItem('user') || '{}';
  const user = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  return ['admin', 'finance_manager', 'finance_staff'].includes(user.role ?? '');
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
  const [tab, setTab]               = useState<'ledger' | 'info' | 'wire'>('ledger');
  const [showCallEntry, setShowCallEntry] = useState(false);
  const [latestFx, setLatestFx]     = useState(143.5);

  async function refresh() {
    if (!id) return;
    const [fRes, lRes] = await Promise.all([fundsAPI.get(id), fundsAPI.ledger(id)]);
    setFund(fRes.data);
    setRows(lRes.data.rows ?? []);
    setSnap(lRes.data.snapshot ?? null);
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

      {/* Snapshot metrics */}
      {snap && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Snap label="Commitment"     value={fmt.usd(snap.commitment_usd, true)} />
          <Snap label="Total Called"   value={fmt.usd(snap.total_called_usd, true)} />
          <Snap label="Total Received" value={fmt.usd(snap.total_received_usd, true)} />
          <Snap label="Drawn %"        value={fmt.pct(snap.drawn_pct)} />
          <Snap label="Unfunded"       value={fmt.usd(snap.unfunded_usd, true)} />
          <Snap label="Inv. Capacity"  value={fmt.usd(snap.investment_capacity, true)} />
          <Snap label="Net Cash"       value={fmt.usd(snap.net_cash_position, true)} sub={snap.net_cash_position < 0 ? 'Net outflow' : 'Net inflow'} />
          <Snap label="DPI"            value={snap.dpi.toFixed(2) + 'x'} />
        </div>
      )}

      {/* Tabs + New Call button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(['ledger', 'info', 'wire'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'ledger' ? '📊 Ledger' : t === 'info' ? '📝 Fund Info' : '🏦 Wire Instructions'}
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
                    <th className="text-right px-3 py-3 font-medium text-gray-500">JPY Called</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-500">JPY Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => {
                    const isCall = row.tx_type === 'capital_call';
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
                          {row.capital_paid_in ? fmt.usd(row.capital_paid_in) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-green-700 bg-green-50/40">
                          {row.capital_received ? fmt.usd(row.capital_received) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600 bg-yellow-50/40">
                          {row.reinvestable ? fmt.usd(row.reinvestable) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-blue-700 bg-blue-50/40">
                          {fmt.usd(row.cumulative_called)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-purple-700 bg-purple-50/40">
                          {fmt.usd(row.investment_capacity)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold bg-orange-50/40 ${row.cash_flow < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt.usd(row.cash_flow)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold bg-red-50/40 ${row.net_cash_position < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {fmt.usd(row.net_cash_position)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.capital_paid_jpy ? fmt.jpy(row.capital_paid_jpy) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                          {row.capital_received_jpy ? fmt.jpy(row.capital_received_jpy) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Fund info tab ── */}
      {tab === 'info' && (
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              ['Fund Name',          fund.fund_name],
              ['Japanese Name',      fund.fund_name_jp],
              ['Manager',            fund.manager],
              ['Administrator',      fund.administrator],
              ['Strategy',           fund.strategy],
              ['Vintage Year',       fund.vintage_year],
              ['Currency',           fund.currency],
              ['Commitment (USD)',   fmt.usd(fund.commitment_usd ?? 0)],
              ['Entry FX Rate',      fmt.rate(fund.entry_fx_rate)],
              ['Contract Date',      fmt.date(fund.contract_date)],
              ['Inv. Period Start',  fmt.date(fund.investment_period_start)],
              ['Inv. Period End',    fmt.date(fund.investment_period_end)],
              ['Fund Term (years)',  fund.fund_term_years],
              ['Management Fee',    fund.management_fee_pct != null ? `${fund.management_fee_pct}%` : '—'],
              ['Carry',              fund.carry_pct != null ? `${fund.carry_pct}%` : '—'],
              ['Hurdle Rate',        fund.hurdle_rate_pct != null ? `${fund.hurdle_rate_pct}%` : '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-b border-gray-50 pb-3">
                <p className="text-gray-400 text-xs">{label}</p>
                <p className="font-medium text-gray-800 mt-0.5">{value ?? '—'}</p>
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
    </div>
  );
}

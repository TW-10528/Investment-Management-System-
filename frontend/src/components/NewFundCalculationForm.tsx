/**
 * New Fund Calculation Form
 * Shows optional input fields and live ledger preview for new fund entry
 * Used when creating a new fund with manual input for transaction values
 */
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { fmt } from '../lib/format'

interface InputValues {
  commitment_usd: string
  capital_distribution: string
  distribution_received: string
  reinvestable: string
  transaction_date: string
  fx_rate: string
}

interface LedgerRow {
  row: number
  date: string
  type: string
  description: string
  capital_paid_in: number
  capital_received: number
  reinvestable: number
  cumulative_called: number
  investment_capacity: number
  cash_flow: number
  net_cash_position: number
}

interface Snapshot {
  commitment_usd: number
  total_called_usd: number
  total_received_usd: number
  drawn_pct: number
  unfunded_usd: number
  investment_capacity: number
  net_cash_position: number
  dpi: number
}

interface Props {
  fundId: string
  fundName: string
  noticeDate?: string
  onCancel: () => void
  onSave: (values: InputValues, ledger: { snapshot: Snapshot; rows: LedgerRow[] }) => Promise<void>
  isLoading?: boolean
}

export default function NewFundCalculationForm({
  fundId: _fundId,
  fundName,
  noticeDate,
  onCancel,
  onSave,
  isLoading = false,
}: Props) {
  const [values, setValues] = useState<InputValues>({
    commitment_usd: '',
    capital_distribution: '',
    distribution_received: '',
    reinvestable: '',
    transaction_date: noticeDate || new Date().toISOString().split('T')[0],
    fx_rate: '150',
  })

  const [ledger, setLedger] = useState<{ snapshot: Snapshot; rows: LedgerRow[] } | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)

  // Auto-fetch FX rate when transaction date changes
  useEffect(() => {
    if (!values.transaction_date) return

    const timer = setTimeout(async () => {
      setFetchingRate(true)
      try {
        const token = localStorage.getItem('authToken')
        const res = await fetch(`/api/v1/fx-rates/historical?date=${values.transaction_date}&from=USD&to=JPY`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.usd_jpy) {
            setValues(prev => ({ ...prev, fx_rate: data.usd_jpy.toString() }))
          }
        }
      } catch (err) {
        console.error('Failed to fetch FX rate:', err)
        // Keep the current rate if fetch fails
      } finally {
        setFetchingRate(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [values.transaction_date])

  // Auto-calculate ledger when values change
  useEffect(() => {
    const timer = setTimeout(() => {
      calculateLedger()
    }, 500)
    return () => clearTimeout(timer)
  }, [values])

  async function calculateLedger() {
    setCalculating(true)
    setCalcError(null)
    try {
      const payload = {
        commitment_usd: parseFloat(values.commitment_usd) || 0,
        capital_distribution: parseFloat(values.capital_distribution) || 0,
        distribution_received: parseFloat(values.distribution_received) || 0,
        reinvestable: parseFloat(values.reinvestable) || 0,
        transaction_date: values.transaction_date,
        fx_rate: parseFloat(values.fx_rate) || 150,
      }

      const token = localStorage.getItem('authToken')
      const res = await fetch('/api/v1/fund-reports/calculate-new-fund-ledger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Calculation failed')
      }

      const data = await res.json()
      setLedger(data)
      setCalcError(null)
    } catch (err: any) {
      console.error('Ledger calculation error:', err)
      setCalcError(err.message || 'Failed to calculate ledger')
      setLedger(null)
    } finally {
      setCalculating(false)
    }
  }

  function handleInputChange(field: string, value: string) {
    setValues(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!ledger || !values.transaction_date) {
      toast.error('Please enter a transaction date and values')
      return
    }
    try {
      await onSave(values, ledger)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    }
  }

  // Enable save if transaction date is set and at least some values are entered
  const hasValues = values.transaction_date && (
    parseFloat(values.commitment_usd) > 0 ||
    parseFloat(values.capital_distribution) > 0 ||
    parseFloat(values.distribution_received) > 0 ||
    parseFloat(values.reinvestable) > 0
  )

  const canSave = (ledger || hasValues) && values.transaction_date && !isLoading && !calculating

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="theme-card border theme-border rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b theme-border">
          <h2 className="text-lg font-bold theme-text">New Fund Entry — {fundName}</h2>
          <p className="text-sm theme-text-muted mt-1">Enter transaction values to calculate ledger</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Input Fields */}
            <div className="space-y-4">
              <h3 className="font-semibold theme-text text-sm uppercase tracking-wide">Input Fields (Optional)</h3>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">Transaction Date</label>
                <input
                  type="date"
                  value={values.transaction_date}
                  onChange={e => handleInputChange('transaction_date', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">Total Commitment (USD)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={values.commitment_usd}
                  onChange={e => handleInputChange('commitment_usd', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">Capital Distribution (B)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={values.capital_distribution}
                  onChange={e => handleInputChange('capital_distribution', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">Distribution/Gains Received (C)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={values.distribution_received}
                  onChange={e => handleInputChange('distribution_received', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">Reinvestable (D)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={values.reinvestable}
                  onChange={e => handleInputChange('reinvestable', e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text"
                />
              </div>

              <div>
                <label className="text-xs font-semibold theme-text-muted uppercase">
                  FX Rate (JPY/USD) {fetchingRate && '(Fetching...)'}
                </label>
                <div className="mt-1 relative">
                  <input
                    type="number"
                    placeholder="150"
                    value={values.fx_rate}
                    onChange={e => handleInputChange('fx_rate', e.target.value)}
                    disabled={fetchingRate}
                    className="w-full px-3 py-2 rounded-lg theme-bg theme-border border text-sm theme-text disabled:opacity-50"
                  />
                  {fetchingRate && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ledger Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold theme-text text-sm uppercase tracking-wide">Calculated Ledger</h3>

              {calcError && (
                <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700 border border-red-200">
                  <strong>Error:</strong> {calcError}
                </div>
              )}

              {ledger ? (
                <>
                  {/* Snapshot */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-lg theme-bg-alt">
                    <div>
                      <div className="text-xs theme-text-muted">Commitment</div>
                      <div className="font-semibold theme-text">{fmt.usd(ledger.snapshot.commitment_usd)}</div>
                    </div>
                    <div>
                      <div className="text-xs theme-text-muted">Total Called</div>
                      <div className="font-semibold theme-text">{fmt.usd(ledger.snapshot.total_called_usd)}</div>
                    </div>
                    <div>
                      <div className="text-xs theme-text-muted">Drawn %</div>
                      <div className="font-semibold theme-text">{(ledger.snapshot.drawn_pct * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs theme-text-muted">DPI</div>
                      <div className="font-semibold theme-text">{ledger.snapshot.dpi.toFixed(2)}x</div>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div className="overflow-x-auto border theme-border rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="theme-bg-alt border-b theme-border">
                          <th className="px-2 py-2 text-left theme-text-muted font-semibold">Date</th>
                          <th className="px-2 py-2 text-right theme-text-muted font-semibold">B</th>
                          <th className="px-2 py-2 text-right theme-text-muted font-semibold">C</th>
                          <th className="px-2 py-2 text-right theme-text-muted font-semibold">E</th>
                          <th className="px-2 py-2 text-right theme-text-muted font-semibold">F</th>
                          <th className="px-2 py-2 text-right theme-text-muted font-semibold">G</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.rows.map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'theme-bg-alt' : ''}>
                            <td className="px-2 py-2 theme-text">{row.date}</td>
                            <td className="px-2 py-2 text-right theme-text">{fmt.usd(row.capital_paid_in)}</td>
                            <td className="px-2 py-2 text-right theme-text">{fmt.usd(row.capital_received)}</td>
                            <td className="px-2 py-2 text-right theme-text">{fmt.usd(row.cumulative_called)}</td>
                            <td className="px-2 py-2 text-right theme-text">{fmt.usd(row.investment_capacity)}</td>
                            <td className="px-2 py-2 text-right theme-text">{fmt.usd(row.cash_flow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-lg theme-bg-alt text-sm theme-text-muted text-center">
                  {calculating ? 'Calculating...' : 'Enter values to see ledger preview'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t theme-border flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold theme-text-muted hover:theme-bg-alt transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save & Create Ledger'}
          </button>
        </div>
      </div>
    </div>
  )
}

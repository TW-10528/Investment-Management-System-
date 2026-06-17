import { useState, useRef, useCallback } from 'react'
import axios from 'axios'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Classification {
  fund_key: string; fund_display_name: string
  report_type: string; currency: string; confidence_score: number
}
interface Extraction {
  transaction_date: string | null
  B_capital_contribution: number | null; C_distribution_received: number | null
  D_reinvestable: number | null; return_of_capital: number | null
  gain: number | null; interest: number | null
  report_provided_unfunded_before: number | null
  report_provided_remaining_after: number | null
  subsequent_close_interest: number | null
  notes: string; extraction_confidence: number
  [key: string]: any
}
interface CalcResult {
  B: number; C: number; D: number; L: number
  cash_flow: number; E: number; F: number; G: number
  commitment_inferred: number | null
}
interface CrossCheck { rule: string; pass: boolean; detail: string }
interface GateResult  { level: string; label: string; color: string }
interface ApiResult {
  pdf_characters: number; pdf_preview: string
  classification: Classification; extraction: Extraction
  calculation: CalcResult | null; cross_checks: CrossCheck[] | null
  confidence_gate: GateResult; model_used: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, currency = 'USD') =>
  n == null ? '—' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const confColor = (s: number) =>
  s >= 95 ? 'text-green-600' : s >= 90 ? 'text-yellow-600' : s >= 75 ? 'text-orange-500' : 'text-red-600'

const gateColors: Record<string, string> = {
  green:  'bg-green-50 border-green-300 text-green-800',
  yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  orange: 'bg-orange-50 border-orange-300 text-orange-800',
  red:    'bg-red-50 border-red-300 text-red-800',
}

const REPORT_BADGES: Record<string, string> = {
  CAPITAL_CALL:         'bg-blue-100 text-blue-800',
  DISTRIBUTION:         'bg-green-100 text-green-800',
  NETTED_CALL:          'bg-purple-100 text-purple-800',
  INITIAL_CONTRIBUTION: 'bg-slate-100 text-slate-700',
}

const STEPS = ['Parsing PDF', 'Classifying Fund', 'Extracting Values', 'Running Calc Engine']

// ── Component ─────────────────────────────────────────────────────────────────
export default function AiExtract() {
  const [file,      setFile]      = useState<File | null>(null)
  const [dragging,  setDragging]  = useState(false)
  const [step,      setStep]      = useState(-1)   // -1 = idle
  const [result,    setResult]    = useState<ApiResult | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [showPdf,   setShowPdf]   = useState(false)

  // Config
  const [modelUrl,  setModelUrl]  = useState('https://tw-gateway.twave.co.jp')
  const [modelName, setModelName] = useState('Qwen/Qwen3.6-35B-A3B-FP8')
  const [prevE,     setPrevE]     = useState('0')
  const [prevF,     setPrevF]     = useState('0')
  const [prevG,     setPrevG]     = useState('0')
  const [status,    setStatus]    = useState<{reachable:boolean;model_available:boolean;models_on_server:string[]} | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') { setFile(f); setResult(null); setError(null) }
  }, [])

  async function checkStatus() {
    try {
      const res = await axios.get('/api/v1/ai-extract/status', {
        params: { model_url: modelUrl, model_name: modelName },
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      })
      setStatus(res.data)
    } catch {
      setStatus({ reachable: false, model_available: false, models_on_server: [] })
    }
  }

  async function run() {
    if (!file) return
    setResult(null); setError(null); setStep(0)

    const form = new FormData()
    form.append('file', file)
    form.append('model_url',  modelUrl)
    form.append('model_name', modelName)
    form.append('prev_e', prevE)
    form.append('prev_f', prevF)
    form.append('prev_g', prevG)

    // Animate steps while waiting
    let s = 0
    const tick = setInterval(() => { s = Math.min(s + 1, STEPS.length - 1); setStep(s) }, 4000)

    try {
      const res = await axios.post<ApiResult>('/api/v1/ai-extract/test', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        timeout: 180_000,
      })
      clearInterval(tick)
      setStep(STEPS.length)
      setResult(res.data)
    } catch (err: any) {
      clearInterval(tick)
      setStep(-1)
      const msg = err.response?.data?.detail ?? err.response?.data?.hint ?? err.message ?? 'Unknown error'
      const hint = err.response?.data?.hint
      setError(hint ? `${msg}\n${hint}` : msg)
    }
  }

  const busy = step >= 0 && step < STEPS.length

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">AI Extraction Tester</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload a fund PDF → Qwen classifies the fund → extracts values → deterministic calc engine runs E, F, G
        </p>
      </div>

      {/* ── Model config ───────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Model Config</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Ollama / vLLM Base URL</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={modelUrl} onChange={e => setModelUrl(e.target.value)}
              placeholder="https://tw-gateway.twave.co.jp"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Model Name</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={modelName} onChange={e => setModelName(e.target.value)}
              placeholder="Qwen/Qwen3.6-35B-A3B-FP8"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkStatus}
            className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Check Model Status
          </button>
          {status && (
            <span className={`text-xs font-medium ${status.reachable ? 'text-green-600' : 'text-red-600'}`}>
              {status.reachable
                ? status.model_available
                  ? `✓ ${modelName} ready`
                  : `⚠ Server up but "${modelName}" not found — available: ${status.models_on_server.join(', ') || 'none'}`
                : '✗ Cannot reach server'}
            </span>
          )}
        </div>

        {/* Previous state for calc engine */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Previous fund state for calc engine (leave 0 for first transaction)</p>
          <div className="grid grid-cols-3 gap-3">
            {[['prev_e', 'Prev E (Cumulative Contributions)', prevE, setPrevE],
              ['prev_f', 'Prev F (Unfunded Commitment)',      prevF, setPrevF],
              ['prev_g', 'Prev G (Net Cash Flow)',            prevG, setPrevG],
            ].map(([, label, val, set]) => (
              <div key={label as string}>
                <label className="block text-xs text-slate-600 mb-1">{label as string}</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={val as string}
                  onChange={e => (set as Function)(e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upload zone ────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
      >
        <input ref={inputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setError(null) } }} />
        {file ? (
          <div>
            <p className="text-2xl mb-2">📄</p>
            <p className="font-medium text-green-700">{file.name}</p>
            <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
          </div>
        ) : (
          <div>
            <p className="text-3xl mb-3">📂</p>
            <p className="text-slate-600 font-medium">Drop a fund PDF here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Capital call or distribution notice from any of the 8 known funds</p>
          </div>
        )}
      </div>

      {/* ── Run button ─────────────────────────────────────────────────── */}
      <button
        onClick={run}
        disabled={!file || busy}
        className="w-full py-3 rounded-xl font-semibold text-white transition-colors
          disabled:bg-slate-300 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700"
      >
        {busy ? 'Processing...' : 'Run AI Extraction'}
      </button>

      {/* ── Progress steps ─────────────────────────────────────────────── */}
      {busy && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${i < step ? 'bg-green-500 text-white'
                    : i === step ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-slate-200 text-slate-400'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <p className={`text-xs mt-1 text-center ${i === step ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{s}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden" />
                )}
              </div>
            ))}
          </div>
          <div className="relative mt-3 h-1 bg-slate-200 rounded-full">
            <div
              className="absolute h-1 bg-blue-500 rounded-full transition-all duration-1000"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">
            {STEPS[step]} — this may take 30–90 seconds depending on model size
          </p>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="font-semibold text-red-700 text-sm">Error</p>
          <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">

          {/* Confidence gate banner */}
          <div className={`border rounded-xl px-4 py-3 font-medium text-sm ${gateColors[result.confidence_gate.color]}`}>
            {result.confidence_gate.color === 'green' ? '✓' : result.confidence_gate.color === 'red' ? '✗' : '⚠'}{' '}
            {result.confidence_gate.label}
          </div>

          {/* Stage 1 — Classification */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Stage 1 — Fund Classification</p>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-slate-800">{result.classification.fund_display_name || result.classification.fund_key}</p>
                <p className="text-sm text-slate-500 mt-0.5">{result.classification.fund_key} · {result.classification.currency}</p>
                <span className={`inline-block mt-2 text-xs font-medium px-2.5 py-1 rounded-full
                  ${REPORT_BADGES[result.classification.report_type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {result.classification.report_type?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold tabular-nums">
                  <span className={confColor(result.classification.confidence_score)}>
                    {result.classification.confidence_score}
                  </span>
                </p>
                <p className="text-xs text-slate-400">confidence</p>
              </div>
            </div>
          </div>

          {/* Stage 2 — Extraction */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Stage 2 — Extracted Values</p>
              <span className={`text-xs font-semibold ${confColor(result.extraction.extraction_confidence)}`}>
                extraction confidence: {result.extraction.extraction_confidence}
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[
                  ['Transaction Date',           result.extraction.transaction_date ?? '—', false],
                  ['B — Capital Contribution',   result.extraction.B_capital_contribution,  true],
                  ['C — Distribution Received',  result.extraction.C_distribution_received, true],
                  ['D — Reinvestable',           result.extraction.D_reinvestable,           true],
                  ['Return of Capital',          result.extraction.return_of_capital,        true],
                  ['Gain',                       result.extraction.gain,                     true],
                  ['Interest',                   result.extraction.interest,                 true],
                  ['Unfunded Before',            result.extraction.report_provided_unfunded_before, true],
                  ['Remaining After',            result.extraction.report_provided_remaining_after, true],
                  ['Subsequent Close Interest',  result.extraction.subsequent_close_interest,       true],
                ].map(([label, val, isMoney]) => (
                  val !== null && val !== undefined ? (
                    <tr key={label as string}>
                      <td className="py-2 text-slate-500">{label as string}</td>
                      <td className="py-2 text-right font-mono font-medium text-slate-800">
                        {isMoney ? fmt(val as number, result.classification.currency) : String(val)}
                      </td>
                    </tr>
                  ) : null
                ))}
                {result.extraction.notes && (
                  <tr>
                    <td className="py-2 text-slate-500">Notes</td>
                    <td className="py-2 text-right text-slate-600 text-xs">{result.extraction.notes}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Stage 3 — Calc Engine */}
          {result.calculation && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Stage 3 — Deterministic Calc Engine</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Cash Flow (−B + C)',      result.calculation.cash_flow, result.calculation.cash_flow >= 0 ? 'text-green-600' : 'text-red-600'],
                  ['L = C − D',              result.calculation.L,         'text-slate-800'],
                  ['E  Cumulative Contributions', result.calculation.E,    'text-blue-700'],
                  ['F  Unfunded Commitment',      result.calculation.F,    'text-indigo-700'],
                  ['G  Cumulative Net Cash Flow', result.calculation.G,    result.calculation.G >= 0 ? 'text-green-700' : 'text-red-600'],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="bg-slate-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-slate-500">{label as string}</p>
                    <p className={`text-lg font-bold tabular-nums mt-0.5 ${cls as string}`}>
                      {fmt(val as number, result.classification.currency)}
                    </p>
                  </div>
                ))}
                {result.calculation.commitment_inferred && (
                  <div className="bg-amber-50 rounded-lg px-4 py-3">
                    <p className="text-xs text-amber-600">Inferred Commitment</p>
                    <p className="text-lg font-bold tabular-nums mt-0.5 text-amber-700">
                      {fmt(result.calculation.commitment_inferred, result.classification.currency)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cross-checks */}
          {result.cross_checks && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Validation Cross-Checks</p>
              <div className="space-y-2">
                {result.cross_checks.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 text-sm p-2 rounded-lg
                    ${c.pass ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className={c.pass ? 'text-green-600' : 'text-red-600'}>{c.pass ? '✓' : '✗'}</span>
                    <div>
                      <p className={`font-medium ${c.pass ? 'text-green-800' : 'text-red-800'}`}>{c.rule}</p>
                      <p className="text-xs text-slate-500">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PDF text preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <button
              onClick={() => setShowPdf(p => !p)}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              {showPdf ? '▲ Hide' : '▼ Show'} extracted PDF text ({result.pdf_characters.toLocaleString()} chars)
            </button>
            {showPdf && (
              <pre className="mt-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                {result.pdf_preview}
                {result.pdf_characters > 500 ? '\n...[first 500 chars shown]' : ''}
              </pre>
            )}
          </div>

          <p className="text-xs text-slate-400 text-center">Model: {result.model_used}</p>
        </div>
      )}
    </div>
  )
}

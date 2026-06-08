import { useState, useEffect } from 'react';
import { rulesAPI, noticesAPI } from '../services/api';
import toast from 'react-hot-toast';

/* ── Tab type ───────────────────────────────────────────────────────────────── */
type PageTab = 'rules' | 'extractors';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Attribute {
  name:        string;
  label:       string;
  noticeTypes: string[];
  description: string;
}

interface Rule {
  id:                 string;
  name:               string;
  description?:       string;
  formula:            string;
  explanation?:       string;
  outputUnit?:        string;
  applicableTypes:    string[];
  displayOnDashboard: boolean;
  isActive:           boolean;
  sortOrder:          number;
  createdBy?:         string;
  createdAt:          string;
  latestResult?: {
    outputText:  string | null;
    outputValue: number | null;
    noticeId:    string;
    createdAt:   string;
  } | null;
}

interface Notice {
  id:          string;
  file_name:   string;
  notice_type: string;
  status:      string;
}

interface Extractor {
  id:             string;
  attributeName:  string;
  label:          string;
  keywords:       string[];
  extractionType: string;
  isActive:       boolean;
  createdAt:      string;
}

const UNIT_OPTIONS = ['', 'USD', 'JPY', '%', '×', 'x'];
const TYPE_OPTIONS = [
  { value: 'capital_call',       label: 'Capital Call' },
  { value: 'distribution',       label: 'Distribution' },
  { value: 'financial_statement',label: 'Financial Statement' },
];

const blankForm = () => ({
  name:               '',
  description:        '',
  formula:            '',
  explanation:        '',
  outputUnit:         '',
  applicableTypes:    [] as string[],
  displayOnDashboard: true,
  isActive:           true,
  sortOrder:          0,
});

/* ── Preview result chip ─────────────────────────────────────────────────────── */
function PreviewChip({ value, error }: { value?: string | null; error?: string | null }) {
  if (!value && !error) return null;
  return (
    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-mono ${
      error ? 'bg-red-500/15 text-red-400 border border-red-500/30'
            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
    }`}>
      {error ?? value}
    </span>
  );
}

const EXTRACTION_TYPES = [
  { value: 'usd',    label: 'USD Amount ($1,234.56)' },
  { value: 'pct',    label: 'Percentage (12.5%)' },
  { value: 'number', label: 'Plain Number' },
  { value: 'date',   label: 'Date (YYYY-MM-DD)' },
  { value: 'text',   label: 'Text / Label' },
];

const blankExtractor = () => ({
  attributeName:  '',
  label:          '',
  keywords:       [''],
  extractionType: 'usd',
  isActive:       true,
});

/* ══════════════════════════════ MAIN PAGE ══════════════════════════════════ */

export default function RulesEngine() {
  const raw    = localStorage.getItem('user') || '{}';
  const user   = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const canEdit = ['admin', 'finance_manager', 'finance_staff'].includes(user.role);

  const [rules,      setRules]      = useState<Rule[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [notices,    setNotices]    = useState<Notice[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [showModal,  setShowModal]  = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState(blankForm());
  const [saving,     setSaving]     = useState(false);

  const [preview,    setPreview]    = useState<{ value: string | null; error: string | null } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [runningOn,  setRunningOn]  = useState<string>('');
  const [running,    setRunning]    = useState(false);

  const [showAttrPanel,  setShowAttrPanel]  = useState(false);
  const [pageTab,       setPageTab]       = useState<PageTab>('rules');

  // Extractors state
  const [extractors,    setExtractors]    = useState<Extractor[]>([]);
  const [showExtModal,  setShowExtModal]  = useState(false);
  const [editExtId,     setEditExtId]     = useState<string | null>(null);
  const [extForm,       setExtForm]       = useState(blankExtractor());
  const [savingExt,     setSavingExt]     = useState(false);
  const [testResult,    setTestResult]    = useState<{ value: any; found: boolean } | null>(null);
  const [testingExt,    setTestingExt]    = useState(false);
  const [testNoticeId,  setTestNoticeId]  = useState('');

  /* load */
  useEffect(() => {
    Promise.all([
      rulesAPI.list(),
      rulesAPI.attributes(),
      noticesAPI.list({ status: 'approved' }),
      rulesAPI.listExtractors(),
    ])
      .then(([r, a, n, e]) => {
        setRules(r.data);
        setAttributes(a.data);
        setNotices(n.data);
        setExtractors(e.data);
      })
      .catch(() => toast.error('Failed to load rules'))
      .finally(() => setLoading(false));
  }, []);

  /* ── Modal helpers ─────────────────────────────────────────────────────── */
  function openNew() {
    setForm(blankForm());
    setEditId(null);
    setPreview(null);
    setShowModal(true);
  }

  function openEdit(rule: Rule) {
    setForm({
      name:               rule.name,
      description:        rule.description  ?? '',
      formula:            rule.formula,
      explanation:        rule.explanation  ?? '',
      outputUnit:         rule.outputUnit   ?? '',
      applicableTypes:    rule.applicableTypes,
      displayOnDashboard: rule.displayOnDashboard,
      isActive:           rule.isActive,
      sortOrder:          rule.sortOrder,
    });
    setEditId(rule.id);
    setPreview(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    setPreview(null);
  }

  function setField(key: string, value: any) {
    setForm(f => ({ ...f, [key]: value }));
    if (key === 'formula') setPreview(null);
  }

  function toggleType(val: string) {
    setForm(f => ({
      ...f,
      applicableTypes: f.applicableTypes.includes(val)
        ? f.applicableTypes.filter(t => t !== val)
        : [...f.applicableTypes, val],
    }));
  }

  function insertAttr(attrName: string) {
    setForm(f => ({ ...f, formula: (f.formula + ' ' + attrName).trim() }));
    setPreview(null);
  }

  /* ── Preview formula ─────────────────────────────────────────────────────── */
  async function previewFormula() {
    if (!form.formula.trim()) return;
    setPreviewing(true);
    try {
      const res = await rulesAPI.preview({ formula: form.formula, outputUnit: form.outputUnit });
      setPreview({ value: res.data.outputText ?? null, error: res.data.error ?? null });
    } catch {
      setPreview({ value: null, error: 'Preview failed' });
    } finally {
      setPreviewing(false);
    }
  }

  /* ── Save rule ─────────────────────────────────────────────────────────── */
  async function save() {
    if (!form.name.trim() || !form.formula.trim()) {
      toast.error('Name and formula are required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const res = await rulesAPI.update(editId, form);
        setRules(rs => rs.map(r => r.id === editId ? { ...r, ...res.data } : r));
        toast.success('Rule updated');
      } else {
        const res = await rulesAPI.create(form);
        setRules(rs => [...rs, res.data]);
        toast.success('Rule created');
      }
      closeModal();
    } catch (e: any) {
      toast.error(e.response?.data?.detail ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  /* ── Delete rule ─────────────────────────────────────────────────────────── */
  async function deleteRule(id: string, name: string) {
    if (!confirm(`Delete rule "${name}"? This also deletes all its calculation results.`)) return;
    try {
      await rulesAPI.delete(id);
      setRules(rs => rs.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Delete failed');
    }
  }

  /* ── Run rules on a notice ─────────────────────────────────────────────── */
  async function runRules() {
    if (!runningOn) { toast.error('Select an approved notice first'); return; }
    setRunning(true);
    try {
      const res = await rulesAPI.run(runningOn);
      toast.success(`Ran ${res.data.results?.length ?? 0} rule(s) — results saved`);
      const fresh = await rulesAPI.list();
      setRules(fresh.data);
    } catch (e: any) {
      toast.error(e.response?.data?.detail ?? 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  /* ── Excel export ─────────────────────────────────────────────────────── */
  async function exportExcel(noticeId: string, fileName: string) {
    try {
      const res = await rulesAPI.exportExcel(noticeId);
      const url  = URL.createObjectURL(new Blob([res.data]));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${fileName}_calculations.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  }

  /* ── Extractor helpers ─────────────────────────────────────────────────── */
  function openNewExt() {
    setExtForm(blankExtractor());
    setEditExtId(null);
    setTestResult(null);
    setShowExtModal(true);
  }

  function openEditExt(ext: Extractor) {
    setExtForm({
      attributeName:  ext.attributeName,
      label:          ext.label,
      keywords:       ext.keywords.length ? ext.keywords : [''],
      extractionType: ext.extractionType,
      isActive:       ext.isActive,
    });
    setEditExtId(ext.id);
    setTestResult(null);
    setShowExtModal(true);
  }

  function setExtField(key: string, value: any) {
    setExtForm(f => ({ ...f, [key]: value }));
  }

  function updateKeyword(i: number, val: string) {
    setExtForm(f => {
      const kws = [...f.keywords];
      kws[i] = val;
      return { ...f, keywords: kws };
    });
  }

  function addKeyword() {
    setExtForm(f => ({ ...f, keywords: [...f.keywords, ''] }));
  }

  function removeKeyword(i: number) {
    setExtForm(f => ({ ...f, keywords: f.keywords.filter((_, j) => j !== i) }));
  }

  async function saveExtractor() {
    const kws = extForm.keywords.map(k => k.trim()).filter(Boolean);
    if (!extForm.attributeName.trim()) { toast.error('Variable name is required'); return; }
    if (!extForm.label.trim())         { toast.error('Label is required'); return; }
    if (kws.length === 0)              { toast.error('At least one keyword is required'); return; }

    setSavingExt(true);
    try {
      const payload = { ...extForm, keywords: kws };
      if (editExtId) {
        const res = await rulesAPI.updateExtractor(editExtId, payload);
        setExtractors(es => es.map(e => e.id === editExtId ? { ...e, ...res.data } : e));
        toast.success('Extractor updated');
      } else {
        const res = await rulesAPI.createExtractor(payload);
        setExtractors(es => [...es, res.data]);
        toast.success('Extractor created');
      }
      setShowExtModal(false);
    } catch (e: any) {
      toast.error(e.response?.data?.detail ?? 'Save failed');
    } finally {
      setSavingExt(false);
    }
  }

  async function deleteExtractor(id: string, name: string) {
    if (!confirm(`Delete extractor "${name}"?`)) return;
    try {
      await rulesAPI.deleteExtractor(id);
      setExtractors(es => es.filter(e => e.id !== id));
      toast.success('Extractor deleted');
    } catch {
      toast.error('Delete failed');
    }
  }

  async function testExtractor() {
    const kws = extForm.keywords.map(k => k.trim()).filter(Boolean);
    if (!testNoticeId || kws.length === 0) {
      toast.error('Select a notice and enter at least one keyword');
      return;
    }
    setTestingExt(true);
    try {
      const res = await rulesAPI.testExtractor({
        noticeId:       testNoticeId,
        keywords:       kws,
        extractionType: extForm.extractionType,
      });
      setTestResult(res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.detail ?? 'Test failed');
    } finally {
      setTestingExt(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeDashboard = rules.filter(r => r.isActive && r.displayOnDashboard);

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold theme-text">Rules Engine</h1>
          <p className="theme-text-muted text-sm mt-0.5">
            Define formulas using PDF-extracted attributes. Results appear on the Dashboard and in Excel exports.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowAttrPanel(v => !v)}
            className="px-3 py-2 text-xs font-medium theme-card border rounded-xl hover:bg-white/5 transition-colors theme-text-muted">
            {showAttrPanel ? 'Hide' : 'Show'} Variables
          </button>
          {canEdit && (
            <button onClick={openNew}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors">
              + New Rule
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl border theme-border" style={{ background: 'rgba(0,0,0,0.15)' }}>
        {([
          { id: 'rules' as PageTab,      label: 'Calculation Rules',      icon: '⚙️' },
          { id: 'extractors' as PageTab, label: 'Keyword Extractors',     icon: '🔍' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setPageTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              pageTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'theme-text-sub hover:theme-text'
            }`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Rules',      value: rules.length,          color: 'text-indigo-400'  },
          { label: 'Active',           value: rules.filter(r => r.isActive).length, color: 'text-emerald-400' },
          { label: 'On Dashboard',     value: activeDashboard.length, color: 'text-blue-400'   },
          { label: 'Approved Notices', value: notices.length,         color: 'text-amber-400'  },
        ].map(s => (
          <div key={s.label} className="theme-card border rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide theme-text-muted">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ══════════════ EXTRACTORS TAB ═══════════════════════════════════════ */}
      {pageTab === 'extractors' && (
        <div className="space-y-5">
          <div className="theme-card border rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold theme-text text-sm">How Keyword Extraction Works</h3>
            <p className="text-xs theme-text-muted leading-relaxed">
              Define a variable name and one or more keyword anchors (exact text labels from the PDF).
              When a PDF is uploaded, the parser finds each keyword and extracts the value immediately after it
              (a dollar amount, percentage, date, or number). The extracted value is stored under your variable name
              and becomes available in Calculation Rule formulas automatically.
            </p>
            <div className="mt-2 p-3 rounded-xl text-xs font-mono"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p className="text-indigo-400 mb-1">Example:</p>
              <p className="theme-text-muted">Variable name: <span className="text-amber-400">totalDistributableAmt</span></p>
              <p className="theme-text-muted">Keywords: <span className="text-emerald-400">"Total Distributable Amount"</span>, <span className="text-emerald-400">"Total Secondary Investments"</span></p>
              <p className="theme-text-muted">Type: USD Amount</p>
              <p className="theme-text-muted mt-1">→ Formula: <span className="text-amber-400">totalDistributableAmt * fxRate</span></p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold theme-text">{extractors.length} extractor(s) defined</p>
            {canEdit && (
              <button onClick={openNewExt}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors">
                + New Extractor
              </button>
            )}
          </div>

          <div className="theme-card border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b theme-divider">
                  {['Variable Name', 'Label', 'Keywords', 'Type', 'Active', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide theme-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {extractors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center theme-text-muted text-sm">
                      No extractors yet. Create one to start defining custom PDF attributes.
                    </td>
                  </tr>
                )}
                {extractors.map(ext => (
                  <tr key={ext.id} className="border-b theme-divider last:border-0 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-sm font-bold text-amber-400">{ext.attributeName}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm theme-text">{ext.label}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex flex-wrap gap-1">
                        {ext.keywords.map((kw, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            "{kw}"
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs theme-text-muted capitalize">{ext.extractionType}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ext.isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'
                      }`}>
                        {ext.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex gap-1.5">
                          <button onClick={() => openEditExt(ext)}
                            className="text-xs px-2.5 py-1 theme-card border rounded-lg hover:bg-white/5 transition-colors theme-text-muted hover:theme-text">
                            Edit
                          </button>
                          <button onClick={() => deleteExtractor(ext.id, ext.attributeName)}
                            className="text-xs px-2.5 py-1 border border-red-500/20 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors">
                            Del
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ RULES TAB ════════════════════════════════════════════ */}
      {pageTab === 'rules' && (<>

      {/* ── Available Variables panel ──────────────────────────────────────── */}
      {showAttrPanel && (
        <div className="theme-card border rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold theme-text text-sm">Available Formula Variables</h3>
          <p className="text-xs theme-text-muted">Click a variable name to copy it to clipboard.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {attributes.map(a => (
              <button key={a.name}
                onClick={() => { navigator.clipboard.writeText(a.name); toast.success(`Copied: ${a.name}`); }}
                className="text-left p-2.5 rounded-xl border theme-border hover:border-indigo-500/40 hover:bg-indigo-600/5 transition-all group">
                <code className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300">{a.name}</code>
                <p className="text-[10px] theme-text-muted mt-0.5">{a.label}</p>
                <p className="text-[10px] theme-text-muted opacity-60 mt-0.5 hidden group-hover:block">{a.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Run rules on a notice ──────────────────────────────────────────── */}
      <div className="theme-card border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
            Run All Rules on Notice
          </label>
          <select
            value={runningOn}
            onChange={e => setRunningOn(e.target.value)}
            className="w-full theme-input rounded-xl px-3 py-2 text-sm">
            <option value="">Select an approved notice…</option>
            {notices.map(n => (
              <option key={n.id} value={n.id}>
                {n.file_name} ({n.notice_type.replace('_', ' ')})
              </option>
            ))}
          </select>
        </div>
        <button onClick={runRules} disabled={running || !runningOn}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors">
          {running ? 'Running…' : 'Run Rules'}
        </button>
        {runningOn && (
          <button onClick={() => exportExcel(runningOn, notices.find(n => n.id === runningOn)?.file_name ?? 'notice')}
            className="px-4 py-2 theme-card border rounded-xl text-sm font-medium hover:bg-white/5 transition-colors theme-text">
            Export Excel
          </button>
        )}
      </div>

      {/* ── Rules table ─────────────────────────────────────────────────────── */}
      <div className="theme-card border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b theme-divider">
              {['Rule Name', 'Formula', 'Unit', 'Types', 'Dashboard', 'Status', 'Latest Result', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wide theme-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center theme-text-muted text-sm">
                  No rules yet. Create your first rule to start extracting calculations from PDF notices.
                </td>
              </tr>
            )}
            {rules.map(rule => (
              <tr key={rule.id} className="border-b theme-divider last:border-0 hover:bg-white/2 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-semibold theme-text text-sm">{rule.name}</p>
                  {rule.description && <p className="text-xs theme-text-muted mt-0.5">{rule.description}</p>}
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <code className="text-xs text-amber-400 break-all">{rule.formula}</code>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs theme-text-muted">{rule.outputUnit || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  {rule.applicableTypes.length === 0
                    ? <span className="text-xs theme-text-muted">All</span>
                    : rule.applicableTypes.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/15 text-indigo-400 mr-1">
                        {t.replace('_', ' ')}
                      </span>
                    ))
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={rule.displayOnDashboard ? 'text-emerald-400' : 'text-slate-500'}>
                    {rule.displayOnDashboard ? '✓' : '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rule.isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {rule.latestResult ? (
                    <span className="text-xs font-mono text-indigo-300">
                      {rule.latestResult.outputText ?? '—'}
                    </span>
                  ) : (
                    <span className="text-xs theme-text-muted">No results yet</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(rule)}
                        className="text-xs px-2.5 py-1 theme-card border rounded-lg hover:bg-white/5 transition-colors theme-text-muted hover:theme-text">
                        Edit
                      </button>
                      <button onClick={() => deleteRule(rule.id, rule.name)}
                        className="text-xs px-2.5 py-1 border border-red-500/20 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors">
                        Del
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>)}

      {/* ── Create / Edit Extractor modal ─────────────────────────────────────── */}
      {showExtModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="w-full max-w-xl theme-card border rounded-2xl shadow-2xl">
            <div className="p-5 border-b theme-divider flex items-center justify-between">
              <h2 className="font-bold theme-text">{editExtId ? 'Edit Extractor' : 'New Keyword Extractor'}</h2>
              <button onClick={() => setShowExtModal(false)} className="theme-text-muted hover:theme-text text-xl px-1">×</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Variable name */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Variable Name <span className="text-red-400">*</span>
                  <span className="text-slate-500 font-normal ml-1">(used in formulas)</span>
                </label>
                <input value={extForm.attributeName} onChange={e => setExtField('attributeName', e.target.value)}
                  placeholder="e.g. totalDistributableAmt"
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm font-mono" />
                <p className="text-[10px] theme-text-muted mt-1">Letters, digits, underscore only. No spaces.</p>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Label <span className="text-red-400">*</span>
                </label>
                <input value={extForm.label} onChange={e => setExtField('label', e.target.value)}
                  placeholder="e.g. Total Distributable Amount"
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm" />
              </div>

              {/* Keywords */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold theme-text-muted uppercase tracking-wide">
                    PDF Keyword Anchors <span className="text-red-400">*</span>
                  </label>
                  <button onClick={addKeyword}
                    className="text-xs text-indigo-400 hover:text-indigo-300">+ Add keyword</button>
                </div>
                <div className="space-y-2">
                  {extForm.keywords.map((kw, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={kw} onChange={e => updateKeyword(i, e.target.value)}
                        placeholder={`e.g. "Total Distributable Amount"`}
                        className="flex-1 theme-input rounded-xl px-3 py-2 text-sm" />
                      {extForm.keywords.length > 1 && (
                        <button onClick={() => removeKeyword(i)}
                          className="text-red-400/60 hover:text-red-400 px-1">×</button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] theme-text-muted mt-1.5">
                  Enter the exact text label as it appears in the PDF. The parser searches for this text and extracts the value that follows it.
                </p>
              </div>

              {/* Extraction type */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Value Type
                </label>
                <select value={extForm.extractionType} onChange={e => setExtField('extractionType', e.target.value)}
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm">
                  {EXTRACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Test on a notice */}
              <div className="p-3 rounded-xl border theme-border space-y-2">
                <p className="text-xs font-semibold theme-text">Test on a Notice</p>
                <div className="flex gap-2">
                  <select value={testNoticeId} onChange={e => { setTestNoticeId(e.target.value); setTestResult(null); }}
                    className="flex-1 theme-input rounded-xl px-3 py-2 text-xs">
                    <option value="">Select an approved notice…</option>
                    {notices.map(n => (
                      <option key={n.id} value={n.id}>{n.file_name}</option>
                    ))}
                  </select>
                  <button onClick={testExtractor} disabled={testingExt || !testNoticeId}
                    className="px-3 py-2 text-xs bg-amber-600/15 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-600/25 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {testingExt ? '…' : 'Test'}
                  </button>
                </div>
                {testResult !== null && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    testResult.found ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {testResult.found
                      ? <>Found: <strong className="font-mono">{String(testResult.value)}</strong></>
                      : 'No match found — try different keyword text'}
                  </div>
                )}
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setExtField('isActive', !extForm.isActive)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${extForm.isActive ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${extForm.isActive ? 'left-5' : 'left-0.5'}`} />
                </div>
                <span className="text-sm theme-text">Active (runs on every PDF upload)</span>
              </label>
            </div>

            <div className="p-5 border-t theme-divider flex gap-3 justify-end">
              <button onClick={() => setShowExtModal(false)}
                className="px-4 py-2 theme-card border rounded-xl text-sm theme-text-muted hover:theme-text transition-colors">
                Cancel
              </button>
              <button onClick={saveExtractor} disabled={savingExt}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {savingExt ? 'Saving…' : editExtId ? 'Save Changes' : 'Create Extractor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Rule modal ──────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="w-full max-w-2xl theme-card border rounded-2xl shadow-2xl">

            <div className="p-5 border-b theme-divider flex items-center justify-between">
              <h2 className="font-bold theme-text">{editId ? 'Edit Rule' : 'New Calculation Rule'}</h2>
              <button onClick={closeModal} className="theme-text-muted hover:theme-text text-xl px-1">×</button>
            </div>

            <div className="p-5 space-y-4">

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Rule Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Net Capital Call in JPY"
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Description (optional)
                </label>
                <input
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Short description of what this rule calculates"
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              {/* Formula */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold theme-text-muted uppercase tracking-wide">
                    Formula <span className="text-red-400">*</span>
                  </label>
                  <button onClick={() => setShowAttrPanel(v => !v)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
                    {showAttrPanel ? 'Hide' : 'Show'} variables
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={form.formula}
                    onChange={e => setField('formula', e.target.value)}
                    placeholder="e.g.  netCallUsd * fxRate"
                    className="flex-1 theme-input rounded-xl px-3 py-2.5 text-sm font-mono"
                  />
                  <button onClick={previewFormula} disabled={previewing || !form.formula.trim()}
                    className="px-3 py-2 text-xs bg-amber-600/15 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-600/25 disabled:opacity-50 transition-colors whitespace-nowrap">
                    {previewing ? '…' : 'Test'}
                  </button>
                </div>
                {preview && (
                  <p className="mt-1.5 text-xs">
                    Preview (with zero inputs): <PreviewChip value={preview.value} error={preview.error} />
                  </p>
                )}
                <p className="text-[10px] theme-text-muted mt-1.5">
                  Use variable names like <code className="text-indigo-400">grossCallUsd</code>,{' '}
                  <code className="text-indigo-400">fxRate</code>. Operators: + − * / ^ ( ) %
                </p>

                {/* Quick-insert attributes */}
                {showAttrPanel && (
                  <div className="mt-3 p-3 rounded-xl border theme-border max-h-40 overflow-y-auto">
                    <p className="text-[10px] theme-text-muted mb-2">Click to insert into formula:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {attributes.map(a => (
                        <button key={a.name} onClick={() => insertAttr(a.name)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600/20 transition-colors font-mono">
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                  Explanation (shown in Excel &amp; Dashboard)
                </label>
                <textarea
                  value={form.explanation}
                  onChange={e => setField('explanation', e.target.value)}
                  rows={2}
                  placeholder="e.g. Converts the net USD capital call to JPY at the notice FX rate"
                  className="w-full theme-input rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>

              {/* Output unit + sort order */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                    Output Unit
                  </label>
                  <select value={form.outputUnit} onChange={e => setField('outputUnit', e.target.value)}
                    className="w-full theme-input rounded-xl px-3 py-2.5 text-sm">
                    <option value="">None / raw number</option>
                    {UNIT_OPTIONS.filter(u => u).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-1.5">
                    Display Order
                  </label>
                  <input type="number" value={form.sortOrder} onChange={e => setField('sortOrder', parseInt(e.target.value) || 0)}
                    className="w-full theme-input rounded-xl px-3 py-2.5 text-sm"
                    min={0} step={1} />
                </div>
              </div>

              {/* Applicable notice types */}
              <div>
                <label className="block text-xs font-semibold theme-text-muted uppercase tracking-wide mb-2">
                  Applicable Notice Types <span className="text-slate-500 font-normal">(leave empty = all types)</span>
                </label>
                <div className="flex gap-3 flex-wrap">
                  {TYPE_OPTIONS.map(t => (
                    <label key={t.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={form.applicableTypes.includes(t.value)}
                        onChange={() => toggleType(t.value)}
                        className="rounded" />
                      <span className="text-sm theme-text">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setField('displayOnDashboard', !form.displayOnDashboard)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${form.displayOnDashboard ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.displayOnDashboard ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm theme-text">Show on Dashboard</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setField('isActive', !form.isActive)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${form.isActive ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isActive ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm theme-text">Active</span>
                </label>
              </div>
            </div>

            <div className="p-5 border-t theme-divider flex gap-3 justify-end">
              <button onClick={closeModal}
                className="px-4 py-2 theme-card border rounded-xl text-sm theme-text-muted hover:theme-text transition-colors">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

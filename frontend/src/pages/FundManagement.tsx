import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fundsAPI } from '../services/api';
import type { FundSummary } from '../types/index';
import { fmt, strategyBg, strategyColor } from '../lib/format';
import AddFundWizard from '../components/AddFundWizard';
import toast from 'react-hot-toast';

const STRATEGIES = [
  'Buyout', 'Growth', 'Venture', 'Secondaries',
  'Private Credit', 'Real Estate', 'Infrastructure',
  'Hedge Fund', 'Other',
];

/* ── Role helper ── */
function useCanEdit() {
  const raw  = localStorage.getItem('user') || '{}';
  const user = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  return ['admin', 'finance_manager', 'finance_staff'].includes(user.role ?? '');
}

/* ── Add/Edit Fund Modal ── */
function FundModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Partial<FundSummary> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!initial?.id;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fund_name:          initial?.fund_name ?? '',
    fund_name_jp:       initial?.fund_name_jp ?? '',
    manager:            initial?.manager ?? '',
    strategy:           initial?.strategy ?? '',
    vintage_year:       initial?.vintage_year ? String(initial.vintage_year) : String(new Date().getFullYear()),
    currency:           initial?.currency ?? 'USD',
    commitment_usd:     initial?.commitment_usd ? String(initial.commitment_usd) : '',
    entry_fx_rate:      '',
    management_fee_pct: '',
    carry_pct:          '',
    hurdle_rate_pct:    '',
    notes:              '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!form.fund_name || !form.strategy) {
      toast.error('Fund name and strategy are required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        vintage_year:       form.vintage_year       ? parseInt(form.vintage_year)       : null,
        commitment_usd:     form.commitment_usd     ? parseFloat(form.commitment_usd)   : 0,
        entry_fx_rate:      form.entry_fx_rate      ? parseFloat(form.entry_fx_rate)    : null,
        management_fee_pct: form.management_fee_pct ? parseFloat(form.management_fee_pct) : 0,
        carry_pct:          form.carry_pct          ? parseFloat(form.carry_pct)        : 0,
        hurdle_rate_pct:    form.hurdle_rate_pct    ? parseFloat(form.hurdle_rate_pct)  : 0,
      };
      if (isEdit) {
        await fundsAPI.update(initial!.id!, payload);
        toast.success(t('funds.updated'));
      } else {
        await fundsAPI.create(payload);
        toast.success(t('funds.created'));
      }
      onSaved();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr.response?.data?.detail || 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = `w-full theme-input rounded-lg px-3 py-2 text-sm`;
  const labelCls = `block text-xs font-medium theme-text-sub mb-1`;

  const field = (label: string, key: string, type = 'text', placeholder = '') => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={(form as Record<string, string>)[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`theme-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border theme-border`}>
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border">
          <h2 className="font-semibold theme-text">{isEdit ? t('funds.editFund') : t('funds.newFund')}</h2>
          <button onClick={onClose} className="theme-text-sub hover:theme-text text-xl leading-none">×</button>
        </div>

        <form id="fund-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field(t('funds.fundName'),    'fund_name',   'text',   'e.g., GS Vintage X Fund')}
            {field(t('funds.fundNameJp'),  'fund_name_jp','text',   '日本語名')}
            {field(t('funds.manager'),     'manager',     'text',   'e.g., Goldman Sachs')}
            <div>
              <label className={labelCls}>{t('funds.strategy')}</label>
              <select
                value={form.strategy}
                onChange={e => set('strategy', e.target.value)}
                required
                className={inputCls}
              >
                <option value="">Select strategy…</option>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {field(t('funds.vintageYear'), 'vintage_year',    'number', '2023')}
            <div>
              <label className={labelCls}>{t('funds.currency')}</label>
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className={inputCls}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
            {field(t('funds.commitment'), 'commitment_usd',     'number', '0')}
            {field(t('funds.entryFx'),    'entry_fx_rate',      'number', '145.00')}
            {field(t('funds.mgmtFee'),    'management_fee_pct', 'number', '1.5')}
            {field(t('funds.carry'),      'carry_pct',          'number', '20')}
            {field(t('funds.hurdle'),     'hurdle_rate_pct',    'number', '8')}
          </div>
          <div>
            <label className={labelCls}>{t('funds.notes')}</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t theme-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm theme-text-sub hover:bg-white/5 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="fund-form"
            disabled={loading}
            className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-60 transition-colors"
          >
            {loading ? t('funds.saving') : isEdit ? t('funds.updateFund') : t('funds.createFund')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function FundManagement() {
  const { t }   = useTranslation();
  const canEdit = useCanEdit();

  const [funds, setFunds]       = useState<FundSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<FundSummary | null>(null);
  const [search, setSearch]     = useState('');

  useEffect(() => { fetchFunds(); }, []);

  async function fetchFunds() {
    setLoading(true);
    try {
      const r = await fundsAPI.list();
      setFunds(r.data);
    } catch {
      toast.error('Failed to load funds');
    } finally {
      setLoading(false);
    }
  }

  async function deactivate(id: string, name: string) {
    if (!confirm(t('funds.deactivateConfirm', { name }))) return;
    try {
      await fundsAPI.deactivate(id);
      toast.success(t('funds.deactivated'));
      fetchFunds();
    } catch {
      toast.error('Failed to deactivate fund');
    }
  }

  const filtered = funds.filter(f =>
    f.fund_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.manager ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (f.strategy ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold theme-text">{t('funds.title')}</h1>
          <p className="theme-text-sub text-sm mt-0.5">
            {funds.length} {funds.length !== 1 ? t('nav.funds') : t('nav.funds')}
          </p>
        </div>
        {canEdit ? (
          <button
            onClick={() => { setSelected(null); setModal('add'); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + {t('funds.addFund')}
          </button>
        ) : (
          <span className="text-xs theme-text-sub flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg">
            👁 {t('nav.viewOnly')}
          </span>
        )}
      </div>

      {/* View-only banner */}
      {!canEdit && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <span className="text-lg">🔒</span>
          <span>{t('funds.viewOnly')}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-sub text-sm">🔍</span>
        <input
          type="text"
          placeholder={t('funds.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 theme-input rounded-lg text-sm"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 theme-text-sub">
          <p className="text-4xl mb-3">🏦</p>
          <p className="font-medium">{t('funds.noFunds')}</p>
          <p className="text-sm mt-1">{t('funds.noFundsSub')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(fund => {
            const barW     = Math.min(fund.drawn_pct, 100);
            const dotColor = strategyColor[fund.strategy ?? ''] ?? '#6b7280';
            const badge    = strategyBg[fund.strategy ?? ''] ?? 'bg-gray-100 text-gray-700';
            return (
              <div
                key={fund.fund_id}
                className="theme-card rounded-xl p-5 hover:shadow-lg transition-shadow flex flex-col gap-3 border theme-border"
              >
                {/* Top */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: dotColor }} />
                    <div className="min-w-0">
                      <Link
                        to={`/funds/${fund.fund_id}`}
                        className="font-semibold theme-text text-sm hover:text-indigo-400 truncate block transition-colors"
                      >
                        {fund.fund_name}
                      </Link>
                      {fund.fund_name_jp && (
                        <p className="theme-text-sub text-xs truncate">{fund.fund_name_jp}</p>
                      )}
                    </div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${badge}`}>
                    {fund.strategy ?? 'Other'}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <p className="theme-text-sub">{t('dashboard.commitment')}</p>
                    <p className="font-semibold theme-text">{fmt.usd(fund.commitment_usd, true)}</p>
                  </div>
                  <div>
                    <p className="theme-text-sub">{t('funds.totalCalled')}</p>
                    <p className="font-semibold theme-text">{fmt.usd(fund.total_called_usd, true)}</p>
                  </div>
                  <div>
                    <p className="theme-text-sub">{t('funds.invCapacity')}</p>
                    <p className="font-semibold theme-text">{fmt.usd(fund.investment_capacity, true)}</p>
                  </div>
                  <div>
                    <p className="theme-text-sub">{t('dashboard.dpi')}</p>
                    <p className="font-semibold theme-text">{(fund.dpi ?? 0).toFixed(2)}x</p>
                  </div>
                </div>

                {/* Draw bar */}
                <div>
                  <div className="flex justify-between text-xs theme-text-sub mb-1">
                    <span>{t('funds.drawn')}</span>
                    <span>{fmt.pct(fund.drawn_pct)}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill-indigo" style={{ width: `${barW}%` }} />
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex gap-2 pt-1 border-t theme-border">
                  <Link
                    to={`/funds/${fund.fund_id}`}
                    className="flex-1 text-center text-xs text-indigo-400 hover:bg-indigo-500/10 py-1.5 rounded-lg transition-colors"
                  >
                    {t('funds.viewLedger')}
                  </Link>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => { setSelected(fund); setModal('edit'); }}
                        className="flex-1 text-xs theme-text-sub hover:bg-white/5 py-1.5 rounded-lg transition-colors"
                      >
                        {t('funds.edit')}
                      </button>
                      <button
                        onClick={() => deactivate(fund.fund_id, fund.fund_name)}
                        className="flex-1 text-xs text-red-400 hover:bg-red-500/10 py-1.5 rounded-lg transition-colors"
                      >
                        {t('funds.deactivate')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add — full wizard */}
      {modal === 'add' && canEdit && (
        <AddFundWizard
          onClose={() => { setModal(null); fetchFunds(); }}
        />
      )}

      {/* Edit — compact modal */}
      {modal === 'edit' && selected && canEdit && (
        <FundModal
          initial={{ ...selected, id: selected.fund_id }}
          onClose={() => { setModal(null); setSelected(null); }}
          onSaved={() => { setModal(null); setSelected(null); fetchFunds(); }}
        />
      )}
    </div>
  );
}

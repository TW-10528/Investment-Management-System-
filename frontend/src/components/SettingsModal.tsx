import { useTranslation } from 'react-i18next';
import { usePreferences, type Theme, type Currency, type DateFmt, type LangCode } from '../contexts/PreferencesContext';
import { LANGUAGES } from '../i18n';
import toast from 'react-hot-toast';

interface Props { onClose: () => void }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 pt-0.5 flex-shrink-0 w-36">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
        ${active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
        }`}
    >
      {children}
    </button>
  );
}

export default function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation();
  const prefs = usePreferences();

  function handleSave() {
    toast.success(t('settings.saved'));
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-0">

          {/* ── Theme ── */}
          <Row label={t('settings.theme')}>
            <Chip active={prefs.theme === 'light'} onClick={() => prefs.setTheme('light' as Theme)}>
              ☀️ {t('settings.light')}
            </Chip>
            <Chip active={prefs.theme === 'dark'} onClick={() => prefs.setTheme('dark' as Theme)}>
              🌙 {t('settings.dark')}
            </Chip>
          </Row>

          {/* ── Language ── */}
          <Row label={t('settings.language')}>
            {LANGUAGES.map(lang => (
              <Chip
                key={lang.code}
                active={prefs.language === lang.code}
                onClick={() => prefs.setLanguage(lang.code as LangCode)}
              >
                {lang.flag} {lang.label}
              </Chip>
            ))}
          </Row>

          {/* ── Currency ── */}
          <Row label={t('settings.currency')}>
            <Chip active={prefs.currency === 'USD'} onClick={() => prefs.setCurrency('USD' as Currency)}>
              $ {t('settings.usd')}
            </Chip>
            <Chip active={prefs.currency === 'JPY'} onClick={() => prefs.setCurrency('JPY' as Currency)}>
              ¥ {t('settings.jpy')}
            </Chip>
          </Row>

          {/* ── Compact numbers ── */}
          <Row label={t('settings.compactNumbers')}>
            <Chip active={prefs.compactNumbers} onClick={() => prefs.setCompactNumbers(true)}>
              {t('settings.compactOn')}
            </Chip>
            <Chip active={!prefs.compactNumbers} onClick={() => prefs.setCompactNumbers(false)}>
              {t('settings.compactOff')}
            </Chip>
          </Row>

          {/* ── Date format ── */}
          <Row label={t('settings.dateFormat')}>
            {(['US', 'ISO', 'JP'] as DateFmt[]).map(f => (
              <Chip key={f} active={prefs.dateFormat === f} onClick={() => prefs.setDateFormat(f)}>
                {t(`settings.dateFormat${f}`)}
              </Chip>
            ))}
          </Row>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => { prefs.resetAll(); toast('Reset to defaults'); }}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline underline-offset-2"
          >
            {t('settings.reset')}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

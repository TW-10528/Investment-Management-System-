/**
 * User Preferences Context
 * Stores: theme, language, currency, compact numbers, date format.
 * All values persist in localStorage.
 */
import { createContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../i18n';

export type Theme       = 'light';   // dark theme removed — app is light-only
export type Currency    = 'USD' | 'JPY';
export type DateFmt     = 'US' | 'ISO' | 'JP';
export type LangCode    = 'en' | 'ja';
export type LandingPage = 'dashboard' | 'funds';

interface Prefs {
  theme:          Theme;
  language:       LangCode;
  currency:       Currency;
  compactNumbers: boolean;
  dateFormat:     DateFmt;
  landingPage:    LandingPage;
  showAnalysis:   boolean;
  showCalculator: boolean;
}

interface PrefsCtx extends Prefs {
  setTheme:          (t: Theme)        => void;
  setLanguage:       (l: LangCode)     => void;
  setCurrency:       (c: Currency)     => void;
  setCompactNumbers: (v: boolean)      => void;
  setDateFormat:     (f: DateFmt)      => void;
  setLandingPage:    (p: LandingPage)  => void;
  setShowAnalysis:   (v: boolean)      => void;
  setShowCalculator: (v: boolean)      => void;
  resetAll:          ()                => void;
}

const DEFAULTS: Prefs = {
  theme:          'light',
  language:       'en',
  currency:       'USD',
  compactNumbers: true,
  dateFormat:     'US',
  landingPage:    'dashboard',
  showAnalysis:   true,
  showCalculator: true,
};

const VALID_LANGS: LangCode[] = ['en', 'ja'];

function load(): Prefs {
  try {
    const raw = localStorage.getItem('ims_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      console.log('🔧 [load] localStorage has language:', parsed.language);
      // STRICT: Only accept saved language if it's valid. Never override with browser lang.
      if (VALID_LANGS.includes(parsed.language)) {
        console.log('✅ [load] using saved language:', parsed.language);
        return { ...DEFAULTS, ...parsed, theme: 'light' };
      }
    }
  } catch { /* ignore */ }
  // No valid saved prefs → use default English (NOT browser detection)
  console.log('❌ [load] no valid saved language, defaulting to en');
  return { ...DEFAULTS, language: 'en' };
}

function save(p: Prefs) {
  localStorage.setItem('ims_prefs', JSON.stringify(p));
  // Keep the standalone language key for i18n init
  localStorage.setItem('ims_language', p.language);
}

export const PrefsCtx = createContext<PrefsCtx>({} as PrefsCtx);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  // Initialize theme
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Sync language to i18n whenever it changes (including mount)
  useEffect(() => {
    const updateLanguage = async () => {
      try {
        console.log('🔄 [useEffect] prefs.language is:', prefs.language, '| i18n.language was:', i18n.language);
        await i18n.changeLanguage(prefs.language);
        console.log('✅ [useEffect] i18n.language is now:', i18n.language);
      } catch (err) {
        console.error('❌ [useEffect] Failed to change language:', err);
      }
    };
    updateLanguage();
  }, [prefs.language]);

  function update(patch: Partial<Prefs>) {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }

  return (
    <PrefsCtx.Provider value={{
      ...prefs,
      setTheme:          t => update({ theme: t }),
      setLanguage:       l => update({ language: l }),
      setCurrency:       c => update({ currency: c }),
      setCompactNumbers: v => update({ compactNumbers: v }),
      setDateFormat:     f => update({ dateFormat: f }),
      setLandingPage:    p => update({ landingPage: p }),
      setShowAnalysis:   v => update({ showAnalysis: v }),
      setShowCalculator: v => update({ showCalculator: v }),
      resetAll:          () => { save(DEFAULTS); setPrefs({ ...DEFAULTS }); },
    }}>
      {children}
    </PrefsCtx.Provider>
  );
}

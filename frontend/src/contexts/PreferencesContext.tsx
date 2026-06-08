/**
 * User Preferences Context
 * Stores: theme, language, currency, compact numbers, date format.
 * All values persist in localStorage.
 */
import { createContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../i18n';

export type Theme      = 'light' | 'dark';
export type Currency   = 'USD' | 'JPY';
export type DateFmt    = 'US' | 'ISO' | 'JP';
export type LangCode   = 'en' | 'ja' | 'zh' | 'tl';

interface Prefs {
  theme:          Theme;
  language:       LangCode;
  currency:       Currency;
  compactNumbers: boolean;
  dateFormat:     DateFmt;
}

interface PrefsCtx extends Prefs {
  setTheme:          (t: Theme)      => void;
  setLanguage:       (l: LangCode)   => void;
  setCurrency:       (c: Currency)   => void;
  setCompactNumbers: (v: boolean)    => void;
  setDateFormat:     (f: DateFmt)    => void;
  resetAll:          ()              => void;
}

const DEFAULTS: Prefs = {
  theme:          'light',
  language:       'en',
  currency:       'USD',
  compactNumbers: true,
  dateFormat:     'US',
};

const VALID_LANGS: LangCode[] = ['en', 'ja', 'zh', 'tl'];

function detectBrowserLang(): LangCode {
  const langs: readonly string[] = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? 'en'];
  for (const lang of langs) {
    const l = lang.toLowerCase();
    if (l.startsWith('ja'))                         return 'ja';
    if (l.startsWith('zh'))                         return 'zh';
    if (l.startsWith('tl') || l.startsWith('fil')) return 'tl';
    if (l.startsWith('en'))                         return 'en';
  }
  return 'en';
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem('ims_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!VALID_LANGS.includes(parsed.language)) parsed.language = detectBrowserLang();
      return { ...DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }
  // No saved prefs → auto-detect from browser
  return { ...DEFAULTS, language: detectBrowserLang() };
}

function save(p: Prefs) {
  localStorage.setItem('ims_prefs', JSON.stringify(p));
  // Keep the standalone language key for i18n init
  localStorage.setItem('ims_language', p.language);
}

export const PrefsCtx = createContext<PrefsCtx>({} as PrefsCtx);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (prefs.theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [prefs.theme]);

  // Apply language to i18n
  useEffect(() => {
    i18n.changeLanguage(prefs.language);
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
      resetAll:          () => { save(DEFAULTS); setPrefs({ ...DEFAULTS }); },
    }}>
      {children}
    </PrefsCtx.Provider>
  );
}

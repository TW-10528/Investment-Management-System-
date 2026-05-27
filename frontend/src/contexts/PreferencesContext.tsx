/**
 * User Preferences Context
 * Stores: theme, language, currency, compact numbers, date format.
 * All values persist in localStorage.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../i18n';

export type Theme      = 'light' | 'dark';
export type Currency   = 'USD' | 'JPY';
export type DateFmt    = 'US' | 'ISO' | 'JP';
export type LangCode   = 'en' | 'ja' | 'tl' | 'zh' | 'ko';

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

function load(): Prefs {
  try {
    const raw = localStorage.getItem('ims_prefs');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function save(p: Prefs) {
  localStorage.setItem('ims_prefs', JSON.stringify(p));
  // Keep the standalone language key for i18n init
  localStorage.setItem('ims_language', p.language);
}

const Ctx = createContext<PrefsCtx>({} as PrefsCtx);

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
    <Ctx.Provider value={{
      ...prefs,
      setTheme:          t => update({ theme: t }),
      setLanguage:       l => update({ language: l }),
      setCurrency:       c => update({ currency: c }),
      setCompactNumbers: v => update({ compactNumbers: v }),
      setDateFormat:     f => update({ dateFormat: f }),
      resetAll:          () => { save(DEFAULTS); setPrefs({ ...DEFAULTS }); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() { return useContext(Ctx); }

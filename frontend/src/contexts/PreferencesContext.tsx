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
}

interface PrefsCtx extends Prefs {
  setTheme:          (t: Theme)        => void;
  setLanguage:       (l: LangCode)     => void;
  setCurrency:       (c: Currency)     => void;
  setCompactNumbers: (v: boolean)      => void;
  setDateFormat:     (f: DateFmt)      => void;
  setLandingPage:    (p: LandingPage)  => void;
  setShowAnalysis:   (v: boolean)      => void;
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
};

const VALID_LANGS: LangCode[] = ['en', 'ja'];

function detectBrowserLang(): LangCode {
  const langs: readonly string[] = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? 'en'];
  for (const lang of langs) {
    const l = lang.toLowerCase();
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

function load(): Prefs {
  try {
    const raw = localStorage.getItem('ims_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!VALID_LANGS.includes(parsed.language)) parsed.language = detectBrowserLang();
      return { ...DEFAULTS, ...parsed, theme: 'light' };   // force light — dark removed
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

  // Dark theme removed — always keep the app in light mode
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Apply language — i18n for keyed strings + Google Translate for everything else
  useEffect(() => {
    i18n.changeLanguage(prefs.language);

    const langMap: Record<string, string> = {
      en: 'en', ja: 'ja',
    };
    const target = langMap[prefs.language] ?? 'en';

    if (target === 'en') {
      // Restore original — remove googtrans cookie and reload
      document.cookie = 'googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'googtrans=; path=/; domain=' + window.location.hostname + '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      if (document.documentElement.lang !== 'en') window.location.reload();
    } else {
      // Set googtrans cookie so Google Translate activates on next render
      const val = `/en/${target}`;
      document.cookie = `googtrans=${val}; path=/`;
      document.cookie = `googtrans=${val}; path=/; domain=${window.location.hostname}`;
      // Trigger translation via the hidden widget element
      const sel = document.querySelector<HTMLSelectElement>('.goog-te-combo');
      if (sel) {
        sel.value = target;
        sel.dispatchEvent(new Event('change'));
      } else {
        // Widget not ready yet — reload so it picks up the cookie
        window.location.reload();
      }
    }
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
      resetAll:          () => { save(DEFAULTS); setPrefs({ ...DEFAULTS }); },
    }}>
      {children}
    </PrefsCtx.Provider>
  );
}

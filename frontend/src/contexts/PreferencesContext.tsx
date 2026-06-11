/**
 * User Preferences Context
 * Stores: theme, language, currency, compact numbers, date format, per-section accents.
 * Values persist in localStorage AND (for logged-in users) on the user's account so
 * they follow the user across devices.
 */
import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import i18n from '../i18n';
import {
  DEFAULT_SECTION_ACCENTS, type SectionAccents, type AccentName,
} from '../lib/accents';
import { authAPI } from '../services/api';

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
  sectionAccents: SectionAccents;
}

interface PrefsCtx extends Prefs {
  setTheme:          (t: Theme)      => void;
  setLanguage:       (l: LangCode)   => void;
  setCurrency:       (c: Currency)   => void;
  setCompactNumbers: (v: boolean)    => void;
  setDateFormat:     (f: DateFmt)    => void;
  setSectionAccent:  (section: string, accent: AccentName) => void;
  hydrateFromServer: ()              => void;
  resetAll:          ()              => void;
}

const DEFAULTS: Prefs = {
  theme:          'light',
  language:       'en',
  currency:       'USD',
  compactNumbers: true,
  dateFormat:     'US',
  sectionAccents: DEFAULT_SECTION_ACCENTS,
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
      return {
        ...DEFAULTS,
        ...parsed,
        // Merge accents so a newly-added section always has a default
        sectionAccents: { ...DEFAULT_SECTION_ACCENTS, ...(parsed.sectionAccents ?? {}) },
      };
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
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (prefs.theme === 'dark') html.classList.add('dark');
    else                        html.classList.remove('dark');
  }, [prefs.theme]);

  // Apply language — i18n for keyed strings + Google Translate for everything else
  useEffect(() => {
    i18n.changeLanguage(prefs.language);

    const langMap: Record<string, string> = {
      en: 'en', ja: 'ja', zh: 'zh-CN', ko: 'ko', tl: 'tl',
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

  /** Debounced push of the whole prefs blob to the user's account. */
  function syncToServer(next: Prefs) {
    if (!localStorage.getItem('authToken')) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      authAPI.updatePreferences(next).catch(() => { /* offline / non-fatal */ });
    }, 600);
  }

  function update(patch: Partial<Prefs>, opts: { sync?: boolean } = {}) {
    const sync = opts.sync ?? true;
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      save(next);
      if (sync) syncToServer(next);
      return next;
    });
  }

  /** Pull this account's saved preferences (called after login / on a protected mount). */
  function hydrateFromServer() {
    if (!localStorage.getItem('authToken')) return;
    authAPI.me()
      .then(res => {
        const server = res.data?.preferences;
        if (server && typeof server === 'object') {
          // Server wins for cross-device consistency; merge so missing keys keep defaults.
          update({
            ...server,
            sectionAccents: { ...DEFAULT_SECTION_ACCENTS, ...(server.sectionAccents ?? {}) },
          }, { sync: false });
        }
      })
      .catch(() => { /* non-fatal */ });
  }

  return (
    <PrefsCtx.Provider value={{
      ...prefs,
      setTheme:          t => update({ theme: t }),
      setLanguage:       l => update({ language: l }),
      setCurrency:       c => update({ currency: c }),
      setCompactNumbers: v => update({ compactNumbers: v }),
      setDateFormat:     f => update({ dateFormat: f }),
      setSectionAccent:  (section, accent) =>
        update({ sectionAccents: { ...prefs.sectionAccents, [section]: accent } }),
      hydrateFromServer,
      resetAll:          () => { save(DEFAULTS); setPrefs({ ...DEFAULTS }); syncToServer(DEFAULTS); },
    }}>
      {children}
    </PrefsCtx.Provider>
  );
}

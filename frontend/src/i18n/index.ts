import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';

export const LANGUAGES = [
  { code: 'en', label: 'English',  flag: '🇺🇸' },
  { code: 'ja', label: '日本語',    flag: '🇯🇵' },
] as const;

export type LangCode = typeof LANGUAGES[number]['code'];

const SUPPORTED = LANGUAGES.map(l => l.code) as string[];

/** Detects best language: saved preference → browser language → 'en' */
function detectLang(): LangCode {
  const saved = localStorage.getItem('ims_language');
  if (saved && SUPPORTED.includes(saved)) return saved as LangCode;

  const browserLangs: readonly string[] = navigator.languages?.length
    ? navigator.languages
    : [navigator.language ?? 'en'];

  for (const lang of browserLangs) {
    const l = lang.toLowerCase();
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    lng:          detectLang(),
    fallbackLng:  'en',
    interpolation: { escapeValue: false },
  });

export default i18n;

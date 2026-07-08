import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';

export const LANGUAGES = [
  { code: 'en', label: 'English',  flag: '🇺🇸' },
  { code: 'ja', label: '日本語',    flag: '🇯🇵' },
] as const;

export type LangCode = typeof LANGUAGES[number]['code'];

// Read saved language from localStorage to avoid flicker on page load
function getSavedLanguage(): LangCode {
  try {
    const raw = localStorage.getItem('ims_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.language === 'en' || parsed.language === 'ja') {
        return parsed.language;
      }
    }
  } catch { /* ignore */ }
  return 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    lng:          getSavedLanguage(), // Load saved language to avoid flicker
    fallbackLng:  'en',
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false, // Prevent suspense issues during language change
    },
  });

// Make i18n globally accessible for debugging
(window as any).i18n = i18n;

export default i18n;

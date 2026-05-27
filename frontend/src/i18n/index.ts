import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';
import tl from './locales/tl.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';

export const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇺🇸' },
  { code: 'ja', label: '日本語',      flag: '🇯🇵' },
  { code: 'tl', label: 'Filipino',   flag: '🇵🇭' },
  { code: 'zh', label: '中文',        flag: '🇨🇳' },
  { code: 'ko', label: '한국어',      flag: '🇰🇷' },
] as const;

export type LangCode = typeof LANGUAGES[number]['code'];

const savedLang = (localStorage.getItem('ims_language') || 'en') as LangCode;

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ja: { translation: ja },
                 tl: { translation: tl }, zh: { translation: zh },
                 ko: { translation: ko } },
    lng:          savedLang,
    fallbackLng:  'en',
    interpolation: { escapeValue: false },
  });

export default i18n;

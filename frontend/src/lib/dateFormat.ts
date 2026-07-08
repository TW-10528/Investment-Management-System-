import i18n from '../i18n';

export function formatDateWithKanji(date: string | null | undefined): string {
  if (!date) return '—';

  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    if (i18n.language === 'ja') {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      return `${year}年${month}月${day}日`;
    } else {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
  } catch {
    return '—';
  }
}

export function formatDateWithKanjiCurrent(date: string | null | undefined, i18nLang?: string): string {
  if (!date) return '—';

  const lang = i18nLang || i18n.language;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    if (lang === 'ja') {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      return `${year}年${month}月${day}日現在`;
    } else {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  } catch {
    return '—';
  }
}

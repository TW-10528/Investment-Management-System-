/**
 * Per-section accent theming.
 *
 * Each main functionality (Dashboard, Funds, FX, Calculator, Users) can carry its
 * own accent colour, chosen by the user. When the user navigates into a section we
 * push that section's accent into a set of CSS custom properties on <html>, and the
 * accent-aware utility classes / components recolour automatically.
 */

export type AccentName =
  | 'indigo' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'teal' | 'slate';

export interface Accent {
  name:  AccentName;
  label: string;
  base:   string;   // primary colour
  strong: string;   // darker — hover / active
}

export const ACCENTS: Accent[] = [
  { name: 'indigo',  label: 'Indigo',  base: '#6366f1', strong: '#4f46e5' },
  { name: 'blue',    label: 'Blue',    base: '#2563eb', strong: '#1d4ed8' },
  { name: 'emerald', label: 'Emerald', base: '#059669', strong: '#047857' },
  { name: 'teal',    label: 'Teal',    base: '#0d9488', strong: '#0f766e' },
  { name: 'amber',   label: 'Amber',   base: '#d97706', strong: '#b45309' },
  { name: 'violet',  label: 'Violet',  base: '#7c3aed', strong: '#6d28d9' },
  { name: 'rose',    label: 'Rose',    base: '#e11d48', strong: '#be123c' },
  { name: 'slate',   label: 'Slate',   base: '#475569', strong: '#334155' },
];

export const ACCENT_MAP: Record<AccentName, Accent> =
  Object.fromEntries(ACCENTS.map(a => [a.name, a])) as Record<AccentName, Accent>;

/** A main functionality the user can theme. `match` resolves a pathname to a section. */
export interface SectionDef {
  id:    string;
  label: string;
  icon:  string;
  match: (path: string) => boolean;
  defaultAccent: AccentName;
}

export const SECTIONS: SectionDef[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: '⊞',  defaultAccent: 'indigo',  match: p => p === '/' },
  { id: 'funds',      label: 'Funds',      icon: '🏦', defaultAccent: 'emerald', match: p => p.startsWith('/funds') },
  { id: 'fx',         label: 'FX Rates',   icon: '💱', defaultAccent: 'blue',    match: p => p.startsWith('/fx-rates') },
  { id: 'calculator', label: 'Calculator', icon: '🧮', defaultAccent: 'amber',   match: p => p.startsWith('/calculator') },
  { id: 'users',      label: 'Users',      icon: '👥', defaultAccent: 'violet',  match: p => p.startsWith('/users') },
];

export type SectionAccents = Record<string, AccentName>;

/** Built-in defaults — used when the user has not customised a section. */
export const DEFAULT_SECTION_ACCENTS: SectionAccents =
  Object.fromEntries(SECTIONS.map(s => [s.id, s.defaultAccent]));

export function sectionIdForPath(path: string): string {
  return (SECTIONS.find(s => s.match(path)) ?? SECTIONS[0]).id;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Write the accent CSS custom properties onto <html> for the given accent name. */
export function applyAccent(name: AccentName) {
  const accent = ACCENT_MAP[name] ?? ACCENT_MAP.indigo;
  const [r, g, b] = hexToRgb(accent.base);
  const root = document.documentElement.style;
  root.setProperty('--accent',        accent.base);
  root.setProperty('--accent-strong', accent.strong);
  root.setProperty('--accent-fg',     '#ffffff');
  root.setProperty('--accent-rgb',    `${r}, ${g}, ${b}`);
  root.setProperty('--accent-soft',   `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.setProperty('--accent-glow',   `rgba(${r}, ${g}, ${b}, 0.30)`);
  root.setProperty('--accent-border', `rgba(${r}, ${g}, ${b}, 0.40)`);
}

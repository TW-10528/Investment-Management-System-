/** Formatting helpers */

export const fmt = {
  usd: (v: number, compact = false) => {
    if (compact && Math.abs(v) >= 1_000_000)
      return `$${(v / 1_000_000).toFixed(1)}M`;
    if (compact && Math.abs(v) >= 1_000)
      return `$${(v / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(v);
  },

  jpy: (v: number) =>
    `¥${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(v)}`,

  pct: (v: number, decimals = 1) => `${v.toFixed(decimals)}%`,

  num: (v: number) => new Intl.NumberFormat('en-US').format(v),

  date: (s?: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  },

  dateJp: (s?: string | null) => {
    if (!s) return '—';
    const d = new Date(s);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  },

  rate: (v?: number | null) => v != null ? v.toFixed(2) : '—',
};

export const strategyColor: Record<string, string> = {
  Secondaries:    '#6366f1',
  Buyout:         '#0ea5e9',
  'Real Estate':  '#f59e0b',
  'Hedge Fund':   '#8b5cf6',
  'Private Credit':'#10b981',
  Infrastructure: '#f97316',
  Growth:         '#ec4899',
  Venture:        '#14b8a6',
  Other:          '#6b7280',
};

export const strategyBg: Record<string, string> = {
  Secondaries:    'bg-indigo-100 text-indigo-800',
  Buyout:         'bg-sky-100 text-sky-800',
  'Real Estate':  'bg-amber-100 text-amber-800',
  'Hedge Fund':   'bg-purple-100 text-purple-800',
  'Private Credit':'bg-emerald-100 text-emerald-800',
  Infrastructure: 'bg-orange-100 text-orange-800',
  Growth:         'bg-pink-100 text-pink-800',
  Venture:        'bg-teal-100 text-teal-800',
  Other:          'bg-gray-100 text-gray-700',
};

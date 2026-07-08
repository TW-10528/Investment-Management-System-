interface MetricsCardProps {
  icon?: string;
  title: string;
  amount: string | number;
  currency?: string;
  variant?: 'usd' | 'jpy';
}

export function MetricsCard({ icon, title, amount, currency, variant = 'usd' }: MetricsCardProps) {
  const bgColor = variant === 'jpy' ? 'rgba(4,120,87,0.08)' : 'rgba(30,64,175,0.08)';
  const borderColor = variant === 'jpy' ? 'rgba(4,120,87,0.2)' : 'rgba(30,64,175,0.2)';
  const iconColor = variant === 'jpy' ? '#047857' : '#1e40af';

  const formattedAmount = typeof amount === 'number'
    ? amount.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : amount;

  return (
    <div
      className="rounded-lg p-4 border transition-all hover:shadow-sm"
      style={{
        background: bgColor,
        borderColor: borderColor,
      }}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span className="text-xl flex-shrink-0" style={{ color: iconColor }}>
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">
            {title}
          </p>
          <div className="flex items-baseline gap-1">
            <p className="text-lg font-bold text-gray-900">
              {formattedAmount}
            </p>
            {currency && (
              <p className="text-xs text-gray-500">
                {currency}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

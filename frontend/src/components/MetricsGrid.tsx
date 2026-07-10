import { MetricsCard } from './MetricsCard';

interface MetricsGridProps {
  title?: string;
  variant?: 'usd' | 'jpy';
  metrics: Array<{
    icon?: string;
    title: string;
    amount: string | number;
    currency?: string;
  }>;
  dividerAfter?: number;
}

export function MetricsGrid({ title, variant = 'usd', metrics, dividerAfter }: MetricsGridProps) {
  return (
    <div>
      {title && (
        <h3 className="text-xs font-semibold theme-text-muted uppercase tracking-wide mb-3">
          {title}
        </h3>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((metric, idx) => (
          <div key={idx} className={dividerAfter === idx ? 'lg:col-span-5 lg:flex lg:gap-3' : ''}>
            <MetricsCard
              icon={metric.icon}
              title={metric.title}
              amount={metric.amount}
              currency={metric.currency}
              variant={variant}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

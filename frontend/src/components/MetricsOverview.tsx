import { MetricsCard } from './MetricsCard';

interface Metric {
  icon?: string;
  title: string;
  amount: string | number;
  currency?: string;
}

interface MetricsOverviewProps {
  usdMetrics: Metric[];
  jpyMetrics: Metric[];
  usdTitle?: string;
  jpyTitle?: string;
}

export function MetricsOverview({
  usdMetrics,
  jpyMetrics,
  usdTitle = '7 Funds (USD)',
  jpyTitle = 'SDG Fund (JPY)',
}: MetricsOverviewProps) {
  return (
    <div className="space-y-6">
      {/* USD Section */}
      {usdMetrics.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold theme-text-muted uppercase tracking-wide mb-3">
            {usdTitle}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {usdMetrics.map((metric, idx) => (
              <MetricsCard
                key={idx}
                icon={metric.icon}
                title={metric.title}
                amount={metric.amount}
                currency={metric.currency}
                variant="usd"
              />
            ))}
          </div>
        </div>
      )}

      {/* JPY Section */}
      {jpyMetrics.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold theme-text-muted uppercase tracking-wide mb-3">
            {jpyTitle}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {jpyMetrics.map((metric, idx) => (
              <MetricsCard
                key={idx}
                icon={metric.icon}
                title={metric.title}
                amount={metric.amount}
                currency={metric.currency}
                variant="jpy"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

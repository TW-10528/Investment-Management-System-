import './StatCard.css';

interface StatCardProps {
  title: string;
  value: number | string;
  format?: 'currency' | 'number' | 'percent' | 'decimal';
  currency?: 'USD' | 'JPY';
  decimals?: number;
  icon?: string;
  color?: string;
}

export default function StatCard({
  title,
  value,
  format = 'number',
  currency = 'USD',
  decimals = 0,
  icon,
  color = '#667eea',
}: StatCardProps) {
  let displayValue = value;

  if (typeof value === 'number') {
    switch (format) {
      case 'currency':
        if (currency === 'JPY') {
          displayValue = `¥${(value / 1000000).toFixed(2)}M`;
        } else {
          displayValue = `$${(value / 1000000).toFixed(2)}M`;
        }
        break;
      case 'percent':
        displayValue = `${value.toFixed(2)}%`;
        break;
      case 'decimal':
        displayValue = value.toFixed(decimals);
        break;
      case 'number':
      default:
        displayValue = value.toLocaleString();
    }
  }

  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-content">
        <p className="stat-title">{title}</p>
        <p className="stat-value">{displayValue}</p>
      </div>
    </div>
  );
}

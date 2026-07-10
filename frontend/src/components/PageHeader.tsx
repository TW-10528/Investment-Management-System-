import type { ReactNode } from 'react';

interface HeaderAction {
  icon: string;
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
  children?: ReactNode;
  badge?: { label: string; color: string };
}

export default function PageHeader({
  title,
  subtitle,
  actions = [],
  children,
  badge,
}: PageHeaderProps) {
  return (
    <div className="px-6 py-4 border-b theme-border">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold theme-text">{title}</h1>
            {badge && (
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                style={{
                  background: badge.color + '14',
                  color: badge.color,
                  border: `1px solid ${badge.color}40`,
                }}
              >
                {badge.label}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm theme-text-muted mt-1">{subtitle}</p>
          )}
        </div>

        {/* Actions section */}
        {(actions.length > 0 || children) && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  transition-colors whitespace-nowrap
                  ${
                    action.variant === 'primary'
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                      : 'border theme-divider theme-text-muted hover:theme-text disabled:opacity-40'
                  }
                `}
              >
                {action.icon} {action.label}
              </button>
            ))}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

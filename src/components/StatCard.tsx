import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning';
  to?: string;
}

const variantStyles = {
  default: 'bg-card',
  primary: 'bg-primary/5 border-primary/20',
  accent: 'bg-accent/5 border-accent/20',
  success: 'bg-success/5 border-success/20',
  warning: 'bg-warning/5 border-warning/20',
};

const iconStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
};

export default function StatCard({ label, value, icon, trend, variant = 'default', to }: StatCardProps) {
  const navigate = useNavigate();
  return (
    <div
      className={cn('rounded-xl border p-5 transition-shadow hover:shadow-md', variantStyles[variant], to && 'cursor-pointer active:scale-[0.98]')}
      onClick={to ? () => navigate(to) : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
        </div>
        <div className={cn('rounded-lg p-2.5', iconStyles[variant])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

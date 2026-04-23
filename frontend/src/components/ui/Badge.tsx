import { cn } from '@/utils/cn';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantClasses: Record<Variant, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-gray-100 text-gray-600',
};

interface BadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

export function Badge({ label, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}

// Convenience helpers
export function statusBadge(status: string) {
  const map: Record<string, Variant> = {
    active: 'success',
    approved: 'success',
    official: 'success',
    completed: 'success',
    pending: 'warning',
    probation: 'warning',
    rejected: 'danger',
    resigned: 'danger',
    inactive: 'neutral',
    cancelled: 'neutral',
    unpaid: 'neutral',
    annual: 'info',
    sick: 'warning',
    compensatory: 'success',
  };
  return <Badge label={status} variant={map[status] ?? 'neutral'} />;
}

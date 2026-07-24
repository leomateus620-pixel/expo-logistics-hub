import { cn } from '@/lib/utils';

export function CycleYearMark({
  year,
  className,
}: {
  year: number;
  className?: string;
}) {
  if (year !== 2028) return <>{year}</>;

  return (
    <span className={cn('cronograma-cycle-year-mark', className)}>
      <span aria-hidden="true">
        2<span className="cronograma-cycle-soy-zero">0<i /></span>28
      </span>
      <span className="sr-only">2028</span>
    </span>
  );
}

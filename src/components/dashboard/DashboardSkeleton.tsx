import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardSkeleton() {
  return (
    <div className="space-y-5 pb-8">
      <div className="px-1">
        <Skeleton className="h-7 w-48 mb-1" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-12 rounded-full" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[170px] rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[260px] rounded-2xl" />)}
      </div>
    </div>
  );
}

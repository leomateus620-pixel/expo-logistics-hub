import { cn } from '@/lib/utils';

function Bone({ className, dark = false }: { className?: string; dark?: boolean }) {
  return <span className={cn('ua-skeleton block', dark && 'ua-skeleton--dark', className)} aria-hidden="true" />;
}

/** Skeleton for the unit header (dark surface). */
export function CommissionHeaderSkeleton() {
  return (
    <div className="cw-header" aria-busy="true" aria-label="Carregando frente">
      <div className="cw-header__identity">
        <Bone dark className="h-10 w-10 rounded-xl md:h-[52px] md:w-[52px] md:rounded-[14px]" />
        <div className="grid min-w-0 gap-2 py-1">
          <Bone dark className="h-3 w-24" />
          <Bone dark className="h-5 w-[min(100%,320px)]" />
          <Bone dark className="hidden h-3 w-[min(100%,420px)] md:block" />
        </div>
        <Bone dark className="h-10 w-10 rounded-[10px] md:h-11 md:w-36" />
      </div>
      <div className="cw-header__people">
        <Bone dark className="h-8 w-8 rounded-full" />
        <Bone dark className="h-3 w-32" />
      </div>
      <div className="cw-nav">
        <div className="cw-nav__rail">
          {[0, 1, 2, 3, 4].map((item) => <Bone key={item} dark className="mb-2 h-8 w-24 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export function AgendaKpiSkeleton() {
  return (
    <div className="ua-kpis" aria-busy="true" aria-label="Carregando indicadores">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="ws-card ua-kpi">
          <Bone className="h-3 w-16" />
          <Bone className="h-6 w-12" />
          <Bone className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function AgendaEventCardSkeleton() {
  return (
    <div className="ws-card ua-event-card">
      <Bone className="h-[60px] w-12 rounded-xl" />
      <div className="ua-event-card__body">
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-3.5 w-32" />
          <Bone className="h-5 w-20 rounded-full" />
        </div>
        <Bone className="h-4 w-[min(100%,360px)]" />
        <div className="flex flex-wrap items-center gap-4">
          <Bone className="h-6 w-36" />
          <Bone className="h-3.5 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Bone className="h-5 w-20 rounded-full" />
          <Bone className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AgendaTimelineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ua-timeline" aria-busy="true" aria-label="Carregando linha do tempo">
      <div className="ua-month-section">
        <div className="ua-month-section__header">
          <Bone className="h-5 w-40" />
          <Bone className="h-3 w-16" />
        </div>
        <div className="ua-day-group">
          <div className="ua-day-heading"><Bone className="h-3 w-36" /><span className="ua-day-heading__line" /></div>
          {Array.from({ length: rows }, (_, index) => <AgendaEventCardSkeleton key={index} />)}
        </div>
      </div>
    </div>
  );
}

export function DocumentsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="ua-documents" aria-busy="true" aria-label="Carregando documentos">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ws-card ua-document">
          <Bone className="h-11 w-10 rounded-[10px]" />
          <div className="ua-document__body">
            <Bone className="h-3.5 w-[min(100%,260px)]" />
            <Bone className="h-3 w-40" />
          </div>
          <Bone className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div className="ua-detail" aria-busy="true" aria-label="Carregando evento">
      <div className="ua-detail__hero">
        <div className="flex gap-2"><Bone className="h-6 w-24 rounded-full" /><Bone className="h-6 w-20 rounded-full" /></div>
        <Bone className="h-6 w-[min(100%,380px)]" />
        <Bone className="h-6 w-[min(100%,240px)]" />
      </div>
      <div className="ua-detail__facts">
        {[0, 1, 2, 3].map((item) => <Bone key={item} className="h-16 rounded-xl" />)}
      </div>
      <Bone className="h-4 w-32" />
      <div className="grid gap-2">
        <Bone className="h-10 rounded-xl" />
        <Bone className="h-10 rounded-xl" />
      </div>
      <Bone className="h-4 w-28" />
      <Bone className="h-20 rounded-xl" />
    </div>
  );
}

export function AgendaPageSkeleton() {
  return (
    <div className="ua-page" aria-busy="true">
      <div className="ua-header">
        <div className="grid gap-2">
          <Bone className="h-3 w-24" />
          <Bone className="h-6 w-48" />
        </div>
      </div>
      <AgendaKpiSkeleton />
      <div className="ua-toolbar">
        <Bone className="h-11 rounded-[10px]" />
        <div className="flex gap-2"><Bone className="h-11 w-28 rounded-[10px]" /><Bone className="h-11 w-24 rounded-[10px]" /></div>
      </div>
      <AgendaTimelineSkeleton rows={3} />
    </div>
  );
}

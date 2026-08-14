import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const AgendaMeetingWorkspace = lazy(async () => {
  const module = await import('./AgendaMeetingWorkspace');
  return { default: module.AgendaMeetingWorkspace };
});

export interface LazyAgendaMeetingWorkspaceProps {
  eventId: string | null;
  orgId: string | null;
  eventTitle: string;
  persistedEvent: boolean;
  canRecord: boolean;
  canReview: boolean;
  canDelete: boolean;
  onActiveCaptureChange?: (
    active: boolean,
    cancelForExit: (() => Promise<void>) | null,
  ) => void;
  className?: string;
}

export type AgendaMeetingContext = Pick<
  LazyAgendaMeetingWorkspaceProps,
  'eventId' | 'orgId' | 'persistedEvent' | 'canRecord' | 'canReview' | 'canDelete'
>;

export function LazyAgendaMeetingWorkspace({
  eventId,
  orgId,
  persistedEvent,
  ...props
}: LazyAgendaMeetingWorkspaceProps) {
  const hasCanonicalEvent = persistedEvent && Boolean(eventId && orgId);

  return (
    <Suspense
      fallback={(
        <div className="agenda-meeting agenda-meeting__loading" aria-busy="true" aria-label="Carregando inteligência da reunião">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Preparando experiência da reunião…
        </div>
      )}
    >
      <AgendaMeetingWorkspace
        {...props}
        eventId={eventId}
        orgId={orgId}
        persistedEvent={hasCanonicalEvent}
      />
    </Suspense>
  );
}

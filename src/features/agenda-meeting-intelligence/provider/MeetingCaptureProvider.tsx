import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AgendaMeetingCaptureController, AgendaMeetingCapturePhase, AgendaMeetingStartInput } from '../types';
import {
  MEETING_CAPTURE_OWNED_PHASES,
  MeetingCaptureContext,
  type MeetingCaptureContextValue,
  type MeetingCaptureTarget,
} from './meetingCaptureContext';
import type { PendingMeetingStart } from './MeetingCaptureEngine';

const MeetingCaptureEngine = lazy(() => import('./MeetingCaptureEngine'));

export const MEETING_CAPTURE_BINDING_KEY = 'fenasoja:agenda-meeting:binding:v1';
const RECOVERY_PREFIX = 'fenasoja:agenda-meeting:recovery:v1:';
const CAPTURE_LOCK = 'fenasoja-agenda-meeting-capture';

function readStoredTarget(): MeetingCaptureTarget | null {
  try {
    const raw = JSON.parse(localStorage.getItem(MEETING_CAPTURE_BINDING_KEY) ?? 'null');
    if (raw && typeof raw.eventId === 'string' && typeof raw.orgId === 'string') {
      return { eventId: raw.eventId, orgId: raw.orgId, eventTitle: typeof raw.eventTitle === 'string' ? raw.eventTitle : 'Reunião' };
    }
    // A recovery record without binding (older client): rebind to its event.
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const record = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (record && typeof record.eventId === 'string' && typeof record.orgId === 'string') {
        return { eventId: record.eventId, orgId: record.orgId, eventTitle: 'Reunião em andamento' };
      }
    }
  } catch {
    // Storage unavailable: no persisted binding.
  }
  return null;
}

function writeStoredTarget(target: MeetingCaptureTarget | null) {
  try {
    if (target) localStorage.setItem(MEETING_CAPTURE_BINDING_KEY, JSON.stringify(target));
    else localStorage.removeItem(MEETING_CAPTURE_BINDING_KEY);
  } catch {
    // Binding persistence is best effort; recovery records remain authoritative.
  }
}

const RELEASE_PHASES = new Set<AgendaMeetingCapturePhase>(['analysis_queued', 'review_required', 'completed']);

/**
 * App-level owner of Fenasoja Meeting capture. Mounted above routes, drawers and
 * modals; the heavy engine is loaded only when a meeting starts or must be recovered.
 */
export function MeetingCaptureProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<MeetingCaptureTarget | null>(() => readStoredTarget());
  const [controller, setController] = useState<AgendaMeetingCaptureController | null>(null);
  const [pendingStart, setPendingStart] = useState<PendingMeetingStart | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<ReadonlySet<string>>(() => new Set());
  const pendingIdRef = useRef(0);
  const lockReleaseRef = useRef<(() => void) | null>(null);
  const previousPhaseRef = useRef<AgendaMeetingCapturePhase>('idle');
  const releasingRef = useRef(false);

  const phase = controller?.state.phase ?? 'idle';
  const isActive = Boolean(target && controller && MEETING_CAPTURE_OWNED_PHASES.has(phase));

  const releaseLock = useCallback(() => {
    lockReleaseRef.current?.();
    lockReleaseRef.current = null;
  }, []);

  const unbind = useCallback(() => {
    setTarget(null);
    setController(null);
    setPanelOpen(false);
    writeStoredTarget(null);
    releaseLock();
  }, [releaseLock]);

  const acquireLock = useCallback(async () => {
    if (lockReleaseRef.current) return true;
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks?.request) return true;
    return await new Promise<boolean>((resolve) => {
      void locks.request(CAPTURE_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise<void>((release) => {
          lockReleaseRef.current = release;
        });
      }).catch(() => resolve(true));
    });
  }, []);

  const startFor = useCallback(async (next: MeetingCaptureTarget, input: AgendaMeetingStartInput) => {
    if (isActive) throw new Error('meeting_capture_already_active');
    if (!(await acquireLock())) throw new Error('meeting_capture_active_other_tab');
    writeStoredTarget(next);
    setTarget(next);
    await new Promise<void>((resolve, reject) => {
      pendingIdRef.current += 1;
      setPendingStart({ id: pendingIdRef.current, target: next, input, resolve, reject });
    }).catch((error) => {
      releaseLock();
      throw error;
    });
  }, [acquireLock, isActive, releaseLock]);

  const handlePending = useCallback((id: number) => {
    setPendingStart((current) => (current?.id === id ? null : current));
  }, []);

  // Release the binding once the client no longer owns anything: every part reached
  // the server after "Finalizar", or the capture was cancelled.
  useEffect(() => {
    if (!controller || !target || releasingRef.current) return;
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    const uploadsDone = controller.state.backlog.segments === 0;
    const finalized = (phase === 'awaiting_transcripts' && uploadsDone) || RELEASE_PHASES.has(phase);
    const cancelled = phase === 'idle' && previous !== 'idle' && !pendingStart;
    // A start that failed before any session existed (e.g. microphone denied) owns nothing.
    const failedBeforeSession = !controller.state.sessionId && (phase === 'fatal_error' || phase === 'recoverable_error') && !pendingStart;
    if (!finalized && !cancelled && !failedBeforeSession) return;
    releasingRef.current = true;
    void (finalized ? controller.purge().catch(() => undefined) : Promise.resolve()).finally(() => {
      releasingRef.current = false;
      previousPhaseRef.current = 'idle';
      unbind();
    });
  }, [controller, pendingStart, phase, target, unbind]);

  // Lock re-acquisition after a reload that recovered an owned session.
  useEffect(() => {
    if (isActive && !lockReleaseRef.current) void acquireLock();
  }, [acquireLock, isActive]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') unbind();
    });
    return () => data.subscription.unsubscribe();
  }, [unbind]);

  const registerVisiblePanel = useCallback((eventId: string) => {
    setVisiblePanels((current) => new Set(current).add(eventId));
    return () => setVisiblePanels((current) => {
      const next = new Set(current);
      next.delete(eventId);
      return next;
    });
  }, []);

  const value = useMemo<MeetingCaptureContextValue>(() => ({
    target,
    controller,
    isActive,
    startFor,
    openPanel: () => setPanelOpen(true),
    closePanel: () => setPanelOpen(false),
    panelOpen,
    registerVisiblePanel,
    visiblePanelEventIds: visiblePanels,
  }), [controller, isActive, panelOpen, registerVisiblePanel, startFor, target, visiblePanels]);

  return (
    <MeetingCaptureContext.Provider value={value}>
      {children}
      {target && (
        <Suspense fallback={null}>
          <MeetingCaptureEngine
            key={`${target.orgId}:${target.eventId}`}
            onController={setController}
            onPendingHandled={handlePending}
            pendingStart={pendingStart}
            target={target}
          />
        </Suspense>
      )}
    </MeetingCaptureContext.Provider>
  );
}

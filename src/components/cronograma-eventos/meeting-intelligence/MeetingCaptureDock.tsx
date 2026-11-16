import { useEffect, useState } from 'react';
import { CircleStop, Mic, MicOff, PanelTopOpen } from 'lucide-react';
import { toast } from 'sonner';

import '@/styles/agenda-meeting-intelligence.css';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useOptionalMeetingCapture } from '@/features/agenda-meeting-intelligence/provider/meetingCaptureContext';

import { MeetingCapturePanel, uploadStatusLabel, useOnlineStatus } from './MeetingCapturePanel';
import { CAPTURE_PHASE_LABELS, COLLAPSE_NOTICE, errorCodeOf, formatDuration, meetingErrorMessage } from './meetingCopy';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const listener = () => setDesktop(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return desktop;
}

/**
 * Persistent compact bar shown while a meeting is owned by this client and its
 * event panel is not on screen. "Reabrir" opens the same session in a floating panel.
 */
export function MeetingCaptureDock() {
  const capture = useOptionalMeetingCapture();
  const online = useOnlineStatus();
  const desktop = useIsDesktop();
  const [confirmFinish, setConfirmFinish] = useState(false);
  if (!capture?.target || !capture.controller || !capture.isActive) return null;
  const { controller, target } = capture;
  const phase = controller.state.phase;
  const panelVisible = capture.visiblePanelEventIds.has(target.eventId);
  const canFinish = ['recording', 'paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(phase);

  return (
    <>
      {!panelVisible && !capture.panelOpen && (
        <div aria-label="Reunião em gravação" className="meeting-dock" data-phase={phase} role="region">
          <span aria-hidden="true" className="meeting-dock__pulse">
            {phase === 'recording' ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </span>
          <span className="meeting-dock__copy">
            <span className="meeting-dock__title">{target.eventTitle}</span>
            <span className="meeting-dock__meta">
              <strong>{formatDuration(controller.state.activeDurationMs)}</strong>
              <span> · {CAPTURE_PHASE_LABELS[phase]} · {uploadStatusLabel(controller, online)}</span>
            </span>
          </span>
          <span className="meeting-dock__actions">
            <button className="meeting-dock__button" onClick={capture.openPanel} type="button">
              <PanelTopOpen className="h-4 w-4" />Reabrir
            </button>
            {canFinish && (
              <button className="meeting-dock__button meeting-dock__button--primary" onClick={() => setConfirmFinish(true)} type="button">
                <CircleStop className="h-4 w-4" />Finalizar
              </button>
            )}
          </span>
        </div>
      )}

      <Sheet open={capture.panelOpen} onOpenChange={(open) => {
        if (open) capture.openPanel();
        else {
          capture.closePanel();
          if (capture.isActive) toast.info(COLLAPSE_NOTICE);
        }
      }}>
        <SheetContent className="meeting-dock__sheet" side={desktop ? 'right' : 'bottom'}>
          <SheetHeader className="sr-only">
            <SheetTitle>Reunião em gravação</SheetTitle>
            <SheetDescription>Controles da gravação em andamento.</SheetDescription>
          </SheetHeader>
          <div className="agenda-meeting agenda-meeting--floating">
            <div className="agenda-meeting__body">
              <MeetingCapturePanel
                controller={controller}
                eventTitle={target.eventTitle}
                onCollapse={() => {
                  capture.closePanel();
                  toast.info(COLLAPSE_NOTICE);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar a reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              A gravação para, o último trecho é enviado e a transcrição completa e o relatório serão gerados. Você pode continuar usando a Agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              void controller.finish({ allowPartial: false })
                .then(() => toast.success('Reunião finalizada. A transcrição e o relatório estão sendo gerados.'))
                .catch((error) => toast.error(meetingErrorMessage(errorCodeOf(error))));
            }}>
              Finalizar reunião
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useEffect, useRef } from 'react';
import { useAgendaMeetingCapture } from '../hooks/useAgendaMeetingCapture';
import type { AgendaMeetingCaptureController, AgendaMeetingStartInput } from '../types';
import type { MeetingCaptureTarget } from './meetingCaptureContext';

export interface PendingMeetingStart {
  id: number;
  target: MeetingCaptureTarget;
  input: AgendaMeetingStartInput;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface MeetingCaptureEngineProps {
  target: MeetingCaptureTarget;
  pendingStart: PendingMeetingStart | null;
  onPendingHandled: (id: number) => void;
  onController: (controller: AgendaMeetingCaptureController) => void;
}

/**
 * Owns the MediaStream, recorder, upload queue, timers and session state. It is
 * mounted once at the app root (lazy) and never by an event panel, so closing or
 * switching panels cannot stop, pause, cancel or restart the capture.
 */
export default function MeetingCaptureEngine({ target, pendingStart, onPendingHandled, onController }: MeetingCaptureEngineProps) {
  const controller = useAgendaMeetingCapture({
    eventId: target.eventId,
    orgId: target.orgId,
    persistedEvent: true,
  });
  const handledRef = useRef<number | null>(null);

  useEffect(() => {
    onController(controller);
    // Report every observable change: state, meter and device list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller.state, controller.mic.inputLevel, controller.mic.devices, controller.mic.selectedDeviceId, onController]);

  useEffect(() => {
    if (!pendingStart || handledRef.current === pendingStart.id) return;
    if (pendingStart.target.eventId !== target.eventId || pendingStart.target.orgId !== target.orgId) return;
    if (controller.state.phase !== 'idle') return;
    handledRef.current = pendingStart.id;
    onPendingHandled(pendingStart.id);
    controller.start(pendingStart.input).then(pendingStart.resolve, pendingStart.reject);
  }, [controller, controller.state.phase, onPendingHandled, pendingStart, target.eventId, target.orgId]);

  return null;
}

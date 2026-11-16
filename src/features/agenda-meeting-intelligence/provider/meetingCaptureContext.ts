import { createContext, useContext } from 'react';
import type {
  AgendaMeetingCaptureController,
  AgendaMeetingCapturePhase,
  AgendaMeetingStartInput,
} from '../types';

export interface MeetingCaptureTarget {
  eventId: string;
  orgId: string;
  eventTitle: string;
}

/** Phases in which the client still owns a meeting (audio, local parts or finalization). */
export const MEETING_CAPTURE_OWNED_PHASES = new Set<AgendaMeetingCapturePhase>([
  'requesting_permission',
  'starting',
  'recording',
  'paused',
  'backpressure_paused',
  'capture_interrupted',
  'recoverable_error',
  'finalizing',
  'awaiting_transcripts',
  'fatal_error',
]);

export interface MeetingCaptureContextValue {
  /** Target the persistent capture controller is bound to (event of the meeting). */
  target: MeetingCaptureTarget | null;
  /** Controller owned by the app-level provider; null until the engine is loaded. */
  controller: AgendaMeetingCaptureController | null;
  /** True while a meeting is owned by this client (recording, paused, finalizing...). */
  isActive: boolean;
  startFor(target: MeetingCaptureTarget, input: AgendaMeetingStartInput): Promise<void>;
  /** Opens the floating capture panel from anywhere in the app. */
  openPanel(): void;
  closePanel(): void;
  panelOpen: boolean;
  /** Event panels report visibility so the compact bar can hide when the panel is on screen. */
  registerVisiblePanel(eventId: string): () => void;
  visiblePanelEventIds: ReadonlySet<string>;
}

export const MeetingCaptureContext = createContext<MeetingCaptureContextValue | null>(null);

export function useMeetingCapture(): MeetingCaptureContextValue {
  const value = useContext(MeetingCaptureContext);
  if (!value) throw new Error('MeetingCaptureProvider ausente');
  return value;
}

/** Optional access for components that may render outside the provider (tests, previews). */
export function useOptionalMeetingCapture(): MeetingCaptureContextValue | null {
  return useContext(MeetingCaptureContext);
}

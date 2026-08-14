import { computeCaptureBacklog } from './backlog';
import type {
  AgendaMeetingCapturePhase,
  AgendaMeetingCaptureState,
  AgendaMeetingSafeError,
  CaptureBackendKind,
  CaptureInterruptionReason,
  CaptureSegmentState,
} from '../types';

export const INITIAL_AGENDA_MEETING_CAPTURE_STATE: AgendaMeetingCaptureState = {
  phase: 'idle',
  sessionId: null,
  sessionVersion: null,
  activeDurationMs: 0,
  startedAtIso: null,
  backend: null,
  mimeType: null,
  selectedDeviceId: null,
  interruption: null,
  backlog: {
    segments: 0,
    bytes: 0,
    durationMs: 0,
    isAtCapacity: false,
    limitedBy: null,
  },
  segments: [],
  error: null,
};

export type AgendaMeetingCaptureAction =
  | { type: 'phase'; phase: AgendaMeetingCapturePhase }
  | {
      type: 'session_started';
      sessionId: string;
      sessionVersion: number;
      startedAtIso: string;
      backend: CaptureBackendKind;
      mimeType: string;
      selectedDeviceId: string | null;
    }
  | {
      type: 'session_rehydrated';
      sessionId: string;
      sessionVersion: number;
      startedAtIso: string | null;
      phase: Extract<AgendaMeetingCapturePhase, 'paused' | 'capture_interrupted' | 'awaiting_transcripts'>;
      selectedDeviceId: string | null;
      activeDurationMs: number;
    }
  | { type: 'session_version'; version: number }
  | { type: 'duration'; activeDurationMs: number }
  | { type: 'segment_upsert'; segment: CaptureSegmentState }
  | { type: 'segment_removed'; segmentId: string }
  | { type: 'segments_rehydrated'; segments: CaptureSegmentState[] }
  | { type: 'interrupted'; reason: CaptureInterruptionReason; error?: AgendaMeetingSafeError }
  | { type: 'error'; phase: 'recoverable_error' | 'fatal_error'; error: AgendaMeetingSafeError }
  | { type: 'clear_error' }
  | { type: 'reset' };

function sortSegments(segments: CaptureSegmentState[]): CaptureSegmentState[] {
  return [...segments].sort((left, right) => left.sequence - right.sequence);
}

function withSegments(
  state: AgendaMeetingCaptureState,
  segments: CaptureSegmentState[],
): AgendaMeetingCaptureState {
  const sorted = sortSegments(segments);
  return { ...state, segments: sorted, backlog: computeCaptureBacklog(sorted) };
}

export function agendaMeetingCaptureReducer(
  state: AgendaMeetingCaptureState,
  action: AgendaMeetingCaptureAction,
): AgendaMeetingCaptureState {
  switch (action.type) {
    case 'phase':
      return { ...state, phase: action.phase, error: null };
    case 'session_started':
      return {
        ...state,
        phase: 'recording',
        sessionId: action.sessionId,
        sessionVersion: action.sessionVersion,
        startedAtIso: action.startedAtIso,
        backend: action.backend,
        mimeType: action.mimeType,
        selectedDeviceId: action.selectedDeviceId,
        interruption: null,
        error: null,
      };
    case 'session_rehydrated':
      return {
        ...state,
        phase: action.phase,
        sessionId: action.sessionId,
        sessionVersion: action.sessionVersion,
        startedAtIso: action.startedAtIso,
        selectedDeviceId: action.selectedDeviceId,
        activeDurationMs: action.activeDurationMs,
        interruption: action.phase === 'capture_interrupted' ? 'pagehide' : null,
        error: null,
      };
    case 'session_version':
      return { ...state, sessionVersion: action.version };
    case 'duration':
      return { ...state, activeDurationMs: Math.max(0, action.activeDurationMs) };
    case 'segment_upsert': {
      const next = state.segments.filter((segment) => segment.id !== action.segment.id);
      next.push(action.segment);
      return withSegments(state, next);
    }
    case 'segment_removed':
      return withSegments(
        state,
        state.segments.filter((segment) => segment.id !== action.segmentId),
      );
    case 'segments_rehydrated':
      return withSegments(state, action.segments);
    case 'interrupted':
      return {
        ...state,
        phase: 'capture_interrupted',
        interruption: action.reason,
        error: action.error ?? null,
      };
    case 'error':
      return { ...state, phase: action.phase, error: action.error };
    case 'clear_error':
      return { ...state, error: null };
    case 'reset':
      return INITIAL_AGENDA_MEETING_CAPTURE_STATE;
  }
}

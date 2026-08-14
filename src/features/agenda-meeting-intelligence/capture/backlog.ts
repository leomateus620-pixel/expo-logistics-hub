import {
  AGENDA_MEETING_MAX_BACKLOG_BYTES,
  AGENDA_MEETING_MAX_BACKLOG_DURATION_MS,
  type CaptureBacklogState,
  type CaptureSegmentState,
} from '../types';

const PENDING_STATUSES = new Set<CaptureSegmentState['status']>([
  'captured',
  'queued',
  'uploading',
  'accepted',
  'processing',
  'retry_wait',
  'terminal_error',
]);

export function computeCaptureBacklog(
  segments: readonly CaptureSegmentState[],
  limits: { maxBytes?: number; maxDurationMs?: number } = {},
): CaptureBacklogState {
  const pending = segments.filter((segment) => PENDING_STATUSES.has(segment.status));
  const bytes = pending.reduce((total, segment) => total + segment.bytes, 0);
  const durationMs = pending.reduce((total, segment) => total + segment.durationMs, 0);
  const maxBytes = limits.maxBytes ?? AGENDA_MEETING_MAX_BACKLOG_BYTES;
  const maxDurationMs = limits.maxDurationMs ?? AGENDA_MEETING_MAX_BACKLOG_DURATION_MS;
  const limitedBy = bytes >= maxBytes ? 'bytes' : durationMs >= maxDurationMs ? 'duration' : null;

  return {
    segments: pending.length,
    bytes,
    durationMs,
    isAtCapacity: limitedBy !== null,
    limitedBy,
  };
}
export function wouldExceedCaptureBacklog(
  backlog: CaptureBacklogState,
  nextSegment: Pick<CaptureSegmentState, 'bytes' | 'durationMs'>,
  limits: { maxBytes?: number; maxDurationMs?: number } = {},
): CaptureBacklogState {
  const maxBytes = limits.maxBytes ?? AGENDA_MEETING_MAX_BACKLOG_BYTES;
  const maxDurationMs = limits.maxDurationMs ?? AGENDA_MEETING_MAX_BACKLOG_DURATION_MS;
  const bytes = backlog.bytes + nextSegment.bytes;
  const durationMs = backlog.durationMs + nextSegment.durationMs;
  const limitedBy = bytes > maxBytes ? 'bytes' : durationMs > maxDurationMs ? 'duration' : null;
  return {
    segments: backlog.segments + 1,
    bytes,
    durationMs,
    isAtCapacity: limitedBy !== null,
    limitedBy,
  };
}

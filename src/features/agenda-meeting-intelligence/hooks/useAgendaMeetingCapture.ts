import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AgendaMeetingEdgeClient, AgendaMeetingEdgeError } from '../api/AgendaMeetingEdgeClient';
import { wouldExceedCaptureBacklog } from '../capture/backlog';
import {
  CaptureSegmenter,
  type CaptureSegmenterOptions,
} from '../capture/CaptureSegmenter';
import { createMeetingMutationId } from '../capture/identity';
import { listSupportedMediaRecorderMimeTypes } from '../capture/mime';
import {
  INITIAL_AGENDA_MEETING_CAPTURE_STATE,
  agendaMeetingCaptureReducer,
} from '../capture/reducer';
import { EncryptedSegmentSpool } from '../spool/EncryptedSegmentSpool';
import { SegmentUploadCoordinator } from '../upload/SegmentUploadCoordinator';
import {
  type AgendaMeetingCaptureCapabilities,
  type AgendaMeetingCaptureController,
  type AgendaMeetingJson,
  type AgendaMeetingSafeError,
  type AgendaMeetingStartInput,
  type AgendaMeetingStartResult,
  type AgendaMeetingStateResult,
  AGENDA_MEETING_MAX_SEGMENT_BYTES,
  AGENDA_MEETING_SEGMENT_DURATION_MS,
  AGENDA_MEETING_SPOOL_TTL_MS,
  type CaptureGapMarker,
  type CaptureSegmentState,
} from '../types';

const INPUT_LEVEL_INTERVAL_MS = 100;
const HEARTBEAT_INTERVAL_MS = 15_000;
const PROCESSING_POLL_INTERVAL_MS = 3_000;
const RECOVERY_STORAGE_PREFIX = 'fenasoja:agenda-meeting:recovery:v1';
const NAVIGATION_GUARDED_PHASES = new Set([
  'requesting_permission',
  'starting',
  'recording',
  'paused',
  'backpressure_paused',
  'capture_interrupted',
  'recoverable_error',
]);

interface RecoveryRecord {
  orgId: string;
  eventId: string;
  sessionId: string;
  sessionVersion: number;
  nextSequence: number;
  activeDurationMs: number;
  selectedDeviceId: string | null;
  startedAtIso: string | null;
  captureEnded: boolean;
  pendingGaps: RecoveryGap[];
  expiresAtMs: number;
}

interface RecoveryGap extends CaptureGapMarker {
  mutationId: string;
}

const GAP_REASONS = new Set<RecoveryGap['reason']>([
  'page_hidden',
  'pagehide',
  'track_ended',
  'device_changed',
  'capture_error',
]);

function parseRecoveryGaps(value: unknown, sessionId: string): RecoveryGap[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecoveryGap => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const gap = item as Partial<RecoveryGap>;
    return (
      typeof gap.id === 'string' &&
      gap.sessionId === sessionId &&
      typeof gap.mutationId === 'string' &&
      Number.isSafeInteger(gap.sequence) &&
      Number(gap.sequence) >= 0 &&
      Number.isSafeInteger(gap.captureStartMs) &&
      Number.isSafeInteger(gap.captureEndMs) &&
      Number(gap.captureEndMs) > Number(gap.captureStartMs) &&
      typeof gap.reason === 'string' &&
      GAP_REASONS.has(gap.reason as RecoveryGap['reason'])
    );
  });
}

export interface UseAgendaMeetingCaptureOptions {
  eventId: string;
  orgId: string;
  persistedEvent: boolean;
  enabled?: boolean;
  client?: AgendaMeetingEdgeClient;
  spool?: EncryptedSegmentSpool;
  segmenterFactory?: (options: CaptureSegmenterOptions) => CaptureSegmenter;
  recoveryStorage?: Storage;
  processingPollIntervalMs?: number;
}

function recoveryKey(orgId: string, eventId: string): string {
  return `${RECOVERY_STORAGE_PREFIX}:${orgId}:${eventId}`;
}

function readRecovery(storage: Storage | undefined, orgId: string, eventId: string): RecoveryRecord | null {
  if (!storage) return null;
  try {
    const value: unknown = JSON.parse(storage.getItem(recoveryKey(orgId, eventId)) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Partial<RecoveryRecord>;
    if (
      record.orgId !== orgId ||
      record.eventId !== eventId ||
      typeof record.sessionId !== 'string' ||
      typeof record.sessionVersion !== 'number' ||
      typeof record.nextSequence !== 'number' ||
      typeof record.activeDurationMs !== 'number'
    ) {
      return null;
    }
    return {
      orgId,
      eventId,
      sessionId: record.sessionId,
      sessionVersion: record.sessionVersion,
      nextSequence: record.nextSequence,
      activeDurationMs: Math.max(0, record.activeDurationMs),
      selectedDeviceId: typeof record.selectedDeviceId === 'string' ? record.selectedDeviceId : null,
      startedAtIso: typeof record.startedAtIso === 'string' ? record.startedAtIso : null,
      captureEnded: record.captureEnded === true,
      pendingGaps: parseRecoveryGaps(record.pendingGaps,record.sessionId),
      expiresAtMs:
        typeof record.expiresAtMs === 'number'
          ? record.expiresAtMs
          : Date.now() + AGENDA_MEETING_SPOOL_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeRecovery(storage: Storage | undefined, record: RecoveryRecord): void {
  if (!storage) return;
  try {
    storage.setItem(recoveryKey(record.orgId, record.eventId), JSON.stringify(record));
  } catch {
    // Recovery metadata is best effort; encrypted audio remains isolated in the spool.
  }
}

function removeRecovery(storage: Storage | undefined, orgId: string, eventId: string): void {
  try {
    storage?.removeItem(recoveryKey(orgId, eventId));
  } catch {
    // Nothing sensitive is copied to a fallback store.
  }
}

function listRecoveries(storage: Storage | undefined): RecoveryRecord[] {
  if (!storage) return [];
  const records: RecoveryRecord[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(`${RECOVERY_STORAGE_PREFIX}:`)) continue;
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const candidate = parsed as Partial<RecoveryRecord>;
      if (typeof candidate.orgId !== 'string' || typeof candidate.eventId !== 'string') continue;
      const recovery = readRecovery(storage, candidate.orgId, candidate.eventId);
      if (recovery) records.push(recovery);
    }
  } catch {
    return records;
  }
  return records;
}

function removeAllRecoveryMetadata(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(`${RECOVERY_STORAGE_PREFIX}:`)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Logout cleanup continues with the encrypted spool if browser storage is restricted.
  }
}

function safeCaptureError(error: unknown): AgendaMeetingSafeError {
  if (error instanceof AgendaMeetingEdgeError) {
    return {
      code: error.code,
      message: error.code,
      retryable: error.retryable,
    };
  }
  const errorRecord = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : null;
  const rawCode = typeof errorRecord?.name === 'string' ? errorRecord.name : '';
  const rawMessage = typeof errorRecord?.message === 'string'
    ? errorRecord.message
    : typeof error === 'string'
      ? error
      : '';

  let code = rawMessage || rawCode || 'meeting_capture_failed';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(rawCode)) {
    code = 'microphone_permission_denied';
  } else if (
    rawMessage === 'supported_audio_capture_unavailable'
    || rawMessage === 'media_devices_unavailable'
  ) {
    code = 'capture_backend_unavailable';
  }
  return { code, message: code, retryable: false };
}

function defaultRecoveryStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function detectCaptureCapabilities(): AgendaMeetingCaptureCapabilities {
  const supportedMimeTypes = listSupportedMediaRecorderMimeTypes();
  const AudioContextConstructor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof window !== 'undefined'
        ? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
  return {
    mediaRecorder: supportedMimeTypes.length > 0,
    audioWorkletWav: Boolean(AudioContextConstructor && typeof AudioWorkletNode !== 'undefined'),
    encryptedIndexedDb: Boolean(globalThis.crypto?.subtle && globalThis.indexedDB),
    supportedMimeTypes,
  };
}

export function useAgendaMeetingCapture(
  options: UseAgendaMeetingCaptureOptions,
): AgendaMeetingCaptureController {
  const [state, dispatch] = useReducer(
    agendaMeetingCaptureReducer,
    INITIAL_AGENDA_MEETING_CAPTURE_STATE,
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputLevel, setInputLevel] = useState<number | null>(null);
  const [preferredDeviceId, setPreferredDeviceId] = useState<string | null>(null);
  const capabilities = useMemo(detectCaptureCapabilities, []);
  const client = useMemo(() => options.client ?? new AgendaMeetingEdgeClient(), [options.client]);
  const spoolRef = useRef<EncryptedSegmentSpool | null>(null);
  if (!spoolRef.current) spoolRef.current = options.spool ?? new EncryptedSegmentSpool();
  const storage = options.recoveryStorage ?? defaultRecoveryStorage();
  const processingPollIntervalMs = options.processingPollIntervalMs ?? PROCESSING_POLL_INTERVAL_MS;
  const stateRef = useRef(state);
  const segmenterRef = useRef<CaptureSegmenter | null>(null);
  const coordinatorRef = useRef<SegmentUploadCoordinator | null>(null);
  const mountedRef = useRef(true);
  const backpressurePausingRef = useRef(false);
  const heartbeatRunningRef = useRef(false);
  const processingRefreshRunningRef = useRef(false);
  const startCancellationRequestedRef = useRef(false);
  const sessionVersionRef = useRef<number | null>(null);
  const activeDurationRef = useRef(0);
  const segmentStatesRef = useRef(new Map<string, CaptureSegmentState>());
  const onBacklogZeroRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    stateRef.current = state;
    sessionVersionRef.current = state.sessionVersion;
    activeDurationRef.current = state.activeDurationMs;
    const existing = readRecovery(storage, options.orgId, options.eventId);
    if (existing && state.sessionId === existing.sessionId) {
      writeRecovery(storage, {
        ...existing,
        sessionVersion: state.sessionVersion ?? existing.sessionVersion,
        activeDurationMs: state.activeDurationMs,
        selectedDeviceId: state.selectedDeviceId ?? existing.selectedDeviceId,
        nextSequence: Math.max(
          existing.nextSequence,
          ...state.segments.map((segment) => segment.sequence + 1),
        ),
      });
    }
  }, [options.eventId, options.orgId, state, storage]);

  const refreshDevices = useCallback(async () => {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    const inputs = (await mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === 'audioinput',
    );
    if (mountedRef.current) setDevices(inputs);
  }, []);

  const selectDevice = useCallback((deviceId: string | null) => {
    if (!['idle', 'capture_interrupted', 'paused'].includes(stateRef.current.phase)) {
      throw new Error('cannot_change_microphone_while_recording');
    }
    setPreferredDeviceId(deviceId);
  }, []);

  const updateRecoveryFromSegment = useCallback(
    (segment: CaptureSegmentState) => {
      const current = readRecovery(storage, options.orgId, options.eventId);
      if (!current || current.sessionId !== segment.sessionId) return;
      writeRecovery(storage, {
        ...current,
        nextSequence: Math.max(current.nextSequence, segment.sequence + 1),
        activeDurationMs: Math.max(current.activeDurationMs, segment.captureEndMs),
      });
    },
    [options.eventId, options.orgId, storage],
  );

  const flushPendingGaps = useCallback(
    async (recovery: RecoveryRecord): Promise<RecoveryRecord> => {
      let current = recovery;
      for (const gap of recovery.pendingGaps) {
        try {
          const result = await client.markLost({
            mutationId: gap.mutationId,
            eventId: recovery.eventId,
            orgId: recovery.orgId,
            sessionId: recovery.sessionId,
            metadata: gap,
          });
          current = {
            ...current,
            sessionVersion: Math.max(current.sessionVersion,result.session.version),
            pendingGaps: current.pendingGaps.filter((candidate) => candidate.id !== gap.id),
          };
          writeRecovery(storage,current);
          if (mountedRef.current && stateRef.current.sessionId === recovery.sessionId) {
            sessionVersionRef.current = result.session.version;
            dispatch({ type: 'session_version',version: result.session.version });
          }
        } catch {
          // Metadata-only gap remains locally replayable; no speech is reconstructed.
        }
      }
      return current;
    },
    [client,storage],
  );

  const registerGap = useCallback(
    async (gap: CaptureGapMarker) => {
      const existing = readRecovery(storage,options.orgId,options.eventId);
      const pendingGap: RecoveryGap = { ...gap,mutationId: createMeetingMutationId() };
      const recovery: RecoveryRecord = existing ?? {
        orgId: options.orgId,
        eventId: options.eventId,
        sessionId: gap.sessionId,
        sessionVersion: sessionVersionRef.current ?? 1,
        nextSequence: gap.sequence + 1,
        activeDurationMs: activeDurationRef.current,
        selectedDeviceId: stateRef.current.selectedDeviceId,
        startedAtIso: stateRef.current.startedAtIso,
        captureEnded: false,
        pendingGaps: [],
        expiresAtMs: Date.now()+AGENDA_MEETING_SPOOL_TTL_MS,
      };
      const updated: RecoveryRecord = {
        ...recovery,
        nextSequence: Math.max(recovery.nextSequence,gap.sequence+1),
        pendingGaps: recovery.pendingGaps.some((item) => item.id === gap.id)
          ? recovery.pendingGaps
          : [...recovery.pendingGaps,pendingGap],
      };
      writeRecovery(storage,updated);
      // Lifecycle callbacks must release the microphone immediately. The
      // metadata-only gap is durable first; its idempotent server receipt can
      // converge in the background or during the next janitor pass.
      void flushPendingGaps(updated);
    },
    [flushPendingGaps,options.eventId,options.orgId,storage],
  );

  const createCoordinator = useCallback(
    (sessionId: string): SegmentUploadCoordinator => {
      coordinatorRef.current?.stop();
      const coordinator = new SegmentUploadCoordinator({
        eventId: options.eventId,
        orgId: options.orgId,
        sessionId,
        transport: client,
        spool: spoolRef.current as EncryptedSegmentSpool,
        onSegmentChange: (segment) => {
          if (!mountedRef.current) return;
          segmentStatesRef.current.set(segment.id, segment);
          dispatch({ type: 'segment_upsert', segment });
          updateRecoveryFromSegment(segment);
        },
        onSegmentDeleted: (segmentId) => {
          segmentStatesRef.current.delete(segmentId);
          if (mountedRef.current) dispatch({ type: 'segment_removed', segmentId });
        },
        onBacklogChange: (backlog) => {
          const nextWorstCase = wouldExceedCaptureBacklog(backlog, {
            bytes: AGENDA_MEETING_MAX_SEGMENT_BYTES,
            durationMs: AGENDA_MEETING_SEGMENT_DURATION_MS,
          });
          if (
            (backlog.isAtCapacity || nextWorstCase.isAtCapacity) &&
            stateRef.current.phase === 'recording' &&
            !backpressurePausingRef.current
          ) {
            backpressurePausingRef.current = true;
            void (async () => {
              try {
                await segmenterRef.current?.pause();
                const current = stateRef.current;
                if (current.sessionId) {
                  const result = await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
                    action: 'pause',
                    mutationId: createMeetingMutationId(),
                    eventId: options.eventId,
                    orgId: options.orgId,
                    sessionId: current.sessionId,
                    expectedVersion: sessionVersionRef.current ?? undefined,
                    payload: { reason: 'backpressure' },
                  });
                  sessionVersionRef.current = result.session.version;
                  dispatch({ type: 'session_version', version: result.session.version });
                }
                dispatch({ type: 'phase', phase: 'backpressure_paused' });
              } catch (error) {
                dispatch({ type: 'error', phase: 'recoverable_error', error: safeCaptureError(error) });
              } finally {
                backpressurePausingRef.current = false;
              }
            })();
          }
          if (backlog.segments === 0) onBacklogZeroRef.current();
        },
      });
      coordinatorRef.current = coordinator;
      return coordinator;
    },
    [client, options.eventId, options.orgId, updateRecoveryFromSegment],
  );

  const createSegmenter = useCallback((): CaptureSegmenter => {
    const factory = options.segmenterFactory ?? ((segmenterOptions) => new CaptureSegmenter(segmenterOptions));
    const segmenter = factory({
      onSegment: async (segment) => {
        const coordinator = coordinatorRef.current;
        if (!coordinator) throw new Error('segment_upload_coordinator_unavailable');
        await coordinator.enqueue(segment);
      },
      onDuration: (activeDurationMs) => {
        activeDurationRef.current = activeDurationMs;
        if (mountedRef.current) dispatch({ type: 'duration', activeDurationMs });
      },
      onInterruption: (reason, error) => {
        if (mountedRef.current) {
          dispatch({
            type: 'interrupted',
            reason,
            error: error ? safeCaptureError(error) : undefined,
          });
        }
        const current = stateRef.current;
        if (current.sessionId) {
          void client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
            action: 'pause',
            mutationId: createMeetingMutationId(),
            eventId: options.eventId,
            orgId: options.orgId,
            sessionId: current.sessionId,
            expectedVersion: sessionVersionRef.current ?? undefined,
            payload: { reason },
          }).then((result) => {
            sessionVersionRef.current = result.session.version;
            if (mountedRef.current) {
              dispatch({ type: 'session_version', version: result.session.version });
            }
          }).catch(() => {
            // Resume/finalize deliberately omit the stale version after an
            // interruption so a dropped pause request remains recoverable.
          });
        }
      },
      onGap: registerGap,
      onLifecycleSignal: (reason) => {
        if (reason === 'device_changed') void refreshDevices();
      },
    });
    segmenterRef.current = segmenter;
    return segmenter;
  }, [client, options.eventId, options.orgId, options.segmenterFactory, refreshDevices, registerGap]);

  const start = useCallback(
    async (input: AgendaMeetingStartInput) => {
      if (!options.enabled && options.enabled !== undefined) throw new Error('meeting_capture_disabled');
      if (!options.persistedEvent || !options.eventId || !options.orgId) {
        throw new Error('persisted_event_required');
      }
      if (!input.participantsInformed || !input.consentVersion.trim()) {
        throw new Error('meeting_consent_required');
      }
      if (stateRef.current.phase !== 'idle') throw new Error('meeting_capture_already_started');

      startCancellationRequestedRef.current = false;
      dispatch({ type: 'phase', phase: 'requesting_permission' });
      const segmenter = createSegmenter();
      let createdSession: AgendaMeetingStartResult['session'] | null = null;
      try {
        const prepared = await segmenter.prepare(input.deviceId ?? preferredDeviceId ?? undefined);
        if (startCancellationRequestedRef.current) {
          throw new Error('meeting_capture_cancelled');
        }
        await refreshDevices();
        dispatch({ type: 'phase', phase: 'starting' });
        const payload: AgendaMeetingJson = {
          consentConfirmed: true,
          consentPolicyVersion: input.consentVersion.trim(),
          participantsInformed: input.participantsInformed,
          capture: {
            backend: prepared.backend,
            mimeType: prepared.mimeType,
            segmentDurationMs: 30_000,
            audioPersistence: 'ephemeral_encrypted_only',
          },
        };
        const result = await client.control<AgendaMeetingJson, AgendaMeetingStartResult>({
          action: 'start',
          mutationId: createMeetingMutationId(),
          eventId: options.eventId,
          orgId: options.orgId,
          payload,
        });
        const session = result.session;
        createdSession = session;
        sessionVersionRef.current = session.version;
        if (startCancellationRequestedRef.current) {
          try {
            await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
              action: 'cancel',
              mutationId: createMeetingMutationId(),
              eventId: options.eventId,
              orgId: options.orgId,
              sessionId: session.id,
              payload: {},
            });
          } catch {
            writeRecovery(storage, {
              orgId: options.orgId,
              eventId: options.eventId,
              sessionId: session.id,
              sessionVersion: session.version,
              nextSequence: 0,
              activeDurationMs: 0,
              selectedDeviceId: prepared.selectedDeviceId,
              startedAtIso: session.startedAt ?? new Date().toISOString(),
              captureEnded: false,
              pendingGaps: [],
              expiresAtMs: Date.now() + AGENDA_MEETING_SPOOL_TTL_MS,
            });
          }
          throw new Error('meeting_capture_cancelled');
        }
        activeDurationRef.current = 0;
        segmentStatesRef.current.clear();
        createCoordinator(session.id);
        const startedAtIso = session.startedAt ?? new Date().toISOString();
        dispatch({
          type: 'session_started',
          sessionId: session.id,
          sessionVersion: session.version,
          startedAtIso,
          backend: prepared.backend,
          mimeType: prepared.mimeType,
          selectedDeviceId: prepared.selectedDeviceId,
        });
        setPreferredDeviceId(prepared.selectedDeviceId);
        writeRecovery(storage, {
          orgId: options.orgId,
          eventId: options.eventId,
          sessionId: session.id,
          sessionVersion: session.version,
          nextSequence: 0,
          activeDurationMs: 0,
          selectedDeviceId: prepared.selectedDeviceId,
          startedAtIso,
          captureEnded: false,
          pendingGaps: [],
          expiresAtMs: Date.now() + AGENDA_MEETING_SPOOL_TTL_MS,
        });
        // Persist the server identity before opening the recorder. A browser or
        // backend failure after session creation can then be cancelled or
        // recovered without leaving an invisible recording session behind.
        await segmenter.start({ sessionId: session.id, sequenceStart: 0 });
      } catch (error) {
        await segmenter.abort().catch(() => undefined);
        segmenterRef.current = null;
        if (startCancellationRequestedRef.current) {
          dispatch({ type: 'reset' });
          throw new Error('meeting_capture_cancelled');
        }
        let serverCleanupFailed = false;
        if (createdSession) {
          try {
            await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
              action: 'cancel',
              mutationId: createMeetingMutationId(),
              eventId: options.eventId,
              orgId: options.orgId,
              sessionId: createdSession.id,
              payload: {},
            });
            await coordinatorRef.current?.purgeSession();
            coordinatorRef.current = null;
            removeRecovery(storage, options.orgId, options.eventId);
            dispatch({ type: 'reset' });
          } catch {
            serverCleanupFailed = true;
          }
        }
        dispatch({
          type: 'error',
          phase:
            serverCleanupFailed
            || (error instanceof AgendaMeetingEdgeError && error.retryable)
              ? 'recoverable_error'
              : 'fatal_error',
          error: safeCaptureError(error),
        });
        throw error;
      }
    },
    [
      client,
      createCoordinator,
      createSegmenter,
      options.enabled,
      options.eventId,
      options.orgId,
      options.persistedEvent,
      preferredDeviceId,
      refreshDevices,
      storage,
    ],
  );

  const pause = useCallback(async () => {
    const current = stateRef.current;
    const segmenter = segmenterRef.current;
    if (current.phase !== 'recording' || !current.sessionId || !segmenter) {
      throw new Error('meeting_capture_not_recording');
    }
    try {
      await segmenter.pause();
      const result = await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
        action: 'pause',
        mutationId: createMeetingMutationId(),
        eventId: options.eventId,
        orgId: options.orgId,
        sessionId: current.sessionId,
        expectedVersion: sessionVersionRef.current ?? undefined,
        payload: { reason: 'user' },
      });
      sessionVersionRef.current = result.session.version;
      dispatch({ type: 'session_version', version: result.session.version });
      dispatch({ type: 'phase', phase: 'paused' });
    } catch (error) {
      if (segmenter.currentMode !== 'recording') {
        dispatch({ type: 'error', phase: 'recoverable_error', error: safeCaptureError(error) });
      }
      throw error;
    }
  }, [client, options.eventId, options.orgId]);

  const resume = useCallback(async () => {
    const current = stateRef.current;
    if (
      !['paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(
        current.phase,
      ) ||
      !current.sessionId
    ) {
      throw new Error('meeting_capture_not_resumable');
    }
    let segmenter = segmenterRef.current;
    let prepared = segmenter?.preparedCapture ?? null;
    let createdFreshSegmenter = false;
    let serverResumed = false;
    try {
      if (!segmenter || ['stopped', 'interrupted'].includes(segmenter.currentMode)) {
        dispatch({ type: 'phase', phase: 'requesting_permission' });
        segmenter = createSegmenter();
        createdFreshSegmenter = true;
        prepared = await segmenter.prepare(preferredDeviceId ?? current.selectedDeviceId ?? undefined);
        await refreshDevices();
      }
      const result = await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
        action: 'resume',
        mutationId: createMeetingMutationId(),
        eventId: options.eventId,
        orgId: options.orgId,
        sessionId: current.sessionId,
        expectedVersion: ['capture_interrupted', 'recoverable_error'].includes(current.phase)
          ? undefined
          : sessionVersionRef.current ?? undefined,
        payload: {
          resumedAfterInterruption: ['capture_interrupted', 'recoverable_error'].includes(current.phase),
        },
      });
      serverResumed = true;
      if (segmenter.currentMode === 'paused') {
        await segmenter.resume();
      } else {
        const recovery = readRecovery(storage,options.orgId,options.eventId);
        const sequenceStart = Math.max(
          recovery?.nextSequence ?? 0,
          0,
          ...current.segments.map((segment) => segment.sequence + 1),
        );
        await segmenter.start({
          sessionId: current.sessionId,
          sequenceStart,
          initialActiveDurationMs: current.activeDurationMs,
        });
      }
      sessionVersionRef.current = result.session.version;
      dispatch({ type: 'session_version', version: result.session.version });
      dispatch({ type: 'phase', phase: 'recording' });
      if (prepared?.selectedDeviceId) setPreferredDeviceId(prepared.selectedDeviceId);
    } catch (error) {
      if (createdFreshSegmenter || serverResumed) {
        await segmenter?.abort().catch(() => undefined);
        segmenterRef.current = null;
      }
      if (serverResumed) {
        try {
          const paused = await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
            action: 'pause',
            mutationId: createMeetingMutationId(),
            eventId: options.eventId,
            orgId: options.orgId,
            sessionId: current.sessionId,
            payload: { reason: 'capture_error' },
          });
          sessionVersionRef.current = paused.session.version;
        } catch {
          // A subsequent resume/finalize omits the potentially stale version.
        }
      }
      dispatch({ type: 'error', phase: 'recoverable_error', error: safeCaptureError(error) });
      throw error;
    }
  }, [client, createSegmenter, options.eventId, options.orgId, preferredDeviceId, refreshDevices,storage]);

  const finish = useCallback(
    async ({ allowPartial }: { allowPartial: boolean }) => {
      const current = stateRef.current;
      if (
        !['recording', 'paused', 'backpressure_paused', 'capture_interrupted', 'recoverable_error'].includes(current.phase) ||
        !current.sessionId
      ) {
        throw new Error('meeting_capture_not_finalizable');
      }
      dispatch({ type: 'phase', phase: 'finalizing' });
      try {
        const segmenter = segmenterRef.current;
        segmenterRef.current = null;
        await segmenter?.stop();
        const recovery = readRecovery(storage, options.orgId, options.eventId);
        const pendingSegments = await spoolRef.current?.list(current.sessionId) ?? [];
        const knownSegments = [
          ...segmentStatesRef.current.values(),
          ...pendingSegments.map((descriptor) => descriptor.metadata),
        ];
        const lastSequence = Math.max(
          -1,
          (recovery?.nextSequence ?? 0) - 1,
          ...knownSegments.map((segment) => segment.sequence),
        );
        const activeDurationMs = Math.max(
          activeDurationRef.current,
          recovery?.activeDurationMs ?? 0,
          ...knownSegments.map((segment) => segment.captureEndMs),
        );
        let result: AgendaMeetingStateResult;
        try {
          result = await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
            action: 'finalize',
            mutationId: createMeetingMutationId(),
            eventId: options.eventId,
            orgId: options.orgId,
            sessionId: current.sessionId,
            expectedVersion: ['capture_interrupted', 'recoverable_error'].includes(current.phase)
              ? undefined
              : sessionVersionRef.current ?? undefined,
            payload: {
              allowPartial,
              lastSequence,
              activeDurationMs,
            },
          });
        } catch (controlError) {
          const detail = await client.detail({
            mutationId: createMeetingMutationId(),
            eventId: options.eventId,
            orgId: options.orgId,
            sessionId: current.sessionId,
          }).catch(() => null);
          if (!detail || detail.session.captureState !== 'ended') throw controlError;
          result = { session: detail.session };
        }
        sessionVersionRef.current = result.session.version;
        dispatch({ type: 'session_version', version: result.session.version });
        dispatch({ type: 'phase', phase: 'awaiting_transcripts' });
        writeRecovery(storage, {
          orgId: options.orgId,
          eventId: options.eventId,
          sessionId: current.sessionId,
          sessionVersion: result.session.version,
          nextSequence: lastSequence + 1,
          activeDurationMs,
          selectedDeviceId: current.selectedDeviceId,
          startedAtIso: current.startedAtIso,
          captureEnded: true,
          pendingGaps: recovery?.pendingGaps ?? [],
          expiresAtMs: recovery?.expiresAtMs ?? Date.now() + AGENDA_MEETING_SPOOL_TTL_MS,
        });
      } catch (error) {
        dispatch({ type: 'error', phase: 'recoverable_error', error: safeCaptureError(error) });
        throw error;
      }
    },
    [client, options.eventId, options.orgId, storage],
  );

  const cancel = useCallback(async () => {
    startCancellationRequestedRef.current = true;
    const current = stateRef.current;
    await segmenterRef.current?.abort().catch(() => undefined);
    segmenterRef.current = null;
    if (!current.sessionId) {
      coordinatorRef.current?.stop();
      coordinatorRef.current = null;
      dispatch({ type: 'reset' });
      return;
    }
    await client.control<AgendaMeetingJson, AgendaMeetingStateResult>({
      action: 'cancel',
      mutationId: createMeetingMutationId(),
      eventId: options.eventId,
      orgId: options.orgId,
      sessionId: current.sessionId,
      payload: {},
    });
    await coordinatorRef.current?.purgeSession();
    coordinatorRef.current = null;
    removeRecovery(storage, options.orgId, options.eventId);
    dispatch({ type: 'reset' });
  }, [client, options.eventId, options.orgId, storage]);

  const retrySegment = useCallback(async (segmentId: string) => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) throw new Error('segment_upload_coordinator_unavailable');
    await coordinator.retry(segmentId);
  }, []);

  const purge = useCallback(async () => {
    const phase = stateRef.current.phase;
    if (['recording', 'paused', 'backpressure_paused', 'finalizing'].includes(phase)) {
      throw new Error('cannot_purge_active_meeting');
    }
    await coordinatorRef.current?.purgeSession();
    coordinatorRef.current = null;
    removeRecovery(storage, options.orgId, options.eventId);
    dispatch({ type: 'reset' });
  }, [options.eventId, options.orgId, storage]);

  const purgeForLogout = useCallback(async () => {
    await segmenterRef.current?.abort().catch(() => undefined);
    segmenterRef.current = null;
    coordinatorRef.current?.stop();
    coordinatorRef.current = null;
    await spoolRef.current?.purgeAll().catch(() => undefined);
    segmentStatesRef.current.clear();
    removeAllRecoveryMetadata(storage);
    if (mountedRef.current) dispatch({ type: 'reset' });
  }, [storage]);

  const refreshProcessingState = useCallback(async () => {
    if (processingRefreshRunningRef.current) return;
    const recovery = readRecovery(storage, options.orgId, options.eventId);
    const sessionId = stateRef.current.sessionId ?? recovery?.sessionId ?? null;
    const processingPhase = ['awaiting_transcripts', 'analysis_queued'].includes(
      stateRef.current.phase,
    );
    if (!sessionId || (!recovery?.captureEnded && !processingPhase)) return;
    const pending = await spoolRef.current?.list(sessionId) ?? [];
    if (pending.some((descriptor) => descriptor.metadata.status !== 'transcribed')) return;
    processingRefreshRunningRef.current = true;
    try {
      const detail = await client.detail({
        mutationId: createMeetingMutationId(),
        orgId: options.orgId,
        eventId: options.eventId,
        sessionId,
      });
      sessionVersionRef.current = detail.session.version;
      if (mountedRef.current) dispatch({ type: 'session_version', version: detail.session.version });
      const processingState = detail.session.processingState;
      const phase =
        processingState === 'review_required'
          ? 'review_required'
          : processingState === 'transcript_ready_with_gaps'
            ? 'review_required'
          : processingState === 'completed'
            ? 'completed'
            : processingState === 'analysis_queued' || processingState === 'analyzing'
              ? 'analysis_queued'
              : processingState === 'failed'
                ? 'recoverable_error'
                : null;
      if (!phase) return;
      if (mountedRef.current) {
        if (phase === 'recoverable_error') {
          dispatch({
            type: 'error',
            phase,
            error: { code: detail.session.errorCode ?? 'meeting_processing_failed', message: detail.session.errorCode ?? 'meeting_processing_failed', retryable: detail.session.retryable },
          });
        } else {
          dispatch({ type: 'phase', phase });
        }
      }
      removeRecovery(storage, options.orgId, options.eventId);
    } catch {
      // A later poll retries without masking the persisted server state.
    } finally {
      processingRefreshRunningRef.current = false;
    }
  }, [client, options.eventId, options.orgId, storage]);

  onBacklogZeroRef.current = () => void refreshProcessingState();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recoveries = listRecoveries(storage);
      const knownSessionIds = new Set(recoveries.map((recovery) => recovery.sessionId));
      for (const recovery of recoveries) {
        if (cancelled) return;
        const recoveredWithGaps = await flushPendingGaps(recovery);
        if (recovery.expiresAtMs <= Date.now()) {
          const descriptors = await spoolRef.current?.list(recovery.sessionId) ?? [];
          let fullyRegistered = true;
          for (const descriptor of descriptors) {
            try {
              await client.markLost({
                mutationId: createMeetingMutationId(),
                eventId: recovery.eventId,
                orgId: recovery.orgId,
                sessionId: recovery.sessionId,
                metadata: descriptor.metadata,
              });
              await spoolRef.current?.delete(descriptor.metadata.id);
            } catch {
              fullyRegistered = false;
            }
          }
          if (fullyRegistered && recoveredWithGaps.pendingGaps.length===0) {
            removeRecovery(storage,recovery.orgId,recovery.eventId);
          }
          continue;
        }
        const janitor = new SegmentUploadCoordinator({
          eventId: recovery.eventId,
          orgId: recovery.orgId,
          sessionId: recovery.sessionId,
          transport: client,
          spool: spoolRef.current as EncryptedSegmentSpool,
        });
        await janitor.runJanitor();
        janitor.stop();
      }
      await spoolRef.current?.janitor(undefined, undefined, knownSessionIds);
      await spoolRef.current?.cleanupOrphans();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, flushPendingGaps, storage]);

  useEffect(() => {
    mountedRef.current = true;
    const recovery = readRecovery(storage, options.orgId, options.eventId);
    if (!recovery || !options.persistedEvent || options.enabled === false) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await client.detail({
          mutationId: createMeetingMutationId(),
          orgId: options.orgId,
          eventId: options.eventId,
          sessionId: recovery.sessionId,
        });
        if (cancelled || !mountedRef.current) return;
        sessionVersionRef.current = detail.session.version;
        activeDurationRef.current = Math.max(
          detail.session.activeDurationMs,
          recovery.activeDurationMs,
        );
        const coordinator = createCoordinator(recovery.sessionId);
        const segments = await coordinator.rehydrate();
        segmentStatesRef.current = new Map(segments.map((segment) => [segment.id, segment]));
        await coordinator.runJanitor();
        dispatch({
          type: 'session_rehydrated',
          sessionId: recovery.sessionId,
          sessionVersion: detail.session.version,
          startedAtIso: detail.session.startedAt ?? recovery.startedAtIso,
          phase:
            recovery.captureEnded || detail.session.captureState === 'ended'
              ? 'awaiting_transcripts'
              : detail.session.captureState === 'paused'
                ? 'paused'
                : 'capture_interrupted',
          selectedDeviceId: recovery.selectedDeviceId,
          activeDurationMs: Math.max(detail.session.activeDurationMs, recovery.activeDurationMs),
        });
        setPreferredDeviceId(recovery.selectedDeviceId);
        if (recovery.captureEnded || detail.session.captureState === 'ended') {
          void refreshProcessingState();
        }
      } catch {
        // Keep recovery metadata and encrypted spool intact for an explicit later retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    client,
    createCoordinator,
    options.enabled,
    options.eventId,
    options.orgId,
    options.persistedEvent,
    refreshProcessingState,
    storage,
  ]);

  useEffect(() => {
    if (!['awaiting_transcripts', 'analysis_queued'].includes(state.phase)) return;
    void refreshProcessingState();
    const timer = setInterval(() => void refreshProcessingState(), processingPollIntervalMs);
    return () => clearInterval(timer);
  }, [processingPollIntervalMs, refreshProcessingState, state.phase]);

  useEffect(() => {
    if (state.phase !== 'recording') {
      setInputLevel(null);
      return;
    }
    const timer = setInterval(() => {
      const level = segmenterRef.current?.readInputLevel() ?? null;
      if (mountedRef.current) setInputLevel(level);
    }, INPUT_LEVEL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (!NAVIGATION_GUARDED_PHASES.has(state.phase) || typeof window === 'undefined') return;
    const guardNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guardNavigation);
    return () => window.removeEventListener('beforeunload', guardNavigation);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'recording' || !state.sessionId) return;
    const timer = setInterval(() => {
      if (heartbeatRunningRef.current) return;
      heartbeatRunningRef.current = true;
      const current = stateRef.current;
      void client
        .control<AgendaMeetingJson, AgendaMeetingStateResult>({
          action: 'heartbeat',
          mutationId: createMeetingMutationId(),
          eventId: options.eventId,
          orgId: options.orgId,
          sessionId: current.sessionId ?? undefined,
          expectedVersion: sessionVersionRef.current ?? undefined,
          payload: { activeDurationMs: current.activeDurationMs },
        })
        .then((result) => {
          sessionVersionRef.current = result.session.version;
          if (mountedRef.current) dispatch({ type: 'session_version', version: result.session.version });
        })
        .catch(() => undefined)
        .finally(() => {
          heartbeatRunningRef.current = false;
        });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [client, options.eventId, options.orgId, state.phase, state.sessionId]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') void purgeForLogout();
    });
    return () => data.subscription.unsubscribe();
  }, [purgeForLogout]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      const coordinator = coordinatorRef.current;
      const segmenter = segmenterRef.current;
      if (!segmenter) {
        coordinator?.stop();
        return;
      }
      const termination = segmenter.currentMode === 'recording'
        ? segmenter.interrupt('pagehide')
        : segmenter.stop();
      void termination
        .catch(() => undefined)
        .finally(() => coordinator?.stop());
    },
    [],
  );

  return {
    state,
    capabilities,
    mic: {
      devices,
      selectedDeviceId: preferredDeviceId ?? state.selectedDeviceId,
      inputLevel,
    },
    refreshDevices,
    selectDevice,
    start,
    pause,
    resume,
    finish,
    cancel,
    retrySegment,
    purge,
    purgeForLogout,
  };
}

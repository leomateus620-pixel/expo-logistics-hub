import { supabase } from '@/integrations/supabase/client';
import {
  AGENDA_MEETING_MAX_SEGMENT_BYTES,
  type AgendaMeetingControlAction,
  type AgendaMeetingControlEnvelope,
  type AgendaMeetingControlRequest,
  type AgendaMeetingDetailResult,
  type AgendaMeetingCreateRevisionInput,
  type AgendaMeetingDeleteResult,
  type AgendaMeetingJson,
  type AgendaMeetingListResult,
  type AgendaMeetingReviewMinutesInput,
  type AgendaMeetingSegmentReceiptResult,
  type AgendaMeetingStateResult,
  type AgendaMeetingUpdateActionInput,
  type AgendaMeetingUploadInput,
  type AgendaMeetingUploadResult,
  type CaptureSegmentMetadata,
  type CaptureGapMarker,
  type SegmentReceiptStatus,
  type SegmentTranscriptionReceipt,
} from '../types';
import { isAllowedAudioMimeType, normalizeAudioMimeType } from '../capture/mime';

const CONTROL_FUNCTION = 'agenda-meeting-control';
const TRANSCRIBE_FUNCTION = 'agenda-meeting-transcribe-segment';
const CONTROL_TIMEOUT_MS = 20_000;
const SEGMENT_UPLOAD_TIMEOUT_MS = 60_000;

export class AgendaMeetingEdgeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(code: string, retryable: boolean, status: number | null = null) {
    super(code);
    this.name = 'AgendaMeetingEdgeError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export interface AgendaMeetingEdgeClientOptions {
  supabaseUrl?: string;
  publishableKey?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string>;
}

interface ErrorPayload {
  error?: string;
  code?: string;
  retryable?: boolean;
}

interface UploadPayload {
  ok: true;
  status: SegmentReceiptStatus;
  canonicalReceiptId?: string | null;
  retryAfterMs?: number | null;
  receipt?: SegmentTranscriptionReceipt;
  errorCode?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControlEnvelope<TResult>(
  value: unknown,
  expectedAction: AgendaMeetingControlAction,
): value is AgendaMeetingControlEnvelope<TResult> {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.action === expectedAction &&
    Object.prototype.hasOwnProperty.call(value, 'data')
  );
}

const RECEIPT_STATUSES = new Set<SegmentReceiptStatus>([
  'accepted',
  'processing',
  'transcribed',
  'retryable_error',
  'terminal_error',
]);

function isSegmentReceiptStatus(value: unknown): value is SegmentReceiptStatus {
  return typeof value === 'string' && RECEIPT_STATUSES.has(value as SegmentReceiptStatus);
}

async function defaultGetAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new AgendaMeetingEdgeError('session_expired', false, 401);
  }
  return data.session.access_token;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('agenda_meeting_request_timeout'), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new AgendaMeetingEdgeError('request_timeout', true, 408);
    }
    throw new AgendaMeetingEdgeError('network_error', true, null);
  } finally {
    clearTimeout(timeout);
  }
}

function shouldReplayControl(error: AgendaMeetingEdgeError): boolean {
  return error.code === 'request_timeout'
    || error.code === 'network_error'
    || (error.status !== null && error.status >= 500);
}

function classifyHttpError(status: number, payload: unknown): AgendaMeetingEdgeError {
  const body = isRecord(payload) ? (payload as ErrorPayload) : {};
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : 'request_failed';
  const retryable =
    typeof body.retryable === 'boolean' ? body.retryable : status === 408 || status === 429 || status >= 500;
  return new AgendaMeetingEdgeError(code, retryable, status);
}

function requireConfiguration(value: string | undefined, code: string): string {
  if (!value) throw new AgendaMeetingEdgeError(code, false);
  return value.replace(/\/+$/, '');
}

export class AgendaMeetingEdgeClient {
  private readonly supabaseUrl: string;
  private readonly publishableKey: string;
  private readonly fetcher: typeof fetch;
  private readonly getAccessToken: () => Promise<string>;

  constructor(options: AgendaMeetingEdgeClientOptions = {}) {
    this.supabaseUrl = requireConfiguration(
      options.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL,
      'supabase_url_missing',
    );
    this.publishableKey = requireConfiguration(
      options.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'supabase_key_missing',
    );
    this.fetcher = options.fetcher ?? fetch;
    this.getAccessToken = options.getAccessToken ?? defaultGetAccessToken;
  }

  async control<TPayload extends AgendaMeetingJson, TResult>(
    request: AgendaMeetingControlRequest<TPayload>,
  ): Promise<TResult> {
    const token = await this.getAccessToken();
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: this.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          this.fetcher,
          `${this.supabaseUrl}/functions/v1/${CONTROL_FUNCTION}`,
          init,
          CONTROL_TIMEOUT_MS,
        );
        const payload = await safeJson(response);
        if (!response.ok) throw classifyHttpError(response.status, payload);
        if (!isControlEnvelope<TResult>(payload, request.action)) {
          throw new AgendaMeetingEdgeError('invalid_control_response', false, response.status);
        }
        return payload.data;
      } catch (error) {
        if (
          attempt === 0
          && error instanceof AgendaMeetingEdgeError
          && shouldReplayControl(error)
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new AgendaMeetingEdgeError('request_failed', true);
  }

  async uploadSegment(input: AgendaMeetingUploadInput): Promise<AgendaMeetingUploadResult> {
    const { metadata } = input.segment;
    const mimeType = normalizeAudioMimeType(metadata.mimeType);
    if (!isAllowedAudioMimeType(mimeType)) {
      throw new AgendaMeetingEdgeError('unsupported_audio_mime_type', false);
    }
    if (input.segment.audio.size !== metadata.bytes) {
      throw new AgendaMeetingEdgeError('segment_size_mismatch', false);
    }
    if (metadata.bytes <= 0 || metadata.bytes > AGENDA_MEETING_MAX_SEGMENT_BYTES) {
      throw new AgendaMeetingEdgeError('segment_size_out_of_bounds', false);
    }

    const token = await this.getAccessToken();
    const response = await fetchWithTimeout(
      this.fetcher,
      `${this.supabaseUrl}/functions/v1/${TRANSCRIBE_FUNCTION}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: this.publishableKey,
          'Content-Type': mimeType,
          'X-Meeting-Session-Id': metadata.sessionId,
          'X-Meeting-Segment-Id': metadata.id,
          'X-Meeting-Sequence': String(metadata.sequence),
          'X-Meeting-Capture-Start-Ms': String(metadata.captureStartMs),
          'X-Meeting-Capture-End-Ms': String(metadata.captureEndMs),
          'X-Meeting-Sha256': metadata.sha256,
          'X-Meeting-Mutation-Id': input.mutationId,
        },
        body: input.segment.audio,
      },
      SEGMENT_UPLOAD_TIMEOUT_MS,
    );
    const payload = await safeJson(response);
    if (!response.ok) throw classifyHttpError(response.status, payload);
    if (!isRecord(payload) || payload.ok !== true || !isSegmentReceiptStatus(payload.status)) {
      throw new AgendaMeetingEdgeError('invalid_transcription_response', false, response.status);
    }
    const typedPayload = payload as unknown as UploadPayload;
    const receipt = typedPayload.receipt ?? {
      segmentId: metadata.id,
      sequence: metadata.sequence,
      status: typedPayload.status,
      canonicalReceiptId: typedPayload.canonicalReceiptId ?? null,
      retryAfterMs: typedPayload.retryAfterMs ?? null,
      errorCode: typedPayload.errorCode ?? null,
    };
    if (receipt.segmentId !== metadata.id || receipt.sequence !== metadata.sequence) {
      throw new AgendaMeetingEdgeError('transcription_receipt_mismatch', false, response.status);
    }
    return { receipt };
  }

  list(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
  }): Promise<AgendaMeetingListResult> {
    return this.control({ ...input, action: 'list', payload: {} });
  }

  detail(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
  }): Promise<AgendaMeetingDetailResult> {
    return this.control({ ...input, action: 'detail', payload: {} });
  }

  getSegmentReceipt(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    segmentId: string;
    sequence: number;
  }): Promise<AgendaMeetingSegmentReceiptResult> {
    const { segmentId, sequence, ...request } = input;
    return this.control({
      ...request,
      action: 'get_segment_receipt',
      payload: { segmentId, sequence },
    });
  }

  markLost(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    metadata: CaptureSegmentMetadata | CaptureGapMarker;
  }): Promise<{ session: { id: string; version: number } }> {
    const { metadata, ...request } = input;
    return this.control({
      ...request,
      action: 'mark_lost',
      payload: {
        sequence: metadata.sequence,
        segmentId: metadata.id,
        captureStartMs: metadata.captureStartMs,
        captureEndMs: metadata.captureEndMs,
        ...('sha256' in metadata ? { sha256: metadata.sha256 } : {}),
        ...('mimeType' in metadata ? { mimeType: metadata.mimeType } : {}),
        ...('reason' in metadata ? { reason: metadata.reason } : {}),
      },
    });
  }

  createRevision(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    expectedVersion: number;
    revision: AgendaMeetingCreateRevisionInput;
  }): Promise<AgendaMeetingDetailResult> {
    const { revision, ...request } = input;
    return this.control<AgendaMeetingJson, AgendaMeetingDetailResult>({
      ...request,
      action: 'create_revision',
      payload: { ...revision },
    });
  }

  reviewMinutes(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    expectedVersion: number;
    review: AgendaMeetingReviewMinutesInput;
  }): Promise<AgendaMeetingDetailResult> {
    const { review, ...request } = input;
    return this.control<AgendaMeetingJson, AgendaMeetingDetailResult>({
      ...request,
      action: 'review_minutes',
      payload: { ...review },
    });
  }

  updateAction(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    expectedVersion: number;
    update: AgendaMeetingUpdateActionInput;
  }): Promise<AgendaMeetingDetailResult> {
    const { update, ...request } = input;
    return this.control<AgendaMeetingJson, AgendaMeetingDetailResult>({
      ...request,
      action: 'update_action',
      payload: { ...update },
    });
  }

  deleteMeeting(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    expectedVersion: number;
  }): Promise<AgendaMeetingDeleteResult> {
    return this.control<AgendaMeetingJson, AgendaMeetingDeleteResult>({
      ...input,
      action: 'delete',
      payload: {},
    });
  }

  retryAnalysis(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    expectedVersion: number;
  }): Promise<AgendaMeetingStateResult> {
    return this.control<AgendaMeetingJson, AgendaMeetingStateResult>({
      ...input,
      action: 'retry_analysis',
      payload: {},
    });
  }
}

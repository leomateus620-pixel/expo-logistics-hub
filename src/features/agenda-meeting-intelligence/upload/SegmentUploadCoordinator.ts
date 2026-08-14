import { AgendaMeetingEdgeError } from '../api/AgendaMeetingEdgeClient';
import { computeCaptureBacklog } from '../capture/backlog';
import { createMeetingMutationId } from '../capture/identity';
import {
  EncryptedSegmentSpool,
  EncryptedSegmentUnavailableError,
  type SpoolSegmentDescriptor,
} from '../spool/EncryptedSegmentSpool';
import {
  AGENDA_MEETING_MAX_RETRY_WINDOW_MS,
  AGENDA_MEETING_MAX_UPLOAD_ATTEMPTS,
  type AgendaMeetingSegmentReceiptResult,
  type AgendaMeetingUploadInput,
  type AgendaMeetingUploadResult,
  type CapturedAudioSegment,
  type CaptureBacklogState,
  type CaptureSegmentMetadata,
  type CaptureSegmentStatus,
  type CaptureSegmentState,
  type SegmentTranscriptionReceipt,
} from '../types';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_CONCURRENCY = 3;

export interface AgendaMeetingSegmentTransport {
  uploadSegment(input: AgendaMeetingUploadInput): Promise<AgendaMeetingUploadResult>;
  getSegmentReceipt(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    segmentId: string;
    sequence: number;
  }): Promise<AgendaMeetingSegmentReceiptResult>;
  markLost(input: {
    mutationId: string;
    eventId: string;
    orgId: string;
    sessionId: string;
    metadata: CaptureSegmentMetadata;
  }): Promise<{ session: { id: string; version: number } }>;
}

export interface SegmentUploadCoordinatorOptions {
  eventId: string;
  orgId: string;
  sessionId: string;
  transport: AgendaMeetingSegmentTransport;
  spool?: EncryptedSegmentSpool;
  maxAttempts?: number;
  retryWindowMs?: number;
  pollIntervalMs?: number;
  maxConcurrency?: number;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  crypto?: Crypto;
  onSegmentChange?: (segment: CaptureSegmentState) => void;
  onSegmentDeleted?: (segmentId: string) => void;
  onBacklogChange?: (backlog: CaptureBacklogState) => void;
}

function safeErrorCode(error: unknown): string {
  if (error instanceof AgendaMeetingEdgeError) return error.code;
  if (error instanceof EncryptedSegmentUnavailableError) return error.code;
  return 'segment_processing_failed';
}

function isRetryable(error: unknown): boolean {
  return error instanceof AgendaMeetingEdgeError && error.retryable;
}

export class SegmentUploadCoordinator {
  private readonly eventId: string;
  private readonly orgId: string;
  private readonly sessionId: string;
  private readonly transport: AgendaMeetingSegmentTransport;
  private readonly spool: EncryptedSegmentSpool;
  private readonly maxAttempts: number;
  private readonly retryWindowMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrency: number;
  private readonly now: () => number;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly crypto: Crypto;
  private readonly onSegmentChange?: (segment: CaptureSegmentState) => void;
  private readonly onSegmentDeleted?: (segmentId: string) => void;
  private readonly onBacklogChange?: (backlog: CaptureBacklogState) => void;
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private readonly running = new Set<string>();
  private stopped = false;
  private idleResolvers: Array<() => void> = [];

  constructor(options: SegmentUploadCoordinatorOptions) {
    this.eventId = options.eventId;
    this.orgId = options.orgId;
    this.sessionId = options.sessionId;
    this.transport = options.transport;
    this.spool = options.spool ?? new EncryptedSegmentSpool();
    this.maxAttempts = options.maxAttempts ?? AGENDA_MEETING_MAX_UPLOAD_ATTEMPTS;
    this.retryWindowMs = options.retryWindowMs ?? AGENDA_MEETING_MAX_RETRY_WINDOW_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.now = options.now ?? (() => Date.now());
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.crypto = options.crypto ?? globalThis.crypto;
    this.onSegmentChange = options.onSegmentChange;
    this.onSegmentDeleted = options.onSegmentDeleted;
    this.onBacklogChange = options.onBacklogChange;
    if (!this.eventId || !this.orgId || !this.sessionId) throw new Error('upload_context_required');
    if (this.maxAttempts <= 0 || this.retryWindowMs <= 0 || this.maxConcurrency <= 0) {
      throw new Error('invalid_upload_policy');
    }
  }

  async enqueue(segment: CapturedAudioSegment): Promise<CaptureSegmentState> {
    if (this.stopped) throw new Error('upload_coordinator_stopped');
    if (segment.metadata.sessionId !== this.sessionId) throw new Error('segment_session_mismatch');
    const descriptor = await this.spool.put(segment);
    this.emitSegment(descriptor.metadata);
    await this.emitBacklog();
    this.queueSegment(descriptor.metadata.id);
    return descriptor.metadata;
  }

  async rehydrate(): Promise<CaptureSegmentState[]> {
    const descriptors = await this.spool.list(this.sessionId);
    for (const descriptor of descriptors) {
      this.emitSegment(descriptor.metadata);
      if (
        descriptor.metadata.status === 'lost'
        || descriptor.metadata.status === 'terminal_error'
      ) {
        void this.registerDiscardedSegment(descriptor.metadata);
      } else if (descriptor.metadata.status !== 'transcribed') {
        this.queueSegment(descriptor.metadata.id);
      }
    }
    await this.emitBacklog();
    return descriptors.map((descriptor) => descriptor.metadata);
  }

  async retry(segmentId: string): Promise<void> {
    const descriptor = (await this.spool.list(this.sessionId)).find(
      (candidate) => candidate.metadata.id === segmentId,
    );
    if (!descriptor) throw new EncryptedSegmentUnavailableError('missing_segment');
    if (descriptor.metadata.attempts >= this.maxAttempts) throw new Error('segment_attempts_exhausted');
    if (this.now() - descriptor.metadata.retryWindowStartedAtMs >= this.retryWindowMs) {
      throw new Error('segment_retry_window_expired');
    }
    const updated = await this.spool.update(segmentId, (metadata) => ({
      ...metadata,
      status: 'queued',
      nextRetryAtMs: null,
      errorCode: null,
    }));
    this.emitSegment(updated.metadata);
    this.queueSegment(segmentId);
  }

  async runJanitor(): Promise<CaptureSegmentState[]> {
    const removed = await this.spool.janitor(async (metadata) => {
      await this.markLost(metadata);
    }, this.sessionId);
    for (const metadata of removed) this.onSegmentDeleted?.(metadata.id);
    await this.emitBacklog();
    return removed;
  }

  async purgeSession(): Promise<number> {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
    const purged = await this.spool.purgeSession(this.sessionId);
    await this.emitBacklog();
    this.resolveIdleIfNeeded();
    return purged;
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
    this.resolveIdleIfNeeded();
  }

  waitForIdle(): Promise<void> {
    if (this.queue.length === 0 && this.running.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private queueSegment(segmentId: string): void {
    if (this.stopped || this.queued.has(segmentId) || this.running.has(segmentId)) return;
    this.queue.push(segmentId);
    this.queued.add(segmentId);
    this.pump();
  }

  private pump(): void {
    while (!this.stopped && this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const segmentId = this.queue.shift();
      if (!segmentId) break;
      this.queued.delete(segmentId);
      this.running.add(segmentId);
      void this.process(segmentId).finally(() => {
        this.running.delete(segmentId);
        this.pump();
        this.resolveIdleIfNeeded();
      });
    }
    this.resolveIdleIfNeeded();
  }

  private async process(segmentId: string): Promise<void> {
    let descriptor: SpoolSegmentDescriptor;
    try {
      const current = await this.spool.get(segmentId);
      descriptor = current;
    } catch (error) {
      const metadata = (await this.spool.list(this.sessionId)).find(
        (candidate) => candidate.metadata.id === segmentId,
      )?.metadata;
      if (metadata && error instanceof EncryptedSegmentUnavailableError) {
        await this.registerDiscardedSegment({ ...metadata, status: 'lost', errorCode: error.code });
      }
      return;
    }

    if (
      descriptor.metadata.status === 'transcribed' ||
      descriptor.metadata.status === 'terminal_error' ||
      descriptor.metadata.status === 'lost'
    ) {
      return;
    }

    const elapsed = this.now() - descriptor.metadata.retryWindowStartedAtMs;
    if (elapsed >= this.retryWindowMs || descriptor.metadata.attempts >= this.maxAttempts) {
      await this.setTerminal(descriptor.metadata.id, 'segment_retry_exhausted');
      return;
    }

    const uploading = await this.spool.update(segmentId, (metadata) => ({
      ...metadata,
      status: 'uploading',
      attempts: metadata.attempts + 1,
      nextRetryAtMs: null,
      errorCode: null,
    }));
    this.emitSegment(uploading.metadata);

    try {
      const decrypted = await this.spool.get(segmentId);
      const { receipt } = await this.transport.uploadSegment({
        segment: { metadata: decrypted.metadata, audio: decrypted.audio },
        mutationId: createMeetingMutationId(this.crypto),
      });
      await this.handleReceipt(decrypted.metadata.id, receipt);
    } catch (error) {
      if (error instanceof EncryptedSegmentUnavailableError) {
        await this.registerDiscardedSegment({
          ...uploading.metadata,
          status: 'lost',
          errorCode: error.code,
        });
        return;
      }
      if (!isRetryable(error)) {
        await this.setTerminal(segmentId, safeErrorCode(error));
        return;
      }
      await this.scheduleRetry(segmentId, safeErrorCode(error), null);
    }
  }

  private async handleReceipt(segmentId: string, receipt: SegmentTranscriptionReceipt): Promise<void> {
    if (receipt.segmentId !== segmentId) {
      await this.setTerminal(segmentId, 'transcription_receipt_mismatch');
      return;
    }
    if (receipt.status === 'transcribed') {
      const updated = await this.spool.update(segmentId, (metadata) => ({
        ...metadata,
        status: 'transcribed',
        canonicalReceiptId: receipt.canonicalReceiptId,
        nextRetryAtMs: null,
        errorCode: null,
      }));
      this.emitSegment(updated.metadata);
      await this.spool.delete(segmentId);
      this.onSegmentDeleted?.(segmentId);
      await this.emitBacklog();
      return;
    }
    if (receipt.status === 'terminal_error') {
      await this.setTerminal(segmentId, receipt.errorCode ?? 'transcription_terminal_error');
      return;
    }
    if (receipt.status === 'retryable_error') {
      await this.scheduleRetry(segmentId, receipt.errorCode ?? 'transcription_retryable_error', receipt.retryAfterMs);
      return;
    }

    const processingStatus = receipt.status === 'accepted' ? 'accepted' : 'processing';
    const updated = await this.spool.update(segmentId, (metadata) => ({
      ...metadata,
      status: processingStatus,
      canonicalReceiptId: receipt.canonicalReceiptId,
      nextRetryAtMs: null,
      errorCode: null,
    }));
    this.emitSegment(updated.metadata);
    await this.pollUntilTerminal(updated.metadata);
  }

  private async pollUntilTerminal(metadata: CaptureSegmentState): Promise<void> {
    while (!this.stopped && this.now() - metadata.retryWindowStartedAtMs < this.retryWindowMs) {
      await this.delay(this.pollIntervalMs);
      const { receipt } = await this.transport.getSegmentReceipt({
        mutationId: createMeetingMutationId(this.crypto),
        eventId: this.eventId,
        orgId: this.orgId,
        sessionId: this.sessionId,
        segmentId: metadata.id,
        sequence: metadata.sequence,
      });
      if (!receipt || receipt.status === 'accepted' || receipt.status === 'processing') {
        if (receipt) {
          const status: CaptureSegmentStatus = receipt.status === 'accepted' ? 'accepted' : 'processing';
          const updated = await this.spool.update(metadata.id, (current) => ({ ...current, status }));
          this.emitSegment(updated.metadata);
        }
        continue;
      }
      await this.handleReceipt(metadata.id, receipt);
      return;
    }
    if (!this.stopped) await this.setTerminal(metadata.id, 'transcription_callback_timeout');
  }

  private async scheduleRetry(
    segmentId: string,
    errorCode: string,
    retryAfterMs: number | null,
  ): Promise<void> {
    const descriptor = (await this.spool.list(this.sessionId)).find(
      (candidate) => candidate.metadata.id === segmentId,
    );
    if (!descriptor) return;
    const elapsed = this.now() - descriptor.metadata.retryWindowStartedAtMs;
    if (descriptor.metadata.attempts >= this.maxAttempts || elapsed >= this.retryWindowMs) {
      await this.setTerminal(segmentId, 'segment_retry_exhausted');
      return;
    }
    const exponentialDelay = Math.min(30_000, 1_000 * 2 ** Math.max(0, descriptor.metadata.attempts - 1));
    const waitMs = Math.max(0, retryAfterMs ?? exponentialDelay);
    if (elapsed + waitMs >= this.retryWindowMs) {
      await this.setTerminal(segmentId, 'segment_retry_window_expired');
      return;
    }
    const updated = await this.spool.update(segmentId, (metadata) => ({
      ...metadata,
      status: 'retry_wait',
      nextRetryAtMs: this.now() + waitMs,
      errorCode,
    }));
    this.emitSegment(updated.metadata);
    await this.delay(waitMs);
    if (!this.stopped) await this.process(segmentId);
  }

  private async setTerminal(segmentId: string, errorCode: string): Promise<void> {
    try {
      const updated = await this.spool.update(segmentId, (metadata) => ({
        ...metadata,
        status: 'terminal_error',
        nextRetryAtMs: null,
        errorCode,
      }));
      this.emitSegment(updated.metadata);
      await this.emitBacklog();
      await this.registerDiscardedSegment(updated.metadata);
    } catch (error) {
      if (!(error instanceof EncryptedSegmentUnavailableError)) throw error;
    }
  }

  private async registerDiscardedSegment(metadata: CaptureSegmentState): Promise<void> {
    try {
      await this.markLost(metadata);
      await this.spool.delete(metadata.id);
      this.onSegmentDeleted?.(metadata.id);
      await this.emitBacklog();
    } catch {
      this.emitSegment(metadata.status === 'lost' ? metadata : { ...metadata, status: 'terminal_error' });
    }
  }

  private markLost(metadata: CaptureSegmentMetadata): Promise<{ session: { id: string; version: number } }> {
    return this.transport.markLost({
      mutationId: createMeetingMutationId(this.crypto),
      eventId: this.eventId,
      orgId: this.orgId,
      sessionId: this.sessionId,
      metadata,
    });
  }

  private emitSegment(segment: CaptureSegmentState): void {
    this.onSegmentChange?.(segment);
  }

  private async emitBacklog(): Promise<void> {
    const descriptors = await this.spool.list(this.sessionId);
    this.onBacklogChange?.(computeCaptureBacklog(descriptors.map((descriptor) => descriptor.metadata)));
  }

  private resolveIdleIfNeeded(): void {
    if (this.queue.length > 0 || this.running.size > 0) return;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export const AGENDA_MEETING_MAX_ACTIVE_DURATION_MS = 4 * 60 * 60 * 1_000;
export const AGENDA_MEETING_SEGMENT_DURATION_MS = 30_000;
export const AGENDA_MEETING_SPOOL_TTL_MS = 24 * 60 * 60 * 1_000;
export const AGENDA_MEETING_MAX_BACKLOG_DURATION_MS = 20 * 60 * 1_000;
export const AGENDA_MEETING_MAX_BACKLOG_BYTES = 64 * 1_024 * 1_024;
export const AGENDA_MEETING_MAX_SEGMENT_BYTES = 2 * 1_024 * 1_024;
export const AGENDA_MEETING_MAX_UPLOAD_ATTEMPTS = 5;
export const AGENDA_MEETING_MAX_RETRY_WINDOW_MS = 15 * 60 * 1_000;

export type AgendaMeetingJsonPrimitive = string | number | boolean | null;
export type AgendaMeetingJson =
  | AgendaMeetingJsonPrimitive
  | AgendaMeetingJson[]
  | { [key: string]: AgendaMeetingJson };

export type AgendaMeetingCapturePhase =
  | 'idle'
  | 'requesting_permission'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'backpressure_paused'
  | 'finalizing'
  | 'awaiting_transcripts'
  | 'analysis_queued'
  | 'review_required'
  | 'completed'
  | 'capture_interrupted'
  | 'recoverable_error'
  | 'fatal_error';

export type AgendaMeetingPersistedSessionState =
  | 'created'
  | 'recording'
  | 'paused'
  | 'capture_interrupted'
  | 'finalizing_transcript'
  | 'transcript_ready'
  | 'transcript_ready_with_gaps'
  | 'analysis_queued'
  | 'analyzing'
  | 'review_required'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'deleted';

export type CaptureSegmentStatus =
  | 'captured'
  | 'queued'
  | 'uploading'
  | 'accepted'
  | 'processing'
  | 'transcribed'
  | 'retry_wait'
  | 'terminal_error'
  | 'lost';

export type SegmentReceiptStatus =
  | 'accepted'
  | 'processing'
  | 'transcribed'
  | 'retryable_error'
  | 'terminal_error';

export type CaptureBackendKind = 'media_recorder' | 'audio_worklet_wav';

export type CaptureInterruptionReason =
  | 'page_hidden'
  | 'pagehide'
  | 'track_ended'
  | 'device_changed'
  | 'capture_error'
  | 'max_duration'
  | 'backpressure';

export interface CaptureGapMarker {
  id: string;
  sessionId: string;
  sequence: number;
  captureStartMs: number;
  captureEndMs: number;
  reason: Exclude<CaptureInterruptionReason, 'max_duration' | 'backpressure'>;
}

export interface AgendaMeetingSafeError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CaptureSegmentMetadata {
  id: string;
  sessionId: string;
  sequence: number;
  captureStartMs: number;
  captureEndMs: number;
  durationMs: number;
  capturedAtIso: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  backend: CaptureBackendKind;
}

export interface CapturedAudioSegment {
  metadata: CaptureSegmentMetadata;
  audio: Blob;
}

export interface CaptureSegmentState extends CaptureSegmentMetadata {
  status: CaptureSegmentStatus;
  attempts: number;
  retryWindowStartedAtMs: number;
  nextRetryAtMs: number | null;
  canonicalReceiptId: string | null;
  errorCode: string | null;
}

export interface CaptureBacklogState {
  segments: number;
  bytes: number;
  durationMs: number;
  isAtCapacity: boolean;
  limitedBy: 'duration' | 'bytes' | null;
}

export interface AgendaMeetingCaptureState {
  phase: AgendaMeetingCapturePhase;
  sessionId: string | null;
  sessionVersion: number | null;
  activeDurationMs: number;
  startedAtIso: string | null;
  backend: CaptureBackendKind | null;
  mimeType: string | null;
  selectedDeviceId: string | null;
  interruption: CaptureInterruptionReason | null;
  backlog: CaptureBacklogState;
  segments: CaptureSegmentState[];
  error: AgendaMeetingSafeError | null;
}

export interface AgendaMeetingStartInput {
  consentVersion: string;
  participantsInformed: boolean;
  deviceId?: string;
}

export interface AgendaMeetingFinishInput {
  allowPartial: boolean;
}

export interface AgendaMeetingCaptureCapabilities {
  mediaRecorder: boolean;
  audioWorkletWav: boolean;
  nativeSpeechRecognition: boolean;
  encryptedIndexedDb: boolean;
  supportedMimeTypes: readonly string[];
}

export interface AgendaMeetingMicrophoneTelemetry {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  inputLevel: number | null;
}

export type AgendaMeetingLiveTranscriptionState =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'speech_detected'
  | 'recovering'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'error';

export interface AgendaMeetingLiveTranscript {
  /** Estado do reconhecimento nativo (reinícios internos aparecem como `recovering`). */
  recognition: AgendaMeetingLiveTranscriptionState;
  /** Texto consolidado de todos os resultados finais da sessão. */
  canonical: string;
  /** Texto provisório (volátil) exibido enquanto o navegador ainda não confirmou. */
  interim: string;
  finalSegmentCount: number;
}

export interface AgendaMeetingCaptureController {
  state: AgendaMeetingCaptureState;
  liveTranscript: AgendaMeetingLiveTranscript;
  capabilities: AgendaMeetingCaptureCapabilities;
  mic: AgendaMeetingMicrophoneTelemetry;
  refreshDevices(): Promise<void>;
  selectDevice(deviceId: string | null): void;
  start(input: AgendaMeetingStartInput): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  finish(input: AgendaMeetingFinishInput): Promise<void>;
  cancel(): Promise<void>;
  retrySegment(segmentId: string): Promise<void>;
  purge(): Promise<void>;
  purgeForLogout(): Promise<void>;
}

export interface AgendaMeetingWorkspaceProps {
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
}

export interface AgendaMeetingEventSnapshot {
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  responsibleNames: string[];
  commissionNames: string[];
}

export interface AgendaMeetingSessionSummary {
  id: string;
  orgId: string;
  eventId: string;
  state: AgendaMeetingPersistedSessionState;
  captureState: 'idle' | 'recording' | 'paused' | 'interrupted' | 'ended';
  processingState:
    | 'idle'
    | 'finalizing_transcript'
    | 'transcript_ready'
    | 'transcript_ready_with_gaps'
    | 'analysis_queued'
    | 'analyzing'
    | 'review_required'
    | 'completed'
    | 'failed';
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  activeDurationMs: number;
  transcriptCoverage: 'pending' | 'complete' | 'with_gaps';
  transcriptSegmentCount: number;
  actionItemCount: number;
  pendingActionItemCount: number;
  version: number;
}

export interface AgendaMeetingTranscriptSegment {
  id: string;
  transcriptVersionId: string;
  sequence: number;
  kind: 'speech' | 'gap' | 'manual';
  captureStartMs: number;
  captureEndMs: number;
  text: string;
  confidence: number | null;
  speakerLabel: null;
  sourceSegmentId: string | null;
}

export interface AgendaMeetingTranscriptVersion {
  id: string;
  version: number;
  kind: 'canonical' | 'normalized_manual';
  coverage: 'complete' | 'with_gaps';
  language: string;
  sha256: string;
  createdAt: string;
  createdBy: string | null;
  segments: AgendaMeetingTranscriptSegment[];
}

export interface AgendaMeetingMinutesVersion {
  id: string;
  version: number;
  state: 'ai_draft' | 'reviewed' | 'superseded';
  title: string;
  executiveSummary: string;
  minutesMarkdown: string;
  sourceTranscriptVersionId: string;
  coverage: 'complete' | 'with_gaps';
  model: string;
  promptVersion: string;
  schemaVersion: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export type AgendaMeetingInsightKind =
  | 'decision'
  | 'pending'
  | 'risk'
  | 'important'
  | 'next_step'
  | 'next_meeting';

export interface AgendaMeetingEvidenceReference {
  transcriptSegmentId: string;
  quoteStartMs: number;
  quoteEndMs: number;
}

export interface AgendaMeetingInsight {
  id: string;
  kind: AgendaMeetingInsightKind;
  title: string;
  detail: string;
  evidence: AgendaMeetingEvidenceReference[];
}

export interface AgendaMeetingActionItem {
  id: string;
  title: string;
  description: string | null;
  status: 'proposed' | 'confirmed' | 'in_progress' | 'completed' | 'dismissed';
  responsibleText: string | null;
  suggestedMemberId: string | null;
  confirmedMemberId: string | null;
  responsibleResolution: 'unresolved' | 'suggested' | 'confirmed';
  dueDateText: string | null;
  dueDate: string | null;
  dueDateConfirmed: boolean;
  evidence: AgendaMeetingEvidenceReference[];
}

export interface AgendaMeetingMemberOption {
  userId: string;
  name: string;
}

export interface AgendaMeetingSessionDetail extends AgendaMeetingSessionSummary {
  eventSnapshot: AgendaMeetingEventSnapshot;
  transcriptVersions: AgendaMeetingTranscriptVersion[];
  minutesVersions: AgendaMeetingMinutesVersion[];
  insights: AgendaMeetingInsight[];
  actionItems: AgendaMeetingActionItem[];
  failedStage: string | null;
  errorCode: string | null;
  retryable: boolean;
}

export interface MeetingAnalysisOutput {
  title: string;
  executiveSummary: string;
  minutesMarkdown: string;
  decisions: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  pendingItems: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  risks: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  importantPoints: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  nextSteps: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  nextMeetings: Array<{
    title: string;
    detail: string;
    evidenceSegmentIds: string[];
  }>;
  actionItems: Array<{
    title: string;
    description: string;
    responsibleText: string | null;
    dueDateText: string | null;
    dueDate: string | null;
    suggestedMemberId: string | null;
    evidenceSegmentIds: string[];
  }>;
}

export type AgendaMeetingControlAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'heartbeat'
  | 'finalize'
  | 'cancel'
  | 'create_revision'
  | 'review_minutes'
  | 'update_action'
  | 'delete'
  | 'retry_analysis'
  | 'list'
  | 'detail'
  | 'get_segment_receipt'
  | 'mark_lost';

export interface AgendaMeetingControlRequest<TPayload extends AgendaMeetingJson = AgendaMeetingJson> {
  action: AgendaMeetingControlAction;
  mutationId: string;
  eventId: string;
  orgId: string;
  sessionId?: string;
  expectedVersion?: number;
  payload: TPayload;
}

export interface AgendaMeetingControlEnvelope<TResult> {
  ok: true;
  action: AgendaMeetingControlAction;
  data: TResult;
}

export interface SegmentTranscriptionReceipt {
  segmentId: string;
  sequence: number;
  status: SegmentReceiptStatus;
  canonicalReceiptId: string | null;
  retryAfterMs: number | null;
  errorCode: string | null;
}

export interface AgendaMeetingStartResult {
  session: AgendaMeetingSessionSummary;
}

export interface AgendaMeetingStateResult {
  session: AgendaMeetingSessionSummary;
}

export interface AgendaMeetingListResult {
  sessions: AgendaMeetingSessionSummary[];
}

export interface AgendaMeetingDetailResult {
  session: AgendaMeetingSessionSummary & {
    eventSnapshot: AgendaMeetingEventSnapshot;
    failedStage: string | null;
    errorCode: string | null;
    retryable: boolean;
  };
  receipts: SegmentTranscriptionReceipt[];
  transcriptVersions: Array<Omit<AgendaMeetingTranscriptVersion, 'segments'>>;
  transcriptSegments: AgendaMeetingTranscriptSegment[];
  minutesVersions: AgendaMeetingMinutesVersion[];
  insights: AgendaMeetingInsight[];
  actions: AgendaMeetingActionItem[];
}

export interface AgendaMeetingSegmentReceiptResult {
  receipt: SegmentTranscriptionReceipt | null;
}

export interface AgendaMeetingUploadInput {
  segment: CapturedAudioSegment;
  mutationId: string;
}

export interface AgendaMeetingUploadResult {
  receipt: SegmentTranscriptionReceipt;
}

export interface AgendaMeetingCreateRevisionInput {
  segments: Array<{
    sourceSegmentId: string;
    text: string;
  }>;
  reason?: string;
}

export interface AgendaMeetingReviewMinutesInput {
  minutesVersionId: string;
  decision: 'approve' | 'request_changes';
  note?: string;
}

export interface AgendaMeetingUpdateActionInput {
  actionId: string;
  title?: string;
  description?: string;
  status?: AgendaMeetingActionItem['status'];
  confirmedUserId?: string | null;
  dueDate?: string | null;
}

export interface AgendaMeetingDeleteResult {
  deletedSessionId: string;
}

export interface NonCanonicalLivePreviewAdapter {
  readonly label: 'Prévia ao vivo — não oficial';
  start(onText: (text: string) => void): Promise<void>;
  stop(): Promise<void>;
}

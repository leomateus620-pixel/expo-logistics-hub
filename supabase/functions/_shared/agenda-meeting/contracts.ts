import { HttpError } from "./http.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
  [key: string]: JsonValue;
};
export type JsonObject = { [key: string]: JsonValue };

export const CONTROL_ACTIONS = [
  "start",
  "list",
  "detail",
  "get_segment_receipt",
  "heartbeat",
  "pause",
  "resume",
  "finalize",
  "cancel",
  "mark_lost",
  "create_revision",
  "review_minutes",
  "update_action",
  "retry_analysis",
  "delete",
] as const;

export type AgendaMeetingControlAction = typeof CONTROL_ACTIONS[number];

const CONTROL_ACTION_SET = new Set<string>(CONTROL_ACTIONS);
const SESSION_REQUIRED_ACTIONS = new Set<AgendaMeetingControlAction>([
  "detail",
  "get_segment_receipt",
  "heartbeat",
  "pause",
  "resume",
  "finalize",
  "cancel",
  "mark_lost",
  "create_revision",
  "review_minutes",
  "update_action",
  "retry_analysis",
  "delete",
]);

const CONTROL_PAYLOAD_KEYS: Record<
  AgendaMeetingControlAction,
  readonly string[]
> = {
  start: [
    "consentConfirmed",
    "consentPolicyVersion",
    "participantsInformed",
    "capture",
  ],
  list: [],
  detail: [],
  get_segment_receipt: ["segmentId", "sequence"],
  heartbeat: ["activeDurationMs"],
  pause: ["reason"],
  resume: ["resumedAfterInterruption"],
  finalize: ["allowPartial", "lastSequence", "activeDurationMs"],
  cancel: [],
  mark_lost: [
    "sequence",
    "segmentId",
    "captureStartMs",
    "captureEndMs",
    "sha256",
    "mimeType",
    "reason",
  ],
  create_revision: ["segments", "reason"],
  review_minutes: ["minutesVersionId", "decision", "note"],
  update_action: [
    "actionId",
    "title",
    "description",
    "status",
    "confirmedUserId",
    "dueDate",
  ],
  retry_analysis: ["confirmPartial"],
  delete: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function removeUnsafeControlCharacters(value: string) {
  let output = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    output +=
      (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
        ? " "
        : character;
  }
  return output;
}

function requireUuid(value: unknown, code: string): string {
  if (!isUuid(value)) throw new HttpError(400, code);
  return value;
}

function optionalUuid(value: unknown, code: string): string | null {
  if (value === undefined || value === null) return null;
  return requireUuid(value, code);
}

export interface AgendaMeetingControlRequest {
  action: AgendaMeetingControlAction;
  mutationId: string;
  eventId: string;
  orgId: string;
  sessionId: string | null;
  expectedVersion: number | null;
  payload: JsonObject;
}

export function parseControlRequest(
  input: unknown,
): AgendaMeetingControlRequest {
  if (!isPlainObject(input)) {
    throw new HttpError(400, "invalid_control_request");
  }
  const allowedRequestKeys = new Set([
    "action",
    "mutationId",
    "eventId",
    "orgId",
    "sessionId",
    "expectedVersion",
    "payload",
  ]);
  if (Object.keys(input).some((key) => !allowedRequestKeys.has(key))) {
    throw new HttpError(400, "unexpected_control_request_field");
  }
  const action = input.action;
  if (typeof action !== "string" || !CONTROL_ACTION_SET.has(action)) {
    throw new HttpError(400, "invalid_control_action");
  }
  const typedAction = action as AgendaMeetingControlAction;
  const sessionId = optionalUuid(input.sessionId, "invalid_session_id");
  if (SESSION_REQUIRED_ACTIONS.has(typedAction) && !sessionId) {
    throw new HttpError(400, "session_id_required");
  }
  const expectedVersion =
    input.expectedVersion === undefined || input.expectedVersion === null
      ? null
      : input.expectedVersion;
  if (
    expectedVersion !== null &&
    (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1)
  ) {
    throw new HttpError(400, "invalid_expected_version");
  }
  const payload = input.payload ?? {};
  if (!isPlainObject(payload)) {
    throw new HttpError(400, "invalid_control_payload");
  }
  const allowedPayloadKeys = new Set(CONTROL_PAYLOAD_KEYS[typedAction]);
  if (Object.keys(payload).some((key) => !allowedPayloadKeys.has(key))) {
    throw new HttpError(400, "unexpected_control_payload_field");
  }

  return {
    action: typedAction,
    mutationId: requireUuid(input.mutationId, "invalid_mutation_id"),
    eventId: requireUuid(input.eventId, "invalid_event_id"),
    orgId: requireUuid(input.orgId, "invalid_org_id"),
    sessionId,
    expectedVersion: expectedVersion === null ? null : Number(expectedVersion),
    payload: payload as JsonObject,
  };
}

export const MAX_SEGMENT_BYTES = 2 * 1_024 * 1_024;
export const MAX_SEGMENT_DURATION_MS = 120_000;
export const MAX_SEGMENT_SEQUENCE = 10_000;
export const MAX_MEETING_ACTIVE_DURATION_MS = 4 * 60 * 60 * 1_000;

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
]);

function normalizedMimeType(value: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "").trim();
}

function requireIntegerHeader(
  req: Request,
  name: string,
  min: number,
  max: number,
) {
  const raw = req.headers.get(name);
  if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) {
    throw new HttpError(400, `invalid_${name.toLowerCase()}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, `invalid_${name.toLowerCase()}`);
  }
  return value;
}

export interface SegmentUploadMetadata {
  sessionId: string;
  segmentId: string;
  mutationId: string;
  sequence: number;
  captureStartMs: number;
  captureEndMs: number;
  sha256: string;
  mimeType: string;
}

export function parseSegmentUploadMetadata(
  req: Request,
): SegmentUploadMetadata {
  const mimeType = normalizedMimeType(req.headers.get("Content-Type"));
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(415, "unsupported_audio_mime_type");
  }
  const captureStartMs = requireIntegerHeader(
    req,
    "X-Meeting-Capture-Start-Ms",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const captureEndMs = requireIntegerHeader(
    req,
    "X-Meeting-Capture-End-Ms",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (
    captureEndMs > MAX_MEETING_ACTIVE_DURATION_MS ||
    captureEndMs <= captureStartMs ||
    captureEndMs - captureStartMs > MAX_SEGMENT_DURATION_MS
  ) {
    throw new HttpError(400, "invalid_segment_capture_window");
  }
  const sha256 = (req.headers.get("X-Meeting-Sha256") ?? "").toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new HttpError(400, "invalid_segment_sha256");
  }

  return {
    sessionId: requireUuid(
      req.headers.get("X-Meeting-Session-Id"),
      "invalid_session_id",
    ),
    segmentId: requireUuid(
      req.headers.get("X-Meeting-Segment-Id"),
      "invalid_segment_id",
    ),
    mutationId: requireUuid(
      req.headers.get("X-Meeting-Mutation-Id"),
      "invalid_mutation_id",
    ),
    sequence: requireIntegerHeader(
      req,
      "X-Meeting-Sequence",
      0,
      MAX_SEGMENT_SEQUENCE,
    ),
    captureStartMs,
    captureEndMs,
    sha256,
    mimeType,
  };
}

export function safeProviderErrorCode(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 80);
  return normalized || fallback;
}

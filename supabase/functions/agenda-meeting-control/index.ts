import {
  type AgendaMeetingControlAction,
  isPlainObject,
  isUuid,
  type JsonObject,
  MAX_MEETING_ACTIVE_DURATION_MS,
  MAX_SEGMENT_SEQUENCE,
  parseControlRequest,
  removeUnsafeControlCharacters,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from "../_shared/agenda-meeting/http.ts";
import {
  authenticateMeetingUser,
  authorizeMeetingAction,
  createMeetingAdminClient,
  mapDatabaseError,
} from "../_shared/agenda-meeting/supabase.ts";

const MAX_CONTROL_BODY_BYTES = 4 * 1_024 * 1_024;
const CAPTURE_MIME_TYPES = new Set([
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

function nonEmptyString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = removeUnsafeControlCharacters(value).trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizePayload(
  action: AgendaMeetingControlAction,
  payload: JsonObject,
): JsonObject {
  const normalized: Record<string, unknown> = { ...payload };
  if (action === "start") {
    normalized.consentConfirmed = payload.consentConfirmed === true;
    normalized.participantsInformed = payload.participantsInformed === true;
    normalized.consentPolicyVersion = nonEmptyString(
      payload.consentPolicyVersion,
      120,
    );
    const capture = payload.capture;
    if (
      normalized.consentConfirmed !== true ||
      normalized.participantsInformed !== true ||
      normalized.consentPolicyVersion === null
    ) {
      throw new HttpError(422, "meeting_consent_required");
    }
    if (
      !isPlainObject(capture) ||
      Object.keys(capture).some((key) =>
        !["backend", "mimeType", "segmentDurationMs", "audioPersistence"]
          .includes(key)
      ) ||
      !["media_recorder", "audio_worklet_wav"].includes(
        String(capture.backend),
      ) ||
      typeof capture.mimeType !== "string" ||
      !CAPTURE_MIME_TYPES.has(
        capture.mimeType.toLowerCase().replace(/\s+/g, ""),
      ) ||
      capture.segmentDurationMs !== 30_000 ||
      capture.audioPersistence !== "ephemeral_encrypted_only"
    ) {
      throw new HttpError(400, "invalid_capture_contract");
    }
    normalized.capture = {
      backend: capture.backend,
      mimeType: capture.mimeType.toLowerCase().replace(/\s+/g, ""),
      segmentDurationMs: 30_000,
      audioPersistence: "ephemeral_encrypted_only",
    };
  }

  if (action === "pause") {
    const reasons = new Set([
      "user",
      "backpressure",
      "page_hidden",
      "pagehide",
      "track_ended",
      "device_changed",
      "capture_error",
      "max_duration",
    ]);
    if (typeof payload.reason !== "string" || !reasons.has(payload.reason)) {
      throw new HttpError(400, "invalid_pause_reason");
    }
  }

  if (
    action === "resume" &&
    typeof payload.resumedAfterInterruption !== "boolean"
  ) {
    throw new HttpError(400, "invalid_resume_payload");
  }

  if (action === "heartbeat") {
    if (
      !Number.isSafeInteger(payload.activeDurationMs) ||
      Number(payload.activeDurationMs) < 0 ||
      Number(payload.activeDurationMs) > MAX_MEETING_ACTIVE_DURATION_MS
    ) throw new HttpError(400, "invalid_active_duration");
  }

  if (action === "finalize") {
    if (
      typeof payload.allowPartial !== "boolean" ||
      !Number.isSafeInteger(payload.lastSequence) ||
      Number(payload.lastSequence) < -1 ||
      Number(payload.lastSequence) > MAX_SEGMENT_SEQUENCE ||
      !Number.isSafeInteger(payload.activeDurationMs) ||
      Number(payload.activeDurationMs) < 0 ||
      Number(payload.activeDurationMs) > MAX_MEETING_ACTIVE_DURATION_MS
    ) throw new HttpError(400, "invalid_finalize_payload");
  }

  if (action === "mark_lost") {
    const validReasons = new Set([
      "page_hidden",
      "pagehide",
      "track_ended",
      "device_changed",
      "capture_error",
    ]);
    if (
      !isUuid(payload.segmentId) ||
      !Number.isSafeInteger(payload.sequence) || Number(payload.sequence) < 0 ||
      Number(payload.sequence) > MAX_SEGMENT_SEQUENCE ||
      !Number.isSafeInteger(payload.captureStartMs) ||
      Number(payload.captureStartMs) < 0 ||
      !Number.isSafeInteger(payload.captureEndMs) ||
      Number(payload.captureEndMs) <= Number(payload.captureStartMs) ||
      Number(payload.captureEndMs) > MAX_MEETING_ACTIVE_DURATION_MS ||
      (payload.reason !== undefined &&
        (typeof payload.reason !== "string" ||
          !validReasons.has(payload.reason)))
    ) throw new HttpError(400, "invalid_lost_segment_payload");
  }

  if (action === "create_revision") {
    const segments = payload.segments;
    if (
      !Array.isArray(segments) || segments.length === 0 ||
      segments.length > 20_000
    ) {
      throw new HttpError(400, "invalid_revision_segments");
    }
    const seen = new Set<string>();
    normalized.segments = segments.map((segment) => {
      if (!isPlainObject(segment) || !isUuid(segment.sourceSegmentId)) {
        throw new HttpError(400, "invalid_revision_segment");
      }
      if (seen.has(segment.sourceSegmentId)) {
        throw new HttpError(409, "duplicate_revision_segment");
      }
      seen.add(segment.sourceSegmentId);
      const text = nonEmptyString(segment.text, 100_000);
      if (!text) throw new HttpError(400, "invalid_revision_segment_text");
      return { sourceSegmentId: segment.sourceSegmentId, text };
    });
    if (payload.reason !== undefined && payload.reason !== null) {
      const reason = nonEmptyString(payload.reason, 500);
      if (!reason) throw new HttpError(400, "invalid_revision_reason");
      normalized.reason = reason;
    }
  }

  if (action === "review_minutes") {
    if (!isUuid(payload.minutesVersionId)) {
      throw new HttpError(400, "invalid_minutes_version_id");
    }
    normalized.decision = payload.decision;
    if (
      normalized.decision !== "approve" &&
      normalized.decision !== "request_changes"
    ) {
      throw new HttpError(400, "invalid_minutes_review_decision");
    }
    if (
      payload.note !== undefined && payload.note !== null &&
      !nonEmptyString(payload.note, 2_000)
    ) {
      throw new HttpError(400, "invalid_minutes_review_note");
    }
  }

  if (action === "update_action") {
    if (!isUuid(payload.actionId)) {
      throw new HttpError(400, "invalid_action_item_id");
    }
    normalized.actionId = payload.actionId;
    if (payload.title !== undefined && !nonEmptyString(payload.title, 300)) {
      throw new HttpError(400, "invalid_action_title");
    }
    if (
      payload.description !== undefined &&
      (typeof payload.description !== "string" ||
        payload.description.length > 5_000)
    ) throw new HttpError(400, "invalid_action_description");
    if (
      normalized.confirmedUserId !== undefined &&
      normalized.confirmedUserId !== null &&
      !isUuid(normalized.confirmedUserId)
    ) {
      throw new HttpError(400, "invalid_confirmed_member_id");
    }
    if (
      normalized.status !== undefined &&
      !["proposed", "confirmed", "in_progress", "completed", "dismissed"]
        .includes(String(normalized.status))
    ) {
      throw new HttpError(400, "invalid_action_status");
    }
    if (
      normalized.dueDate !== undefined &&
      normalized.dueDate !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(normalized.dueDate))
    ) {
      throw new HttpError(400, "invalid_action_due_date");
    }
    if (
      typeof normalized.dueDate === "string" &&
      Number.isNaN(Date.parse(`${normalized.dueDate}T00:00:00Z`))
    ) throw new HttpError(400, "invalid_action_due_date");
  }

  if (
    action === "retry_analysis" && payload.confirmPartial !== undefined &&
    typeof payload.confirmPartial !== "boolean"
  ) {
    throw new HttpError(400, "invalid_partial_analysis_confirmation");
  }

  if (action === "get_segment_receipt") {
    const hasSegmentId = isUuid(payload.segmentId);
    const hasSequence = Number.isSafeInteger(payload.sequence) &&
      Number(payload.sequence) >= 0;
    if (!hasSegmentId && !hasSequence) {
      throw new HttpError(400, "segment_receipt_key_required");
    }
  }

  return normalized as JsonObject;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const request = parseControlRequest(
      await readJsonBody(req, MAX_CONTROL_BODY_BYTES),
    );
    // The user-scoped authorization RPC runs before any service-role client is created.
    const caller = await authenticateMeetingUser(req);
    await authorizeMeetingAction(
      caller.client,
      request.action,
      request.orgId,
      request.eventId,
      request.sessionId,
    );

    const admin = createMeetingAdminClient();
    const { data, error } = await admin.rpc("agenda_meeting_control", {
      p_action: request.action,
      p_actor_user_id: caller.id,
      p_org_id: request.orgId,
      p_event_id: request.eventId,
      p_session_id: request.sessionId,
      p_mutation_id: request.mutationId,
      p_expected_version: request.expectedVersion,
      p_payload: normalizePayload(request.action, request.payload),
    });
    if (error) throw mapDatabaseError(error);
    if (!isPlainObject(data)) {
      throw new HttpError(503, "invalid_control_result", true);
    }

    return jsonResponse(req, { ok: true, action: request.action, data });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_control");
  }
});

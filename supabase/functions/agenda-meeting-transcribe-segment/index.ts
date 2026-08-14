import {
  isPlainObject,
  isUuid,
  removeUnsafeControlCharacters,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
} from "../_shared/agenda-meeting/http.ts";
import {
  authenticateMeetingUser,
  authorizeMeetingAction,
  createMeetingAdminClient,
  mapDatabaseError,
} from "../_shared/agenda-meeting/supabase.ts";

const MAX_ACTIVE_DURATION_MS = 4 * 60 * 60 * 1_000;
const MAX_TRANSCRIPT_CHARS = 20_000;
const MAX_SEQUENCE = 10_000;

interface TextSegmentPayload {
  sessionId: string;
  segmentId: string;
  mutationId: string;
  sequence: number;
  captureStartMs: number;
  captureEndMs: number;
  transcript: string;
  confidence: number | null;
}

interface SessionScope {
  org_id: string;
  event_id: string;
}

function requireInteger(value: unknown, min: number, max: number, code: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new HttpError(400, code);
  }
  return number;
}

function parseTextSegmentPayload(body: unknown): TextSegmentPayload {
  if (!isPlainObject(body)) throw new HttpError(400, "invalid_payload");
  if (
    !isUuid(body.sessionId) || !isUuid(body.segmentId) ||
    !isUuid(body.mutationId)
  ) {
    throw new HttpError(400, "invalid_segment_identifiers");
  }
  const sequence = requireInteger(body.sequence, 0, MAX_SEQUENCE, "invalid_sequence");
  const captureStartMs = requireInteger(
    body.captureStartMs,
    0,
    MAX_ACTIVE_DURATION_MS,
    "invalid_segment_capture_window",
  );
  const captureEndMs = requireInteger(
    body.captureEndMs,
    1,
    MAX_ACTIVE_DURATION_MS,
    "invalid_segment_capture_window",
  );
  if (captureEndMs <= captureStartMs) {
    throw new HttpError(400, "invalid_segment_capture_window");
  }
  if (typeof body.transcript !== "string") {
    throw new HttpError(400, "invalid_transcript_text");
  }
  const transcript = removeUnsafeControlCharacters(body.transcript)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw new HttpError(413, "transcript_segment_too_large");
  }
  const rawConfidence = body.confidence;
  const confidence = typeof rawConfidence === "number" &&
      Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : null;

  return {
    sessionId: body.sessionId,
    segmentId: body.segmentId,
    mutationId: body.mutationId,
    sequence,
    captureStartMs,
    captureEndMs,
    transcript,
    confidence,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new HttpError(400, "invalid_payload");
    }
    const payload = parseTextSegmentPayload(rawBody);
    const caller = await authenticateMeetingUser(req);

    const { data: session, error: scopeError } = await caller.client
      .from("agenda_meeting_sessions")
      .select("org_id,event_id")
      .eq("id", payload.sessionId)
      .maybeSingle();
    if (scopeError) {
      throw new HttpError(503, "meeting_scope_lookup_failed", true);
    }
    if (!session) throw new HttpError(403, "forbidden");
    const scope = session as SessionScope;
    await authorizeMeetingAction(
      caller.client,
      "transcribe_segment",
      scope.org_id,
      scope.event_id,
      payload.sessionId,
    );

    const admin = createMeetingAdminClient();
    const { data, error } = await admin.rpc(
      "agenda_meeting_ingest_text_segment",
      {
        p_actor_user_id: caller.id,
        p_session_id: payload.sessionId,
        p_segment_id: payload.segmentId,
        p_sequence: payload.sequence,
        p_capture_start_ms: payload.captureStartMs,
        p_capture_end_ms: payload.captureEndMs,
        p_transcript: payload.transcript,
        p_mutation_id: payload.mutationId,
        p_confidence: payload.confidence,
      },
    );
    if (error) throw mapDatabaseError(error);

    const result: Record<string, unknown> = isPlainObject(data) ? data : {};
    const canonicalReceiptId = typeof result.canonicalReceiptId === "string"
      ? result.canonicalReceiptId
      : null;

    return jsonResponse(req, {
      ok: true,
      status: "transcribed",
      canonicalReceiptId,
      retryAfterMs: null,
      errorCode: null,
      receipt: {
        segmentId: payload.segmentId,
        sequence: payload.sequence,
        status: "transcribed",
        canonicalReceiptId,
        retryAfterMs: null,
        errorCode: null,
      },
    });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_transcribe_segment");
  }
});

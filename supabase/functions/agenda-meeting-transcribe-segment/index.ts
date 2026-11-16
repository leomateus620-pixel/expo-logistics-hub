import {
  isPlainObject,
  isUuid,
  removeUnsafeControlCharacters,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  logSafe,
  optionsResponse,
} from "../_shared/agenda-meeting/http.ts";
import {
  authenticateMeetingUser,
  authorizeMeetingAction,
  createMeetingAdminClient,
  looseClient,
  mapDatabaseError,
  MEETING_AUDIO_BUCKET,
} from "../_shared/agenda-meeting/supabase.ts";
import { inspectWav } from "../_shared/agenda-meeting/transcription.ts";

const MAX_AUDIO_PART_BYTES = 2 * 1_024 * 1_024;
const MAX_AUDIO_PART_DURATION_MS = 65_000;

interface AudioPartMetadata {
  sessionId: string;
  segmentId: string;
  mutationId: string;
  sequence: number;
  captureStartMs: number;
  captureEndMs: number;
  sha256: string;
  stats: Record<string, number>;
}

function parseAudioMetadata(raw: unknown): AudioPartMetadata {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "invalid_audio_metadata");
    }
  }
  if (!isPlainObject(value)) throw new HttpError(400, "invalid_audio_metadata");
  if (!isUuid(value.sessionId) || !isUuid(value.segmentId) || !isUuid(value.mutationId)) {
    throw new HttpError(400, "invalid_segment_identifiers");
  }
  const sequence = requireInteger(value.sequence, 0, MAX_SEQUENCE, "invalid_sequence");
  const captureStartMs = requireInteger(value.captureStartMs, 0, MAX_ACTIVE_DURATION_MS, "invalid_segment_capture_window");
  const captureEndMs = requireInteger(value.captureEndMs, 1, MAX_ACTIVE_DURATION_MS, "invalid_segment_capture_window");
  if (captureEndMs <= captureStartMs || captureEndMs - captureStartMs > MAX_AUDIO_PART_DURATION_MS) {
    throw new HttpError(400, "invalid_segment_capture_window");
  }
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new HttpError(400, "invalid_segment_sha256");
  }
  const stats: Record<string, number> = {};
  if (isPlainObject(value.stats)) {
    for (const key of ["peakLevel", "rmsLevel", "voicedRatio", "sampleRate"]) {
      const item = value.stats[key];
      if (typeof item === "number" && Number.isFinite(item)) stats[key] = Math.round(item * 10_000) / 10_000;
    }
  }
  return {
    sessionId: value.sessionId,
    segmentId: value.segmentId,
    mutationId: value.mutationId,
    sequence,
    captureStartMs,
    captureEndMs,
    sha256: value.sha256,
    stats,
  };
}

async function sha256Hex(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Audio pipeline: stores one complete WAV part in the private bucket and registers a
 * durable receipt plus a transcription job. Transcription happens in the worker, so the
 * request stays short and the browser may discard its local copy after this receipt.
 */
async function handleAudioPart(req: Request) {
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_PART_BYTES + 64 * 1_024) {
    throw new HttpError(413, "audio_part_too_large");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "invalid_multipart_payload");
  }
  const metadata = parseAudioMetadata(form.get("metadata"));
  const file = form.get("audio");
  if (!(file instanceof File)) throw new HttpError(400, "audio_part_required");
  if (file.size <= 44 || file.size > MAX_AUDIO_PART_BYTES) throw new HttpError(413, "audio_part_size_out_of_bounds");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (await sha256Hex(bytes) !== metadata.sha256) throw new HttpError(422, "audio_part_hash_mismatch");
  let wavDuration: number;
  try {
    wavDuration = inspectWav(bytes).durationMs;
  } catch {
    throw new HttpError(422, "audio_part_invalid_wav");
  }
  if (Math.abs(wavDuration - (metadata.captureEndMs - metadata.captureStartMs)) > 1_500) {
    throw new HttpError(422, "audio_part_duration_mismatch");
  }

  const caller = await authenticateMeetingUser(req);
  const { data: session, error: scopeError } = await caller.client
    .from("agenda_meeting_sessions")
    .select("org_id,event_id")
    .eq("id", metadata.sessionId)
    .maybeSingle();
  if (scopeError) throw new HttpError(503, "meeting_scope_lookup_failed", true);
  if (!session) throw new HttpError(403, "forbidden");
  const scope = session as SessionScope;
  await authorizeMeetingAction(caller.client, "transcribe_segment", scope.org_id, scope.event_id, metadata.sessionId);

  const admin = createMeetingAdminClient();
  const path = `${scope.org_id}/${scope.event_id}/${metadata.sessionId}/audio/${String(metadata.sequence).padStart(5, "0")}-${metadata.segmentId}.wav`;
  const { data: existing, error: existingError } = await looseClient(admin)
    .from("agenda_meeting_segment_receipts")
    .select("sha256,audio_storage_path,status")
    .eq("session_id", metadata.sessionId)
    .eq("sequence", metadata.sequence)
    .maybeSingle();
  if (existingError) throw new HttpError(503, "meeting_scope_lookup_failed", true);
  if (existing && existing.sha256 && existing.sha256 !== metadata.sha256) {
    throw new HttpError(409, "segment_conflict");
  }
  // Retries of a part whose audio is already durable skip the upload entirely.
  const alreadyStored = Boolean(existing?.audio_storage_path === path && existing.status !== "lost");
  if (!alreadyStored) {
    const upload = await admin.storage.from(MEETING_AUDIO_BUCKET).upload(path, bytes as unknown as Blob, {
      contentType: "audio/wav",
      upsert: true,
    });
    if (upload.error) {
      logSafe("error", "agenda_meeting_audio_upload_failed", { sessionId: metadata.sessionId, sequence: metadata.sequence });
      throw new HttpError(503, "audio_storage_unavailable", true);
    }
  }
  const { data, error } = await looseClient(admin).rpc("agenda_meeting_register_audio_segment", {
    p_actor_user_id: caller.id,
    p_session_id: metadata.sessionId,
    p_segment_id: metadata.segmentId,
    p_sequence: metadata.sequence,
    p_capture_start_ms: metadata.captureStartMs,
    p_capture_end_ms: metadata.captureEndMs,
    p_mime_type: "audio/wav",
    p_byte_size: bytes.byteLength,
    p_sha256: metadata.sha256,
    p_mutation_id: metadata.mutationId,
    p_storage_path: path,
    p_client_stats: metadata.stats,
  });
  if (error) {
    // Never keep audio that has no receipt (closed sequence, conflict, deleted session...).
    if (!alreadyStored) {
      const { data: owner } = await looseClient(admin).from("agenda_meeting_segment_receipts")
        .select("id").eq("audio_storage_path", path).maybeSingle();
      if (!owner) await admin.storage.from(MEETING_AUDIO_BUCKET).remove([path]).catch(() => undefined);
    }
    const raw = `${error.message ?? ""}`;
    if (raw.includes("AUDIO_BUDGET_EXCEEDED")) throw new HttpError(422, "meeting_audio_budget_exceeded");
    if (raw.includes("DURATION_LIMIT_REACHED")) throw new HttpError(422, "meeting_duration_limit_reached");
    if (raw.includes("SEQUENCE_CLOSED")) throw new HttpError(409, "meeting_sequence_closed");
    if (raw.includes("PIPELINE_CONFLICT")) throw new HttpError(409, "meeting_pipeline_conflict");
    throw mapDatabaseError(error);
  }
  const result: Record<string, unknown> = isPlainObject(data) ? data : {};
  const status = typeof result.status === "string" ? result.status : "accepted";
  const receipt = {
    segmentId: metadata.segmentId,
    sequence: metadata.sequence,
    status,
    canonicalReceiptId: typeof result.canonicalReceiptId === "string" ? result.canonicalReceiptId : null,
    retryAfterMs: null,
    errorCode: typeof result.errorCode === "string" ? result.errorCode : null,
    durable: result.durable === true,
  };
  return jsonResponse(req, { ok: true, status, canonicalReceiptId: receipt.canonicalReceiptId, retryAfterMs: null, errorCode: receipt.errorCode, receipt });
}

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
    if ((req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      return await handleAudioPart(req);
    }
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new HttpError(400, "invalid_payload");
    }
    const payload = parseTextSegmentPayload(rawBody);
    const caller = await authenticateMeetingUser(req);

    const { data: session, error: scopeError } = await looseClient(caller.client)
      .from("agenda_meeting_sessions")
      .select("org_id,event_id,pipeline")
      .eq("id", payload.sessionId)
      .maybeSingle();
    if (session && (session as { pipeline?: string }).pipeline === "audio_gemini_v1") {
      throw new HttpError(409, "meeting_pipeline_conflict");
    }
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
    const { data, error } = await looseClient(admin).rpc(
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

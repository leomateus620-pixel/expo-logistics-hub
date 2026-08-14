import {
  isPlainObject,
  isUuid,
  MAX_SEGMENT_DURATION_MS,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  constantTimeEqual,
  sha256Hex,
} from "../_shared/agenda-meeting/crypto.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  readBodyBytes,
} from "../_shared/agenda-meeting/http.ts";
import {
  createMeetingAdminClient,
  mapDatabaseError,
} from "../_shared/agenda-meeting/supabase.ts";
import {
  DeepgramMeetingSttAdapter,
  SttProviderError,
} from "../_shared/agenda-meeting/stt.ts";

const MAX_CALLBACK_BODY_BYTES = 4 * 1_024 * 1_024;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

interface CallbackReceipt {
  id: string;
  segment_id: string;
  attempt_id: string;
  callback_token_hash: string | null;
  callback_token_expires_at: string | null;
  provider_request_id: string | null;
  capture_start_ms: number;
  status: string;
}

function callbackRequestId(payload: unknown) {
  if (!isPlainObject(payload) || !isPlainObject(payload.metadata)) return null;
  return typeof payload.metadata.request_id === "string" &&
      payload.metadata.request_id.trim()
    ? payload.metadata.request_id.trim()
    : null;
}

function parseCallbackJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_callback_json");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const attemptId = url.searchParams.get("attempt");
    const segmentId = url.searchParams.get("segment");
    const opaqueToken = url.searchParams.get("token") ?? "";
    if (
      !isUuid(attemptId) || !isUuid(segmentId) ||
      !OPAQUE_TOKEN_PATTERN.test(opaqueToken)
    ) {
      throw new HttpError(401, "invalid_callback");
    }

    const admin = createMeetingAdminClient();
    const { data: rawReceipt, error: receiptError } = await admin
      .from("agenda_meeting_segment_receipts")
      .select(
        "id,segment_id,attempt_id,callback_token_hash,callback_token_expires_at,provider_request_id,capture_start_ms,status",
      )
      .eq("attempt_id", attemptId)
      .eq("segment_id", segmentId)
      .maybeSingle();
    if (receiptError) {
      throw new HttpError(503, "callback_receipt_lookup_failed", true);
    }
    if (!rawReceipt) throw new HttpError(401, "invalid_callback");
    const receipt = rawReceipt as CallbackReceipt;
    const suppliedTokenHash = await sha256Hex(opaqueToken);
    if (
      !receipt.callback_token_hash ||
      !constantTimeEqual(receipt.callback_token_hash, suppliedTokenHash)
    ) {
      throw new HttpError(401, "invalid_callback");
    }
    if (
      !receipt.callback_token_expires_at ||
      Date.parse(receipt.callback_token_expires_at) < Date.now()
    ) {
      throw new HttpError(401, "callback_expired");
    }

    const bodyBytes = await readBodyBytes(req, MAX_CALLBACK_BODY_BYTES);
    if (bodyBytes.byteLength === 0) {
      throw new HttpError(400, "callback_body_required");
    }
    const callbackDigest = await sha256Hex(bodyBytes);
    const payload = parseCallbackJson(bodyBytes);
    const adapter = new DeepgramMeetingSttAdapter();
    if (
      !adapter.verifyCallback({
        headers: req.headers,
        payload,
        expectedAttemptId: attemptId,
        expectedSegmentId: segmentId,
      })
    ) {
      throw new HttpError(401, "invalid_callback_provider");
    }

    const providerRequestId = callbackRequestId(payload);
    if (!providerRequestId) {
      throw new HttpError(400, "callback_request_id_missing");
    }
    if (
      receipt.provider_request_id &&
      !constantTimeEqual(receipt.provider_request_id, providerRequestId)
    ) {
      throw new HttpError(409, "callback_request_id_conflict");
    }

    let normalized;
    try {
      normalized = adapter.normalizeResult(payload);
      const timingLimitMs = MAX_SEGMENT_DURATION_MS + 5_000;
      if (
        normalized.durationMs > timingLimitMs ||
        normalized.words.some((word) =>
          word.startMs > timingLimitMs || word.endMs > timingLimitMs
        )
      ) {
        throw new SttProviderError(
          "stt_callback_timing_invalid",
          null,
          false,
        );
      }
    } catch (error) {
      if (error instanceof SttProviderError && !error.retryable) {
        const failure = adapter.classifyError(error);
        const { error: failureError } = await admin.rpc(
          "agenda_meeting_fail_segment",
          {
            p_receipt_id: receipt.id,
            p_error_code: failure.code,
            p_terminal: true,
            p_retry_after_ms: null,
          },
        );
        if (failureError) throw mapDatabaseError(failureError);
        return jsonResponse(req, { ok: true, status: "terminal_error" });
      }
      throw error;
    }

    if (
      normalized.requestId !== providerRequestId ||
      normalized.attemptId !== attemptId ||
      normalized.segmentId !== segmentId
    ) {
      throw new HttpError(409, "callback_metadata_conflict");
    }
    const globallyTimedWords = normalized.words.map((word) => ({
      ...word,
      startMs: receipt.capture_start_ms + word.startMs,
      endMs: receipt.capture_start_ms + word.endMs,
    }));

    const { data, error } = await admin.rpc("agenda_meeting_complete_segment", {
      p_callback_token_hash: suppliedTokenHash,
      p_callback_digest: callbackDigest,
      p_provider_request_id: normalized.requestId,
      p_attempt_id: normalized.attemptId,
      p_transcript: normalized.transcript,
      p_words: globallyTimedWords,
      p_duration_ms: normalized.durationMs,
      p_confidence: normalized.confidence,
    });
    if (error) throw mapDatabaseError(error);
    const result: Record<string, unknown> = isPlainObject(data) ? data : {};
    return jsonResponse(req, {
      ok: true,
      status: typeof result.status === "string" ? result.status : "transcribed",
      duplicate: result.duplicate === true,
    });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_stt_callback");
  }
});

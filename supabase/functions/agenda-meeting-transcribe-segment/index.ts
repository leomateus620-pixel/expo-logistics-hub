import {
  isPlainObject,
  MAX_SEGMENT_BYTES,
  parseSegmentUploadMetadata,
  removeUnsafeControlCharacters,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  constantTimeEqual,
  randomOpaqueToken,
  sha256Hex,
} from "../_shared/agenda-meeting/crypto.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  logSafe,
  optionsResponse,
  readBodyBytes,
} from "../_shared/agenda-meeting/http.ts";
import {
  authenticateMeetingUser,
  authorizeMeetingAction,
  createMeetingAdminClient,
  mapDatabaseError,
} from "../_shared/agenda-meeting/supabase.ts";
import { DeepgramMeetingSttAdapter } from "../_shared/agenda-meeting/stt.ts";

const CALLBACK_TOKEN_TTL_MS = 30 * 60 * 1_000;

interface SessionScope {
  org_id: string;
  event_id: string;
}

interface PreparedSegment {
  receiptId: string;
  canonicalReceiptId?: string | null;
  attemptId: string;
  segmentId: string;
  sequence: number;
  status: string;
  retryAfterMs?: number | null;
  errorCode?: string | null;
  shouldForward: boolean;
  keyterms?: unknown;
}

function requirePreparedSegment(value: unknown): PreparedSegment {
  if (
    !isPlainObject(value) ||
    typeof value.receiptId !== "string" ||
    typeof value.attemptId !== "string" ||
    typeof value.segmentId !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    typeof value.status !== "string" ||
    typeof value.shouldForward !== "boolean"
  ) {
    throw new HttpError(503, "invalid_segment_prepare_result", true);
  }
  return value as unknown as PreparedSegment;
}

function collectActualKeyterms(value: unknown, output: string[], depth = 0) {
  if (depth > 3 || output.length >= 24) return;
  if (typeof value === "string") {
    const normalized = removeUnsafeControlCharacters(value).replace(/\s+/g, " ")
      .trim();
    if (normalized) output.push(normalized.slice(0, 80));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectActualKeyterms(item, output, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of ["title", "location", "name"]) {
    if (key in value) collectActualKeyterms(value[key], output, depth + 1);
  }
}

function receiptPayload(
  segment: PreparedSegment,
  overrides: Record<string, unknown> = {},
) {
  const status = typeof overrides.status === "string"
    ? overrides.status
    : segment.status;
  const canonicalReceiptId = overrides.canonicalReceiptId !== undefined
    ? overrides.canonicalReceiptId
    : segment.canonicalReceiptId ?? null;
  const retryAfterMs = overrides.retryAfterMs !== undefined
    ? overrides.retryAfterMs
    : segment.retryAfterMs ?? null;
  const errorCode = overrides.errorCode !== undefined
    ? overrides.errorCode
    : segment.errorCode ?? null;
  const receipt = {
    segmentId: segment.segmentId,
    sequence: segment.sequence,
    status,
    canonicalReceiptId,
    retryAfterMs,
    errorCode,
  };
  return {
    ok: true,
    status,
    canonicalReceiptId,
    retryAfterMs,
    errorCode,
    receipt,
  };
}

function callbackUrl(
  attemptId: string,
  segmentId: string,
  opaqueToken: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new HttpError(503, "server_configuration_missing", true);
  }
  const url = new URL(
    `${supabaseUrl}/functions/v1/agenda-meeting-stt-callback`,
  );
  url.searchParams.set("attempt", attemptId);
  url.searchParams.set("segment", segmentId);
  url.searchParams.set("token", opaqueToken);
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const metadata = parseSegmentUploadMetadata(req);
    const caller = await authenticateMeetingUser(req);

    // Resolve the scope through a user client, so RLS is evaluated before service role.
    const { data: session, error: scopeError } = await caller.client
      .from("agenda_meeting_sessions")
      .select("org_id,event_id")
      .eq("id", metadata.sessionId)
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
      metadata.sessionId,
    );

    const bytes = await readBodyBytes(req, MAX_SEGMENT_BYTES);
    if (bytes.byteLength === 0) {
      throw new HttpError(400, "audio_segment_required");
    }
    const actualSha256 = await sha256Hex(bytes);
    if (!constantTimeEqual(actualSha256, metadata.sha256)) {
      throw new HttpError(422, "segment_sha256_mismatch");
    }

    const opaqueToken = randomOpaqueToken();
    const callbackTokenHash = await sha256Hex(opaqueToken);
    const admin = createMeetingAdminClient();
    const { data: preparedData, error: prepareError } = await admin.rpc(
      "agenda_meeting_prepare_segment",
      {
        p_actor_user_id: caller.id,
        p_session_id: metadata.sessionId,
        p_segment_id: metadata.segmentId,
        p_sequence: metadata.sequence,
        p_capture_start_ms: metadata.captureStartMs,
        p_capture_end_ms: metadata.captureEndMs,
        p_mime_type: metadata.mimeType,
        p_byte_size: bytes.byteLength,
        p_sha256: actualSha256,
        p_mutation_id: metadata.mutationId,
        p_callback_token_hash: callbackTokenHash,
        p_callback_token_expires_at: new Date(
          Date.now() + CALLBACK_TOKEN_TTL_MS,
        ).toISOString(),
      },
    );
    if (prepareError) throw mapDatabaseError(prepareError);
    const prepared = requirePreparedSegment(preparedData);
    if (
      prepared.segmentId !== metadata.segmentId ||
      prepared.sequence !== metadata.sequence
    ) {
      throw new HttpError(409, "segment_prepare_mismatch");
    }
    if (!prepared.shouldForward) {
      if (prepared.status === "accepted") {
        return jsonResponse(
          req,
          receiptPayload(prepared, {
            status: "retryable_error",
            retryAfterMs: prepared.retryAfterMs ?? 120_000,
            errorCode: "segment_submission_pending",
          }),
        );
      }
      return jsonResponse(req, receiptPayload(prepared));
    }

    const keyterms: string[] = [];
    collectActualKeyterms(prepared.keyterms, keyterms);
    const adapter = new DeepgramMeetingSttAdapter();
    try {
      const accepted = await adapter.submitSegment({
        bytes,
        mimeType: metadata.mimeType,
        callbackUrl: callbackUrl(
          prepared.attemptId,
          prepared.segmentId,
          opaqueToken,
        ),
        attemptId: prepared.attemptId,
        segmentId: prepared.segmentId,
        keyterms,
      });
      const { data: acceptedData, error: acceptedError } = await admin.rpc(
        "agenda_meeting_accept_segment",
        {
          p_receipt_id: prepared.receiptId,
          p_provider_request_id: accepted.requestId,
        },
      );
      if (acceptedError) {
        // Deepgram may already deliver the callback. Do not expose or retain the audio;
        // polling will converge through the prepared attempt/token pair.
        logSafe("warn", "agenda_meeting_segment_acceptance_write_deferred", {
          receiptId: prepared.receiptId,
          segmentId: prepared.segmentId,
          sequence: prepared.sequence,
          errorCode: "acceptance_write_failed",
        });
        return jsonResponse(
          req,
          receiptPayload(prepared, { status: "processing" }),
          202,
        );
      }
      const acceptedResult: Record<string, unknown> =
        isPlainObject(acceptedData) ? acceptedData : {};
      return jsonResponse(
        req,
        receiptPayload(prepared, {
          status: typeof acceptedResult.status === "string"
            ? acceptedResult.status
            : "processing",
          canonicalReceiptId: acceptedResult.canonicalReceiptId ?? null,
        }),
        202,
      );
    } catch (providerError) {
      const failure = adapter.classifyError(providerError);
      const { data: failedData, error: failedError } = await admin.rpc(
        "agenda_meeting_fail_segment",
        {
          p_receipt_id: prepared.receiptId,
          p_error_code: failure.code,
          p_terminal: !failure.retryable,
          p_retry_after_ms: failure.retryAfterMs,
        },
      );
      if (failedError) throw mapDatabaseError(failedError);
      const failed: Record<string, unknown> = isPlainObject(failedData)
        ? failedData
        : {};
      return jsonResponse(
        req,
        receiptPayload(prepared, {
          status: typeof failed.status === "string"
            ? failed.status
            : failure.retryable
            ? "retryable_error"
            : "terminal_error",
          retryAfterMs: failed.retryAfterMs ?? failure.retryAfterMs,
          errorCode: failed.errorCode ?? failure.code,
          canonicalReceiptId: failed.canonicalReceiptId ?? null,
        }),
      );
    }
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_transcribe_segment");
  }
});

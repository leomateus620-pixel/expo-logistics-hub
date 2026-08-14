import { constantTimeEqual } from "./crypto.ts";
import {
  isPlainObject,
  isUuid,
  removeUnsafeControlCharacters,
} from "./contracts.ts";

export interface MeetingSttSubmission {
  bytes: Uint8Array;
  mimeType: string;
  callbackUrl: string;
  attemptId: string;
  segmentId: string;
  keyterms: string[];
}

export interface MeetingSttAccepted {
  requestId: string;
}

export interface MeetingSttWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface NormalizedMeetingTranscript {
  requestId: string;
  attemptId: string;
  segmentId: string;
  transcript: string;
  words: MeetingSttWord[];
  durationMs: number;
  confidence: number | null;
}

export interface MeetingSttFailure {
  code: string;
  retryable: boolean;
  retryAfterMs: number | null;
}

export interface MeetingSttAdapter {
  submitSegment(input: MeetingSttSubmission): Promise<MeetingSttAccepted>;
  verifyCallback(input: {
    headers: Headers;
    payload: unknown;
    expectedAttemptId: string;
    expectedSegmentId: string;
  }): boolean;
  normalizeResult(payload: unknown): NormalizedMeetingTranscript;
  classifyError(error: unknown): MeetingSttFailure;
}

export class SttProviderError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    code: string,
    status: number | null,
    retryable: boolean,
    retryAfterMs: number | null = null,
  ) {
    super(code);
    this.name = "SttProviderError";
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function requireSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new SttProviderError("stt_configuration_missing", null, true, 30_000);
  }
  return value;
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const child = value[key];
  return isPlainObject(child) ? child : null;
}

function arrayAt(value: unknown, key: string): unknown[] {
  if (!isPlainObject(value)) return [];
  return Array.isArray(value[key]) ? value[key] as unknown[] : [];
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function millisecondsFromSeconds(value: unknown, fallback = 0) {
  const seconds = boundedNumber(value, 0, 24 * 60 * 60);
  return seconds === null ? fallback : Math.round(seconds * 1_000);
}

function normalizeKeyterms(values: string[]) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const input of values) {
    const term = removeUnsafeControlCharacters(input).replace(/\s+/g, " ")
      .trim().slice(0, 80);
    const key = term.toLocaleLowerCase("pt-BR");
    if (term.length < 2 || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length >= 24) break;
  }
  return terms;
}

function parseRetryAfter(response: Response) {
  const raw = response.headers.get("Retry-After");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(300_000, Math.round(seconds * 1_000));
  }
  const date = Date.parse(raw);
  return Number.isFinite(date)
    ? Math.max(0, Math.min(300_000, date - Date.now()))
    : null;
}

function deepgramFailure(status: number, retryAfterMs: number | null) {
  if (status === 408) {
    return new SttProviderError(
      "stt_provider_timeout",
      status,
      true,
      retryAfterMs ?? 5_000,
    );
  }
  if (status === 409) {
    return new SttProviderError(
      "stt_provider_conflict",
      status,
      true,
      retryAfterMs ?? 2_000,
    );
  }
  if (status === 429) {
    return new SttProviderError(
      "stt_provider_rate_limited",
      status,
      true,
      retryAfterMs ?? 10_000,
    );
  }
  if (status >= 500) {
    return new SttProviderError(
      "stt_provider_unavailable",
      status,
      true,
      retryAfterMs ?? 10_000,
    );
  }
  if (status === 401 || status === 403) {
    return new SttProviderError(
      "stt_provider_authorization_failed",
      status,
      false,
    );
  }
  if (status === 400 || status === 415 || status === 422) {
    return new SttProviderError("stt_provider_rejected_media", status, false);
  }
  return new SttProviderError("stt_provider_rejected_request", status, false);
}

export class DeepgramMeetingSttAdapter implements MeetingSttAdapter {
  private readonly apiKey: string;
  private readonly apiKeyIdentifier: string;

  constructor() {
    this.apiKey = requireSecret("DEEPGRAM_API_KEY");
    this.apiKeyIdentifier = requireSecret("DEEPGRAM_API_KEY_ID");
  }

  async submitSegment(
    input: MeetingSttSubmission,
  ): Promise<MeetingSttAccepted> {
    const endpoint = new URL("https://api.deepgram.com/v1/listen");
    endpoint.searchParams.set("model", "nova-3");
    endpoint.searchParams.set("language", "pt-BR");
    endpoint.searchParams.set("smart_format", "true");
    endpoint.searchParams.set("utterances", "true");
    endpoint.searchParams.set("mip_opt_out", "true");
    endpoint.searchParams.set("callback_method", "POST");
    endpoint.searchParams.set("callback", input.callbackUrl);
    endpoint.searchParams.append("extra", `attempt_id:${input.attemptId}`);
    endpoint.searchParams.append("extra", `segment_id:${input.segmentId}`);
    for (const keyterm of normalizeKeyterms(input.keyterms)) {
      endpoint.searchParams.append("keyterm", keyterm);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort("stt_submission_timeout"),
      25_000,
    );
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Token ${this.apiKey}`,
          "Content-Type": input.mimeType,
        },
        body: Uint8Array.from(input.bytes).buffer,
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw deepgramFailure(response.status, parseRetryAfter(response));
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new SttProviderError(
          "stt_provider_invalid_acceptance",
          response.status,
          true,
          5_000,
        );
      }
      const requestId =
        isPlainObject(payload) && typeof payload.request_id === "string"
          ? payload.request_id
          : null;
      if (!requestId) {
        throw new SttProviderError(
          "stt_provider_invalid_acceptance",
          response.status,
          true,
          5_000,
        );
      }
      return { requestId };
    } catch (error) {
      if (error instanceof SttProviderError) throw error;
      if (controller.signal.aborted) {
        throw new SttProviderError(
          "stt_submission_ambiguous",
          null,
          true,
          15_000,
        );
      }
      throw new SttProviderError(
        "stt_provider_network_error",
        null,
        true,
        5_000,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyCallback(input: {
    headers: Headers;
    payload: unknown;
    expectedAttemptId: string;
    expectedSegmentId: string;
  }): boolean {
    const suppliedIdentifier = input.headers.get("dg-token")?.trim() ?? "";
    if (
      !suppliedIdentifier ||
      !constantTimeEqual(this.apiKeyIdentifier, suppliedIdentifier)
    ) return false;
    const metadata = objectAt(input.payload, "metadata");
    const extra = objectAt(metadata, "extra");
    const attemptId = extra?.attempt_id;
    const segmentId = extra?.segment_id;
    return (
      typeof attemptId === "string" &&
      typeof segmentId === "string" &&
      constantTimeEqual(input.expectedAttemptId, attemptId) &&
      constantTimeEqual(input.expectedSegmentId, segmentId)
    );
  }

  normalizeResult(payload: unknown): NormalizedMeetingTranscript {
    const metadata = objectAt(payload, "metadata");
    const extra = objectAt(metadata, "extra");
    const requestId = metadata?.request_id;
    const attemptId = extra?.attempt_id;
    const segmentId = extra?.segment_id;
    if (
      typeof requestId !== "string" || !requestId ||
      !isUuid(attemptId) || !isUuid(segmentId)
    ) {
      throw new SttProviderError("stt_callback_metadata_invalid", null, false);
    }

    const results = objectAt(payload, "results");
    const channel = arrayAt(results, "channels").find(isPlainObject) as
      | Record<string, unknown>
      | undefined;
    const alternative = arrayAt(channel, "alternatives").find(isPlainObject) as
      | Record<string, unknown>
      | undefined;
    const transcript = typeof alternative?.transcript === "string"
      ? removeUnsafeControlCharacters(alternative.transcript).trim()
      : "";
    if (transcript.length > 100_000) {
      throw new SttProviderError("stt_transcript_too_large", null, false);
    }

    const words: MeetingSttWord[] = [];
    for (const rawWord of arrayAt(alternative, "words").slice(0, 5_000)) {
      if (!isPlainObject(rawWord)) continue;
      const rawText = typeof rawWord.punctuated_word === "string"
        ? rawWord.punctuated_word
        : typeof rawWord.word === "string"
        ? rawWord.word
        : "";
      const text = removeUnsafeControlCharacters(rawText).trim().slice(0, 500);
      if (!text) continue;
      const startMs = millisecondsFromSeconds(rawWord.start);
      const endMs = Math.max(
        startMs,
        millisecondsFromSeconds(rawWord.end, startMs),
      );
      words.push({
        text,
        startMs,
        endMs,
        confidence: boundedNumber(rawWord.confidence, 0, 1),
      });
    }

    return {
      requestId,
      attemptId,
      segmentId,
      transcript,
      words,
      durationMs: millisecondsFromSeconds(
        metadata?.duration,
        words.at(-1)?.endMs ?? 0,
      ),
      confidence: boundedNumber(alternative?.confidence, 0, 1),
    };
  }

  classifyError(error: unknown): MeetingSttFailure {
    if (error instanceof SttProviderError) {
      return {
        code: error.message,
        retryable: error.retryable,
        retryAfterMs: error.retryAfterMs,
      };
    }
    return {
      code: "stt_provider_unknown_error",
      retryable: true,
      retryAfterMs: 5_000,
    };
  }
}

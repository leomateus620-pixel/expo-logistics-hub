import {
  configuredModel,
  DEFAULT_TRANSCRIPTION_MODEL,
  gatewayApiKey,
  gatewayRequestId,
  LOVABLE_AI_GATEWAY_URL,
  ProviderError,
  providerErrorFromResponse,
  readServerSentEvents,
} from "./gateway.ts";

/** Gemini 3.5 Transcribe accepts at most 14 MB per file on the gateway. */
export const GEMINI_TRANSCRIBE_MAX_FILE_BYTES = 14 * 1_024 * 1_024;

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(view.getUint8(offset + index));
  return value;
}

/** Validates a canonical PCM WAV container produced by the browser capture engine. */
export function inspectWav(bytes: Uint8Array): WavInfo {
  if (bytes.byteLength < 44) throw new Error("wav_too_small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") throw new Error("wav_invalid_header");
  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.byteLength) throw new Error("wav_invalid_format");
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new Error("wav_format_missing");
      if (format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels !== 1) throw new Error("wav_unsupported_encoding");
      if (format.sampleRate < 8_000 || format.sampleRate > 48_000) throw new Error("wav_unsupported_sample_rate");
      const dataBytes = Math.min(size, bytes.byteLength - body);
      if (dataBytes <= 0 || dataBytes % 2 !== 0) throw new Error("wav_invalid_data");
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        bitsPerSample: format.bitsPerSample,
        dataBytes,
        durationMs: Math.round((dataBytes / 2 / format.sampleRate) * 1_000),
      };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("wav_data_missing");
}

export interface TranscriptionResult {
  text: string;
  model: string;
  providerRequestId: string;
  usage: Record<string, number | string | null>;
}

function safeUsage(value: unknown): Record<string, number | string | null> {
  if (!value || typeof value !== "object") return {};
  const usage = value as Record<string, unknown>;
  const output: Record<string, number | string | null> = {};
  for (const key of ["type", "input_tokens", "output_tokens", "total_tokens", "seconds"]) {
    const item = usage[key];
    if (typeof item === "number" && Number.isFinite(item)) output[key] = Math.round(item);
    else if (typeof item === "string") output[key] = item.slice(0, 40);
  }
  return output;
}

/**
 * Transcribes one complete audio part with Gemini 3.5 Transcribe through the
 * Lovable AI Gateway (`/v1/audio/transcriptions`, multipart, SSE). The spoken
 * Portuguese is returned as delivered by the provider; no summarisation.
 */
export async function transcribeAudioPart(
  audio: Uint8Array,
  fileName: string,
  options: { language?: string; signal?: AbortSignal } = {},
): Promise<TranscriptionResult> {
  if (audio.byteLength === 0 || audio.byteLength > GEMINI_TRANSCRIBE_MAX_FILE_BYTES) {
    throw new ProviderError("transcription_audio_size_invalid", false, 0);
  }
  const apiKey = gatewayApiKey("transcription");
  const model = configuredModel("AGENDA_MEETING_TRANSCRIPTION_MODEL", DEFAULT_TRANSCRIPTION_MODEL, "google");
  const form = new FormData();
  form.append("model", model.gatewayId);
  form.append("file", new Blob([audio], { type: "audio/wav" }), fileName);
  form.append("response_format", "json");
  form.append("stream", "true");
  form.append("language", options.language ?? "pt-BR");

  let response: Response;
  try {
    response = await fetch(`${LOVABLE_AI_GATEWAY_URL}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ProviderError("transcription_provider_network_error", true, 30);
  }
  if (!response.ok) throw await providerErrorFromResponse(response, "transcription");
  const requestId = gatewayRequestId(response) ?? `gateway:${crypto.randomUUID()}`;
  if (!response.body) throw new ProviderError("transcription_provider_empty_response", true, 30, { providerRequestId: requestId });

  let deltas = "";
  let finalText: string | null = null;
  let usage: Record<string, number | string | null> = {};
  try {
    for await (const event of readServerSentEvents(response.body)) {
      const type = typeof event.type === "string" ? event.type : "";
      if (type === "transcript.text.delta" && typeof event.delta === "string") deltas += event.delta;
      else if (type === "transcript.text.done") {
        finalText = typeof event.text === "string" ? event.text : deltas;
        usage = safeUsage(event.usage);
      } else if (type === "error" || event.error) {
        throw new ProviderError("transcription_provider_stream_error", true, 30, { providerRequestId: requestId });
      }
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("transcription_provider_stream_interrupted", true, 30, { providerRequestId: requestId });
  }
  // A stream that ends without the done event is incomplete: never persist a truncated part.
  if (finalText === null) {
    throw new ProviderError("transcription_provider_incomplete", true, 30, { providerRequestId: requestId });
  }
  return { text: finalText.trim(), model: model.id, providerRequestId: requestId, usage };
}

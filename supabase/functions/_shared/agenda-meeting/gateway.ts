/**
 * Lovable AI Gateway helpers shared by the meeting transcription and report steps.
 * The key never leaves the server; only safe identifiers are logged.
 */
export const LOVABLE_AI_GATEWAY_URL = "https://ai.gateway.lovable.dev";
export const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export const DEFAULT_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe";
export const DEFAULT_ANALYSIS_MODEL = "gpt-6.1-sol";

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly retryAfterSeconds: number;
  /** Workspace-level credit/policy block: pause every automated provider call. */
  readonly pauseProvider: boolean;
  readonly providerRequestId: string | null;

  constructor(
    code: string,
    retryable: boolean,
    retryAfterSeconds = 30,
    options: { pauseProvider?: boolean; providerRequestId?: string | null } = {},
  ) {
    super(code);
    this.name = "ProviderError";
    this.retryable = retryable;
    this.retryAfterSeconds = retryable ? Math.max(1, retryAfterSeconds) : 0;
    this.pauseProvider = options.pauseProvider ?? false;
    this.providerRequestId = options.providerRequestId ?? null;
  }
}

export function gatewayApiKey(stage: "transcription" | "analysis") {
  const key = Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (!key) {
    throw new ProviderError(`${stage}_configuration_missing`, false, 0);
  }
  return key;
}

/** Model IDs are configured unprefixed (e.g. gemini-3.5-transcribe) and mapped to the gateway vendor prefix. */
export function configuredModel(
  envName: string,
  fallback: string,
  vendor: "google" | "openai",
) {
  const raw = Deno.env.get(envName)?.trim() || fallback;
  const unprefixed = raw.replace(/^(google|openai)\//, "");
  if (!/^[a-z0-9][a-z0-9.\-]{1,80}$/i.test(unprefixed)) {
    throw new ProviderError(`${envName.toLowerCase()}_invalid`, false, 0);
  }
  return { id: unprefixed, gatewayId: `${vendor}/${unprefixed}` };
}

export function retryAfterSeconds(response: Response, fallback = 30) {
  const value = Number(response.headers.get("Retry-After") ?? "");
  return Number.isFinite(value) && value >= 0
    ? Math.min(900, Math.max(1, Math.ceil(value)))
    : fallback;
}

export function gatewayRequestId(response: Response) {
  return response.headers.get("x-lovable-aig-log-id")?.trim() ||
    response.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || null;
}

/**
 * Maps a non-2xx gateway response to a provider error following the gateway
 * semantics: 429/5xx retry with backoff, 402/403 credit or policy blocks pause
 * all automated calls, everything else is terminal for the current job.
 */
export async function providerErrorFromResponse(
  response: Response,
  stage: "transcription" | "analysis",
) {
  const requestId = gatewayRequestId(response);
  let type = "";
  try {
    const payload = await response.json();
    const error = payload?.error ?? payload;
    type = typeof error?.type === "string" ? error.type : "";
  } catch {
    await response.body?.cancel().catch(() => undefined);
  }
  const status = response.status;
  if (status === 429) {
    return new ProviderError(`${stage}_provider_rate_limited`, true, retryAfterSeconds(response, 30), { providerRequestId: requestId });
  }
  if (status >= 500 || status === 408) {
    return new ProviderError(`${stage}_provider_unavailable`, true, retryAfterSeconds(response, 30), { providerRequestId: requestId });
  }
  if (status === 402) {
    return new ProviderError(`${stage}_credits_exhausted`, false, 0, { pauseProvider: true, providerRequestId: requestId });
  }
  if (status === 401) {
    return new ProviderError(`${stage}_configuration_missing`, false, 0, { providerRequestId: requestId });
  }
  if (status === 403) {
    const credit = /credit|limit|disabled/i.test(type);
    return new ProviderError(
      type === "model_vendor_not_enabled" || type === "provider_not_available_in_region" || type === "model_requires_retention_consent"
        ? `${stage}_model_not_enabled`
        : credit ? `${stage}_credits_exhausted` : `${stage}_provider_denied`,
      false,
      0,
      { pauseProvider: credit, providerRequestId: requestId },
    );
  }
  if (status === 404) {
    return new ProviderError(`${stage}_model_unavailable`, false, 0, { providerRequestId: requestId });
  }
  if (status === 413) {
    return new ProviderError(`${stage}_audio_too_large`, false, 0, { providerRequestId: requestId });
  }
  return new ProviderError(`${stage}_provider_rejected_request`, false, 0, { providerRequestId: requestId });
}

/** Incremental SSE reader yielding parsed `data:` JSON objects. */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += value;
    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
      const data = rawEvent.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === "object") yield parsed as Record<string, unknown>;
        } catch {
          // Ignore keep-alive or malformed fragments; completion is validated by the caller.
        }
      }
      boundary = buffer.search(/\r?\n\r?\n/);
    }
    if (done) break;
  }
  const tail = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if (tail && tail !== "[DONE]") {
    try {
      const parsed = JSON.parse(tail);
      if (parsed && typeof parsed === "object") yield parsed as Record<string, unknown>;
    } catch {
      // incomplete tail
    }
  }
}

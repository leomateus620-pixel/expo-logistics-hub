export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

const DEFAULT_ALLOWED_HEADERS = [
  "authorization",
  "apikey",
  "content-type",
  "x-client-info",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
  "x-meeting-session-id",
  "x-meeting-segment-id",
  "x-meeting-sequence",
  "x-meeting-capture-start-ms",
  "x-meeting-capture-end-ms",
  "x-meeting-sha256",
  "x-meeting-mutation-id",
  "x-worker-token",
].join(", ");

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    status: number,
    code: string,
    retryable = false,
    retryAfterMs: number | null = null,
  ) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function configuredOrigins() {
  return (Deno.env.get("AGENDA_MEETING_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request): HeadersInit {
  const requestOrigin = req.headers.get("Origin");
  const allowlist = configuredOrigins();
  // A missing origin allowlist is a deployment NO-GO. Returning the opaque
  // `null` origin keeps server-to-server callbacks usable while failing closed
  // for browser clients until the production origins are configured.
  const allowedOrigin = requestOrigin && allowlist.includes(requestOrigin)
    ? requestOrigin
    : "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function jsonResponse(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": JSON_CONTENT_TYPE },
  });
}

export function noContentResponse(req: Request, status = 204) {
  return new Response(null, { status, headers: corsHeaders(req) });
}

export function optionsResponse(req: Request) {
  return noContentResponse(req);
}

export async function readBodyBytes(
  req: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "request_body_too_large");
  }
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("request_body_too_large").catch(() => undefined);
      throw new HttpError(413, "request_body_too_large");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "content_type_must_be_json");
  }
  const bytes = await readBodyBytes(req, maxBytes);
  if (bytes.byteLength === 0) throw new HttpError(400, "request_body_required");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function safeLogValue(key: string, value: unknown): unknown {
  if (/audio|body|content|prompt|secret|token|transcript|text/i.test(key)) {
    return "[redacted]";
  }
  if (
    value === null || typeof value === "boolean" || typeof value === "number"
  ) return value;
  if (typeof value === "string") return value.slice(0, 120);
  return "[omitted]";
}

export function logSafe(
  level: "info" | "warn" | "error",
  event: string,
  metadata: Record<string, unknown> = {},
) {
  const safe = Object.fromEntries(
    Object.entries(metadata).map((
      [key, value],
    ) => [key, safeLogValue(key, value)]),
  );
  console[level](event, safe);
}

export function errorResponse(req: Request, error: unknown, scope: string) {
  const httpError = error instanceof HttpError
    ? error
    : new HttpError(500, "internal_error", true);
  logSafe(httpError.status >= 500 ? "error" : "warn", `${scope}_failed`, {
    errorCode: httpError.code,
    status: httpError.status,
  });
  const headers = new Headers({
    ...corsHeaders(req),
    "Content-Type": JSON_CONTENT_TYPE,
  });
  if (httpError.retryAfterMs !== null) {
    headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(httpError.retryAfterMs / 1_000))),
    );
  }
  return new Response(
    JSON.stringify({
      error: httpError.code,
      code: httpError.code,
      retryable: httpError.retryable,
      retryAfterMs: httpError.retryAfterMs,
    }),
    { status: httpError.status, headers },
  );
}

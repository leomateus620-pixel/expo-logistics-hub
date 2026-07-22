// Helpers para chamar o gateway do Lovable App User Connector (Google Calendar).
// O OAuth começa com a client key do conector; chamadas ao Google usam a
// connection_key per-user emitida pelo gateway após o início da autorização.

export const GATEWAY_BASE = "https://connector-gateway.lovable.dev";
export const CONNECTOR_ID = "google_calendar";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function lovableApiKey(): string {
  return requireEnv("LOVABLE_API_KEY");
}

export function clientApiKey(): string {
  return requireEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY");
}

export function extractConnectionKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const connection = record.connection && typeof record.connection === "object"
    ? record.connection as Record<string, unknown>
    : null;

  // O gateway pode devolver tanto o identificador da sessão OAuth quanto a
  // chave final da conexão. Para chamadas reais ao Google, a chave final deve
  // sempre prevalecer; usar session_id em X-Connection-Api-Key gera 401.
  const finalizedCandidates = [
    record.connection_key,
    record.connectionKey,
    record.connection_api_key,
    record.connectionApiKey,
    record.app_user_connection_key,
    record.appUserConnectionKey,
    connection?.connection_key,
    connection?.connectionKey,
    connection?.connection_api_key,
    connection?.connectionApiKey,
    connection?.app_user_connection_key,
    connection?.appUserConnectionKey,
    connection?.key,
  ];
  const sessionCandidates = [
    record.session_id,
    record.sessionId,
    record.oauth_session_id,
    record.oauthSessionId,
  ];
  const key = [...finalizedCandidates, ...sessionCandidates]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof key === "string" ? key.trim() : null;
}

export function extractFinalizedConnectionKey(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const connection = record.connection && typeof record.connection === "object"
    ? record.connection as Record<string, unknown>
    : null;
  const candidates = [
    record.connection_key,
    record.connectionKey,
    record.connection_api_key,
    record.connectionApiKey,
    record.app_user_connection_key,
    record.appUserConnectionKey,
    connection?.connection_key,
    connection?.connectionKey,
    connection?.connection_api_key,
    connection?.connectionApiKey,
    connection?.app_user_connection_key,
    connection?.appUserConnectionKey,
    connection?.key,
  ];
  const key = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof key === "string" ? key.trim() : null;
}

function requireConnectionKey(connectionKey: string | null | undefined): string {
  const key = String(connectionKey ?? "").trim();
  if (!key) throw new Error("missing_connection_key");
  return key;
}

async function gatewayErrorCode(response: Response, text?: string) {
  const body = text ?? await response.text().catch(() => "");
  if (!body) return "provider_rejected";
  try {
    const parsed = JSON.parse(body) as { error?: unknown; type?: unknown; message?: unknown };
    return String(parsed.error ?? parsed.type ?? parsed.message ?? "provider_rejected").slice(0, 120);
  } catch {
    return body.slice(0, 120).replace(/\s+/g, "_");
  }
}

/**
 * Inicia o fluxo OAuth do App User Connector.
 * Retorna { authorization_url, session_id } que o frontend abre em popup.
 * No App User Connector, o session_id é a credencial opaca que passa a ser
 * utilizável pelo gateway depois que o usuário conclui o consentimento.
 */
export async function startOAuth(returnUrl: string, appUserId: string) {
  const res = await fetch(`${GATEWAY_BASE}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey()}`,
      "X-Client-Api-Key": clientApiKey(),
    },
    body: JSON.stringify({
      connector_id: CONNECTOR_ID,
      app_user_id: appUserId,
      return_url: returnUrl,
      credentials_configuration: { scopes: GOOGLE_SCOPES },
    }),
  });
  if (!res.ok) {
    const reason = await gatewayErrorCode(res);
    console.warn("google_calendar_oauth_start_rejected", { status: res.status, reason });
    throw new Error(`oauth_start_failed:${res.status}`);
  }
  const payload = await res.json();
  return { ...payload, connection_key: extractFinalizedConnectionKey(payload) };
}

/**
 * Chama a API do Google via gateway, autenticando como app_user.
 */
export async function callGoogle(
  connectionKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = requireConnectionKey(connectionKey);
  const url = `${GATEWAY_BASE}/${CONNECTOR_ID}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${lovableApiKey()}`);
  headers.set("X-Connection-Api-Key", key);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await fetch(url, { ...init, headers });
}

export async function callGoogleJson<T = unknown>(
  connectionKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await callGoogle(connectionKey, path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`google_api:${res.status}:${await gatewayErrorCode(res, text)}`);
  return text ? JSON.parse(text) : ({} as T);
}

/**
 * Valida que a autorização OAuth foi concluída (endpoint barato).
 * Retorna true se o gateway aceita chamadas como esse app_user.
 */
export async function probeConnection(connectionKey: string | null | undefined): Promise<boolean> {
  if (!String(connectionKey ?? "").trim()) return false;
  try {
    const res = await callGoogle(requireConnectionKey(connectionKey), "/calendar/v3/users/me/settings/timezone");
    if (res.ok) {
      await res.text();
      return true;
    }
    const reason = await gatewayErrorCode(res);
    console.warn("probeConnection rejected", { status: res.status, reason });
    return false;
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    console.warn("probeConnection failed", { reason: message === "missing_connection_key" ? "authorization_pending" : "gateway_unavailable" });
    return false;
  }
}

/** Cria calendário secundário "FENASOJA — Cronograma". */
export async function ensureSecondaryCalendar(connectionKey: string, existingId?: string | null) {
  if (existingId) {
    const check = await callGoogle(connectionKey, `/calendar/v3/calendars/${encodeURIComponent(existingId)}`);
    await check.text();
    if (check.ok) return existingId;
  }
  const created = await callGoogleJson<{ id: string }>(connectionKey, "/calendar/v3/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: "FENASOJA — Cronograma",
      description: "Eventos oficiais da FENASOJA sincronizados automaticamente.",
      timeZone: "America/Sao_Paulo",
    }),
  });
  await callGoogle(connectionKey, `/calendar/v3/users/me/calendarList/${encodeURIComponent(created.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ colorId: "10", summaryOverride: "FENASOJA — Cronograma" }),
  }).then((r) => r.text()).catch(() => {});
  return created.id;
}

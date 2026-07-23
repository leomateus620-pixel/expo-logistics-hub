// Lovable App User Connector gateway helpers for Google Calendar.
// Temporary OAuth identifiers and finalized connection keys intentionally use
// different branded types so a session id cannot be sent to Google by mistake.

export const GATEWAY_BASE = "https://connector-gateway.lovable.dev";
export const CONNECTOR_ID = "google_calendar";
export const SECONDARY_CALENDAR_SUMMARY = "FENASOJA — Cronograma";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  // Full calendar access is required because this integration creates and
  // manages a dedicated secondary calendar, not only events in an existing one.
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

declare const oauthSessionBrand: unique symbol;
declare const oauthExchangeCodeBrand: unique symbol;
declare const finalizedConnectionKeyBrand: unique symbol;

export type OAuthSessionId = string & { readonly [oauthSessionBrand]: true };
export type OAuthExchangeCode = string & { readonly [oauthExchangeCodeBrand]: true };
export type FinalizedConnectionKey = string & { readonly [finalizedConnectionKeyBrand]: true };

export interface OAuthStartResult {
  authorizationUrl: string;
  sessionId: OAuthSessionId;
  state: string;
  responseFields: string[];
}

export interface OAuthExchangeResult {
  connectionKey: FinalizedConnectionKey;
  connectorId: typeof CONNECTOR_ID;
  responseFields: string[];
}

export interface SecondaryCalendarResult {
  calendarId: string;
  disposition: "existing" | "recovered" | "created";
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

export function lovableApiKey(): string {
  return requireEnv("LOVABLE_API_KEY");
}

export function clientApiKey(): string {
  return requireEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY");
}

function asObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("provider_response_invalid");
  }
  return payload as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string, errorCode: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(errorCode);
  return value.trim();
}

export function asOAuthExchangeCode(value: unknown): OAuthExchangeCode {
  if (typeof value !== "string" || !value.trim()) throw new Error("missing_exchange_code");
  return value.trim() as OAuthExchangeCode;
}

export function asFinalizedConnectionKey(value: unknown): FinalizedConnectionKey {
  if (typeof value !== "string" || !value.trim()) throw new Error("missing_connection_key");
  return value.trim() as FinalizedConnectionKey;
}

function safeProviderError(status: number) {
  if (status === 400) return "provider_bad_request";
  if (status === 401 || status === 403) return "provider_unauthorized";
  if (status === 404) return "provider_not_found";
  if (status === 409) return "provider_conflict";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return asObject(JSON.parse(text));
  } catch {
    throw new Error("provider_response_invalid");
  }
}

/** Starts the documented redirect-mode App User Connector flow. */
export async function startOAuth(returnUrl: string, appUserId: string): Promise<OAuthStartResult> {
  const response = await fetch(`${GATEWAY_BASE}/api/v1/app-users/oauth2/authorize`, {
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
      response_mode: "redirect",
    }),
  });
  if (!response.ok) {
    await response.text().catch(() => undefined);
    throw new Error(`oauth_start_failed:${response.status}:${safeProviderError(response.status)}`);
  }

  const payload = await readJsonObject(response);
  const authorizationUrl = requiredString(payload, "authorization_url", "authorization_url_missing");
  const sessionId = requiredString(payload, "session_id", "oauth_session_id_missing") as OAuthSessionId;
  let state = "";
  try {
    state = new URL(authorizationUrl).searchParams.get("state")?.trim() ?? "";
  } catch {
    throw new Error("authorization_url_invalid");
  }
  if (!state) throw new Error("oauth_state_missing");

  return {
    authorizationUrl,
    sessionId,
    state,
    responseFields: Object.keys(payload).sort(),
  };
}

/** Exchanges the one-time callback code using the gateway's exact contract. */
export async function exchangeOAuthCode(code: OAuthExchangeCode): Promise<OAuthExchangeResult> {
  const response = await fetch(`${GATEWAY_BASE}/api/v1/app-users/oauth2/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey()}`,
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    await response.text().catch(() => undefined);
    throw new Error(`oauth_exchange_failed:${response.status}:${safeProviderError(response.status)}`);
  }

  const payload = await readJsonObject(response);
  const connectorId = requiredString(payload, "connector_id", "connector_id_missing");
  if (connectorId !== CONNECTOR_ID) throw new Error("connector_mismatch");
  return {
    connectionKey: asFinalizedConnectionKey(payload.api_key),
    connectorId: CONNECTOR_ID,
    responseFields: Object.keys(payload).sort(),
  };
}

export async function disconnectGoogleConnection(connectionKey: FinalizedConnectionKey) {
  const response = await fetch(`${GATEWAY_BASE}/api/v1/app-users/connection`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey()}`,
      "X-Connection-Api-Key": connectionKey,
    },
    body: JSON.stringify({ connector_id: CONNECTOR_ID }),
  });
  await response.text().catch(() => undefined);
  if (!response.ok && ![404, 410].includes(response.status)) {
    throw new Error(`disconnect_failed:${response.status}:${safeProviderError(response.status)}`);
  }
}

/** Calls Google through the connector with a finalized per-user key only. */
export async function callGoogle(
  connectionKey: FinalizedConnectionKey,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = asFinalizedConnectionKey(connectionKey);
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${lovableApiKey()}`);
  headers.set("X-Connection-Api-Key", key);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return await fetch(`${GATEWAY_BASE}/${CONNECTOR_ID}${path}`, { ...init, headers });
}

export async function callGoogleJson<T = unknown>(
  connectionKey: FinalizedConnectionKey,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await callGoogle(connectionKey, path, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`google_api:${response.status}:${safeProviderError(response.status)}`);
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("google_api_response_invalid");
  }
}

/** Probes an endpoint covered by the requested Calendar scope. */
export async function probeConnection(connectionKey: FinalizedConnectionKey): Promise<boolean> {
  try {
    const response = await callGoogle(
      connectionKey,
      "/calendar/v3/users/me/calendarList?maxResults=1&fields=items(id)",
    );
    await response.text();
    return response.ok;
  } catch {
    return false;
  }
}

interface CalendarListItem {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  deleted?: boolean;
}

async function findSecondaryCalendar(connectionKey: FinalizedConnectionKey) {
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: "250", showDeleted: "false" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await callGoogleJson<{ items?: CalendarListItem[]; nextPageToken?: string }>(
      connectionKey,
      `/calendar/v3/users/me/calendarList?${query.toString()}`,
    );
    const match = page.items?.find((item) =>
      !item.deleted
      && item.id
      && (item.summary === SECONDARY_CALENDAR_SUMMARY || item.summaryOverride === SECONDARY_CALENDAR_SUMMARY)
    );
    if (match?.id) return match.id;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return null;
}

async function calendarIsAccessible(connectionKey: FinalizedConnectionKey, calendarId: string) {
  const response = await callGoogle(
    connectionKey,
    `/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}?fields=id,deleted`,
  );
  const text = await response.text();
  if (!response.ok) return false;
  try {
    const item = JSON.parse(text) as CalendarListItem;
    return item.id === calendarId && item.deleted !== true;
  } catch {
    return false;
  }
}

/** Recovers or creates the dedicated calendar and verifies calendarList access. */
export async function ensureSecondaryCalendar(
  connectionKey: FinalizedConnectionKey,
  existingId?: string | null,
): Promise<SecondaryCalendarResult> {
  if (existingId && await calendarIsAccessible(connectionKey, existingId)) {
    return { calendarId: existingId, disposition: "existing" };
  }

  const recoveredId = await findSecondaryCalendar(connectionKey);
  if (recoveredId) return { calendarId: recoveredId, disposition: "recovered" };

  const created = await callGoogleJson<{ id?: string }>(connectionKey, "/calendar/v3/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: SECONDARY_CALENDAR_SUMMARY,
      description: "Eventos oficiais da FENASOJA sincronizados automaticamente.",
      timeZone: "America/Sao_Paulo",
    }),
  });
  const calendarId = requiredString(created as Record<string, unknown>, "id", "calendar_id_missing");
  await callGoogleJson(connectionKey, `/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`, {
    method: "PATCH",
    body: JSON.stringify({ colorId: "10", summaryOverride: SECONDARY_CALENDAR_SUMMARY }),
  });
  if (!await calendarIsAccessible(connectionKey, calendarId)) throw new Error("secondary_calendar_inaccessible");
  return { calendarId, disposition: "created" };
}

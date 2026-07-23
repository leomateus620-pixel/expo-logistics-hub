// Direct Google Calendar + OAuth 2.0 client. Talks to accounts.google.com,
// oauth2.googleapis.com and www.googleapis.com without any Lovable gateway.
// Every call is server-only; the access token never leaves this backend.

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_API_BASE = "https://www.googleapis.com";
export const CALENDAR_API_BASE = `${GOOGLE_API_BASE}/calendar/v3`;
export const SECONDARY_CALENDAR_SUMMARY = "FENASOJA — Cronograma";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

/** Scopes strictly required for the sync to work. Missing any of these = reconnect. */
export const REQUIRED_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

/** Returns the required scopes missing from Google's granted scope string. */
export function missingRequiredScopes(grantedScope: string | undefined | null): string[] {
  const granted = new Set((grantedScope ?? "").split(/\s+/).filter(Boolean));
  return REQUIRED_CALENDAR_SCOPES.filter((s) => !granted.has(s));
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

export function googleClientId(): string {
  return requireEnv("GOOGLE_OAUTH_CLIENT_ID");
}

export function googleClientSecret(): string {
  return requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
}

export function googleRedirectUri(): string {
  return requireEnv("GOOGLE_OAUTH_REDIRECT_URI");
}

export function buildAuthorizationUrl(state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  return url.toString();
}

export interface GoogleTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export function safeProviderError(status: number): string {
  if (status === 400) return "provider_bad_request";
  if (status === 401) return "provider_unauthorized";
  if (status === 403) return "provider_unauthorized";
  if (status === 404) return "provider_not_found";
  if (status === 409) return "provider_conflict";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("google_response_invalid");
  }
}

/** Exchanges an authorization code for tokens. Called only in the callback. */
export async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenPayload> {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (detail.includes("invalid_grant")) throw new Error("oauth_code_invalid");
    if (response.status === 400) throw new Error("oauth_code_invalid");
    if (response.status === 401) throw new Error("oauth_client_mismatch");
    throw new Error(`oauth_exchange_failed:${response.status}`);
  }
  const payload = await readJson<GoogleTokenPayload>(response);
  if (!payload.access_token) throw new Error("oauth_exchange_failed:missing_access_token");
  if (!payload.refresh_token) throw new Error("refresh_token_missing");
  return payload;
}

/** Refreshes an access token. Returns a token payload without refresh_token when Google omits it. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenPayload> {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (detail.includes("invalid_grant")) throw new Error("refresh_token_invalid");
    throw new Error(`refresh_failed:${response.status}`);
  }
  return await readJson<GoogleTokenPayload>(response);
}

/** Best-effort token revocation on disconnect. */
export async function revokeToken(token: string): Promise<void> {
  const body = new URLSearchParams({ token });
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).catch(() => undefined);
}

/** Fetches basic userinfo. Returns null instead of throwing on soft failures. */
export async function fetchGoogleUserinfo(accessToken: string): Promise<{ email?: string; sub?: string } | null> {
  try {
    const response = await fetch(`${GOOGLE_API_BASE}/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return await readJson<{ email?: string; sub?: string }>(response);
  } catch {
    return null;
  }
}

/** Generic authenticated call to the Calendar v3 API. */
export async function callCalendar(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return await fetch(`${CALENDAR_API_BASE}${path}`, { ...init, headers });
}

export async function callCalendarJson<T = unknown>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await callCalendar(accessToken, path, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`google_api:${response.status}:${safeProviderError(response.status)}`);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("google_response_invalid");
  }
}

export interface ProbeConnectionResult {
  ok: boolean;
  stage: "calendar_list_probe";
  status: number | null;
  safeCode: string;
  attempts: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function probeConnection(
  accessToken: string,
  options: { maxAttempts?: number; initialDelayMs?: number } = {},
): Promise<ProbeConnectionResult> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 8));
  const initialDelayMs = Math.max(200, options.initialDelayMs ?? 500);
  let last: ProbeConnectionResult = {
    ok: false,
    stage: "calendar_list_probe",
    status: null,
    safeCode: "provider_unavailable",
    attempts: 0,
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await callCalendar(
        accessToken,
        "/users/me/calendarList?maxResults=1&fields=items(id)",
      );
      await response.text();
      last = {
        ok: response.ok,
        stage: "calendar_list_probe",
        status: response.status,
        safeCode: response.ok ? "ok" : safeProviderError(response.status),
        attempts: attempt,
      };
      if (response.ok) return last;
      // 401/403 will not recover with retries.
      if (response.status === 401 || response.status === 403) return last;
    } catch {
      last = { ok: false, stage: "calendar_list_probe", status: null, safeCode: "provider_unavailable", attempts: attempt };
    }
    if (attempt < maxAttempts) await wait(initialDelayMs * attempt);
  }
  return last;
}

export interface SecondaryCalendarResult {
  calendarId: string;
  disposition: "existing" | "recovered" | "created";
}

interface CalendarListItem {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  deleted?: boolean;
}

async function findSecondaryCalendar(accessToken: string): Promise<string | null> {
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: "250", showDeleted: "false" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await callCalendarJson<{ items?: CalendarListItem[]; nextPageToken?: string }>(
      accessToken,
      `/users/me/calendarList?${query.toString()}`,
    );
    const match = page.items?.find((item) =>
      !item.deleted && item.id
      && (item.summary === SECONDARY_CALENDAR_SUMMARY || item.summaryOverride === SECONDARY_CALENDAR_SUMMARY)
    );
    if (match?.id) return match.id;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return null;
}

async function calendarIsAccessible(accessToken: string, calendarId: string): Promise<boolean> {
  const response = await callCalendar(
    accessToken,
    `/users/me/calendarList/${encodeURIComponent(calendarId)}?fields=id,deleted`,
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

export async function ensureSecondaryCalendar(
  accessToken: string,
  existingId?: string | null,
): Promise<SecondaryCalendarResult> {
  if (existingId && await calendarIsAccessible(accessToken, existingId)) {
    return { calendarId: existingId, disposition: "existing" };
  }
  const recovered = await findSecondaryCalendar(accessToken);
  if (recovered) return { calendarId: recovered, disposition: "recovered" };
  const created = await callCalendarJson<{ id?: string }>(accessToken, "/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: SECONDARY_CALENDAR_SUMMARY,
      description: "Eventos oficiais da FENASOJA sincronizados automaticamente.",
      timeZone: "America/Sao_Paulo",
    }),
  });
  const calendarId = created.id;
  if (!calendarId) throw new Error("calendar_id_missing");
  await callCalendarJson(accessToken, `/users/me/calendarList/${encodeURIComponent(calendarId)}`, {
    method: "PATCH",
    body: JSON.stringify({ colorId: "10", summaryOverride: SECONDARY_CALENDAR_SUMMARY }),
  }).catch(() => undefined);
  if (!(await calendarIsAccessible(accessToken, calendarId))) throw new Error("secondary_calendar_inaccessible");
  return { calendarId, disposition: "created" };
}

export async function findRemoteEventIds(
  accessToken: string,
  calendarId: string,
  fenasojaEventId: string,
): Promise<string[]> {
  const response = await callCalendarJson<{ items?: Array<{ id?: string }> }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&showDeleted=false&maxResults=250&privateExtendedProperty=${encodeURIComponent(`fenasoja_event_id=${fenasojaEventId}`)}`,
  );
  return [...new Set((response.items ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)))];
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  const response = await callCalendar(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE" },
  );
  await response.text();
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`google_api:${response.status}:delete_failed`);
  }
}

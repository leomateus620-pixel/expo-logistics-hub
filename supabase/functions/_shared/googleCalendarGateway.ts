// Helpers para chamar o gateway do Lovable App User Connector (Google Calendar).
// A autenticação usa app_user_id + client key; a connection é resolvida internamente
// pelo gateway (não expomos connection_key ao app).

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

/**
 * Inicia o fluxo OAuth do App User Connector.
 * Retorna { authorization_url, session_id } que o frontend abre em popup.
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
    throw new Error(`oauth_start_failed:${res.status}:${await res.text()}`);
  }
  return await res.json();
}

/**
 * Chama a API do Google via gateway, autenticando como app_user.
 */
export async function callGoogle(
  appUserId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${GATEWAY_BASE}/${CONNECTOR_ID}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${lovableApiKey()}`);
  headers.set("X-Client-Api-Key", clientApiKey());
  headers.set("X-App-User-Id", appUserId);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await fetch(url, { ...init, headers });
}

export async function callGoogleJson<T = unknown>(
  appUserId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await callGoogle(appUserId, path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`google_api:${res.status}:${text}`);
  return text ? JSON.parse(text) : ({} as T);
}

/**
 * Valida que a autorização OAuth foi concluída (endpoint barato).
 * Retorna true se o gateway aceita chamadas como esse app_user.
 */
export async function probeConnection(appUserId: string): Promise<boolean> {
  try {
    const res = await callGoogle(appUserId, "/calendar/v3/users/me/settings/timezone");
    if (res.ok) {
      await res.text();
      return true;
    }
    const body = await res.text();
    console.warn(`probeConnection http ${res.status}: ${body.slice(0, 300)}`);
    return false;
  } catch (e) {
    console.warn("probeConnection error:", (e as Error).message);
    return false;
  }
}

/** Cria calendário secundário "FENASOJA — Cronograma". */
export async function ensureSecondaryCalendar(appUserId: string, existingId?: string | null) {
  if (existingId) {
    const check = await callGoogle(appUserId, `/calendar/v3/calendars/${existingId}`);
    await check.text();
    if (check.ok) return existingId;
  }
  const created = await callGoogleJson<{ id: string }>(appUserId, "/calendar/v3/calendars", {
    method: "POST",
    body: JSON.stringify({
      summary: "FENASOJA — Cronograma",
      description: "Eventos oficiais da FENASOJA sincronizados automaticamente.",
      timeZone: "America/Sao_Paulo",
    }),
  });
  await callGoogle(appUserId, `/calendar/v3/users/me/calendarList/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ colorId: "10", summaryOverride: "FENASOJA — Cronograma" }),
  }).then((r) => r.text()).catch(() => {});
  return created.id;
}

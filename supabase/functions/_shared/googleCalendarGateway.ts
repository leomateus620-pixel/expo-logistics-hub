// Helpers para chamar o gateway do Lovable App User Connector (Google Calendar).
// A connection_key é uma referência opaca do gateway (NÃO é o token do Google).

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
 * Retorna { authorize_url, session_id } que o frontend abre em popup.
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
 * Recupera a connection_key após o usuário aprovar consent.
 */
export async function fetchConnectionKey(appUserId: string): Promise<string | null> {
  const res = await fetch(
    `${GATEWAY_BASE}/api/v1/app-users/connections?connector_id=${CONNECTOR_ID}&app_user_id=${encodeURIComponent(appUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${lovableApiKey()}`,
        "X-Client-Api-Key": clientApiKey(),
      },
    },
  );
  if (!res.ok) return null;
  const body = await res.json();
  const conn = body?.connections?.[0] ?? body?.[0] ?? body;
  return conn?.connection_key ?? conn?.api_key ?? null;
}

/**
 * Chama a API do Google Calendar via gateway usando a connection_key do usuário.
 */
export async function callGoogle(
  connectionKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${GATEWAY_BASE}/${CONNECTOR_ID}${path}`;
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${lovableApiKey()}`);
  headers.set("X-Connection-Api-Key", connectionKey);
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
  if (!res.ok) throw new Error(`google_api:${res.status}:${text}`);
  return text ? JSON.parse(text) : ({} as T);
}

/** Cria calendário secundário "FENASOJA — Cronograma". */
export async function ensureSecondaryCalendar(connectionKey: string, existingId?: string | null) {
  if (existingId) {
    // verificar se ainda existe
    const check = await callGoogle(connectionKey, `/calendar/v3/calendars/${existingId}`);
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
  // aplicar cor/nome via calendarList
  await callGoogle(connectionKey, `/calendar/v3/users/me/calendarList/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ colorId: "10", summaryOverride: "FENASOJA — Cronograma" }),
  }).catch(() => {});
  return created.id;
}

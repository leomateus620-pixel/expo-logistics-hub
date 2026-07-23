const GOOGLE_CALLBACK_KEYS = [
  'google',
  'google_error',
  'google_result',
  'result',
  'error',
  'error_description',
  'code',
  'state',
  'scope',
  'authuser',
  'prompt',
  'attempt',
  // Legacy key aliases are removed from history but are never consumed.
  'connection_key',
  'connectionKey',
  'connection_api_key',
  'connectionApiKey',
] as const;

export const GOOGLE_CALENDAR_CALLBACK_PATH = '/google-calendar/callback';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GoogleCalendarCallbackFeedback =
  | { kind: 'none' }
  | { kind: 'completion_required'; attemptId: string | null; code: string; state: string | null }
  | { kind: 'cancelled'; code: 'authorization_cancelled'; attemptId: string | null }
  | { kind: 'failed'; code: 'invalid_callback' | 'authorization_failed'; attemptId: string | null };

/**
 * Parses provider input only. It deliberately never reports authorization as
 * successful: only the backend exchange, Google probe and calendar verification
 * can produce a success message. The `attempt` query param is optional — the
 * Lovable connector gateway may strip custom query params from `return_url`,
 * so the backend can resolve the attempt from `state` alone when needed.
 */
export function parseGoogleCalendarCallbackFeedback(search: string): GoogleCalendarCallbackFeedback {
  const params = new URLSearchParams(search);
  const providerError = (params.get('google_error') ?? params.get('error') ?? '').toLowerCase();
  const attemptRaw = params.get('attempt')?.trim() ?? '';
  const attemptId = UUID_PATTERN.test(attemptRaw) ? attemptRaw : null;

  if (providerError === 'access_denied' || providerError === 'cancelled') {
    return { kind: 'cancelled', code: 'authorization_cancelled', attemptId };
  }
  if (providerError) {
    return {
      kind: 'failed',
      code: providerError === 'invalid_state' || providerError === 'missing_code'
        ? 'invalid_callback'
        : 'authorization_failed',
      attemptId,
    };
  }

  const code = params.get('code')?.trim() ?? '';
  const state = params.get('state')?.trim() ?? '';
  if (code && (state || attemptId)) {
    return { kind: 'completion_required', attemptId, code, state: state || null };
  }

  const connectorResult = (
    params.get('google_result')
    ?? params.get('google')
    ?? params.get('result')
    ?? ''
  ).toLowerCase();
  if (connectorResult === 'cancelled' || connectorResult === 'denied') {
    return { kind: 'cancelled', code: 'authorization_cancelled', attemptId };
  }
  if (connectorResult) {
    return { kind: 'failed', code: 'invalid_callback', attemptId };
  }

  const hasOAuthSignal = GOOGLE_CALLBACK_KEYS.some((key) => params.has(key));
  if (hasOAuthSignal) return { kind: 'failed', code: 'invalid_callback', attemptId };
  return { kind: 'none' };
}


export function cleanGoogleCalendarCallbackUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const params = new URLSearchParams(location.search);
  GOOGLE_CALLBACK_KEYS.forEach((key) => params.delete(key));
  if (location.pathname === GOOGLE_CALENDAR_CALLBACK_PATH) params.delete('next');

  const hashValue = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const hashParams = new URLSearchParams(hashValue);
  const hashHadCallbackKeys = GOOGLE_CALLBACK_KEYS.some((key) => hashParams.has(key));
  if (hashHadCallbackKeys) GOOGLE_CALLBACK_KEYS.forEach((key) => hashParams.delete(key));

  const query = params.toString();
  const hash = hashHadCallbackKeys ? hashParams.toString() : hashValue;
  return `${location.pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function getGoogleCalendarCallbackNext(search: string) {
  const raw = new URLSearchParams(search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/cronograma-eventos';
  try {
    const parsed = new URL(raw, 'https://fenasoja.local');
    if (parsed.origin !== 'https://fenasoja.local' || parsed.pathname !== '/cronograma-eventos') {
      return '/cronograma-eventos';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/cronograma-eventos';
  }
}

export function buildGoogleCalendarReturnUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  GOOGLE_CALLBACK_KEYS.forEach((key) => url.searchParams.delete(key));
  url.searchParams.delete('next');

  const callback = new URL(GOOGLE_CALENDAR_CALLBACK_PATH, url.origin);
  callback.searchParams.set('next', `${url.pathname}${url.search}${url.hash}`);
  return callback.toString();
}

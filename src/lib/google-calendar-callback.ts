const GOOGLE_CALLBACK_KEYS = [
  'google',
  'google_error',
  'error',
  'error_description',
  'code',
  'state',
  'scope',
  'authuser',
  'prompt',
] as const;

const GOOGLE_CALENDAR_CALLBACK_PATH = '/google-calendar/callback';

export type GoogleCalendarCallbackFeedback =
  | { kind: 'none' }
  | { kind: 'success' }
  | { kind: 'cancelled'; code: 'authorization_cancelled' }
  | { kind: 'failed'; code: 'invalid_callback' | 'authorization_failed' };

export function parseGoogleCalendarCallbackFeedback(search: string): GoogleCalendarCallbackFeedback {
  const params = new URLSearchParams(search);
  const googleResult = params.get('google');
  const providerError = (params.get('google_error') ?? params.get('error') ?? '').toLowerCase();

  if (providerError === 'access_denied' || providerError === 'cancelled' || googleResult === 'cancelled') {
    return { kind: 'cancelled', code: 'authorization_cancelled' };
  }
  if (providerError === 'invalid_state' || providerError === 'missing_code') {
    return { kind: 'failed', code: 'invalid_callback' };
  }
  if (providerError) return { kind: 'failed', code: 'authorization_failed' };
  if (googleResult === 'connected') return { kind: 'success' };

  // Códigos e estados OAuth pertencem ao callback protegido do gateway. Se
  // chegarem diretamente à aplicação, não devem ser processados no cliente.
  if (params.has('code') || params.has('state')) {
    return { kind: 'failed', code: 'invalid_callback' };
  }
  return { kind: 'none' };
}

export function cleanGoogleCalendarCallbackUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const params = new URLSearchParams(location.search);
  GOOGLE_CALLBACK_KEYS.forEach((key) => params.delete(key));
  if (location.pathname === GOOGLE_CALENDAR_CALLBACK_PATH) params.delete('next');
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}

export function getGoogleCalendarCallbackNext(search: string) {
  const raw = new URLSearchParams(search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/cronograma-eventos';
  try {
    const parsed = new URL(raw, 'https://fenasoja.local');
    if (parsed.origin !== 'https://fenasoja.local') return '/cronograma-eventos';
    if (parsed.pathname !== '/cronograma-eventos') return '/cronograma-eventos';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/cronograma-eventos';
  }
}

export function appendGoogleCalendarCallbackSignal(path: string) {
  const parsed = new URL(path, 'https://fenasoja.local');
  GOOGLE_CALLBACK_KEYS.forEach((key) => parsed.searchParams.delete(key));
  parsed.searchParams.set('google', 'connected');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildGoogleCalendarReturnUrl(currentUrl: string) {
  const url = new URL(currentUrl);
  GOOGLE_CALLBACK_KEYS.forEach((key) => url.searchParams.delete(key));
  url.searchParams.delete('next');

  const callback = new URL(GOOGLE_CALENDAR_CALLBACK_PATH, url.origin);
  callback.searchParams.set('google', 'connected');
  callback.searchParams.set('next', `${url.pathname}${url.search}${url.hash}`);
  return callback.toString();
}

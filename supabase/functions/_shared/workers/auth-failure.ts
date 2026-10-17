/** Authentication transport failures do not establish that access was denied. */
export function workerAuthFailureCode(error: unknown): 'forbidden' | 'network_error' | 'timeout' | 'query_failed' {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof value.status === 'number' ? value.status : undefined;
  const name = typeof value.name === 'string' ? value.name : '';
  const message = typeof value.message === 'string' ? value.message : '';
  if (status === 408 || status === 504 || /timeout|timed out/i.test(message)) return 'timeout';
  if (name === 'AuthRetryableFetchError' || status === 0 || status !== undefined && status >= 500
    || /fetch failed|failed to fetch|network|connection|load failed/i.test(message)) return 'network_error';
  if (status === 401 || status === 403 || /AuthSessionMissingError|AuthInvalidJwtError/.test(name)
    || /session.*missing|no session|invalid.*(?:jwt|token)|jwt.*expired/i.test(message)) return 'forbidden';
  return 'query_failed';
}

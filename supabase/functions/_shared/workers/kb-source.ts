/** Public source syntax shared by the server, renderer and seed validation.
 * This is not proof of registration: the selected KB row and SQL also verify URL/date.
 */
export function isSafeKbSourceUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- Reject URL parser normalization of unsafe characters.
  if (!value || value.length > 1200 || /[\s\\<>`"\u0000-\u001f\u007f]/.test(value)
    || /%(?![0-9a-f]{2})|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    // Registered sources use public DNS names; reject IP literals, including URL-normalized numeric forms.
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
      || /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|lan|home|test|invalid|onion)$/.test(host)) return false;
    let path = url.pathname;
    for (let pass = 0; pass < 3; pass += 1) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
    // Decode before checking so encoded slash/dot aliases cannot hide the token route.
    const normalizedPath = new URL(path.replace(/^\/+/, '/'), 'https://kb-path.invalid').pathname;
    // eslint-disable-next-line no-control-regex -- Reject encoded controls as well as their literal form.
    if (/[\\<>`"\u0000-\u001f\u007f]/.test(path) || /\/areas(?:\/|$)/i.test(normalizedPath)) return false;
    if (/%[0-9a-f]{2}[^=&]*=/i.test(url.search)
      || [...url.searchParams.keys()].some(key => /token|secret|password|credential|authorization|auth|key|e-?mail|phone|telefone|cpf|cnpj|pix|signature|sig/i.test(key))) return false;
    return true;
  } catch { return false; }
}

/** A declared access date is a civil date, never an arbitrary timestamp or date overflow. */
export function isKbSourceDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

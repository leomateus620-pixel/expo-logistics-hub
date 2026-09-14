/** Public assets must be keyed to the same build as their JS consumer. */
export function versionAlvoradaAsset(url: string) {
  if (!url.startsWith('/alvorada/')) return url;
  const parsed = new URL(url, 'https://alvorada.invalid');
  parsed.searchParams.set('build', import.meta.env.VITE_GIT_COMMIT ?? 'portal-lifecycle-v2');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

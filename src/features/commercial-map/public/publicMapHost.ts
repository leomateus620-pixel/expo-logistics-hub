/** Domínio dedicado exclusivamente aos links públicos do Mapa Comercial. */
export const PUBLIC_MAP_CANONICAL_ORIGIN = 'https://mapafenasoja.com';

const PUBLIC_MAP_HOSTS = new Set(['mapafenasoja.com', 'www.mapafenasoja.com']);
const INTERNAL_HOSTS = new Set(['fenasojagestao.com', 'www.fenasojagestao.com']);

export function isPublicMapHost(hostname: string): boolean {
  return PUBLIC_MAP_HOSTS.has(hostname.toLowerCase());
}

export function isInternalProductionHost(hostname: string): boolean {
  return INTERNAL_HOSTS.has(hostname.toLowerCase());
}

const AREA_PATH = /^\/areas\/[a-z0-9-]+\/[^/]+\/?$/i;

export function isPublicAreaPath(pathname: string): boolean {
  return AREA_PATH.test(pathname);
}

/**
 * Links antigos abertos no domínio interno devem ir para o domínio público,
 * preservando caminho e parâmetros. Retorna null quando não há redirecionamento.
 */
export function legacyPublicLinkRedirect(location: Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'>): string | null {
  if (!isInternalProductionHost(location.hostname)) return null;
  if (!location.pathname.startsWith('/areas/')) return null;
  return `${PUBLIC_MAP_CANONICAL_ORIGIN}${location.pathname}${location.search}${location.hash}`;
}

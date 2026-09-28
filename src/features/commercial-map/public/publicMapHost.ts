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

export const INTERNAL_CANONICAL_ORIGIN = 'https://fenasojagestao.com';
export const PUBLISHED_LOVABLE_HOST = 'fenasoja-gestao.lovable.app';

type Loc = Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'>;

/**
 * Endereço canônico: sistema em fenasojagestao.com, links públicos em
 * mapafenasoja.com. Preview do editor e localhost nunca redirecionam.
 * Retorna null quando o endereço atual já é o correto.
 */
export function resolveCanonicalRedirect(location: Loc): string | null {
  const host = location.hostname.toLowerCase();
  const rest = `${location.pathname}${location.search}${location.hash}`;
  const isArea = location.pathname.startsWith('/areas/');
  const isInternalAlias = host === PUBLISHED_LOVABLE_HOST || host === 'www.fenasojagestao.com';

  if (host === 'www.mapafenasoja.com') return `${PUBLIC_MAP_CANONICAL_ORIGIN}${rest}`;
  if (host === 'fenasojagestao.com' || isInternalAlias) {
    if (isArea) return `${PUBLIC_MAP_CANONICAL_ORIGIN}${rest}`;
    if (isInternalAlias) return `${INTERNAL_CANONICAL_ORIGIN}${rest}`;
  }
  return null;
}

/** Compatibilidade: redirecionamento de links públicos antigos. */
export function legacyPublicLinkRedirect(location: Loc): string | null {
  return resolveCanonicalRedirect(location);
}

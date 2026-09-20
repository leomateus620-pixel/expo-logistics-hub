/**
 * Registro canônico das dez áreas publicáveis do Mapa Comercial.
 *
 * O escopo real é resolvido no servidor (`public_map_links`), sempre por UUID
 * canônico — pavilhão pelo `parent_entity_id`, segmento pelo `segment_id` e o
 * Espaço do Automóvel por um conjunto fixo de entidades. Este registro existe
 * apenas para rótulos, navegação e validação do slug no cliente.
 */

export type PublicAreaKind = 'PAVILION' | 'SEGMENT' | 'SEGMENT_EXTERNAL' | 'ENTITY_SET';

export interface PublicAreaDefinition {
  slug: string;
  name: string;
  shortName: string;
  kind: PublicAreaKind;
  /** Identificador canônico da edificação do pavilhão (B1, B6, …). */
  pavilionIdentifier?: string;
  /** Slug do segmento canônico persistido em `map_segments`. */
  segmentSlug?: string;
}

export const PUBLIC_MAP_AREAS: readonly PublicAreaDefinition[] = [
  { slug: 'pavilhao-1', name: 'Pavilhão 1', shortName: 'Pavilhão 1', kind: 'PAVILION', pavilionIdentifier: 'B1' },
  { slug: 'pavilhao-3', name: 'Pavilhão 3', shortName: 'Pavilhão 3', kind: 'PAVILION', pavilionIdentifier: 'B6' },
  { slug: 'pavilhao-5', name: 'Pavilhão 5', shortName: 'Pavilhão 5', kind: 'PAVILION', pavilionIdentifier: 'B8' },
  { slug: 'pavilhao-8', name: 'Pavilhão 8', shortName: 'Pavilhão 8', kind: 'PAVILION', pavilionIdentifier: 'B4' },
  { slug: 'pavilhao-12', name: 'Pavilhão 12', shortName: 'Pavilhão 12', kind: 'PAVILION', pavilionIdentifier: 'B3' },
  { slug: 'pavilhao-13', name: 'Pavilhão 13', shortName: 'Pavilhão 13', kind: 'PAVILION', pavilionIdentifier: 'B5' },
  { slug: 'pavilhao-14', name: 'Pavilhão 14', shortName: 'Pavilhão 14', kind: 'PAVILION', pavilionIdentifier: 'B2' },
  { slug: 'exporural', name: 'Exporural', shortName: 'Exporural', kind: 'SEGMENT', segmentSlug: 'exporural' },
  {
    slug: 'industria-comercio-servicos-externo',
    name: 'Indústria, Comércio e Serviços — área externa',
    shortName: 'ICS — área externa',
    kind: 'SEGMENT_EXTERNAL',
    segmentSlug: 'industria-comercio-servicos',
  },
  { slug: 'espaco-automovel', name: 'Espaço do Automóvel', shortName: 'Espaço do Automóvel', kind: 'ENTITY_SET' },
] as const;

const BY_SLUG = new Map(PUBLIC_MAP_AREAS.map((area) => [area.slug, area]));

export function getPublicArea(slug?: string | null): PublicAreaDefinition | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function isPublicAreaSlug(slug?: string | null): boolean {
  return Boolean(getPublicArea(slug));
}

/** Pavilhão 7 (B10) nunca é publicado: não possui preço oficial 2028. */
export const PUBLIC_MAP_EXCLUDED_PAVILIONS = ['B10'] as const;

export function publicMapOrigin(): string {
  const configured = (import.meta.env as Record<string, string | undefined>)['VITE_PUBLIC_MAP_ORIGIN'];
  if (configured) return configured.replace(/\/$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function publicAreaUrl(slug: string, token: string): string {
  return `${publicMapOrigin()}/areas/${slug}/${token}`;
}

import { Factory, MapPinned, Tractor, type LucideIcon } from 'lucide-react';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  type CommercialMapSegmentId,
} from '@/features/commercial-map/data/commercialMapSegments';
import type { CommissionModule } from './commissionRegistry';

export type CommissionMapPortalId = 'exporural' | 'industria-comercio-servicos';
export type CommissionMapPortalTheme = 'rural' | 'industry';

export interface CommissionMapPortalConfig {
  id: CommissionMapPortalId;
  slug: CommissionMapPortalId;
  name: string;
  shortName: string;
  capability: string;
  segmentId: CommercialMapSegmentId;
  theme: CommissionMapPortalTheme;
  icon: LucideIcon;
  loginPath: string;
  basePath: string;
  mapPath: string;
  module: CommissionModule;
}

const mapMenu = {
  label: 'Mapa Comercial',
  path: 'mapa-comercial',
  description: 'Lotes, estruturas, disponibilidade e negociações do segmento.',
  icon: MapPinned,
} as const;

export const COMMISSION_MAP_PORTALS: readonly CommissionMapPortalConfig[] = [
  {
    id: 'exporural',
    slug: 'exporural',
    name: 'Exporural',
    shortName: 'Exporural',
    capability: 'exporural_access',
    segmentId: COMMERCIAL_MAP_SEGMENT_IDS.exporural,
    theme: 'rural',
    icon: Tractor,
    loginPath: '/login/exporural',
    basePath: '/comissoes/exporural',
    mapPath: '/comissoes/exporural/mapa-comercial',
    module: {
      slug: 'exporural',
      name: 'Exporural',
      shortName: 'Exporural',
      description: 'Gestão comercial dedicada às Quadras R e S da área rural.',
      icon: Tractor,
      accentClass: 'from-emerald-700/30 via-amber-500/15 to-transparent',
      visual: {
        tone: 'emerald',
        accentColor: 'hsl(139 48% 28%)',
        accentGradient: 'from-emerald-700/30 via-amber-500/15 to-transparent',
        iconBackground: 'bg-emerald-700/12 text-emerald-800 dark:text-emerald-200',
        surfaceTint: 'bg-emerald-700/[0.065]',
        chartThemeKey: 'exporural-commercial',
        motionHint: 'profundidade rural e colheita controlada',
      },
      status: 'active',
      capability: 'exporural_access',
      sensitive: false,
      adminOnly: false,
      basePath: '/comissoes/exporural',
      defaultMenuPath: 'mapa-comercial',
      order: 10,
      publicPortal: true,
      menus: [{ ...mapMenu }],
    },
  },
  {
    id: 'industria-comercio-servicos',
    slug: 'industria-comercio-servicos',
    name: 'Indústria, Comércio e Serviços',
    shortName: 'Indústria e Comércio',
    capability: 'industria_comercio_servicos_access',
    segmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
    theme: 'industry',
    icon: Factory,
    loginPath: '/login/industria-comercio-servicos',
    basePath: '/comissoes/industria-comercio-servicos',
    mapPath: '/comissoes/industria-comercio-servicos/mapa-comercial',
    module: {
      slug: 'industria-comercio-servicos',
      name: 'Indústria, Comércio e Serviços',
      shortName: 'Indústria e Comércio',
      description: 'Pavilhões, quadras e lotes do núcleo comercial central.',
      icon: Factory,
      accentClass: 'from-sky-800/28 via-amber-500/12 to-transparent',
      visual: {
        tone: 'cyan',
        accentColor: 'hsl(205 58% 29%)',
        accentGradient: 'from-sky-800/28 via-amber-500/12 to-transparent',
        iconBackground: 'bg-sky-800/10 text-sky-800 dark:text-sky-200',
        surfaceTint: 'bg-sky-800/[0.06]',
        chartThemeKey: 'industry-commercial',
        motionHint: 'estrutura comercial e precisão institucional',
      },
      status: 'active',
      capability: 'industria_comercio_servicos_access',
      sensitive: false,
      adminOnly: false,
      basePath: '/comissoes/industria-comercio-servicos',
      defaultMenuPath: 'mapa-comercial',
      order: 11,
      publicPortal: true,
      menus: [{ ...mapMenu }],
    },
  },
] as const;

const PORTAL_BY_SLUG = new Map(COMMISSION_MAP_PORTALS.map((portal) => [portal.slug, portal]));

export function getCommissionMapPortal(slug?: string | null) {
  return slug ? PORTAL_BY_SLUG.get(slug as CommissionMapPortalId) : undefined;
}

export function isCommissionMapPortalSlug(slug?: string | null): slug is CommissionMapPortalId {
  return Boolean(getCommissionMapPortal(slug));
}

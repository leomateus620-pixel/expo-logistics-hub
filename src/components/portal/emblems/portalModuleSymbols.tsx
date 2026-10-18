import type { ReactNode } from 'react';
import type { PortalEntryId } from '@/modules/portal/portalRegistry';

/**
 * Symbols share a 32-unit grid with a 4-unit optical margin and a single
 * stroke weight. Parts only reference the `pe-*` classes, so color comes from
 * the emblem tone and motion from the shared primitives in
 * `portal-module-emblems.css`.
 */
export type PortalEmblemPlate = 'indigo' | 'blue' | 'teal' | 'navy';
export type PortalEmblemAccent = 'gold' | 'orange' | 'green' | 'cream';
export type PortalEmblemSupport = 'blue' | 'indigo';

export interface PortalModuleSymbol {
  plate: PortalEmblemPlate;
  accent: PortalEmblemAccent;
  support: PortalEmblemSupport;
  body: ReactNode;
}

const SHIELD = 'M16 4.8l9 3.4v7.1c0 5.7-3.8 10-9 11.9-5.2-1.9-9-6.2-9-11.9V8.2Z';

export const PORTAL_MODULE_SYMBOLS: Record<PortalEntryId, PortalModuleSymbol> = {
  'agenda-fenasoja': {
    plate: 'indigo',
    accent: 'gold',
    support: 'blue',
    body: (
      <>
        <path className="pe-tint" d="M9 7.5h14a4 4 0 0 1 4 4V13H5v-1.5a4 4 0 0 1 4-4Z" />
        <rect className="pe-line" x="5" y="7.5" width="22" height="19.5" rx="4" />
        <path className="pe-line" d="M5 13h22" />
        <path className="pe-line pe-m-lift" d="M11 4.8v4.6M21 4.8v4.6" />
        <g className="pe-dot">
          <rect x="8.7" y="16" width="2.6" height="2.6" rx="0.8" />
          <rect x="14.7" y="16" width="2.6" height="2.6" rx="0.8" />
          <rect x="20.7" y="16" width="2.6" height="2.6" rx="0.8" />
          <rect x="8.7" y="21" width="2.6" height="2.6" rx="0.8" />
          <rect x="14.7" y="21" width="2.6" height="2.6" rx="0.8" />
        </g>
        <rect className="pe-accent pe-m-pop" x="20" y="20.3" width="4" height="4" rx="1.1" />
      </>
    ),
  },
  'agenda-restaurante-arena': {
    plate: 'blue',
    accent: 'orange',
    support: 'blue',
    body: (
      <>
        <g className="pe-m-lift">
          <path className="pe-tint" d="M4 14C8 8.8 11.8 6.5 16 6.5S24 8.8 28 14Z" />
          <path className="pe-line" d="M4 14C8 8.8 11.8 6.5 16 6.5S24 8.8 28 14" />
        </g>
        <path className="pe-line" d="M7.5 13h17M7.5 13v12.5M24.5 13v12.5M4.5 25.5h23" />
        <path className="pe-support-line" d="M10.2 17.6h1.8M20 17.6h1.8" />
        <path className="pe-accent pe-m-glow" d="M13 25.5v-4.6a3 3 0 0 1 6 0v4.6Z" />
      </>
    ),
  },
  'mapa-comercial': {
    plate: 'teal',
    accent: 'green',
    support: 'blue',
    body: (
      <>
        <path className="pe-tint pe-m-glow" d="M11.5 7l9 3v16l-9-3Z" />
        <path className="pe-line" d="M4.5 9.5l7-2.5 9 3 7-2.5v16l-7 2.5-9-3-7 2.5Z" />
        <path className="pe-line pe-soft" d="M11.5 7v16M20.5 10v16" />
        <ellipse className="pe-ground pe-m-squash" cx="16" cy="21.4" rx="2.3" ry="0.75" />
        <g className="pe-m-rise">
          <path
            className="pe-accent"
            d="M16 9.4a3.8 3.8 0 0 0-3.8 3.8c0 2.8 3.8 6.6 3.8 6.6s3.8-3.8 3.8-6.6A3.8 3.8 0 0 0 16 9.4Z"
          />
          <circle className="pe-cut" cx="16" cy="13.2" r="1.35" />
        </g>
      </>
    ),
  },
  comissoes: {
    plate: 'indigo',
    accent: 'cream',
    support: 'indigo',
    body: (
      <>
        <g className="pe-m-in-start">
          <circle className="pe-support-line" cx="8" cy="13.6" r="2.5" />
          <path className="pe-support-line" d="M3.8 24a4.2 4.2 0 0 1 6.3-3.6" />
        </g>
        <g className="pe-m-in-end">
          <circle className="pe-support-line" cx="24" cy="13.6" r="2.5" />
          <path className="pe-support-line" d="M28.2 24a4.2 4.2 0 0 0-6.3-3.6" />
        </g>
        <circle className="pe-accent pe-m-pop" cx="16" cy="11.6" r="3.6" />
        <path className="pe-line" d="M10.2 25.2a5.8 5.8 0 0 1 11.6 0" />
      </>
    ),
  },
  financeiro: {
    plate: 'navy',
    accent: 'gold',
    support: 'indigo',
    body: (
      <>
        <rect className="pe-support-line" x="7.5" y="21.6" width="17" height="2.6" rx="1.3" />
        <rect className="pe-line" x="5" y="25.2" width="22" height="2.6" rx="1.3" />
        <g className="pe-m-rise">
          <circle className="pe-accent-soft pe-accent-line" cx="16" cy="11.8" r="6.8" />
          <circle className="pe-accent-line pe-soft pe-fine" cx="16" cy="11.8" r="4.8" />
          <path
            className="pe-line pe-fine"
            d="M18 9.9c-.35-.65-1.1-1-2-1-1.15 0-2 .62-2 1.45 0 2.05 4.1 1.05 4.1 3.05 0 .9-.9 1.5-2.1 1.5-.95 0-1.75-.38-2.15-1.05M16 7.7v1.2M16 14.7v1.2"
          />
        </g>
      </>
    ),
  },
  administrador: {
    plate: 'navy',
    accent: 'green',
    support: 'indigo',
    body: (
      <>
        <path className="pe-tint" d={SHIELD} />
        <path className="pe-facet" d="M16 4.8v22.4c-5.2-1.9-9-6.2-9-11.9V8.2Z" />
        <path className="pe-line" d={SHIELD} />
        <g className="pe-m-turn">
          <circle className="pe-support-line" cx="16" cy="15.4" r="3.2" />
          <path className="pe-support-line" d="M16 10.6v1.3M16 18.9v1.3M11.2 15.4h1.3M19.5 15.4h1.3" />
        </g>
        <circle className="pe-accent pe-m-pop" cx="16" cy="15.4" r="1.3" />
      </>
    ),
  },
};

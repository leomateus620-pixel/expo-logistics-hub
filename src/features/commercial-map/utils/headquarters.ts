import { FENASOJA_2028_COLORS } from '@/lib/fenasoja-brand';

export const FENASOJA_HEADQUARTERS_REVISION = '2026.8-headquarters-realism.2';

export const FENASOJA_HEADQUARTERS_LAYOUT = {
  sourceCenter: [4105, 3681] as const,
  sourceFootprint: [135, 104] as const,
  facingRadians: -Math.PI / 18,
  envelope: {
    widthRatio: 0.9,
    depthRatio: 0.76,
  },
  identity: {
    symbolAsset: '/alvorada/fenasoja-symbol-official.png',
    wordmark: 'FENASOJA',
    department: 'Comissão Central',
  },
  palette: {
    navy: FENASOJA_2028_COLORS.navy,
    navyDark: FENASOJA_2028_COLORS.nearBlackNavy,
    roof: FENASOJA_2028_COLORS.softWhite,
    glass: '#153a51',
    amber: FENASOJA_2028_COLORS.orange,
    warmLight: FENASOJA_2028_COLORS.gold,
  },
} as const;

export const FENASOJA_HEADQUARTERS_RENDER_BUDGET = {
  basePrimaryDrawCalls: 14,
  detailPrimaryDrawCalls: 28,
  focusPrimaryDrawCalls: 36,
  measuredModelBasePrimaryDrawCalls: 9,
  measuredModelDetailPrimaryDrawCalls: 25,
  measuredModelFocusPrimaryDrawCalls: 30,
  measuredBaseWithOverlayDrawCalls: 10,
  measuredDetailWithOverlayDrawCalls: 26,
  measuredFocusWithOverlayDrawCalls: 32,
} as const;

export interface HeadquartersFootprint {
  width: number;
  depth: number;
}

export interface HeadquartersOrientedEnvelope extends HeadquartersFootprint {
  localWidth: number;
  localDepth: number;
}

export function headquartersOrientedEnvelope(
  footprint: HeadquartersFootprint,
  facingRadians = FENASOJA_HEADQUARTERS_LAYOUT.facingRadians,
): HeadquartersOrientedEnvelope {
  const localWidth = footprint.width * FENASOJA_HEADQUARTERS_LAYOUT.envelope.widthRatio;
  const localDepth = footprint.depth * FENASOJA_HEADQUARTERS_LAYOUT.envelope.depthRatio;
  const cosine = Math.abs(Math.cos(facingRadians));
  const sine = Math.abs(Math.sin(facingRadians));
  return {
    width: localWidth * cosine + localDepth * sine,
    depth: localWidth * sine + localDepth * cosine,
    localWidth,
    localDepth,
  };
}

import {
  FENASOJA_COMPLEX,
  FENASOJA_COMPLEX_REVISION,
} from "../data/fenasojaComplexReconstruction";
const hq = FENASOJA_COMPLEX.headquarters;
const unit = FENASOJA_COMPLEX.registration.unitsPerMeter;
export const FENASOJA_HEADQUARTERS_REVISION = FENASOJA_COMPLEX_REVISION;
export const FENASOJA_HEADQUARTERS_LAYOUT = {
  sourceCenter: hq.sourceOrigin,
  sourceFootprint: [106, 84] as const,
  facingRadians: hq.yaw,
  envelope: { widthRatio: 1, depthRatio: 1 },
  identity: {
    symbolAsset: hq.sign.symbolAsset,
    wordmark: "FENASOJA",
    department: "Comissão Central",
  },
  palette: {
    navy: "#454b4c",
    navyDark: "#252521",
    roof: "#eceee5",
    glass: "#4d6875",
    amber: "#a5a297",
    warmLight: "#ead4a9",
  },
} as const;
export const FENASOJA_HEADQUARTERS_RENDER_BUDGET = {
  basePrimaryDrawCalls: 20,
  detailPrimaryDrawCalls: 24,
  focusPrimaryDrawCalls: 24,
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
  _footprint: HeadquartersFootprint,
  facingRadians: number = hq.yaw,
): HeadquartersOrientedEnvelope {
  const xs = hq.roofProjection.map((p) => p[0]),
    zs = hq.roofProjection.map((p) => p[1]);
  const localWidth = (Math.max(...xs) - Math.min(...xs)) * unit,
    localDepth = (Math.max(...zs) - Math.min(...zs)) * unit;
  const c = Math.abs(Math.cos(facingRadians)),
    s = Math.abs(Math.sin(facingRadians));
  return {
    width: localWidth * c + localDepth * s,
    depth: localWidth * s + localDepth * c,
    localWidth,
    localDepth,
  };
}

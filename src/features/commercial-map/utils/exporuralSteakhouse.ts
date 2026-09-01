export const EXPORURAL_STEAKHOUSE_REVISION = '2026.9-c4-reference.1';
export const EXPORURAL_STEAKHOUSE_VISIBILITY_THRESHOLD = 0.015;

export const EXPORURAL_STEAKHOUSE_LAYOUT = {
  officialEntityIdentifier: 'C4',
  officialRestroomEntityIdentifier: 'E-06',
  sourcePdfFootprint: [4980, 2370, 5100, 2480] as const,
  sourcePdfRestroomAnchor: [4931, 2427] as const,
  facingRadians: 0,
  // The north-west approach keeps the road, low restroom annex and turbine
  // legible together without changing C4's official cartographic anchor.
  focusDirection: [-0.86, 0.54, -0.62] as const,
  mainBuilding: {
    widthRatio: 0.84,
    depthRatio: 0.9,
    offsetXRatio: 0.05,
    wallHeightToSpan: 0.36,
    roofRiseToSpan: 0.115,
    northRoofShare: 0.52,
    foundationHeight: 0.055,
  },
  restroomAnnex: {
    widthRatio: 0.4,
    depthRatio: 0.39,
    // Normalized from the official E-06 anchor relative to the C4 source box.
    centerOffsetToFootprint: [-109 / 120, 2 / 110] as const,
    wallHeightToSpan: 0.245,
    roofRiseToSpan: 0.075,
  },
  windTurbine: {
    offsetToFootprint: [-1.34, -0.18] as const,
    foundationHeight: 0.16,
    foundationDiameterToSpan: 0.24,
    towerHeightToSpan: 1.36,
    minimumTowerHeight: 3.3,
    rotorRadiusToSpan: 0.285,
    hubRadiusToSpan: 0.075,
    bottomRadiusToSpan: 0.047,
    topRadiusToSpan: 0.024,
    nacelleSizeToSpan: [0.16, 0.14, 0.38] as const,
    // Local presentation yaw, not a surveyed wind bearing: it exposes the
    // three-blade plane from the same north-west review view used for C4.
    yawRadians: -Math.PI * 0.7,
    bladeTipStartRatio: 0.8,
    bladeAngles: [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3] as const,
  },
  palette: {
    wall: '#343a3c',
    accent: '#b73532',
    roof: '#4d5558',
    trim: '#c8b99b',
    dark: '#202628',
    glass: '#66818a',
    green: '#466544',
    white: '#f3f1e9',
    platform: '#8b8982',
    metal: '#7b8589',
  },
  references: [
    'docs/refs-churrascaria-satelite.jpeg',
    'docs/refs-catavento-fundos.jpg',
  ],
} as const;

export const EXPORURAL_STEAKHOUSE_RENDER_BUDGET = {
  reduced: {
    maximumPrimaryDrawCalls: 15,
    maximumRenderedTriangles: 1_200,
  },
  detailed: {
    maximumPrimaryDrawCalls: 18,
    maximumRenderedTriangles: 1_800,
  },
  maximumShadowDrawCalls: 12,
} as const;

export interface ExporuralSteakhouseFootprint {
  width: number;
  depth: number;
}

export interface ExporuralSteakhouseDimensions {
  mainWidth: number;
  mainDepth: number;
  mainOffsetX: number;
  mainWallHeight: number;
  mainRoofRise: number;
  annexWidth: number;
  annexDepth: number;
  annexCenterX: number;
  annexCenterZ: number;
  annexWallHeight: number;
  annexRoofRise: number;
  turbineCenterX: number;
  turbineCenterZ: number;
  turbineFoundationHeight: number;
  turbineFoundationDiameter: number;
  turbineTowerHeight: number;
  turbineRotorRadius: number;
  turbineHubRadius: number;
  visualHeight: number;
}

export interface ExporuralSteakhousePresentationExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerOffsetX: number;
  centerOffsetZ: number;
  maxHeight: number;
}

export interface ExporuralSteakhouseRenderDiagnostics {
  primaryDrawCalls: number;
  renderedTriangles: number;
  shadowDrawCalls: number;
  bladeCount: number;
  withinBudget: boolean;
}

export interface ExporuralSteakhousePresentationState {
  presentInRenderedEntities: boolean;
  selected: boolean;
  layerOpacity: number;
}

export function resolveExporuralSteakhouseDimensions(
  footprint: ExporuralSteakhouseFootprint,
): ExporuralSteakhouseDimensions {
  const width = Math.max(0.2, footprint.width);
  const depth = Math.max(0.2, footprint.depth);
  const span = Math.max(width, depth);
  const main = EXPORURAL_STEAKHOUSE_LAYOUT.mainBuilding;
  const annex = EXPORURAL_STEAKHOUSE_LAYOUT.restroomAnnex;
  const turbine = EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine;
  const mainWidth = width * main.widthRatio;
  const mainDepth = depth * main.depthRatio;
  const mainOffsetX = width * main.offsetXRatio;
  const annexWidth = width * annex.widthRatio;
  const annexDepth = depth * annex.depthRatio;
  const turbineTowerHeight = Math.max(
    turbine.minimumTowerHeight,
    span * turbine.towerHeightToSpan,
  );
  const turbineRotorRadius = span * turbine.rotorRadiusToSpan;
  const turbineFoundationHeight = turbine.foundationHeight;
  const turbineFoundationDiameter = span * turbine.foundationDiameterToSpan;

  return {
    mainWidth,
    mainDepth,
    mainOffsetX,
    mainWallHeight: span * main.wallHeightToSpan,
    mainRoofRise: span * main.roofRiseToSpan,
    annexWidth,
    annexDepth,
    annexCenterX: width * annex.centerOffsetToFootprint[0],
    annexCenterZ: depth * annex.centerOffsetToFootprint[1],
    annexWallHeight: span * annex.wallHeightToSpan,
    annexRoofRise: span * annex.roofRiseToSpan,
    turbineCenterX: width * turbine.offsetToFootprint[0],
    turbineCenterZ: depth * turbine.offsetToFootprint[1],
    turbineFoundationHeight,
    turbineFoundationDiameter,
    turbineTowerHeight,
    turbineRotorRadius,
    turbineHubRadius: span * turbine.hubRadiusToSpan,
    visualHeight: turbineFoundationHeight + turbineTowerHeight + turbineRotorRadius,
  };
}

export function resolveExporuralSteakhousePresentationExtent(
  footprint: ExporuralSteakhouseFootprint,
): ExporuralSteakhousePresentationExtent {
  const dimensions = resolveExporuralSteakhouseDimensions(footprint);
  const span = Math.max(Math.max(0.2, footprint.width), Math.max(0.2, footprint.depth));
  const mainRoofOverhang = span * 0.028;
  const annexRoofOverhang = span * 0.022;
  const turbine = EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine;
  const yawCos = Math.cos(turbine.yawRadians);
  const yawSin = Math.sin(turbine.yawRadians);
  const nacelleWidth = span * turbine.nacelleSizeToSpan[0];
  const nacelleLength = span * turbine.nacelleSizeToSpan[2];
  const rotorDepth = Math.max(0.08, span * 0.055);
  const rotorLocalZ = -nacelleLength * 0.56;
  const rotorCenterX = dimensions.turbineCenterX + yawSin * rotorLocalZ;
  const rotorCenterZ = dimensions.turbineCenterZ + yawCos * rotorLocalZ;
  const rotorRadius = dimensions.turbineRotorRadius * 1.04;
  const rotorHalfWidthX = Math.abs(yawCos) * rotorRadius + Math.abs(yawSin) * rotorDepth / 2;
  const rotorHalfDepthZ = Math.abs(yawSin) * rotorRadius + Math.abs(yawCos) * rotorDepth / 2;
  const nacelleHalfWidthX = Math.abs(yawCos) * nacelleWidth / 2
    + Math.abs(yawSin) * nacelleLength / 2;
  const nacelleHalfDepthZ = Math.abs(yawSin) * nacelleWidth / 2
    + Math.abs(yawCos) * nacelleLength / 2;
  const foundationRadius = dimensions.turbineFoundationDiameter / 2;

  const minX = Math.min(
    dimensions.mainOffsetX - dimensions.mainWidth / 2 - mainRoofOverhang,
    dimensions.annexCenterX - dimensions.annexWidth / 2 - annexRoofOverhang,
    dimensions.turbineCenterX - foundationRadius,
    dimensions.turbineCenterX - nacelleHalfWidthX,
    rotorCenterX - rotorHalfWidthX,
  );
  const maxX = Math.max(
    dimensions.mainOffsetX + dimensions.mainWidth / 2 + mainRoofOverhang,
    dimensions.annexCenterX + dimensions.annexWidth / 2 + annexRoofOverhang,
    dimensions.turbineCenterX + foundationRadius,
    dimensions.turbineCenterX + nacelleHalfWidthX,
    rotorCenterX + rotorHalfWidthX,
  );
  const minZ = Math.min(
    -dimensions.mainDepth / 2 - mainRoofOverhang,
    dimensions.annexCenterZ - dimensions.annexDepth / 2 - annexRoofOverhang,
    dimensions.turbineCenterZ - foundationRadius,
    dimensions.turbineCenterZ - nacelleHalfDepthZ,
    rotorCenterZ - rotorHalfDepthZ,
  );
  const maxZ = Math.max(
    dimensions.mainDepth / 2 + mainRoofOverhang,
    dimensions.annexCenterZ + dimensions.annexDepth / 2 + annexRoofOverhang,
    dimensions.turbineCenterZ + foundationRadius,
    dimensions.turbineCenterZ + nacelleHalfDepthZ,
    rotorCenterZ + rotorHalfDepthZ,
  );
  const width = Math.max(0.2, maxX - minX);
  const depth = Math.max(0.2, maxZ - minZ);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerOffsetX: (minX + maxX) / 2,
    centerOffsetZ: (minZ + maxZ) / 2,
    maxHeight: dimensions.visualHeight,
  };
}

export function isExporuralSteakhouseRestroomAnnex(
  entity: { publicIdentifier: string },
): boolean {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR')
    === EXPORURAL_STEAKHOUSE_LAYOUT.officialRestroomEntityIdentifier;
}

export function isExporuralSteakhousePresentationAvailable(
  state: ExporuralSteakhousePresentationState,
): boolean {
  return state.presentInRenderedEntities
    && (state.selected || state.layerOpacity > EXPORURAL_STEAKHOUSE_VISIBILITY_THRESHOLD);
}

export function resolveExporuralSteakhouseRestroomPresentationLift(
  usesSteakhouseAnnexPresentation: boolean,
  defaultPresentationLift: number,
): number {
  return usesSteakhouseAnnexPresentation ? 0 : defaultPresentationLift;
}

export function exporuralSteakhouseVisualHeight(
  footprint: ExporuralSteakhouseFootprint,
): number {
  return resolveExporuralSteakhouseDimensions(footprint).visualHeight;
}

export function exporuralSteakhouseRenderDiagnostics(
  detailed: boolean,
): ExporuralSteakhouseRenderDiagnostics {
  const primaryDrawCalls = detailed ? 17 : 15;
  const renderedTriangles = detailed ? 1_344 : 888;
  const shadowDrawCalls = 11;
  const budget = detailed
    ? EXPORURAL_STEAKHOUSE_RENDER_BUDGET.detailed
    : EXPORURAL_STEAKHOUSE_RENDER_BUDGET.reduced;

  return {
    primaryDrawCalls,
    renderedTriangles,
    shadowDrawCalls,
    bladeCount: EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine.bladeAngles.length,
    withinBudget: primaryDrawCalls <= budget.maximumPrimaryDrawCalls
      && renderedTriangles <= budget.maximumRenderedTriangles
      && shadowDrawCalls <= EXPORURAL_STEAKHOUSE_RENDER_BUDGET.maximumShadowDrawCalls,
  };
}

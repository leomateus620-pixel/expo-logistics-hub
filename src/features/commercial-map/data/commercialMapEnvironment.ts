export type CommercialMapEnvironmentMode = 'normal' | 'hydrological';

export interface CommercialMapEnvironmentExtent {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  diagonal: number;
}

export interface CommercialMapCloudPlacement {
  position: readonly [number, number, number];
  rotationY: number;
  scale: readonly [number, number, number];
}

interface CommercialMapCloudBlueprint {
  angle: number;
  distance: number;
  height: number;
  rotation: number;
  width: number;
  depth: number;
}

/** Presentation-only atmosphere for the shared Commercial Map canvas. */
export const COMMERCIAL_MAP_ENVIRONMENT_CONFIG = {
  revision: '2026.8-premium-atmosphere.1',
  solar: {
    // The existing satellite-confirmed tree shadows already define a coherent
    // daylight direction for this park model. The dated opening-morning study
    // remains an atomic tuning alternative for future field calibration.
    activePreset: 'satelliteReference',
    presets: {
      openingMorning: {
        // 29/04/2028 10:00 BRT, Parque de Exposições de Santa Rosa.
        // +X = leste, -Z = norte; azimute 46,41°, elevação 33,21°.
        direction: [0.60601, 0.54769, -0.57688] as const,
        azimuthDegreesFromNorth: 46.4109,
        elevationDegrees: 33.2087,
        localDateTime: '2028-04-29T10:00:00-03:00',
        coordinates: [-27.84502, -54.47892] as const,
        provenance: 'NOAA_SOLAR_POSITION_FROM_REPOSITORY_EVENT_AND_PARK_REFERENCE',
      },
      satelliteReference: {
        direction: [-0.476, 0.743, 0.47] as const,
        sourceShadowRotationRadians: -0.78,
        provenance: 'SATELLITE_SHADOW_INFERRED',
      },
    },
    fieldVerificationRecommended: true,
    color: '#fff0cf',
    intensity: 2.28,
    hydrologicalIntensity: 1.94,
    distanceRatio: 1.32,
    minimumDistance: 96,
    shadowCoverageRatio: 0.6,
  },
  fill: {
    direction: [0.54, 0.34, -0.45] as const,
    color: '#c9e0f4',
    intensity: 0.3,
    hydrologicalIntensity: 0.24,
  },
  ambient: {
    intensity: 0.32,
    hydrologicalIntensity: 0.54,
    hemisphereIntensity: 0.96,
    hydrologicalHemisphereIntensity: 0.9,
  },
  sky: {
    minimumScale: 900,
    scaleRatio: 12,
    turbidity: 4.7,
    rayleigh: 2.75,
    mieCoefficient: 0.0042,
    mieDirectionalG: 0.78,
  },
  clouds: {
    fullCount: 7,
    reducedCount: 4,
    fullTextureSize: 384,
    reducedTextureSize: 192,
    opacity: 0.86,
    hydrologicalOpacity: 0.5,
    seed: 4317202,
  },
  ground: {
    minimumWorldSize: 300,
    worldSizeRatio: 2,
    fullTextureSize: 256,
    reducedTextureSize: 128,
  },
  fog: {
    nearRatio: 3.9,
    farRatio: 7.2,
    hydrologicalNearRatio: 4.4,
    hydrologicalFarRatio: 7.6,
  },
  reflections: {
    fullTextureWidth: 128,
    reducedTextureWidth: 64,
    intensity: 0.34,
    hydrologicalIntensity: 0.2,
  },
  toneMappingExposure: 0.98,
  palettes: {
    normal: {
      fallback: '#63a8d4',
      zenith: '#2f83bf',
      upperSky: '#5ea9d4',
      horizon: '#8fc1d2',
      sunGlow: '#ffe7b9',
      cloud: '#f1f5f7',
      cloudShade: '#b8cbd7',
      activeGround: '#b8c9b0',
      outerGroundNear: '#b8c9b0',
      outerGroundFar: '#859c81',
      hemisphereGround: '#60745d',
    },
    hydrological: {
      fallback: '#82b7c9',
      zenith: '#568fa9',
      upperSky: '#77aec1',
      horizon: '#b2d1d6',
      sunGlow: '#f8e7c8',
      cloud: '#e8f0f2',
      cloudShade: '#aec4ca',
      activeGround: '#b9cbc6',
      outerGroundNear: '#b8cbc4',
      outerGroundFar: '#91aaa3',
      hemisphereGround: '#46686a',
    },
  },
} as const;

const CLOUD_BLUEPRINTS: readonly CommercialMapCloudBlueprint[] = [
  { angle: -2.72, distance: 0.74, height: 0.2, rotation: -0.22, width: 0.34, depth: 0.15 },
  { angle: -1.98, distance: 0.94, height: 0.29, rotation: 0.18, width: 0.46, depth: 0.19 },
  { angle: -1.12, distance: 0.72, height: 0.18, rotation: -0.1, width: 0.32, depth: 0.14 },
  { angle: -0.24, distance: 0.98, height: 0.32, rotation: 0.28, width: 0.48, depth: 0.2 },
  { angle: 0.74, distance: 0.76, height: 0.22, rotation: -0.16, width: 0.36, depth: 0.15 },
  { angle: 1.68, distance: 0.92, height: 0.3, rotation: 0.12, width: 0.44, depth: 0.18 },
  { angle: 2.56, distance: 0.73, height: 0.19, rotation: -0.3, width: 0.33, depth: 0.14 },
];

const REDUCED_CLOUD_INDICES = new Set([0, 2, 4, 6]);

export function normalizedCommercialMapSunDirection() {
  const solar = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar;
  const [x, y, z] = solar.presets[solar.activePreset].direction;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length] as const;
}

export function projectedCommercialMapShadowDirection() {
  const [x, , z] = normalizedCommercialMapSunDirection();
  const length = Math.hypot(x, z) || 1;
  return [-x / length, -z / length] as const;
}

export function projectedCommercialMapShadowRotation() {
  const [x, z] = projectedCommercialMapShadowDirection();
  return Math.atan2(z, x);
}

export function resolveCommercialMapEnvironmentLayout(
  extent: CommercialMapEnvironmentExtent,
  mode: CommercialMapEnvironmentMode,
  reducedGraphics: boolean,
) {
  const diagonal = Math.max(1, extent.diagonal);
  const groundMargin = Math.max(8, diagonal * 0.08);
  const fog = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fog;
  const fogNearRatio = mode === 'hydrological' ? fog.hydrologicalNearRatio : fog.nearRatio;
  const fogFarRatio = mode === 'hydrological' ? fog.hydrologicalFarRatio : fog.farRatio;

  return {
    activeGroundWidth: extent.width + groundMargin,
    activeGroundDepth: extent.depth + groundMargin,
    outerGroundSize: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.minimumWorldSize,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.worldSizeRatio,
    ),
    skyScale: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.minimumScale,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.scaleRatio,
    ),
    fogNear: diagonal * fogNearRatio,
    fogFar: diagonal * fogFarRatio,
    sunDistance: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.minimumDistance,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.distanceRatio,
    ),
    shadowSpan: Math.max(extent.width, extent.depth) * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.shadowCoverageRatio,
    cloudCount: reducedGraphics
      ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.reducedCount
      : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.fullCount,
  };
}

export function resolveCommercialMapCloudPlacements(
  extent: CommercialMapEnvironmentExtent,
  reducedGraphics: boolean,
): readonly CommercialMapCloudPlacement[] {
  const diagonal = Math.max(1, extent.diagonal);
  const blueprints = reducedGraphics
    ? CLOUD_BLUEPRINTS.filter((_cloud, index) => REDUCED_CLOUD_INDICES.has(index))
    : CLOUD_BLUEPRINTS;

  return blueprints.map((cloud) => ({
    position: [
      extent.centerX + Math.cos(cloud.angle) * diagonal * cloud.distance,
      Math.max(24, diagonal * cloud.height),
      extent.centerZ + Math.sin(cloud.angle) * diagonal * cloud.distance,
    ] as const,
    rotationY: cloud.angle + cloud.rotation,
    scale: [
      diagonal * cloud.width,
      diagonal * cloud.depth,
      1,
    ] as const,
  }));
}

export function commercialMapEnvironmentBudget(reducedGraphics = false) {
  const cloudCount = reducedGraphics
    ? COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.reducedCount
    : COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.fullCount;
  return {
    primaryDrawCalls: 4,
    skyDrawCalls: 1,
    groundDrawCalls: 2,
    cloudDrawCalls: 1,
    cloudInstances: cloudCount,
    animatedLayers: 0,
  } as const;
}

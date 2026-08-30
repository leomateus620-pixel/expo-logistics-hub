export type CommercialMapEnvironmentMode = 'normal' | 'hydrological';

export interface CommercialMapEnvironmentExtent {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  diagonal: number;
  maxHeight?: number;
}

export type CommercialMapSunriseQualityTier = 'full' | 'balanced' | 'reduced';

export interface CommercialMapSunriseFrame {
  progress: number;
  easedProgress: number;
  elevationDegrees: number;
  direction: readonly [number, number, number];
  sunlightIntensity: number;
  fillIntensity: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  environmentIntensity: number;
  cloudWarmth: number;
  hazeStrength: number;
  rayStrength: number;
  shadowRadius: number;
}

/** Presentation-only atmosphere for the shared Commercial Map canvas. */
export const COMMERCIAL_MAP_ENVIRONMENT_CONFIG = {
  revision: '2026.8-premium-sunrise.2-camera-safe',
  sunrise: {
    durationMs: 12_000,
    // Attachments 1-2 face the top/rear of the official plan. The plan is
    // mapped without rotation, so its stable horizon is world -Z. This is a
    // map-local bearing, not a surveyed claim of true north.
    azimuthMapDegrees: 0,
    horizonDirection: [0, 0, -1] as const,
    horizonLabel: 'topo/traseira da planta oficial (-Z)',
    startElevationDegrees: -0.6,
    endElevationDegrees: 3.2,
    apparentDiscDiameterDegrees: 1.62,
    coronaDiameterDegrees: 7.2,
    // The visual sun lives on a far-clamped celestial sphere. Keeping its
    // world-space origin at the map anchor preserves the same azimuth/elevation
    // used by the Sky shader and directional light while making camera
    // translation parallax visually negligible.
    celestialDistanceRatio: 300,
    minimumCelestialDistance: 50_000,
    toneMappingExposure: 0.93,
    colors: {
      preSunriseZenith: '#2f70a5',
      preSunriseUpper: '#78acc8',
      preSunriseHorizon: '#bdcbd0',
      finalZenith: '#2f78b3',
      finalUpper: '#73b8d0',
      finalHorizon: '#f4b47c',
      finalHorizonCool: '#b6d4d6',
      sunCore: '#fff9df',
      sunEdge: '#ffd28a',
      corona: '#f2a45c',
      rays: '#ffd8a0',
      warmCloud: '#f7c18e',
      coolShadow: '#9fc1d1',
    },
    quality: {
      full: {
        shadowMapSize: 2048,
        shadowRefreshIntervalMs: 66,
        bloomLevels: 7,
        bloomEnabled: true,
      },
      balanced: {
        shadowMapSize: 1536,
        shadowRefreshIntervalMs: 92,
        bloomLevels: 5,
        bloomEnabled: true,
      },
      reduced: {
        shadowMapSize: 512,
        shadowRefreshIntervalMs: 140,
        bloomLevels: 0,
        bloomEnabled: false,
      },
    },
  },
  solar: {
    // Retained only as calibration provenance. The authored sunrise above is
    // the active source of truth because these studies describe high daylight,
    // not the attachment-defined horizon.
    calibrationAlternatives: {
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
    color: '#ffd7a0',
    intensity: 2.46,
    hydrologicalIntensity: 2.08,
    distanceRatio: 1.32,
    minimumDistance: 96,
    shadowCoverageRatio: 0.68,
  },
  fill: {
    direction: [0.54, 0.34, -0.45] as const,
    color: '#c9e0f4',
    intensity: 0.22,
    hydrologicalIntensity: 0.18,
  },
  ambient: {
    intensity: 0.39,
    hydrologicalIntensity: 0.54,
    hemisphereIntensity: 1.04,
    hydrologicalHemisphereIntensity: 0.9,
  },
  sky: {
    minimumScale: 50_000,
    scaleRatio: 300,
    turbidity: 7.1,
    rayleigh: 2.35,
    mieCoefficient: 0.0068,
    mieDirectionalG: 0.84,
  },
  clouds: {
    opacity: 0.34,
    hydrologicalOpacity: 0.22,
  },
  ground: {
    minimumWorldSize: 1_600,
    worldSizeRatio: 12,
  },
  fog: {
    minimumNearRatio: 4.4,
    depthRatio: 5.6,
    hydrologicalMinimumNearRatio: 4.8,
    hydrologicalDepthRatio: 6,
    mapClearanceRatio: 1.15,
  },
  reflections: {
    fullTextureWidth: 128,
    reducedTextureWidth: 64,
    intensity: 0.42,
    hydrologicalIntensity: 0.2,
  },
  toneMappingExposure: 0.93,
  palettes: {
    normal: {
      fallback: '#77a9c4',
      zenith: '#2f78b3',
      upperSky: '#73b8d0',
      horizon: '#e9b88e',
      sunGlow: '#ffd6a0',
      cloud: '#eef4f5',
      cloudShade: '#a9c1ce',
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

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function smootherstep(value: number) {
  const t = clampUnit(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function rangeProgress(value: number, start: number, end: number) {
  if (end <= start) return value >= end ? 1 : 0;
  return clampUnit((value - start) / (end - start));
}

export function commercialMapSunriseDirection(
  elevationDegrees: number = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.endElevationDegrees,
  azimuthMapDegrees: number = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.azimuthMapDegrees,
) {
  const elevation = elevationDegrees * Math.PI / 180;
  const azimuth = azimuthMapDegrees * Math.PI / 180;
  const cosElevation = Math.cos(elevation);
  return [
    Math.sin(azimuth) * cosElevation,
    Math.sin(elevation),
    -Math.cos(azimuth) * cosElevation,
  ] as const;
}

export function normalizedCommercialMapSunDirection() {
  return commercialMapSunriseDirection();
}

export function resolveCommercialMapSunriseProgress(startedAt: number, currentTime: number) {
  const elapsed = Math.max(0, currentTime - startedAt);
  return clampUnit(elapsed / COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.durationMs);
}

export function resolveCommercialMapSunriseFrame(
  progress: number,
  mode: CommercialMapEnvironmentMode = 'normal',
): CommercialMapSunriseFrame {
  const normalizedProgress = clampUnit(progress);
  const easedProgress = smootherstep(normalizedProgress);
  const daylight = smootherstep(rangeProgress(normalizedProgress, 0.12, 0.78));
  const colorTransition = smootherstep(rangeProgress(normalizedProgress, 0.02, 0.72));
  const rayReveal = smootherstep(rangeProgress(normalizedProgress, 0.14, 0.5));
  const raySettle = smootherstep(rangeProgress(normalizedProgress, 0.72, 1));
  const config = COMMERCIAL_MAP_ENVIRONMENT_CONFIG;
  const finalSunlight = mode === 'hydrological'
    ? config.solar.hydrologicalIntensity
    : config.solar.intensity;
  const finalFill = mode === 'hydrological'
    ? config.fill.hydrologicalIntensity
    : config.fill.intensity;
  const finalAmbient = mode === 'hydrological'
    ? config.ambient.hydrologicalIntensity
    : config.ambient.intensity;
  const finalHemisphere = mode === 'hydrological'
    ? config.ambient.hydrologicalHemisphereIntensity
    : config.ambient.hemisphereIntensity;
  const finalEnvironment = mode === 'hydrological'
    ? config.reflections.hydrologicalIntensity
    : config.reflections.intensity;
  const elevationDegrees = config.sunrise.startElevationDegrees
    + (config.sunrise.endElevationDegrees - config.sunrise.startElevationDegrees) * easedProgress;

  return {
    progress: normalizedProgress,
    easedProgress,
    elevationDegrees,
    direction: commercialMapSunriseDirection(elevationDegrees),
    sunlightIntensity: finalSunlight * daylight,
    fillIntensity: finalFill * (0.62 + daylight * 0.38),
    ambientIntensity: finalAmbient * (0.76 + colorTransition * 0.24),
    hemisphereIntensity: finalHemisphere * (0.78 + colorTransition * 0.22),
    environmentIntensity: finalEnvironment * (0.44 + daylight * 0.56),
    cloudWarmth: colorTransition,
    hazeStrength: 0.54 + colorTransition * 0.46,
    rayStrength: rayReveal * (1 - raySettle * 0.34),
    shadowRadius: 4.1 - daylight * 1.55,
  };
}

export function resolveCommercialMapSunriseQualityTier({
  reducedGraphics,
  viewportWidth,
  viewportHeight,
  deviceMemory,
  hardwareConcurrency,
}: {
  reducedGraphics: boolean;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}): CommercialMapSunriseQualityTier {
  if (reducedGraphics) return 'reduced';
  const shortestSide = Math.min(
    Number.isFinite(viewportWidth) ? viewportWidth : 0,
    Number.isFinite(viewportHeight) ? viewportHeight : 0,
  );
  if (
    (Number.isFinite(deviceMemory) && (deviceMemory ?? 8) < 4)
    || (Number.isFinite(hardwareConcurrency) && (hardwareConcurrency ?? 8) < 4)
  ) return 'reduced';
  if (shortestSide > 0 && shortestSide <= 720) return 'balanced';
  return 'full';
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
  _qualityTier: CommercialMapSunriseQualityTier,
  safeCameraMaxDistance = Math.max(1, extent.diagonal),
) {
  const diagonal = Math.max(1, extent.diagonal);
  const fog = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fog;
  const fogNearRatio = mode === 'hydrological'
    ? fog.hydrologicalMinimumNearRatio
    : fog.minimumNearRatio;
  const fogDepthRatio = mode === 'hydrological'
    ? fog.hydrologicalDepthRatio
    : fog.depthRatio;
  const boundingSphereRadius = Math.hypot(
    Math.max(1, extent.width) / 2,
    Math.max(1, extent.depth) / 2,
    Math.max(0, extent.maxHeight ?? 0) / 2,
  );
  const safeMaximumDistance = Number.isFinite(safeCameraMaxDistance)
    ? Math.max(1, safeCameraMaxDistance)
    : diagonal;
  const fogNear = Math.max(
    diagonal * fogNearRatio,
    safeMaximumDistance + boundingSphereRadius * fog.mapClearanceRatio,
  );

  return {
    outerGroundSize: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.minimumWorldSize,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.ground.worldSizeRatio,
      // Keep the single opaque ground boundary beyond the derived camera far
      // plane at every supported aspect ratio. The fog remains atmospheric;
      // it is not responsible for concealing a finite plane edge.
      (safeMaximumDistance + boundingSphereRadius) * 12,
    ),
    skyScale: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.minimumScale,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sky.scaleRatio,
    ),
    fogNear,
    fogFar: fogNear + diagonal * fogDepthRatio,
    sunDistance: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.minimumDistance,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.distanceRatio,
    ),
    visualSunDistance: Math.max(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.minimumCelestialDistance,
      diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.celestialDistanceRatio,
    ),
    shadowSpan: Math.max(extent.width, extent.depth) * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.shadowCoverageRatio,
  };
}

export function commercialMapEnvironmentBudget(
  qualityTier: CommercialMapSunriseQualityTier = 'full',
) {
  const quality = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality[qualityTier];
  return {
    primaryDrawCalls: 3,
    skyDrawCalls: 1,
    sunDrawCalls: 1,
    sunIntegratedInSky: false,
    groundDrawCalls: 1,
    cloudDrawCalls: 0,
    cloudInstances: 0,
    cloudsIntegratedInSky: true,
    animatedLayers: 4,
    postProcessingPasses: quality.bloomEnabled ? 2 : 0,
    shadowMapSize: quality.shadowMapSize,
  } as const;
}

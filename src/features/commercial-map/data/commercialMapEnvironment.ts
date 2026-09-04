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
    // The reveal remains visible, but reaches useful architectural daylight
    // quickly enough that the cold-start experience is never a dark model.
    durationMs: 7_500,
    // Attachments 1-2 face the top/rear of the official plan. The plan is
    // mapped without rotation, so its stable horizon is world -Z. This is a
    // map-local bearing, not a surveyed claim of true north.
    azimuthMapDegrees: 0,
    horizonDirection: [0, 0, -1] as const,
    horizonLabel: 'topo/traseira da planta oficial (-Z)',
    startElevationDegrees: -0.6,
    // A 24-degree key keeps the warm aerial-reference character while avoiding
    // kilometre-long shadows, acne and crushed north-facing facades.
    endElevationDegrees: 24,
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
        smaaPreset: 'ultra',
        // Minimal post-SMAA unsharp so ULTRA edge blending does not soften
        // roof lines and parking stripes. 0 disables the extra pass.
        sharpenStrength: 0.16,
      },
      balanced: {
        shadowMapSize: 1536,
        shadowRefreshIntervalMs: 92,
        bloomLevels: 5,
        bloomEnabled: true,
        smaaPreset: 'high',
        sharpenStrength: 0,
      },
      reduced: {
        shadowMapSize: 512,
        shadowRefreshIntervalMs: 140,
        bloomLevels: 0,
        bloomEnabled: false,
        smaaPreset: 'renderer-msaa',
        sharpenStrength: 0,
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
    // 0.15 map units/metre. Constant bias stays tiny so shadows kiss the
    // ground (no peter-pan). Normal bias of 0.02 units ≈ 13 cm kills 24°
    // acne on roofs and lots without lifting pavilion/tree contact.
    shadowBias: -0.0001,
    shadowNormalBias: 0.02,
  },
  fill: {
    direction: [0.54, 0.34, -0.45] as const,
    color: '#c9e0f4',
    intensity: 0.22,
    hydrologicalIntensity: 0.18,
  },
  ambient: {
    // Less flat ambient, more sky/ground hemisphere: north-facing facades keep
    // reading as volume under the 24° key instead of a uniform grey fill.
    intensity: 0.33,
    hydrologicalIntensity: 0.5,
    hemisphereIntensity: 1.14,
    hydrologicalHemisphereIntensity: 0.94,
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
    // Regional BR-344/BR-472 sit well outside the 120×90 park crop. Keep the
    // opaque grass plane larger than that corridor so the void never shows a
    // horizon seam when the camera dollies out to the highways.
    minimumWorldSize: 2_400,
    worldSizeRatio: 14,
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
    intensity: 0.5,
    hydrologicalIntensity: 0.22,
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

/**
 * Night atmosphere shared by global Night Mode and the amusement-park focus.
 * The environment eases towards these values with the damping lambdas below,
 * so sky, fog, ambient light and the sun darken together instead of flipping.
 * Ambient/hemisphere stay above the old park-only night so the darker zones
 * of the map remain readable while the pole network lights the rest.
 */
export const COMMERCIAL_MAP_NIGHT_ATMOSPHERE = {
  background: '#050916',
  fog: '#0b1421',
  ambientColor: '#7185ad',
  ambientIntensity: 0.19,
  hemisphereSky: '#263a67',
  hemisphereGround: '#101713',
  hemisphereIntensity: 0.25,
  environmentIntensity: 0.11,
  sky: {
    zenith: '#04070f',
    upper: '#0a1226',
    horizon: '#1d2a49',
    horizonGlow: '#3a3a4d',
    groundFar: '#070a10',
    starIntensity: 0.62,
  },
  /** Damping lambdas (s⁻¹) for entering and leaving the night. */
  blendInLambda: 2.2,
  blendOutLambda: 2.9,
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
    // Texel radius for a 2048² PCF map (the renderer scales it per map size).
    // The low sun starts soft and settles to a crisp architectural edge.
    shadowRadius: 3 - daylight * 1.25,
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

export interface CommercialMapShadowFrustum {
  /** World-space XZ the directional light targets: the park centre, not the BRs. */
  anchor: readonly [number, number];
  /** Orthographic half-extents along the light camera's right/up axes. */
  halfWidth: number;
  halfHeight: number;
  /** Distance from the anchor at which the light (shadow camera) sits. */
  distance: number;
  near: number;
  far: number;
}

function shadowFrustumForDirection(
  halfWidth: number,
  halfDepth: number,
  maxHeight: number,
  direction: readonly [number, number, number],
) {
  // Camera basis of a DirectionalLight shadow camera: it looks along
  // -direction with world +Y as the up hint (Object3D.lookAt semantics).
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz) || 1;
  const forward = [-dx / length, -dy / length, -dz / length] as const;
  let right = [forward[2], 0, -forward[0]] as [number, number, number];
  const rightLength = Math.hypot(right[0], right[1], right[2]);
  right = rightLength < 1e-6 ? [1, 0, 0] : [right[0] / rightLength, 0, right[2] / rightLength];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ] as const;
  let spanRight = 0;
  let spanUp = 0;
  let spanDepth = 0;
  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [0, maxHeight]) {
      for (const z of [-halfDepth, halfDepth]) {
        spanRight = Math.max(spanRight, Math.abs(x * right[0] + y * right[1] + z * right[2]));
        spanUp = Math.max(spanUp, Math.abs(x * up[0] + y * up[1] + z * up[2]));
        spanDepth = Math.max(spanDepth, Math.abs(x * forward[0] + y * forward[1] + z * forward[2]));
      }
    }
  }
  return { spanRight, spanUp, spanDepth };
}

/**
 * Fits the directional shadow camera to the PARK box only. The regional
 * highways add hundreds of world units to the camera/fog extent, and letting
 * them into the shadow frustum spreads a 2048² map so thin that pavilions and
 * trees lose their shadows. The box is evaluated for the low sunrise start and
 * the ~24° daylight end so the animated light never clips the park.
 */
export function resolveCommercialMapShadowFrustum(
  parkExtent: Pick<CommercialMapEnvironmentExtent, 'centerX' | 'centerZ' | 'width' | 'depth' | 'maxHeight'>,
  margin = 1.08,
): CommercialMapShadowFrustum {
  const halfWidth = Math.max(1, Number.isFinite(parkExtent.width) ? parkExtent.width : 1) / 2;
  const halfDepth = Math.max(1, Number.isFinite(parkExtent.depth) ? parkExtent.depth : 1) / 2;
  // Real casters (pavilion roofs, water tanks, canopies) top out well below
  // this; the floor protects against a scene whose extent reports no height.
  const maxHeight = Math.max(6, Number.isFinite(parkExtent.maxHeight) ? parkExtent.maxHeight ?? 0 : 0);
  const safeMargin = Math.min(1.5, Math.max(1, Number.isFinite(margin) ? margin : 1.08));
  const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
  const elevations = [
    Math.max(0.5, sunrise.startElevationDegrees),
    sunrise.endElevationDegrees,
  ];
  let spanRight = 0;
  let spanUp = 0;
  let spanDepth = 0;
  for (const elevation of elevations) {
    const fit = shadowFrustumForDirection(
      halfWidth,
      halfDepth,
      maxHeight,
      commercialMapSunriseDirection(elevation),
    );
    spanRight = Math.max(spanRight, fit.spanRight);
    spanUp = Math.max(spanUp, fit.spanUp);
    spanDepth = Math.max(spanDepth, fit.spanDepth);
  }
  const diagonal = Math.hypot(halfWidth * 2, halfDepth * 2);
  const distance = Math.max(
    COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.minimumDistance,
    diagonal * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.distanceRatio,
  );
  const depthPadding = Math.max(6, spanDepth * 0.15);
  return {
    anchor: [
      Number.isFinite(parkExtent.centerX) ? parkExtent.centerX : 0,
      Number.isFinite(parkExtent.centerZ) ? parkExtent.centerZ : 0,
    ],
    halfWidth: spanRight * safeMargin,
    halfHeight: spanUp * safeMargin,
    distance,
    near: Math.max(0.5, distance - spanDepth - depthPadding),
    far: distance + spanDepth + depthPadding,
  };
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
    // Top-level composer passes: scene, combined Bloom/ACES, final SMAA and,
    // on full only, the minimal sharpen. SMAA's two internal lookup passes and
    // Bloom mip levels remain bounded by the presets above rather than being
    // misreported as scene draw calls.
    postProcessingPasses: quality.bloomEnabled ? 3 + (quality.sharpenStrength > 0 ? 1 : 0) : 0,
    shadowMapSize: quality.shadowMapSize,
  } as const;
}

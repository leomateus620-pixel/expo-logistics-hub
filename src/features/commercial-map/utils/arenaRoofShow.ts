import * as THREE from 'three';
import { FENASOJA_2028_COLORS } from '@/lib/fenasoja-brand';

export type ArenaShowStatus = 'idle' | 'playing' | 'settling';

export type ArenaShowStage =
  | 'idle'
  | 'panel-activation'
  | 'horizon-dawn'
  | 'sunrise-plains'
  | 'institutional-transition'
  | 'brand-reveal'
  | 'settling';

export const ARENA_SHOW_TIMELINE = Object.freeze({
  activationStart: 0.0,
  activationEnd: 0.8,
  horizonStart: 0.8,
  horizonEnd: 2.5,
  sunriseStart: 2.5,
  sunriseEnd: 4.6,
  transitionStart: 4.6,
  transitionEnd: 5.8,
  revealStart: 5.8,
  revealEnd: 7.0,
  totalDurationSeconds: 7.0,
  settlingDurationSeconds: 0.45,
});

export const ARENA_SHOW_PALETTE = Object.freeze({
  idleBlueFaceBottom: FENASOJA_2028_COLORS.indigo, // #121D85
  idleBlueFaceMid: '#1543A8',
  idleBlueFaceTop: FENASOJA_2028_COLORS.blue, // #1A6CCB
  idleBlueEmissive: '#0C2D7A',
  idleReturnNavy: FENASOJA_2028_COLORS.navy, // #031834
  idleReturnEmissive: '#102B6B',
  panelHousingDark: '#060E20',
  panelFrameBlue: '#0E2960',
  goldHighlight: FENASOJA_2028_COLORS.gold, // #F9C121
  lightGold: FENASOJA_2028_COLORS.lightGold, // #FAD954
  dawnOrange: FENASOJA_2028_COLORS.orange, // #F2751A
  emeraldField: '#0A8754',
});

export interface ArenaShowFrameState {
  status: ArenaShowStatus;
  stage: ArenaShowStage;
  elapsedSeconds: number;
  progress: number;
  /** 0 in idle, 1 when the LED surface is fully active */
  panelPower: number;
  /** 0..1 progress of dawn/horizon appearance (0.8s -> 4.6s) */
  horizonProgress: number;
  /** 0..1 elevation and golden radiance of the sun (1.1s -> 4.8s) */
  sunElevation: number;
  /** 0..1 golden light spreading across agricultural plains (2.5s -> 4.6s) */
  plainsGoldSpread: number;
  /** 0..1 transition from landscape to institutional ceremony (4.6s -> 5.8s) */
  institutionalReveal: number;
  /** 0..1 final brand highlight in gold + intense blue (5.8s -> 7.0s) */
  brandFinale: number;
  /** -0.3..1.3 horizontal light sweep across logo and FENASOJA letters */
  sweepPosition: number;
  /** 0..1 visibility of the 3D official emblem during the show */
  symbolPresence: number;
  /** 0..1 visibility of the 3D sculpted FENASOJA letters during the show */
  sculptedBrandPresence: number;
  /** 0..1 golden/blue luminescence boost on the 3D letters during Phase 5 */
  letterGoldBoost: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function smoothstepRange(value: number, edge0: number, edge1: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstepRange(value: number, edge0: number, edge1: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function resolveArenaShowStage(elapsedSeconds: number, active: boolean): ArenaShowStage {
  if (!active || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 'idle';
  const T = ARENA_SHOW_TIMELINE;
  if (elapsedSeconds < T.activationEnd) return 'panel-activation';
  if (elapsedSeconds < T.horizonEnd) return 'horizon-dawn';
  if (elapsedSeconds < T.sunriseEnd) return 'sunrise-plains';
  if (elapsedSeconds < T.transitionEnd) return 'institutional-transition';
  if (elapsedSeconds < T.revealEnd) return 'brand-reveal';
  if (elapsedSeconds < T.revealEnd + T.settlingDurationSeconds) return 'settling';
  return 'idle';
}

export function sampleArenaShowFrame(
  elapsedSeconds: number,
  active: boolean,
): ArenaShowFrameState {
  const T = ARENA_SHOW_TIMELINE;
  const totalWithSettling = T.totalDurationSeconds + T.settlingDurationSeconds;

  if (!active || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= totalWithSettling) {
    return {
      status: 'idle',
      stage: 'idle',
      elapsedSeconds: 0,
      progress: 0,
      panelPower: 0,
      horizonProgress: 0,
      sunElevation: 0,
      plainsGoldSpread: 0,
      institutionalReveal: 0,
      brandFinale: 0,
      sweepPosition: -0.35,
      symbolPresence: 1,
      sculptedBrandPresence: 1,
      letterGoldBoost: 0,
    };
  }

  const stage = resolveArenaShowStage(elapsedSeconds, true);
  const status: ArenaShowStatus = stage === 'settling' ? 'settling' : 'playing';
  const progress = clamp01(elapsedSeconds / T.totalDurationSeconds);

  // Phase 1 (0.0s -> 0.8s): Panel energization & smooth power-down at end (6.65s -> 7.45s)
  const powerIn = smootherstepRange(elapsedSeconds, 0.0, 0.72);
  const powerOut = 1 - smootherstepRange(elapsedSeconds, 6.62, totalWithSettling);
  const panelPower = clamp01(powerIn * powerOut);

  // Phase 2 (0.8s -> 2.5s): Horizon and dawn emergence
  const horizonIn = smootherstepRange(elapsedSeconds, 0.65, 2.35);
  const horizonOut = 1 - smootherstepRange(elapsedSeconds, 4.75, 5.85);
  const horizonProgress = clamp01(horizonIn * horizonOut);

  // Sun rises from 0.9s through 4.6s
  const sunElevation = smootherstepRange(elapsedSeconds, 0.9, 4.55);

  // Phase 3 (2.5s -> 4.6s): Golden sunlight spreading across plains
  const plainsIn = smootherstepRange(elapsedSeconds, 2.2, 4.45);
  const plainsGoldSpread = clamp01(plainsIn * horizonOut);

  // Phase 4 (4.6s -> 5.8s): Institutional transition
  const institutionalIn = smootherstepRange(elapsedSeconds, 4.55, 5.75);
  const institutionalReveal = clamp01(institutionalIn * powerOut);

  // Phase 5 (5.8s -> 7.0s): Final brand reveal in gold and intense blue
  const finaleIn = smootherstepRange(elapsedSeconds, 5.55, 6.35);
  const finaleOut = 1 - smootherstepRange(elapsedSeconds, 6.75, totalWithSettling);
  const brandFinale = clamp01(finaleIn * finaleOut);

  // Ceremonial light sweep across the lockup during Phase 4 -> Phase 5
  const sweepProgress = smootherstepRange(elapsedSeconds, 4.75, 6.85);
  const sweepPosition = -0.3 + sweepProgress * 1.6;

  // Sculpted 3D letters/emblem recede gently during the landscape phases (0.2s -> 4.6s)
  // so the horizon & sunrise have an unobstructed LED canvas; then in Phase 4 the emblem
  // leads the institutional reveal followed by the FENASOJA wordmark in Phase 5.
  const brandFadeOut = 1 - smootherstepRange(elapsedSeconds, 0.12, 0.74);
  const symbolFadeIn = smootherstepRange(elapsedSeconds, 4.58, 5.45);
  const lettersFadeIn = smootherstepRange(elapsedSeconds, 4.88, 5.78);
  const symbolPresence = clamp01(0.06 + 0.94 * Math.max(brandFadeOut, symbolFadeIn));
  const sculptedBrandPresence = clamp01(0.06 + 0.94 * Math.max(brandFadeOut, lettersFadeIn));

  const letterGoldBoost = clamp01(
    smootherstepRange(elapsedSeconds, 5.15, 6.2) * (1 - smootherstepRange(elapsedSeconds, 6.72, totalWithSettling)),
  );

  return {
    status,
    stage,
    elapsedSeconds,
    progress,
    panelPower,
    horizonProgress,
    sunElevation,
    plainsGoldSpread,
    institutionalReveal,
    brandFinale,
    sweepPosition,
    symbolPresence,
    sculptedBrandPresence,
    letterGoldBoost,
  };
}

export interface ArenaShowController {
  readonly status: ArenaShowStatus;
  readonly stage: ArenaShowStage;
  readonly sequence: number;
  trigger: (nowMs: number) => boolean;
  sample: (nowMs: number) => ArenaShowFrameState;
  reset: () => void;
}

/**
 * Deterministic, re-entrancy-safe controller for the on-demand Arena brand show.
 * Blocks repeated clicks while `playing` or `settling` and returns cleanly to `idle`.
 */
export function createArenaShowController(): ArenaShowController {
  let status: ArenaShowStatus = 'idle';
  let stage: ArenaShowStage = 'idle';
  let startedAtMs: number | null = null;
  let sequence = 0;

  const reset = () => {
    status = 'idle';
    stage = 'idle';
    startedAtMs = null;
  };

  const sample = (nowMs: number): ArenaShowFrameState => {
    if (status === 'idle' || startedAtMs === null || !Number.isFinite(nowMs)) {
      reset();
      return sampleArenaShowFrame(0, false);
    }
    const elapsedSeconds = Math.max(0, (nowMs - startedAtMs) / 1000);
    const frame = sampleArenaShowFrame(elapsedSeconds, true);
    if (frame.status === 'idle') {
      reset();
      return frame;
    }
    status = frame.status;
    stage = frame.stage;
    return frame;
  };

  const trigger = (nowMs: number): boolean => {
    if (!Number.isFinite(nowMs)) return false;
    // Refresh current state first in case the previous run has just finished
    if (status !== 'idle' && startedAtMs !== null) {
      const check = sampleArenaShowFrame(Math.max(0, (nowMs - startedAtMs) / 1000), true);
      if (check.status === 'idle') {
        reset();
      }
    }
    if (status !== 'idle') {
      return false;
    }
    startedAtMs = nowMs;
    status = 'playing';
    stage = 'panel-activation';
    sequence += 1;
    return true;
  };

  return {
    get status() {
      return status;
    },
    get stage() {
      return stage;
    },
    get sequence() {
      return sequence;
    },
    trigger,
    sample,
    reset,
  };
}

const ARENA_LED_PANEL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vPanelUv;
  varying vec3 vWorldNormal;

  void main() {
    vPanelUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARENA_LED_PANEL_FRAGMENT_SHADER = /* glsl */ `
  uniform float uPower;
  uniform float uElapsed;
  uniform float uHorizon;
  uniform float uSunElevation;
  uniform float uPlainsGold;
  uniform float uInstitutional;
  uniform float uFinale;
  uniform float uSweep;
  uniform float uNight;
  varying vec2 vPanelUv;
  varying vec3 vWorldNormal;

  float roundedBoxSdf(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    if (uPower <= 0.001) discard;

    // vPanelUv.x runs left-to-right along the Arena ridge (0 = logo side, 1 = right end of FENASOJA)
    // vPanelUv.y runs bottom-to-top across the curved vault section (0 = lower eave side, 1 = upper eave side)
    vec2 centered = vPanelUv * 2.0 - 1.0;
    vec2 aspectPos = vec2(centered.x * 2.35, centered.y);

    // Outer architectural bezel & rounded mask so the LED panel feels recessed into the curved roof
    float outerDist = roundedBoxSdf(aspectPos, vec2(2.26, 0.90), 0.14);
    float outerAlpha = 1.0 - smoothstep(-0.02, 0.035, outerDist);
    if (outerAlpha <= 0.002) discard;

    float innerDist = roundedBoxSdf(aspectPos, vec2(2.17, 0.81), 0.10);
    float innerMask = 1.0 - smoothstep(-0.015, 0.02, innerDist);
    float bezelRing = clamp(outerAlpha - innerMask, 0.0, 1.0);

    // Phase 1: Panel activation wave from center outward
    float activationWave = smoothstep(0.0, 1.0, uPower * 1.25 - length(centered * vec2(0.65, 0.85)) * 0.35);

    // Screen coordinates inside the active display area:
    // uv.x runs left-to-right along the Arena ridge (0 = logo side, 1 = right end of FENASOJA)
    // uv.y runs bottom-to-top on the viewer's screen (0 = bottom eave, 1 = top eave)
    vec2 uv = clamp((centered + vec2(0.92, 0.81)) / vec2(1.84, 1.62), 0.0, 1.0);

    // Subtle curvature shading so the LED display respects the barrel vault 3D volume
    float vaultCrown = 1.0 - pow(centered.y * 0.82, 2.0);

    // Base dark sapphire LED cabinet
    vec3 cabinetColor = mix(vec3(0.018, 0.045, 0.125), vec3(0.035, 0.095, 0.245), vaultCrown);
    float energizeLine = exp(-pow((uv.y - (0.22 + 0.28 * uPower)) * 9.5, 2.0)) * (1.0 - uHorizon * 0.65);
    cabinetColor += vec3(0.08, 0.32, 0.78) * energizeLine * 0.55;

    // Phase 2 & 3: Dawn Sky & Rising Sun over stylized agricultural plains
    float horizonLine = 0.36 + 0.025 * sin(uv.x * 5.2 + 0.4) + 0.014 * cos(uv.x * 9.5 - 0.8);
    float skyFactor = smoothstep(horizonLine - 0.012, horizonLine + 0.018, uv.y);

    // Sky gradient: deep predawn navy -> royal blue -> warm amber/gold at the horizon
    float skyHeight = clamp((uv.y - horizonLine) / max(0.001, 1.0 - horizonLine), 0.0, 1.0);
    vec3 predawnZenith = vec3(0.02, 0.06, 0.19);
    vec3 dawnZenith = vec3(0.04, 0.16, 0.46);
    vec3 horizonDawnWarm = mix(vec3(0.88, 0.38, 0.10), vec3(0.98, 0.76, 0.18), uPlainsGold);
    vec3 skyColor = mix(predawnZenith, dawnZenith, uSunElevation);
    skyColor = mix(horizonDawnWarm, skyColor, pow(skyHeight, 0.58));

    // Sun position & atmospheric corona
    vec2 sunCenter = vec2(0.36, horizonLine - 0.06 + uSunElevation * 0.27);
    vec2 sunDelta = (uv - sunCenter) * vec2(2.15, 1.0);
    float sunDist = length(sunDelta);
    float sunDisc = 1.0 - smoothstep(0.085, 0.115, sunDist);
    float sunHalo = exp(-sunDist * 4.2) * (0.45 + 0.55 * uSunElevation);
    float horizonGlow = exp(-abs(uv.y - horizonLine) * 11.0) * exp(-abs(uv.x - sunCenter.x) * 2.2);

    skyColor += vec3(1.0, 0.88, 0.46) * sunHalo * 0.85;
    skyColor += vec3(1.0, 0.97, 0.82) * sunDisc * 1.15;
    skyColor += vec3(0.99, 0.68, 0.16) * horizonGlow * (0.45 + 0.55 * uPlainsGold);

    // Agricultural plains with perspective crop rows converging toward the rising sun
    float groundDepth = clamp((horizonLine - uv.y) / max(0.001, horizonLine), 0.0, 1.0);
    float perspectiveX = (uv.x - sunCenter.x) / (0.16 + groundDepth * 0.88);
    float furrows = 0.5 + 0.5 * cos(perspectiveX * 26.0);
    float furrowLines = smoothstep(0.25, 0.88, furrows);

    vec3 earthBase = mix(vec3(0.03, 0.12, 0.14), vec3(0.04, 0.28, 0.20), smoothstep(0.0, 1.0, uSunElevation));
    vec3 sunlitRows = mix(vec3(0.14, 0.48, 0.24), vec3(0.96, 0.74, 0.16), uPlainsGold * (0.65 + 0.35 * (1.0 - groundDepth)));
    vec3 plainsColor = mix(earthBase, sunlitRows, furrowLines * (0.35 + 0.65 * (0.4 + 0.6 * uPlainsGold)));

    // Golden sunlight wash spreading across the terraces in Phase 3
    float sunBeamSpread = exp(-pow((uv.x - sunCenter.x) * 1.65, 2.0)) * (1.0 - groundDepth * 0.45);
    plainsColor += vec3(0.98, 0.76, 0.20) * sunBeamSpread * uPlainsGold * 0.52;
    plainsColor += vec3(0.99, 0.82, 0.34) * exp(-groundDepth * 6.5) * (0.35 + 0.65 * uPlainsGold) * 0.45;

    vec3 landscapeScene = mix(plainsColor, skyColor, skyFactor);

    // Phase 4 & 5: Institutional transformation & Ceremonial Royal Blue + Gold reveal
    vec3 institutionalBlue = mix(
      vec3(0.015, 0.048, 0.19),
      vec3(0.035, 0.13, 0.42),
      vaultCrown * (0.65 + 0.35 * (1.0 - abs(uv.x - 0.5)))
    );
    float goldAuraLeft = exp(-length((uv - vec2(0.16, 0.5)) * vec2(2.4, 1.3)) * 2.6);
    float blueAuraRight = exp(-length((uv - vec2(0.60, 0.5)) * vec2(1.4, 1.8)) * 2.4);
    institutionalBlue += vec3(0.08, 0.28, 0.72) * blueAuraRight * (0.45 + 0.55 * uFinale);
    institutionalBlue += vec3(0.98, 0.75, 0.16) * goldAuraLeft * (0.42 + 0.58 * uFinale);

    // Ceremonial horizontal light sweep and golden frame lines
    float sweepBeam = exp(-pow((uv.x - uSweep) * 6.5, 2.0));
    float topBottomAccent = exp(-min(uv.y, 1.0 - uv.y) * 26.0);
    institutionalBlue += vec3(0.99, 0.80, 0.24) * sweepBeam * (0.50 * uInstitutional + 0.42 * uFinale);
    institutionalBlue += vec3(0.98, 0.76, 0.18) * topBottomAccent * (0.35 * uInstitutional + 0.65 * uFinale);

    // Blend phases smoothly
    vec3 activeContent = mix(cabinetColor, landscapeScene, uHorizon);
    activeContent = mix(activeContent, institutionalBlue, uInstitutional);

    // Subtle LED micro-grid texture for authentic architectural panel finish
    vec2 ledGrid = abs(fract(vPanelUv * vec2(180.0, 72.0)) - 0.5);
    float pixelCell = smoothstep(0.47, 0.32, max(ledGrid.x, ledGrid.y));
    activeContent *= 0.92 + 0.08 * pixelCell;

    // Bezel frame around the display
    vec3 bezelColor = mix(
      vec3(0.04, 0.11, 0.28),
      vec3(0.98, 0.78, 0.22),
      (0.25 + 0.75 * uFinale) * (0.5 + 0.5 * sweepBeam)
    );

    vec3 finalColor = mix(bezelColor, activeContent, innerMask);
    finalColor *= vaultCrown * 0.18 + 0.82;
    if (uNight > 0.5) {
      finalColor *= 1.12;
    }

    float finalAlpha = outerAlpha * activationWave * clamp(uPower * 1.15, 0.0, 0.98);
    gl_FragColor = vec4(finalColor, finalAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface ArenaLedPanelShaderMaterial {
  material: THREE.ShaderMaterial;
  applyFrame: (frame: ArenaShowFrameState, nightMode: boolean) => void;
  dispose: () => void;
}

export function createArenaLedPanelMaterial(): ArenaLedPanelShaderMaterial {
  const uniforms = {
    uPower: { value: 0 },
    uElapsed: { value: 0 },
    uHorizon: { value: 0 },
    uSunElevation: { value: 0 },
    uPlainsGold: { value: 0 },
    uInstitutional: { value: 0 },
    uFinale: { value: 0 },
    uSweep: { value: -0.35 },
    uNight: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    name: 'arena-fenasoja-led-panel-material',
    uniforms,
    vertexShader: ARENA_LED_PANEL_VERTEX_SHADER,
    fragmentShader: ARENA_LED_PANEL_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });

  const applyFrame = (frame: ArenaShowFrameState, nightMode: boolean) => {
    uniforms.uPower.value = frame.panelPower;
    uniforms.uElapsed.value = frame.elapsedSeconds;
    uniforms.uHorizon.value = frame.horizonProgress;
    uniforms.uSunElevation.value = frame.sunElevation;
    uniforms.uPlainsGold.value = frame.plainsGoldSpread;
    uniforms.uInstitutional.value = frame.institutionalReveal;
    uniforms.uFinale.value = frame.brandFinale;
    uniforms.uSweep.value = frame.sweepPosition;
    uniforms.uNight.value = nightMode ? 1 : 0;
  };

  return {
    material,
    applyFrame,
    dispose: () => material.dispose(),
  };
}

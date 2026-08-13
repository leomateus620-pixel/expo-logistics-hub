import { describe, expect, it } from 'vitest';
import { EXECUTIVE_CHARACTER_PROFILES } from '@/features/commercial-map/data/executiveCharacters';
import {
  EXECUTIVE_WALKING_ROUTE,
  executiveRouteIsVisible,
} from '@/features/commercial-map/data/executiveRoute';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  createExecutiveRouteCurve,
  routeProgressAtTime,
  sampleExecutiveRoutePose,
  validateExecutiveRoute,
} from '@/features/commercial-map/utils/executiveRoute';

describe('circuito executivo do Mapa Comercial', () => {
  it('mantém perfis individuais e não mistura as identidades das referências', () => {
    const fabiano = EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis'];
    const djeison = EXECUTIVE_CHARACTER_PROFILES['djeison-drey'];

    expect(fabiano.assetUrl).not.toBe(djeison.assetUrl);
    expect(fabiano.heightMapUnits).toBeLessThan(djeison.heightMapUnits);
    expect(fabiano.refinement.definingFacialCharacteristics.join(' ')).toContain('castanho muito escuro');
    expect(djeison.refinement.definingFacialCharacteristics.join(' ')).toContain('barba cheia curta ruiva');
    expect(djeison.refinement.distinctiveAccessories.join(' ')).toContain('cuia de chimarrão');
    expect(fabiano.route.stridePhase).not.toBe(djeison.route.stridePhase);
  });

  it('parte da âncora B12 sem alterar o identificador cadastral', () => {
    const b12 = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B12');
    expect(b12?.name).toContain('Sede Fenasoja');
    expect(EXECUTIVE_WALKING_ROUTE.anchor.publicIdentifier).toBe('B12');
    expect(EXECUTIVE_WALKING_ROUTE.anchor.experienceName).toBe('Casa da Soja');
    expect(EXECUTIVE_WALKING_ROUTE.waypoints[0]).toEqual(EXECUTIVE_WALKING_ROUTE.anchor.start);
  });

  it('permanece finita, dentro do parque, contínua e fora de lotes/estruturas sólidas', () => {
    const lateralOffsets = Object.values(EXECUTIVE_CHARACTER_PROFILES)
      .map((profile) => profile.route.lateralOffset);
    expect(validateExecutiveRoute(
      EXECUTIVE_WALKING_ROUTE,
      OFFICIAL_REFERENCE_ENTITIES,
      lateralOffsets,
    )).toEqual([]);
  });

  it('mantém formação lateral e cinemática por comprimento de arco', () => {
    const curve = createExecutiveRouteCurve(EXECUTIVE_WALKING_ROUTE);
    const length = curve.getLength();
    const fabiano = EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis'];
    const djeison = EXECUTIVE_CHARACTER_PROFILES['djeison-drey'];
    const progress = routeProgressAtTime(18, length, EXECUTIVE_WALKING_ROUTE.speedMapUnitsPerSecond);
    const fabianoPose = sampleExecutiveRoutePose(curve, progress, fabiano.route.lateralOffset);
    const djeisonPose = sampleExecutiveRoutePose(curve, progress, djeison.route.lateralOffset);

    expect(length).toBeGreaterThan(80);
    expect(fabianoPose.position.distanceTo(djeisonPose.position)).toBeCloseTo(0.27, 2);
    expect(fabianoPose.tangent.length()).toBeCloseTo(1, 5);
    expect(Number.isFinite(fabianoPose.yaw)).toBe(true);
  });

  it('mantém progressão positiva e velocidade lateral limitada em todo o circuito', () => {
    const curve = createExecutiveRouteCurve(EXECUTIVE_WALKING_ROUTE);
    const routeLength = curve.getLength();
    const sampleCount = 40_000;
    const centerlineStep = routeLength / sampleCount;

    Object.values(EXECUTIVE_CHARACTER_PROFILES).forEach((profile) => {
      const phaseOffset = profile.route.longitudinalOffset / routeLength;
      let previous = sampleExecutiveRoutePose(
        curve,
        phaseOffset,
        profile.route.lateralOffset,
      ).position;
      let reverseSteps = 0;
      let minimumStepRatio = Number.POSITIVE_INFINITY;
      let maximumStepRatio = 0;

      for (let index = 1; index <= sampleCount; index += 1) {
        const pose = sampleExecutiveRoutePose(
          curve,
          index / sampleCount + phaseOffset,
          profile.route.lateralOffset,
        );
        const displacement = pose.position.clone().sub(previous);
        if (displacement.dot(pose.tangent) <= 0) reverseSteps += 1;
        const stepRatio = displacement.length() / centerlineStep;
        minimumStepRatio = Math.min(minimumStepRatio, stepRatio);
        maximumStepRatio = Math.max(maximumStepRatio, stepRatio);
        previous = pose.position;
      }

      expect(reverseSteps, `${profile.id} não pode inverter a marcha`).toBe(0);
      expect(minimumStepRatio, `${profile.id} não pode quase parar em uma curva`).toBeGreaterThan(0.15);
      expect(maximumStepRatio, `${profile.id} não pode disparar em uma curva`).toBeLessThan(2.25);
    });
  });

  it('preserva a rota no mapa e no foco de segmento, mas não inventa contexto em portais isolados', () => {
    expect(executiveRouteIsVisible(null)).toBe(true);
    expect(executiveRouteIsVisible(undefined)).toBe(true);
    expect(executiveRouteIsVisible('industria-comercio-servicos')).toBe(false);
    expect(executiveRouteIsVisible('exporural')).toBe(false);
  });
});

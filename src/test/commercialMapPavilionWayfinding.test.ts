import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createCommercialPavilionReferenceProjectionFrame,
  projectCommercialPavilionReferencePoint,
  projectCommercialPavilionReferenceRect,
} from '@/features/commercial-map/data/commercialPavilionReference';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  COMMERCIAL_PAVILION_DEFINITIONS,
  createCommercialPavilionLayout,
} from '@/features/commercial-map/utils/commercialPavilions';
import {
  resolveCommercialPavilionWayfindingMarkers,
} from '@/features/commercial-map/utils/commercialPavilionWayfinding';

const FOOTPRINT = { width: 10, depth: 16 };

function markerFor(
  publicIdentifier: keyof typeof COMMERCIAL_PAVILION_MODULE_PLANS,
  markerId: string,
) {
  const marker = resolveCommercialPavilionWayfindingMarkers(
    COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier],
    FOOTPRINT,
  ).find((candidate) => candidate.id === markerId);
  expect(marker).toBeDefined();
  return marker!;
}

function markersFor(publicIdentifier: keyof typeof COMMERCIAL_PAVILION_MODULE_PLANS) {
  return resolveCommercialPavilionWayfindingMarkers(
    COMMERCIAL_PAVILION_MODULE_PLANS[publicIdentifier],
    FOOTPRINT,
  );
}

describe('orientação visual das plantas internas comerciais', () => {
  it('posiciona os seis pontos do Pavilhão 3 nos vãos do croqui oficial', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B6;
    const markers = resolveCommercialPavilionWayfindingMarkers(plan, FOOTPRINT);
    const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, FOOTPRINT);
    const emergencyCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'south-access')!,
      frame,
    );
    const connectionCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'west-lateral-access')!,
      frame,
    );

    expect(markers).toHaveLength(6);
    expect(markers.filter((marker) => marker.kind === 'entrance')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'exit')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'emergency')).toHaveLength(1);
    expect(markers.filter((marker) => marker.kind === 'connection')).toHaveLength(1);
    expect(markers.filter((marker) => marker.kind === 'entrance').every((marker) => (
      marker.edge === 'rear'
    ))).toBe(true);

    const emergency = markerFor('B6', 'front-emergency-exit');
    expect(emergency.edge).toBe('front');
    expect(emergency.position[0]).toBeCloseTo(emergencyCorridor.centerX, 12);
    expect(emergency.position[1]).toBeCloseTo(frame.centerZ + frame.depth / 2, 12);

    const connection = markerFor('B6', 'pavilion-13-connection');
    expect(connection.edge).toBe('left');
    expect(connection.position[0]).toBeCloseTo(frame.centerX - frame.width / 2, 12);
    expect(connection.position[1]).toBeCloseTo(connectionCorridor.centerZ, 12);
    expect(connection.targetPublicIdentifier).toBe('B5');
  });

  it('corrige o Pavilhão 13 e ancora entradas, saídas e conexões nos seis vãos oficiais', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B5;
    const markers = markersFor('B5');
    const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, FOOTPRINT);

    expect(markers).toHaveLength(6);
    expect(markers.filter((marker) => marker.kind === 'entrance')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'exit')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'connection')).toHaveLength(2);

    const westExitCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'northwest-entry')!,
      frame,
    );
    const eastExitCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'northeast-entry')!,
      frame,
    );
    const westExit = markerFor('B5', 'northwest-exit');
    const eastExit = markerFor('B5', 'northeast-exit');
    expect(westExit).toMatchObject({ kind: 'exit', edge: 'rear' });
    expect(eastExit).toMatchObject({ kind: 'exit', edge: 'rear' });
    expect(westExit.position[0]).toBeCloseTo(westExitCorridor.centerX, 12);
    expect(eastExit.position[0]).toBeCloseTo(eastExitCorridor.centerX, 12);

    const southwestEntrance = markerFor('B5', 'southwest-entrance');
    const southeastEntrance = markerFor('B5', 'southeast-entrance');
    const southwestPoint = projectCommercialPavilionReferencePoint([6.6 / 21, 1], frame);
    const southeastPoint = projectCommercialPavilionReferencePoint([14.7 / 21, 1], frame);
    expect(southwestEntrance).toMatchObject({
      kind: 'entrance',
      edge: 'front',
      sourcePrecision: 'plan-traced',
    });
    expect(southeastEntrance).toMatchObject({
      kind: 'entrance',
      edge: 'front',
      sourcePrecision: 'plan-traced',
    });
    expect(southwestEntrance.position[0]).toBeCloseTo(southwestPoint[0], 12);
    expect(southeastEntrance.position[0]).toBeCloseTo(southeastPoint[0], 12);

    expect(markerFor('B5', 'pavilion-3-connection')).toMatchObject({
      edge: 'left',
      targetPublicIdentifier: 'B6',
    });
    expect(markerFor('B5', 'pavilion-8-connection')).toMatchObject({
      edge: 'right',
      targetPublicIdentifier: 'B4',
    });
  });

  it('materializa os cinco acessos oficiais do Pavilhão 8 sem duplicar badges bidirecionais', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B4;
    const markers = markersFor('B4');
    const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, FOOTPRINT);

    expect(markers).toHaveLength(5);
    expect(markers.filter((marker) => marker.kind === 'bidirectional')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'emergency')).toHaveLength(1);
    expect(markers.filter((marker) => marker.kind === 'connection')).toHaveLength(2);

    const southwest = markerFor('B4', 'southwest-entry-exit');
    const southeast = markerFor('B4', 'southeast-entry-exit');
    expect(southwest).toMatchObject({ kind: 'bidirectional', edge: 'front' });
    expect(southeast).toMatchObject({ kind: 'bidirectional', edge: 'front' });
    expect(southwest.position[0]).toBeCloseTo(
      projectCommercialPavilionReferencePoint([5.675 / 21.7, 1], frame)[0],
      12,
    );
    expect(southeast.position[0]).toBeCloseTo(
      projectCommercialPavilionReferencePoint([16.025 / 21.7, 1], frame)[0],
      12,
    );

    const emergency = markerFor('B4', 'rear-emergency-exit');
    expect(emergency).toMatchObject({
      kind: 'emergency',
      edge: 'rear',
      sourcePrecision: 'official-metric',
    });
    expect(emergency.position[0]).toBeCloseTo(
      projectCommercialPavilionReferencePoint([19.6 / 21.7, 0], frame)[0],
      12,
    );

    expect(markerFor('B4', 'pavilion-13-connection')).toMatchObject({
      edge: 'left',
      targetPublicIdentifier: 'B5',
    });
    expect(markerFor('B4', 'pavilion-12-connection')).toMatchObject({
      edge: 'right',
      targetPublicIdentifier: 'B3',
    });
  });

  it('inverte somente a apresentação do Pavilhão 12 para reproduzir o Anexo 5', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B3;
    const markers = markersFor('B3');
    const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, FOOTPRINT);
    const centralCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'central-distribution')!,
      frame,
    );
    const bottomCorridor = projectCommercialPavilionReferenceRect(
      plan.corridors.find((corridor) => corridor.id === 'north-entry')!,
      frame,
    );

    expect(markers).toHaveLength(3);
    expect(markers.filter((marker) => marker.kind === 'bidirectional')).toHaveLength(2);
    expect(markers.filter((marker) => marker.kind === 'connection')).toHaveLength(1);

    const rightVisibleAccess = markerFor('B3', 'right-central-entry-exit');
    const bottomVisibleAccess = markerFor('B3', 'bottom-central-entry-exit');
    const leftVisibleConnection = markerFor('B3', 'pavilion-8-connection');
    expect(rightVisibleAccess).toMatchObject({ kind: 'bidirectional', edge: 'left' });
    expect(rightVisibleAccess.position[1]).toBeCloseTo(centralCorridor.centerZ, 12);
    expect(bottomVisibleAccess).toMatchObject({ kind: 'bidirectional', edge: 'rear' });
    expect(bottomVisibleAccess.position[0]).toBeCloseTo(bottomCorridor.centerX, 12);
    expect(leftVisibleConnection).toMatchObject({
      kind: 'connection',
      edge: 'right',
      targetPublicIdentifier: 'B4',
    });
    expect(leftVisibleConnection.position[1]).toBeCloseTo(centralCorridor.centerZ, 12);
  });

  it('respeita a rotação oficial do Pavilhão 1 sem mover módulos', () => {
    const markers = resolveCommercialPavilionWayfindingMarkers(
      COMMERCIAL_PAVILION_MODULE_PLANS.B1,
      FOOTPRINT,
    );

    expect(markers).toHaveLength(4);
    expect(markers.filter((marker) => marker.kind === 'entrance')).toHaveLength(1);
    expect(markers.filter((marker) => marker.kind === 'exit')).toHaveLength(3);
    expect(markerFor('B1', 'west-upper-exit').edge).toBe('rear');
    expect(markerFor('B1', 'west-main-entrance').edge).toBe('rear');
    expect(markerFor('B1', 'east-upper-exit').edge).toBe('front');
    expect(markerFor('B1', 'east-lower-exit').edge).toBe('front');
  });

  it('ancora o Pavilhão 5 nos dois extremos do corredor e no vão 62/63', () => {
    const markers = resolveCommercialPavilionWayfindingMarkers(
      COMMERCIAL_PAVILION_MODULE_PLANS.B8,
      FOOTPRINT,
    );

    expect(markers).toHaveLength(3);
    expect(markerFor('B8', 'north-central-exit').edge).toBe('rear');
    expect(markerFor('B8', 'west-central-entrance').edge).toBe('left');
    expect(markerFor('B8', 'south-central-exit').edge).toBe('front');
  });

  it('fecha o fluxo recíproco Pavilhão 3 ↔ 13 ↔ 8 ↔ 12', () => {
    const fromPavilion3 = markerFor('B6', 'pavilion-13-connection');
    const pavilion13To3 = markerFor('B5', 'pavilion-3-connection');
    const pavilion13To8 = markerFor('B5', 'pavilion-8-connection');
    const pavilion8To13 = markerFor('B4', 'pavilion-13-connection');
    const pavilion8To12 = markerFor('B4', 'pavilion-12-connection');
    const pavilion12To8 = markerFor('B3', 'pavilion-8-connection');

    expect(fromPavilion3.targetPublicIdentifier).toBe('B5');
    expect(pavilion13To3.targetPublicIdentifier).toBe('B6');
    expect(pavilion13To3.edge).toBe('left');
    expect(pavilion13To3.label).toBe('Acesso para o Pavilhão 3');
    expect(pavilion13To8.targetPublicIdentifier).toBe('B4');
    expect(pavilion8To13.targetPublicIdentifier).toBe('B5');
    expect(pavilion8To12.targetPublicIdentifier).toBe('B3');
    expect(pavilion12To8.targetPublicIdentifier).toBe('B4');
  });

  it('mantém acessos estruturais legados fora da camada UI-only', () => {
    expect(resolveCommercialPavilionWayfindingMarkers(
      COMMERCIAL_PAVILION_MODULE_PLANS.B2,
      FOOTPRINT,
    )).toEqual([]);
    expect(resolveCommercialPavilionWayfindingMarkers(
      COMMERCIAL_PAVILION_MODULE_PLANS.B10,
      FOOTPRINT,
    )).toEqual([]);
  });

  it('preserva as fachadas existentes dos quatro pavilhões alterados', () => {
    const expectedGenericEntrances = {
      B1: { front: 1, rear: 0, left: 0, right: 0 },
      B3: { front: 2, rear: 0, left: 0, right: 0 },
      B4: { front: 2, rear: 1, left: 0, right: 0 },
      B5: { front: 2, rear: 2, left: 0, right: 0 },
      B6: { front: 3, rear: 0, left: 0, right: 0 },
      B8: { front: 2, rear: 0, left: 0, right: 0 },
    } as const;

    Object.entries(expectedGenericEntrances).forEach(([publicIdentifier, expected]) => {
      const typedIdentifier = publicIdentifier as keyof typeof expectedGenericEntrances;
      const layout = createCommercialPavilionLayout(
        { width: 8, depth: 12 },
        COMMERCIAL_PAVILION_DEFINITIONS[typedIdentifier],
        undefined,
        COMMERCIAL_PAVILION_MODULE_PLANS[typedIdentifier],
      );
      expect(layout.exterior.facade.entrances).toHaveLength(expected.front);
      expect(layout.exterior.facade.rearEntrances).toHaveLength(expected.rear);
      expect(layout.exterior.facade.leftEntrances).toHaveLength(expected.left);
      expect(layout.exterior.facade.rightEntrances).toHaveLength(expected.right);
    });
  });

  it('não intercepta lotes e descarta recursos GPU ao trocar de interior', () => {
    const layer = readFileSync(
      'src/features/commercial-map/components/canvas/CommercialPavilionWayfindingLayer.tsx',
      'utf8',
    );
    const scene = readFileSync(
      'src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx',
      'utf8',
    );
    const canvas = readFileSync(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
      'utf8',
    );
    const styles = readFileSync(
      'src/features/commercial-map/commercial-map.css',
      'utf8',
    );

    expect(layer).toContain('raycast={NO_RAYCAST}');
    expect(layer).toContain("style={{ pointerEvents: canNavigate ? 'auto' : 'none' }}");
    expect(layer).toContain('calculatePosition={canNavigate');
    expect(layer).toContain('THREE.MathUtils.clamp');
    expect(layer).toContain('onPointerDown={(event) => event.stopPropagation()}');
    expect(layer).toContain('geometry.dispose()');
    expect(layer).toContain('surface.dispose()');
    expect(layer).toContain('accent.dispose()');
    expect(scene).toContain('<CommercialPavilionWayfindingLayer');
    expect(scene).toContain('onNavigate={onNavigate}');
    expect(canvas).toContain('switchInterior(targetEntityId)');
    expect(canvas).toContain('PAVILION_INTERIOR_TRANSITION_COVER_MS');
    expect(canvas).toContain('PAVILION_INTERIOR_TRANSITION_REVEAL_MS');
    expect(canvas).toContain('const sourceInteriorEntityId = interiorEntityId');
    expect(canvas).toContain("useCommercialMapStore.getState().interiorEntityId !== sourceInteriorEntityId");
    expect(canvas).toContain("useCommercialMapStore.getState().interiorEntityId !== targetEntityId");
    expect(canvas).toContain('aria-live="polite"');
    expect(styles).toContain('.commercial-pavilion-view-transition.is-covering');
    expect(styles).toContain('.commercial-pavilion-view-transition.is-revealing');
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?commercial-pavilion-view-transition/);
  });
});

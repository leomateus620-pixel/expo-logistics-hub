import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createCommercialPavilionReferenceProjectionFrame,
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

  it('fecha a navegação recíproca Pavilhão 3 ↔ Pavilhão 13', () => {
    const fromPavilion3 = markerFor('B6', 'pavilion-13-connection');
    const fromPavilion13 = markerFor('B5', 'pavilion-3-connection');

    expect(fromPavilion3.targetPublicIdentifier).toBe('B5');
    expect(fromPavilion13.targetPublicIdentifier).toBe('B6');
    expect(fromPavilion13.edge).toBe('right');
    expect(fromPavilion13.label).toBe('Acesso para o Pavilhão 3');
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

    expect(layer).toContain('raycast={NO_RAYCAST}');
    expect(layer).toContain("style={{ pointerEvents: canNavigate ? 'auto' : 'none' }}");
    expect(layer).toContain('onPointerDown={(event) => event.stopPropagation()}');
    expect(layer).toContain('geometry.dispose()');
    expect(layer).toContain('surface.dispose()');
    expect(layer).toContain('accent.dispose()');
    expect(scene).toContain('<CommercialPavilionWayfindingLayer');
    expect(scene).toContain('onNavigate={enterInterior}');
  });
});

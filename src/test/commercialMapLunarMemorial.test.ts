import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  APOLLO_XIV_FEATURE_METADATA,
  APOLLO_XIV_LAYOUT,
  APOLLO_XIV_REFERENCE,
  APOLLO_XIV_RENDER_BUDGET,
  APOLLO_XIV_SELECTION_CLEARING_RADIUS,
  LUNAR_MEMORIAL_HIT_SCALE,
  apolloXivFitsLandmarkHitVolume,
  apolloXivLocalEnvelope,
  apolloXivReplicaHeight,
  apolloXivRigidCurbClearanceFromTree,
  treeRemainsVisibleWithSelectedApollo,
} from '@/features/commercial-map/utils/lunarMemorial';
import {
  strategicLandmarkBounds,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import { mapSearchText, normalizeMapEntityMetadata } from '@/features/commercial-map/utils/mapMetadata';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';

const rendererSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');

function lunarTree() {
  const entity = OFFICIAL_REFERENCE_DATA.entities.find(({ publicIdentifier }) => publicIdentifier === 'G');
  if (!entity) throw new Error('Entidade oficial G / Árvore Lunar ausente.');
  return entity;
}

describe('Memorial Árvore Lunar e Réplica Apollo XIV', () => {
  it('preserva G como único marco não comercial, pesquisável também pela réplica', () => {
    const entity = lunarTree();
    const metadata = normalizeMapEntityMetadata(entity);
    const search = mapSearchText(entity);

    expect(entity.classification).toBe('LANDMARK');
    expect(metadata.commercialStatus).toBe('NOT_COMMERCIAL');
    expect(strategicLandmarkSupportsInterior(entity)).toBe(false);
    expect(strategicLandmarkSearchAliases(entity)).toEqual(expect.arrayContaining([
      'Memorial Árvore Lunar',
      'Réplica Apollo XIV',
      'Apollo 14',
      'Foguete Apollo',
    ]));
    expect(search).toContain('replica apollo xiv');
    expect(search).toContain('apollo 14');
    expect(OFFICIAL_REFERENCE_DATA.lots.some(({ entityId }) => entityId === entity.id)).toBe(false);
    expect(APOLLO_XIV_FEATURE_METADATA).toMatchObject({
      classification: 'NON_COMMERCIAL_STRUCTURE',
      isSellable: false,
      contributesToCommercialMetrics: false,
      selectionOwner: 'G',
    });
  });

  it('mantém o offset fotointerpretado e todo o conjunto dentro do hit volume de G', () => {
    const entity = lunarTree();
    const bounds = strategicLandmarkBounds(entity);
    const height = strategicLandmarkVisualHeight(entity)!;
    const envelope = apolloXivLocalEnvelope();
    const rocketPosition = [
      bounds.centerX + APOLLO_XIV_LAYOUT.replicaOffset[0],
      bounds.centerZ + APOLLO_XIV_LAYOUT.replicaOffset[1],
    ] as const;

    expect(APOLLO_XIV_REFERENCE.lunarTreeSourceAnchor).toEqual([2152, 3334]);
    expect(APOLLO_XIV_REFERENCE.replicaSourceAnchor).toEqual([2184, 3340]);
    expect(bounds.centerX).toBeCloseTo(-26.1382, 3);
    expect(bounds.centerZ).toBeCloseTo(7.8327, 3);
    expect(rocketPosition[0]).toBeCloseTo(-25.4382, 3);
    expect(rocketPosition[1]).toBeCloseTo(7.9527, 3);
    expect(apolloXivReplicaHeight(height)).toBeGreaterThanOrEqual(3.6);
    expect(apolloXivReplicaHeight(height)).toBeLessThanOrEqual(3.9);
    expect(apolloXivFitsLandmarkHitVolume(bounds.width, bounds.depth)).toBe(true);
    expect(envelope.maxX).toBeLessThan(bounds.width * LUNAR_MEMORIAL_HIT_SCALE / 2);
    expect(envelope.maxZ).toBeLessThan(bounds.depth * LUNAR_MEMORIAL_HIT_SCALE / 2);
  });

  it('reserva folga de copa para as árvores ambientais já cadastradas ao redor', () => {
    const entity = lunarTree();
    const bounds = strategicLandmarkBounds(entity);
    const rocketX = bounds.centerX + APOLLO_XIV_LAYOUT.replicaOffset[0];
    const rocketZ = bounds.centerZ + APOLLO_XIV_LAYOUT.replicaOffset[1];
    const clearances = COMMERCIAL_MAP_TREES.map((tree) => (
      Math.hypot(tree.position[0] - rocketX, tree.position[1] - rocketZ)
        - tree.canopyRadius
        - APOLLO_XIV_LAYOUT.finRadius
    ));

    expect(Math.min(...clearances)).toBeGreaterThan(0.25);
  });

  it('abre o canteiro compartilhado junto ao tronco sem colisão de meio-fio rígido', () => {
    const bounds = strategicLandmarkBounds(lunarTree());
    const trunkRadius = Math.max(bounds.width, bounds.depth) * 0.2;

    expect(APOLLO_XIV_LAYOUT.rigidCurbSides).toEqual(['south', 'east']);
    expect(apolloXivRigidCurbClearanceFromTree(trunkRadius)).toBeGreaterThan(0.25);
    expect(rendererSource).toContain('name="canteiro-compartilhado-arvore-lunar-apollo-xiv"');
    expect(rendererSource).toContain('kind === \'lunar-tree\' ? LUNAR_MEMORIAL_HIT_SCALE : 1');
  });

  it('abre somente uma pequena clareira visual no maciço durante a seleção da Apollo', () => {
    const center = [10, 20] as const;

    expect(APOLLO_XIV_SELECTION_CLEARING_RADIUS).toBeLessThan(2.7);
    expect(treeRemainsVisibleWithSelectedApollo({
      area: 'PAVILIONS_1_14_GROVE',
      position: [12.4, 20],
    }, center)).toBe(false);
    expect(treeRemainsVisibleWithSelectedApollo({
      area: 'PAVILIONS_1_14_GROVE',
      position: [12.8, 20],
    }, center)).toBe(true);
    expect(treeRemainsVisibleWithSelectedApollo({
      area: 'RUA_BRASIL_GROVE',
      position: [10, 20],
    }, center)).toBe(true);

    const focus = strategicLandmarkFocusDirection(lunarTree())!;
    const horizontalAlignment = (
      focus[0] * APOLLO_XIV_LAYOUT.replicaOffset[0]
      + focus[2] * APOLLO_XIV_LAYOUT.replicaOffset[1]
    ) / (
      Math.hypot(focus[0], focus[2])
      * Math.hypot(...APOLLO_XIV_LAYOUT.replicaOffset)
    );
    expect(horizontalAlignment).toBeGreaterThan(0.9);
  });

  it('continua ausente do recorte indústria-comércio-serviços', () => {
    const entity = lunarTree();
    const scoped = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'industria-comercio-servicos');
    expect(scoped.entityIds.has(entity.id)).toBe(false);
  });

  it('usa silhueta procedural, atlas único, instâncias e orçamento explícito', () => {
    expect(rendererSource).toContain('new THREE.LatheGeometry(profile, radialSegments)');
    expect(rendererSource).toContain('new THREE.CanvasTexture(canvas)');
    expect(rendererSource).toContain('<ScaledInstances geometry={finGeometry}');
    expect(rendererSource).toContain('name="memorial-arvore-lunar-apollo-xiv"');
    expect(rendererSource).toContain('name="replica-apollo-xiv"');
    expect(rendererSource).toContain('raycast={NO_RAYCAST}');
    expect(rendererSource).not.toContain('<Decal');
    expect(APOLLO_XIV_RENDER_BUDGET.replicaFarPrimaryDrawCalls).toBe(4);
    expect(APOLLO_XIV_RENDER_BUDGET.replicaDetailPrimaryDrawCalls).toBe(6);
    expect(APOLLO_XIV_RENDER_BUDGET.replicaShadowDrawCalls).toBe(2);
    expect(APOLLO_XIV_RENDER_BUDGET.memorialDetailPrimaryDrawCalls).toBeLessThanOrEqual(11);
    expect(APOLLO_XIV_RENDER_BUDGET.detailMaxTriangles).toBeLessThanOrEqual(800);
  });
});

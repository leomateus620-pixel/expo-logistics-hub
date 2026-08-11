import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MAP_SEGMENTS,
  COMMERCIAL_MAP_SEGMENT_IDS,
  buildCommercialMapSegmentIndex,
  commercialMapSegmentInventory,
  findCommercialMapSegmentsForEntity,
  getCommercialMapSegment,
  isSegmentTintClassification,
  withCommercialMapSegments,
  type CommercialMapSegmentId,
} from '@/features/commercial-map/data/commercialMapSegments';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
} from '@/features/commercial-map/data/officialReference2026';
import { EXPORURAL_AREA_CODE } from '@/features/commercial-map/data/exporuralReference2026';
import { isSegmentCompatibleWithAreaScope } from '@/features/commercial-map/utils/areaScope';

const entityByPublicIdentifier = new Map(
  OFFICIAL_REFERENCE_ENTITIES.map((entity) => [entity.publicIdentifier, entity]),
);

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function publicIdentifiersForSegment(segmentId: string) {
  const index = buildCommercialMapSegmentIndex(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
  return OFFICIAL_REFERENCE_ENTITIES
    .filter((entity) => index.get(entity.id)?.id === segmentId)
    .map((entity) => entity.publicIdentifier);
}

describe('registro de segmentos do Mapa Comercial 3D', () => {
  it('mantém três contratos únicos, completos e visualmente válidos', () => {
    expect(COMMERCIAL_MAP_SEGMENTS.map((segment) => segment.id)).toEqual([
      COMMERCIAL_MAP_SEGMENT_IDS.exporural,
      COMMERCIAL_MAP_SEGMENT_IDS.industry,
      COMMERCIAL_MAP_SEGMENT_IDS.automotive,
    ]);
    expect(new Set(COMMERCIAL_MAP_SEGMENTS.map((segment) => segment.id)).size).toBe(3);
    expect(new Set(COMMERCIAL_MAP_SEGMENTS.map((segment) => segment.code)).size).toBe(3);

    COMMERCIAL_MAP_SEGMENTS.forEach((segment) => {
      expect(segment.name.trim()).not.toBe('');
      expect(segment.description.trim()).not.toBe('');
      expect(segment.boundary.reference.trim()).not.toBe('');
      expect(segment.boundary.resolution).toBe('explicit-entity-union');
      expect(segment.boundary.perimeter.length).toBeGreaterThanOrEqual(4);
      expect(segment.behavior).toEqual({ visibleByDefault: true, interaction: 'filter-and-focus' });
      expect(segment.palette.surface).toMatch(/^#[0-9A-F]{6}$/i);
      expect(segment.palette.edge).toMatch(/^#[0-9A-F]{6}$/i);
      expect(segment.palette.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrastRatio(segment.palette.surface, '#DFE8DE')).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(segment.palette.foreground, segment.palette.accent)).toBeGreaterThanOrEqual(4.5);
      expect(new Set([
        segment.palette.surface,
        segment.palette.edge,
        segment.palette.accent,
      ]).size).toBe(3);
      expect(segment.camera.direction.every(Number.isFinite)).toBe(true);
      expect(segment.camera.padding).toBeGreaterThan(1);
      expect(segment.camera.minDistanceRatio).toBeGreaterThan(0);
      expect(segment.camera.maxDistanceRatio).toBeGreaterThan(segment.camera.minDistanceRatio);
    });
  });

  it('preserva integralmente o inventário existente da Exporural', () => {
    const inventory = commercialMapSegmentInventory(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
    const exporural = inventory.find(({ segment }) => segment.id === COMMERCIAL_MAP_SEGMENT_IDS.exporural);

    expect(exporural).toMatchObject({ entityCount: 111, lotCount: 95 });
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).toContain(EXPORURAL_AREA_CODE);
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).toContain('QUADRA-R');
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).toContain('QUADRA-S');
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).not.toContain('B7');
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).not.toContain('B8');
    expect(publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.exporural)).not.toContain('D3');
  });

  it('atribui o Espaço do Automóvel somente às quadras U, P, T e O', () => {
    const identifiers = publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.automotive);
    const blockIdentifiers = identifiers.filter((identifier) => identifier.startsWith('QUADRA-'));
    const lotIdentifiers = identifiers.filter((identifier) => identifier.startsWith('Q-'));

    expect(blockIdentifiers).toEqual(expect.arrayContaining(['QUADRA-U', 'QUADRA-P', 'QUADRA-T', 'QUADRA-O']));
    expect(blockIdentifiers).toHaveLength(4);
    expect(lotIdentifiers).toHaveLength(52);
    expect(identifiers).toHaveLength(56);
    expect(identifiers).not.toEqual(expect.arrayContaining(['QUADRA-V', 'QUADRA-Q', 'QUADRA-M', 'QUADRA-L']));
  });

  it('representa fielmente o núcleo de Indústria, Comércio e Serviços do Anexo 2', () => {
    const identifiers = publicIdentifiersForSegment(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    const blockIdentifiers = identifiers.filter((identifier) => identifier.startsWith('QUADRA-'));
    const lotIdentifiers = identifiers.filter((identifier) => identifier.startsWith('Q-'));

    expect(blockIdentifiers).toEqual(expect.arrayContaining([
      'QUADRA-M', 'QUADRA-G', 'QUADRA-L', 'QUADRA-F',
      'QUADRA-J', 'QUADRA-E', 'QUADRA-I', 'QUADRA-D',
    ]));
    expect(blockIdentifiers).toHaveLength(8);
    expect(lotIdentifiers).toHaveLength(103);
    expect(identifiers).toHaveLength(140);
    expect(lotIdentifiers).toEqual(expect.arrayContaining([
      'Q-G-01', 'Q-G-02', 'Q-G-05', 'Q-G-06', 'Q-G-07', 'Q-G-08',
    ]));
    expect(lotIdentifiers).not.toEqual(expect.arrayContaining(['Q-G-03', 'Q-G-04']));
    expect(identifiers).toEqual(expect.arrayContaining([
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
      'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
      'C2', 'C3', 'D1', 'D2', 'D3',
      'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
    ]));
    expect(identifiers).not.toEqual(expect.arrayContaining([
      'QUADRA-N', 'B7', 'B11', 'B15', 'C1', 'QUADRA-C', 'QUADRA-B', 'QUADRA-A',
    ]));

    const inventory = commercialMapSegmentInventory(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
    expect(inventory.find(({ segment }) => segment.id === COMMERCIAL_MAP_SEGMENT_IDS.industry))
      .toMatchObject({ entityCount: 140, lotCount: 103 });
  });

  it('não aceita sobreposição silenciosa entre segmentos', () => {
    OFFICIAL_REFERENCE_ENTITIES.forEach((entity) => {
      const lot = OFFICIAL_REFERENCE_LOTS.find((candidate) => candidate.entityId === entity.id);
      expect(findCommercialMapSegmentsForEntity(entity, lot).length).toBeLessThanOrEqual(1);
    });
  });

  it('não mascara conflito direto herdando o segmento do pai', () => {
    const parent = entityByPublicIdentifier.get('QUADRA-M')!;
    const conflictingChild = {
      ...entityByPublicIdentifier.get('B1')!,
      id: 'db:conflicting-child',
      parentEntityId: parent.id,
      publicIdentifier: 'CUSTOM-CONFLICT',
      metadata: {
        block: 'M',
        segmentId: COMMERCIAL_MAP_SEGMENT_IDS.automotive,
      },
    };
    expect(findCommercialMapSegmentsForEntity(conflictingChild)).toHaveLength(2);
    const index = buildCommercialMapSegmentIndex(
      [...OFFICIAL_REFERENCE_ENTITIES, conflictingChild],
      OFFICIAL_REFERENCE_LOTS,
    );
    expect(index.has(conflictingChild.id)).toBe(false);
  });

  it('resolve o mesmo membership quando UUIDs persistidos substituem os IDs locais', () => {
    const replacementIds = new Map(
      OFFICIAL_REFERENCE_ENTITIES.map((entity, index) => [entity.id, `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`]),
    );
    const persistedEntities = OFFICIAL_REFERENCE_ENTITIES.map((entity) => {
      const {
        segmentId: _segmentId,
        segmentCode: _segmentCode,
        segmentName: _segmentName,
        ...metadata
      } = entity.metadata;
      return {
        ...entity,
        id: replacementIds.get(entity.id)!,
        parentEntityId: entity.parentEntityId ? replacementIds.get(entity.parentEntityId) ?? null : null,
        metadata,
      };
    });
    const persistedLots = OFFICIAL_REFERENCE_LOTS.map((lot) => ({
      ...lot,
      id: `db:${lot.id}`,
      entityId: replacementIds.get(lot.entityId)!,
    }));

    const referenceIndex = buildCommercialMapSegmentIndex(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
    const persistedIndex = buildCommercialMapSegmentIndex(persistedEntities, persistedLots);

    persistedEntities.forEach((entity) => {
      const referenceEntity = entityByPublicIdentifier.get(entity.publicIdentifier)!;
      expect(persistedIndex.get(entity.id)?.id ?? null).toBe(referenceIndex.get(referenceEntity.id)?.id ?? null);
    });

    const normalized = withCommercialMapSegments({
      source: 'database',
      sourceMessage: null,
      project: { id: 'db-project' } as never,
      calibration: null,
      layers: [],
      entities: persistedEntities,
      lots: persistedLots,
    });
    expect(normalized.entities.find((entity) => entity.publicIdentifier === 'QUADRA-M')?.metadata)
      .toMatchObject({
        segmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
        segmentCode: 'INDUSTRIA_COMERCIO_SERVICOS',
        segmentName: 'Indústria, Comércio e Serviços',
      });
  });

  it('mantém equipamentos funcionais neutros e colore unidades comerciais', () => {
    expect(isSegmentTintClassification('SELLABLE_LOT')).toBe(true);
    expect(isSegmentTintClassification('PAVILION')).toBe(true);
    expect(isSegmentTintClassification('RESTAURANT')).toBe(true);
    expect(isSegmentTintClassification('SECURITY')).toBe(false);
    expect(isSegmentTintClassification('EMERGENCY')).toBe(false);
    expect(isSegmentTintClassification('RESTROOM')).toBe(false);
    expect(isSegmentTintClassification('ROAD')).toBe(false);
  });

  it('expõe metadados estruturados na referência oficial sem substituir o domínio cadastral', () => {
    const samples = ['QUADRA-R', 'QUADRA-M', 'QUADRA-U'];
    samples.forEach((identifier) => {
      const entity = entityByPublicIdentifier.get(identifier)!;
      const segment = getCommercialMapSegment(entity.metadata.segmentId as CommercialMapSegmentId);
      expect(segment?.code).toBe(entity.metadata.segmentCode);
      expect(segment?.name).toBe(entity.metadata.segmentName);
    });
  });

  it('impede que estado residual de outro segmento invalide o deep-link da Exporural', () => {
    expect(isSegmentCompatibleWithAreaScope(COMMERCIAL_MAP_SEGMENT_IDS.exporural, 'exporural')).toBe(true);
    expect(isSegmentCompatibleWithAreaScope(COMMERCIAL_MAP_SEGMENT_IDS.industry, 'exporural')).toBe(false);
    expect(isSegmentCompatibleWithAreaScope(COMMERCIAL_MAP_SEGMENT_IDS.automotive, 'exporural')).toBe(false);
    expect(isSegmentCompatibleWithAreaScope(COMMERCIAL_MAP_SEGMENT_IDS.industry, 'park')).toBe(true);
  });
});

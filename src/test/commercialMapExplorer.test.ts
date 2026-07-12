import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { CommercialStatus } from '@/features/commercial-map/types';
import {
  buildEntityExplorerFacets,
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
  type EntityExplorerCriteria,
  type EntityExplorerItem,
} from '@/features/commercial-map/utils/entityExplorer';

const defaultCriteria: EntityExplorerCriteria = {
  query: '',
  statusFilters: [],
  classificationFilters: [],
  locationFilter: null,
  verificationFilters: [],
  sortOrder: 'relevance',
};

const officialIndex = buildEntityExplorerIndex(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots);

function explore(
  criteria: Partial<EntityExplorerCriteria>,
  items: EntityExplorerItem[] = officialIndex,
) {
  return filterAndSortEntityExplorerItems(items, { ...defaultCriteria, ...criteria });
}

describe('explorador compartilhado de entidades do mapa comercial', () => {
  it('indexa a base completa e prioriza identificadores exatos ou internos', () => {
    expect(officialIndex.length).toBeGreaterThan(400);

    const lotS36 = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'Q-S-36')!;
    expect(explore({ query: 'Q-S-36' }).map((item) => item.entity.id)).toEqual([lotS36.id]);
    expect(explore({ query: lotS36.id }).map((item) => item.entity.id)).toEqual([lotS36.id]);
    expect(explore({ query: 'B12' }).map((item) => item.entity.publicIdentifier)).toEqual(['B12']);
    expect(explore({ query: 'S36' })[0].entity.publicIdentifier).toBe('Q-S-36');
  });

  it('busca sem acentos por nome, quadra, lote, pavilhão e rua', () => {
    expect(explore({ query: 'restaurante' }).map((item) => item.entity.publicIdentifier)).toContain('C2');

    const quadraS = explore({ query: 'Quadra S' }).map((item) => item.entity.publicIdentifier);
    expect(quadraS).toContain('QUADRA-S');
    expect(quadraS).toContain('Q-S-36');
    expect(quadraS).not.toContain('B12');
    expect(quadraS.length).toBeLessThan(60);

    expect(explore({ query: 'Lote 36' }).map((item) => item.entity.publicIdentifier)).toContain('Q-S-36');
    expect(explore({ query: 'pavilhao 14' })[0].entity.publicIdentifier).toBe('B2');
    expect(explore({ query: 'Rua Chile' })[0].entity.publicIdentifier).toBe('RUA-CHILE');
    expect(explore({ query: 'pavilhão' }).map((item) => item.entity.id))
      .toEqual(explore({ query: 'pavilhao' }).map((item) => item.entity.id));
  });

  it('inclui empresa, contrato e palavras-chave armazenadas sem inventar dados de produção', () => {
    const sourceLot = OFFICIAL_REFERENCE_DATA.lots[0];
    const enrichedLots = OFFICIAL_REFERENCE_DATA.lots.map((lot) => lot.id === sourceLot.id ? {
      ...lot,
      currentBuyer: 'Agro São José',
      activeContractNumber: 'CTR-2026-77',
    } : lot);
    const enrichedEntities = OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.id === sourceLot.entityId ? {
      ...entity,
      metadata: { ...entity.metadata, searchKeywords: ['Espaço Premium Região Noroeste'] },
    } : entity);
    const enrichedIndex = buildEntityExplorerIndex(enrichedEntities, enrichedLots);

    expect(explore({ query: 'agro sao jose' }, enrichedIndex)[0].entity.id).toBe(sourceLot.entityId);
    expect(explore({ query: 'CTR-2026-77' }, enrichedIndex)[0].entity.id).toBe(sourceLot.entityId);
    expect(explore({ query: 'regiao noroeste' }, enrichedIndex)[0].entity.id).toBe(sourceLot.entityId);
  });

  it('filtra cada situação comercial e combina texto, tipo, local e verificação', () => {
    const statuses: CommercialStatus[] = ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE'];
    const statusByLotId = new Map(OFFICIAL_REFERENCE_DATA.lots.slice(0, statuses.length).map((lot, index) => [lot.id, statuses[index]]));
    const variedLots = OFFICIAL_REFERENCE_DATA.lots.map((lot) => ({ ...lot, status: statusByLotId.get(lot.id) ?? lot.status }));
    const variedIndex = buildEntityExplorerIndex(OFFICIAL_REFERENCE_DATA.entities, variedLots);

    statuses.forEach((status) => {
      const result = explore({ statusFilters: [status] }, variedIndex);
      expect(result.length, status).toBeGreaterThan(0);
      expect(result.every((item) => item.lot?.status === status), status).toBe(true);
    });

    const combined = explore({
      query: 'Quadra S',
      statusFilters: ['AVAILABLE', 'RESERVED'],
      classificationFilters: ['SELLABLE_LOT'],
      locationFilter: 'block:S',
      verificationFilters: ['NEEDS_REVIEW'],
    }, variedIndex);
    expect(combined).toHaveLength(2);
    expect(combined.every((item) => item.metadata.block === 'S' && item.entity.classification === 'SELLABLE_LOT')).toBe(true);
  });

  it('ordena por relevância, nome, localização e situação com desempate estável', () => {
    const byRelevance = explore({ query: 'B12', sortOrder: 'relevance' });
    expect(byRelevance[0].matchReason).toBe('Identificador exato');

    const byName = explore({ query: 'pavilhao', sortOrder: 'name' });
    const nameCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    expect(byName.every((item, index) => index === 0 || nameCollator.compare(
      byName[index - 1].metadata.officialDisplayName,
      item.metadata.officialDisplayName,
    ) <= 0)).toBe(true);

    const byLocation = explore({ query: 'Lote', sortOrder: 'location' });
    expect(byLocation[0].locationLabel).toMatch(/^Quadra /);

    const statuses: CommercialStatus[] = ['UNAVAILABLE', 'BLOCKED', 'SOLD', 'IN_NEGOTIATION', 'RESERVED', 'AVAILABLE'];
    const selectedLots = OFFICIAL_REFERENCE_DATA.lots.slice(0, statuses.length).map((lot, index) => ({ ...lot, status: statuses[index] }));
    const selectedIds = new Set(selectedLots.map((lot) => lot.entityId));
    const selectedEntities = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => selectedIds.has(entity.id));
    const byStatus = explore({ sortOrder: 'status' }, buildEntityExplorerIndex(selectedEntities, selectedLots));
    expect(byStatus.map((item) => item.lot?.status)).toEqual(['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE']);
  });

  it('expõe somente facetas derivadas dos metadados existentes', () => {
    const facets = buildEntityExplorerFacets(officialIndex);
    expect(facets.classifications.find((option) => option.value === 'SELLABLE_LOT')?.count).toBe(262);
    expect(facets.locations.find((option) => option.value === 'block:S')?.count).toBeGreaterThanOrEqual(37);
    expect(facets.locations.find((option) => option.label === 'Rua Chile')).toMatchObject({ group: 'Vias', count: 1 });
    expect(facets.statusCounts.BLOCKED).toBe(262);
  });
});

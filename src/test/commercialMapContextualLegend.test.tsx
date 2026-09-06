import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContextualMapLegend } from '@/features/commercial-map/components/panels/ContextualMapLegend';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import { deriveContextualMapSummary, resolveContextualMapScope } from '@/features/commercial-map/utils/contextualMapSummary';

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B1')!;
const baseEntity = OFFICIAL_REFERENCE_ENTITIES[0];
const baseLot = OFFICIAL_REFERENCE_LOTS[0];
const moduleEntity = (number: number, overrides: Partial<MapEntity> = {}): MapEntity => ({
  ...baseEntity, id: `module-${number}`, parentEntityId: pavilion.id,
  publicIdentifier: `B1-M${String(number).padStart(3, '0')}`, classification: 'INTERNAL_STAND',
  isSellable: true, isArchived: false, metadata: { pavilionPublicIdentifier: 'B1', moduleNumber: number }, ...overrides,
});
const lot = (entityId: string, overrides: Partial<CommercialLot> = {}): CommercialLot => ({
  ...baseLot, id: `lot:${entityId}`, entityId, officialAreaSqm: null, archivedAt: null, status: 'BLOCKED', ...overrides,
});

describe('resumo comercial contextual', () => {
  it('prioriza interior aberto, mesmo quando o segmento selecionado pertence a outro local', () => {
    const interior = resolveContextualMapScope({
      entities: OFFICIAL_REFERENCE_ENTITIES, lots: OFFICIAL_REFERENCE_LOTS,
      interiorEntity: pavilion, activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.exporural,
    });
    expect(interior.kind).toBe('interior');
    expect(interior.title).toBe(pavilion.name);
    expect(interior.totalCount).toBe(189);
    expect(interior.lots).toHaveLength(189);
    expect(interior.lots.every((record) => record.publicIdentifier.startsWith('B1-M'))).toBe(true);
    expect(deriveContextualMapSummary(interior).byStatus.BLOCKED).toBe(189);
  });

  it.each(Object.keys(COMMERCIAL_PAVILION_MODULE_PLANS))('conta exclusivamente células válidas do plano %s', (identifier) => {
    const entity = OFFICIAL_REFERENCE_ENTITIES.find((candidate) => candidate.publicIdentifier === identifier)!;
    const scope = resolveContextualMapScope({ entities: OFFICIAL_REFERENCE_ENTITIES, lots: OFFICIAL_REFERENCE_LOTS, interiorEntity: entity });
    expect(scope.totalCount).toBe(scope.plan!.cells.length);
    expect(scope.lots).toHaveLength(scope.totalCount);
    expect(scope.unregisteredModuleCount).toBe(0);
    expect(Object.values(deriveContextualMapSummary(scope).byStatus).reduce((sum, value) => sum + value, 0)).toBe(scope.totalCount);
  });

  it('retorna ao segmento e ao parque sem transportar os totais do interior', () => {
    const input = { entities: OFFICIAL_REFERENCE_ENTITIES, lots: OFFICIAL_REFERENCE_LOTS };
    const segment = resolveContextualMapScope({ ...input, activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.exporural });
    expect(segment.kind).toBe('segment');
    expect(segment.title).toBe('Exporural');
    expect(segment.totalCount).toBe(95);
    const park = resolveContextualMapScope(input);
    expect(park.totalCount).toBe(1577);
    expect(park.nonCommercialCount).toBeGreaterThan(0);
    expect(deriveContextualMapSummary(park).byStatus.BLOCKED).toBe(1577);
  });

  it('separa contagem total e filtrada e mantém cores e áreas vinculadas aos mesmos registros', () => {
    const entities = [moduleEntity(1), moduleEntity(2), moduleEntity(3)];
    const lots = [lot(entities[0].id, { status: 'AVAILABLE', officialAreaSqm: 12 }), lot(entities[1].id, { status: 'RESERVED', officialAreaSqm: 8 }), lot(entities[2].id, { status: 'AVAILABLE' })];
    const scope = resolveContextualMapScope({ entities, lots, interiorEntity: pavilion });
    const summary = deriveContextualMapSummary(scope, { statusFilters: ['AVAILABLE'], matchingEntityIds: new Set([entities[2].id]) });
    expect(scope.totalCount).toBe(189);
    expect(summary.filteredCount).toBe(1);
    expect(summary.byStatus.AVAILABLE).toBe(2);
    expect(summary.byStatus.RESERVED).toBe(1);
    expect(summary.officialArea).toEqual({ squareMeters: 20, informedCount: 2, missingCount: 1 });
    expect(summary.availableOfficialArea).toEqual({ squareMeters: 12, informedCount: 1, missingCount: 1 });
    expect(scope.plan!.stats.totalAreaSquareMeters).toBe(1201.5);
    expect(scope.plan!.stats.moduleAreaSquareMeters).toBe(587.85);
  });

  it('não transforma cadastro ausente, arquivado ou módulo ambíguo em bloqueado', () => {
    const entities = [moduleEntity(1), moduleEntity(1, { id: 'duplicate' }), moduleEntity(2, { isArchived: true }), moduleEntity(3), moduleEntity(999), moduleEntity(4, { publicIdentifier: 'B2-M004', metadata: { pavilionPublicIdentifier: 'B2', moduleNumber: 4 } })];
    const lots = entities.map((entity) => lot(entity.id, entity.id === 'module-3' ? { archivedAt: '2026-09-01' } : {}));
    const scope = resolveContextualMapScope({ entities, lots, interiorEntity: pavilion });
    expect(scope.lots).toHaveLength(0);
    expect(scope.unregisteredModuleCount).toBe(189);
    expect(deriveContextualMapSummary(scope).byStatus.BLOCKED).toBe(0);
    expect(deriveContextualMapSummary(scope).officialArea.squareMeters).toBeNull();
  });

  it('usa descendentes de outras estruturas com navegação própria e exclui globais e órfãos', () => {
    const building = { ...baseEntity, id: 'building', publicIdentifier: 'CUSTOM', name: 'Estrutura interna', isArchived: false };
    const room = { ...baseEntity, id: 'room', parentEntityId: building.id, isArchived: false, isSellable: false };
    const stand = { ...baseEntity, id: 'stand', parentEntityId: room.id, isArchived: false };
    const foreign = { ...baseEntity, id: 'foreign', parentEntityId: null, isArchived: false };
    const scope = resolveContextualMapScope({
      entities: [building, room, stand, foreign], lots: [lot('stand'), lot('foreign'), lot('orphan')], interiorEntity: building,
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
    });
    expect([...scope.entityIds]).toEqual(['room', 'stand']);
    expect(scope.totalCount).toBe(1);
    expect(scope.nonCommercialCount).toBe(1);
    expect(scope.lots[0].entityId).toBe('stand');
  });
});

describe('legenda interativa integrada', () => {
  beforeEach(() => useCommercialMapStore.setState({ statusFilters: [], activeSegmentId: null, search: '', locationFilter: null }));

  it('altera a situação imediatamente e limpa apenas esse filtro na fonte de estado existente', () => {
    useCommercialMapStore.setState({ activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.exporural, search: 'B1', locationFilter: 'block:M' });
    render(<ContextualMapLegend entities={[moduleEntity(1)]} lots={[lot('module-1', { status: 'AVAILABLE' })]} interiorEntity={pavilion} />);
    const available = screen.getByRole('button', { name: 'Disponível: 1 módulos' });
    fireEvent.click(available);
    expect(available).toHaveAttribute('aria-pressed', 'true');
    expect(available.querySelector('i')).toBeTruthy();
    expect(available.style.getPropertyValue('--status-color')).toBe(STATUS_CONFIG.AVAILABLE.color);
    expect(screen.getByRole('status')).toHaveTextContent('1 de 189 módulos correspondem aos filtros');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro de situação comercial' }));
    expect(useCommercialMapStore.getState()).toMatchObject({ statusFilters: [], activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.exporural, search: 'B1', locationFilter: 'block:M' });
  });

  it('não apresenta área desconhecida como zero e distingue área total, modular e oficial', () => {
    render(<ContextualMapLegend entities={OFFICIAL_REFERENCE_ENTITIES} lots={OFFICIAL_REFERENCE_LOTS} interiorEntity={pavilion} />);
    const legend = screen.getByRole('region', { name: `Legenda de ${pavilion.name}` });
    expect(within(legend).getAllByText('Área não informada').length).toBeGreaterThan(0);
    expect(legend).not.toHaveTextContent('0,00 m²');
    expect(within(legend).getByText('Área total do pavilhão')).toBeInTheDocument();
    expect(within(legend).getByText('Área modular total')).toBeInTheDocument();
    expect(within(legend).getByText('1.201,5 m²')).toBeInTheDocument();
    expect(within(legend).getByText('587,85 m²')).toBeInTheDocument();
    expect(within(legend).getByRole('img')).toHaveAccessibleName('Esquema dos módulos e corredores do pavilhão');
  });

  it('mantém situações e áreas expansíveis na versão compacta, comunicando filtro ativo', () => {
    act(() => useCommercialMapStore.getState().toggleStatus('BLOCKED'));
    const { container } = render(<ContextualMapLegend entities={OFFICIAL_REFERENCE_ENTITIES} lots={OFFICIAL_REFERENCE_LOTS} interiorEntity={pavilion} compact />);
    expect(screen.getByText('Filtro: Bloqueado')).toBeVisible();
    expect(screen.getByText('189 de 189 módulos correspondem aos filtros')).toBeVisible();
    expect(container.querySelectorAll('details')).toHaveLength(2);
    container.querySelectorAll('details').forEach((detail) => expect(detail.open).toBe(false));
    expect(screen.getByText('Situações e legenda')).toBeVisible();
    expect(screen.getByText('Áreas e informações')).toBeVisible();
  });
});

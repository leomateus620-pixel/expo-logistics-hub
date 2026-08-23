import { beforeEach, describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  buildCommercialMapSegmentIndex,
  COMMERCIAL_MAP_SEGMENT_IDS,
  getCommercialMapSegment,
} from '@/features/commercial-map/data/commercialMapSegments';
import { commercialMapQueryKey } from '@/features/commercial-map/hooks/useCommercialMap';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import { isCommissionInventoryConsistent } from '@/features/commercial-map/utils/commissionInventory';
import {
  COMMISSION_MAP_PORTALS,
  getCommissionMapPortal,
} from '@/modules/commissions/commissionMapPortalRegistry';
import {
  getCommissionModule,
  getModuleRoute,
} from '@/modules/commissions/commissionRegistry';

const explorerCriteria = {
  query: '',
  statusFilters: [],
  classificationFilters: [],
  locationFilter: null,
  verificationFilters: [],
  sortOrder: 'relevance' as const,
};

describe('portais comerciais por comissão', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      activeScopeKey: null,
      activeSegmentId: null,
      selectedEntityId: null,
      interiorEntityId: null,
      search: '',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      activePanel: null,
    });
  });

  it('mantém contratos únicos de rota, capability e menu', () => {
    expect(COMMISSION_MAP_PORTALS.map((portal) => portal.slug)).toEqual([
      'exporural',
      'industria-comercio-servicos',
    ]);

    COMMISSION_MAP_PORTALS.forEach((portal) => {
      const module = getCommissionModule(portal.slug);
      expect(module).toEqual(portal.module);
      expect(module?.capability).toBe(portal.capability);
      expect(module?.menus.map((menu) => menu.path)).toEqual(['mapa-comercial']);
      expect(getModuleRoute(portal.module)).toBe(portal.mapPath);
      expect(portal.loginPath).toBe(`/login/${portal.slug}`);
      expect(portal.mapPath).toBe(`${portal.basePath}/mapa-comercial`);
    });

    expect(getCommissionMapPortal('nao-existe')).toBeUndefined();
  });

  it('isola inventário, busca e métricas entre Exporural e Indústria', () => {
    const rural = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, 'exporural');
    const industry = scopeCommercialMapData(
      OFFICIAL_REFERENCE_DATA,
      'industria-comercio-servicos',
    );

    expect(rural.entities).toHaveLength(111);
    expect(rural.lots).toHaveLength(95);
    expect(industry.entities).toHaveLength(354);
    expect(industry.lots).toHaveLength(317);

    const ruralIds = new Set(rural.entities.map((entity) => entity.id));
    expect(industry.entities.some((entity) => ruralIds.has(entity.id))).toBe(false);
    expect(rural.entities.some((entity) => entity.publicIdentifier === 'Q-R-55')).toBe(true);
    expect(industry.entities.some((entity) => entity.publicIdentifier === 'Q-R-55')).toBe(false);
    expect(industry.entities.some((entity) => entity.publicIdentifier === 'B3')).toBe(true);

    const industryExplorer = buildEntityExplorerIndex(industry.entities, industry.lots);
    expect(filterAndSortEntityExplorerItems(industryExplorer, {
      ...explorerCriteria,
      query: 'Q-R-55',
    })).toEqual([]);
    expect(filterAndSortEntityExplorerItems(industryExplorer, {
      ...explorerCriteria,
      query: 'B3',
    }).map((item) => item.entity.publicIdentifier)).toEqual(['B3']);

    const canonicalIndustryEntity = {
      ...rural.entities.find((entity) => entity.publicIdentifier === 'Q-R-55')!,
      segmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
      segmentSource: 'database' as const,
    };
    expect(buildCommercialMapSegmentIndex([canonicalIndustryEntity], [])
      .get(canonicalIndustryEntity.id)?.id).toBe(COMMERCIAL_MAP_SEGMENT_IDS.industry);
  });

  it('mantém framing explícito e chaves de cache segregadas por usuário, organização e segmento', () => {
    const industry = getCommercialMapSegment(COMMERCIAL_MAP_SEGMENT_IDS.industry)!;
    expect(industry.camera).toEqual({
      direction: [0.58, 0.7, 0.64],
      padding: 1.12,
      minDistanceRatio: 0.1,
      maxDistanceRatio: 2.05,
    });

    const ruralKey = commercialMapQueryKey('user-1', 'org-1', {
      mode: 'commission',
      commissionId: 'exporural',
      segmentId: 'exporural',
    });
    const industryKey = commercialMapQueryKey('user-1', 'org-1', {
      mode: 'commission',
      commissionId: 'industria-comercio-servicos',
      segmentId: 'industria-comercio-servicos',
    });
    expect(ruralKey).not.toEqual(industryKey);
    expect(ruralKey).not.toEqual(commercialMapQueryKey('user-2', 'org-1', {
      mode: 'commission',
      commissionId: 'exporural',
      segmentId: 'exporural',
    }));
  });

  it('limpa estado residual ao trocar de escopo e restaura o segmento bloqueado', () => {
    const store = useCommercialMapStore.getState();
    store.activateScope('commission:industry', COMMERCIAL_MAP_SEGMENT_IDS.industry);
    store.setSearch('B3');
    store.setSelectedEntityId('entity-b3');
    store.requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.exporural);

    useCommercialMapStore.getState().activateScope(
      'commission:industry',
      COMMERCIAL_MAP_SEGMENT_IDS.industry,
    );

    expect(useCommercialMapStore.getState()).toMatchObject({
      activeScopeKey: 'commission:industry',
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
      selectedEntityId: null,
      search: '',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
    });
  });

  it('mantém o inventário válido após split e merge sem aceitar vínculos quebrados', () => {
    const baseline = {
      expectedEntityCount: 111,
      expectedLotCount: 95,
    };
    const entityIds = Array.from({ length: 111 }, (_, index) => `entity-${index}`);
    const lotEntityIds = entityIds.slice(0, 95);

    expect(isCommissionInventoryConsistent({ ...baseline, entityIds, lotEntityIds })).toBe(true);
    expect(isCommissionInventoryConsistent({
      expectedEntityCount: baseline.expectedEntityCount + 1,
      expectedLotCount: baseline.expectedLotCount + 1,
      entityIds: [...entityIds, 'split-child'],
      lotEntityIds: [...lotEntityIds, 'split-child'],
    })).toBe(true);
    expect(isCommissionInventoryConsistent({
      expectedEntityCount: baseline.expectedEntityCount - 1,
      expectedLotCount: baseline.expectedLotCount - 1,
      entityIds: entityIds.slice(0, -1),
      lotEntityIds: lotEntityIds.slice(0, -1),
    })).toBe(true);
    expect(isCommissionInventoryConsistent({
      ...baseline,
      entityIds,
      lotEntityIds: lotEntityIds.slice(0, -1),
    })).toBe(false);
    expect(isCommissionInventoryConsistent({
      ...baseline,
      entityIds,
      lotEntityIds: [...lotEntityIds.slice(0, -1), lotEntityIds[0]],
    })).toBe(false);
    expect(isCommissionInventoryConsistent({
      ...baseline,
      entityIds: [...entityIds.slice(0, -1), entityIds[0]],
      lotEntityIds,
    })).toBe(false);
  });
});

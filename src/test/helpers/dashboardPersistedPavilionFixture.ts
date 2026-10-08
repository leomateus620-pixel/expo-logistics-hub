import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import type { CommercialMapData, Coordinate, MapEntity } from '@/features/commercial-map/types';

type TargetPavilion = 'B4' | 'B5';
type DashboardSource = Pick<CommercialMapData, 'entities' | 'lots'>;

/** Independent reproduction of the existing SQL frame; no backend or production mutation. */
export function dashboardPersistedPavilionFrame(pavilion: MapEntity, identifier: TargetPavilion) {
  const points = pavilion.geometry.coordinates[0];
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z);
  const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const clearWidth = width - .18 * Math.min(width, depth);
  const clearDepth = depth - .18 * Math.min(width, depth);
  const { metricWidthM, metricDepthM } = COMMERCIAL_PAVILION_MODULE_PLANS[identifier].projection;
  if (!metricWidthM || !metricDepthM) throw new Error('A fixture SQL exige dimensões métricas oficiais.');
  const scale = Math.min(clearWidth / metricWidthM, clearDepth / metricDepthM);
  const frameWidth = metricWidthM * scale, frameDepth = metricDepthM * scale;
  const slack = clearDepth - frameDepth;
  // SQL aligns in world Z after the 180° rotation, unlike the seed projector.
  const frameCenterZ = centerZ + slack / 2;
  const project = ([u, v]: readonly [number, number]): Coordinate => [
    centerX - (u - .5) * frameWidth,
    frameCenterZ - (v - .5) * frameDepth,
  ];
  return { centerX, centerZ, frameWidth, frameDepth, slack, project };
}

/**
 * Loaded-data fixture for P8 SQL 2028.1-p8.2 and P13 SQL central revision
 * 2028.2-p13.5 (central top=6m). The other six pavilions and all commercial
 * records are the original source objects. This is imported only by tests/QA.
 */
export function createDashboardPersistedPavilionFixture(source: DashboardSource = OFFICIAL_REFERENCE_DATA): DashboardSource {
  const pavilions = new Map(source.entities.filter((entity) => entity.publicIdentifier === 'B4' || entity.publicIdentifier === 'B5')
    .map((entity) => [entity.id, entity]));
  return {
    ...source,
    entities: source.entities.map((entity) => {
      const pavilion = entity.parentEntityId ? pavilions.get(entity.parentEntityId) : undefined;
      if (!pavilion) return entity;
      const identifier = pavilion.publicIdentifier as TargetPavilion;
      const plan = COMMERCIAL_PAVILION_MODULE_PLANS[identifier];
      const cell = plan.cells.find(({ id }) => id === entity.metadata.pavilionModuleKey);
      if (!cell) return entity;
      const centerRevision = identifier === 'B5' && cell.number >= 27 && cell.number <= 78;
      const shift = centerRevision ? (8.9 - 6) / 37.8 : 0;
      const normalizedSource = cell.shape?.footprint ?? [
        [cell.centerX - cell.width / 2, cell.centerZ - cell.depth / 2],
        [cell.centerX + cell.width / 2, cell.centerZ - cell.depth / 2],
        [cell.centerX + cell.width / 2, cell.centerZ + cell.depth / 2],
        [cell.centerX - cell.width / 2, cell.centerZ + cell.depth / 2],
      ];
      const normalized = normalizedSource.map(([x, z]): Coordinate => [x, z - shift]);
      const normalizedAnchor: Coordinate = [cell.labelAnchor[0], cell.labelAnchor[1] - shift];
      const frame = dashboardPersistedPavilionFrame(pavilion, identifier);
      const world = normalized.map(frame.project);
      return { ...entity,
        geometry: { ...entity.geometry, coordinates: [[...world, [...world[0]] as Coordinate]] },
        metadata: { ...entity.metadata,
          normalizedFootprintPolygon: [...normalized, [...normalized[0]] as Coordinate],
          normalizedLabelAnchor: normalizedAnchor,
          labelAnchor: frame.project(normalizedAnchor),
          layoutRevision: identifier === 'B4' ? '2028.1-p8.2' : centerRevision ? '2028.2-p13.5' : '2028.2-p13.3',
        },
      };
    }),
    lots: source.lots,
  };
}

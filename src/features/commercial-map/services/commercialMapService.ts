import { supabase } from '@/integrations/supabase/client';
import { OFFICIAL_REFERENCE_DATA, OFFICIAL_REFERENCE_REVISION } from '../data/officialReference2026';
import { reconcileExporuralReference } from '../data/reconcileExporuralReference';
import type {
  CommercialLot,
  CommercialMapData,
  CommercialMapQueryScope,
  LotContractVersion,
  MapActivity,
  MapCalibration,
  MapEntity,
  MapLayer,
  MapProject,
  PolygonGeometry,
} from '../types';
import { validateContractFile } from '../utils/contracts';
import {
  getCommercialMapSegment,
  type CommercialMapSegmentId,
} from '../data/commercialMapSegments';
import { isCommissionInventoryConsistent } from '../utils/commissionInventory';

interface ProjectRow {
  id: string; org_id: string; name: string; description: string | null; coordinate_system: MapProject['coordinateSystem'];
  reference_width: number | string; reference_height: number | string; reference_revision?: string | null;
  active_version: number; is_published: boolean;
}
interface LayerRow {
  id: string; project_id: string; layer_key: string; name: string; description: string | null; color: string;
  opacity: number | string; is_visible: boolean; is_locked: boolean; sort_order: number;
}
interface CalibrationRow {
  id: string; project_id: string; reference_image_path: string | null; opacity: number | string; is_locked: boolean;
  image_offset_x: number | string; image_offset_y: number | string; image_scale_x: number | string; image_scale_y: number | string;
  image_rotation_degrees: number | string;
  point_a: MapCalibration['pointA']; point_b: MapCalibration['pointB']; known_distance_meters: number | string | null;
  map_units_per_meter: number | string | null; status: MapCalibration['status']; version: number;
}
interface EntityRow {
  id: string; project_id: string; layer_id: string; parent_entity_id: string | null; public_identifier: string;
  segment_id?: string | null;
  name: string; description: string | null; classification: MapEntity['classification'];
  verification_status: MapEntity['verificationStatus']; is_sellable: boolean; is_archived: boolean; metadata: Record<string, unknown> | null;
}
interface SegmentRow {
  id: string;
  project_id: string;
  slug: string;
  display_name: string;
  boundary_data: Record<string, unknown>;
  camera_config: Record<string, unknown>;
  is_active: boolean;
}
interface SegmentLookupRow { id: string; slug: string; }
interface GeometryRow {
  id: string; entity_id: string; geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  elevation: number | string; extrusion_height: number | string; rotation: number | string; version: number; calibration_version: number | null;
}
interface PriceRow { is_active: boolean; pricing_mode: CommercialLot['pricingMode']; base_price: number | string | null; price_per_sqm: number | string | null; asking_price: number | string | null; minimum_price: number | string | null; }
interface ReservationRow { status: string; company_name: string; expires_at: string; responsible_name: string | null; }
interface NegotiationRow { status: string; company_name: string; contact_name: string | null; }
interface SaleRow { status: string; buyer_name: string; sale_date: string; salesperson_name: string; contract_number: string | null; }
interface ContractRow { is_active: boolean; contract_number: string | null; }
interface LotRow {
  id: string; entity_id: string; public_identifier: string; block: string | null; lot_number: string | null; level_label: string | null; display_name: string;
  description: string | null; status: CommercialLot['status']; official_area_sqm: number | string | null; calculated_area_sqm: number | string | null;
  area_validation_status: CommercialLot['areaValidationStatus']; frontage_meters: number | string | null; depth_meters: number | string | null;
  lot_prices: PriceRow[] | PriceRow | null; lot_reservations: ReservationRow[] | null; lot_negotiations: NegotiationRow[] | null;
  lot_sales: SaleRow[] | null; lot_contracts: ContractRow[] | null;
  infrastructure: string[] | null; has_electricity: boolean; has_water: boolean; has_internet: boolean; is_corner: boolean; is_covered: boolean;
  accessibility_notes: string | null; commercial_notes: string | null; internal_notes: string | null; archived_at: string | null;
  created_by: string | null; updated_by: string | null; created_at: string | null; updated_at: string | null;
}
interface ActivityRow {
  id: string; entity_id: string | null; lot_id: string | null; action: string; reason: string | null; actor_user_id: string | null;
  before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; created_at: string;
}

// Tables are introduced by this migration and are not present in the checked-in generated Supabase type snapshot yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// PostgREST caps every response at 1000 rows. The park already exceeds that
// (1.7k+ entities/geometries), so unpaginated queries silently truncate whole
// pavilions out of the map. Page through with a stable ordering until a short
// page signals the end.
const MAP_PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(buildQuery: () => any): Promise<{ data: any[] | null; error: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  for (let from = 0; ; from += MAP_PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order('id')
      .range(from, from + MAP_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < MAP_PAGE_SIZE) return { data: all, error: null };
  }
}

function isMissingMapInfrastructure(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || Boolean(error.message?.includes('map_projects') && error.message.includes('schema cache'));
}

function isMissingMapSegmentInfrastructure(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
    || error.code === '42703'
    || error.code === '42883'
    || error.code === 'PGRST204'
    || error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || Boolean(error.message?.includes('map_segments'))
    || Boolean(error.message?.includes('segment_id'));
}

function commissionMapError(
  code:
    | 'MAP_SEGMENT_CONFIGURATION_UNAVAILABLE'
    | 'MAP_SEGMENT_EMPTY'
    | 'MAP_SEGMENT_GEOMETRY_INCOMPLETE'
    | 'MAP_SEGMENT_INVENTORY_MISMATCH',
) {
  const error = new Error(code);
  error.name = 'CommercialMapCommissionScopeError';
  return error;
}

function isMissingReservationMaintenance(error: { code?: string; message?: string }): boolean {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || Boolean(error.message?.includes('expire_commercial_reservations') && error.message.includes('schema cache'));
}

function isMissingReferenceSync(error: { code?: string; message?: string }): boolean {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || Boolean(error.message?.includes('sync_commercial_map_reference_2026') && error.message.includes('schema cache'));
}

function isClearlyLegacy2024Seed(
  project: ProjectRow,
  entities: EntityRow[],
  hasAnyCommercialLots: boolean,
): boolean {
  if (hasAnyCommercialLots) return false;

  const revision = project.reference_revision?.trim();
  if (revision?.startsWith('2024')) return true;

  const projectDescription = `${project.name} ${project.description ?? ''}`.toLocaleLowerCase('pt-BR');
  if (projectDescription.includes('2024') && projectDescription.includes('fenasoja') && projectDescription.includes('referência')) {
    return true;
  }

  if (entities.length === 0) return false;
  return entities.every((entity) => {
    const metadata = entity.metadata ?? {};
    const sourceRevision = typeof metadata.sourceRevision === 'string' ? metadata.sourceRevision : '';
    const source = typeof metadata.source === 'string' ? metadata.source.toLocaleLowerCase('pt-BR') : '';
    return sourceRevision.startsWith('2024') || (source.includes('fenasoja') && source.includes('2024'));
  });
}

function mapProject(row: ProjectRow): MapProject {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    coordinateSystem: row.coordinate_system,
    referenceWidth: Number(row.reference_width),
    referenceHeight: Number(row.reference_height),
    referenceRevision: row.reference_revision ?? null,
    activeVersion: row.active_version,
    isPublished: row.is_published,
  };
}

function mapLayer(row: LayerRow): MapLayer {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.layer_key,
    name: row.name,
    description: row.description,
    color: row.color,
    opacity: Number(row.opacity),
    isVisible: row.is_visible,
    isLocked: row.is_locked,
    sortOrder: row.sort_order,
  };
}

function mapCalibration(row: CalibrationRow): MapCalibration {
  return {
    id: row.id,
    projectId: row.project_id,
    referenceImagePath: row.reference_image_path,
    opacity: Number(row.opacity),
    isLocked: row.is_locked,
    imageOffsetX: Number(row.image_offset_x),
    imageOffsetY: Number(row.image_offset_y),
    imageScaleX: Number(row.image_scale_x),
    imageScaleY: Number(row.image_scale_y),
    imageRotationDegrees: Number(row.image_rotation_degrees),
    pointA: row.point_a,
    pointB: row.point_b,
    knownDistanceMeters: row.known_distance_meters === null ? null : Number(row.known_distance_meters),
    mapUnitsPerMeter: row.map_units_per_meter === null ? null : Number(row.map_units_per_meter),
    status: row.status,
    version: row.version,
  };
}

function mapEntity(
  row: EntityRow,
  geometryRow: GeometryRow,
  forcedSegmentId?: CommercialMapSegmentId,
): MapEntity {
  const storedGeometry = geometryRow.geometry;
  const segment = getCommercialMapSegment(forcedSegmentId);
  return {
    id: row.id,
    projectId: row.project_id,
    layerId: row.layer_id,
    parentEntityId: row.parent_entity_id,
    segmentId: forcedSegmentId ?? null,
    segmentSource: forcedSegmentId ? 'database' : undefined,
    publicIdentifier: row.public_identifier,
    name: row.name,
    description: row.description,
    classification: row.classification,
    verificationStatus: row.verification_status,
    isSellable: row.is_sellable,
    isArchived: row.is_archived,
    geometry: {
      id: geometryRow.id,
      type: 'Polygon',
      coordinates: storedGeometry.coordinates,
      elevation: Number(geometryRow.elevation),
      extrusionHeight: Number(geometryRow.extrusion_height),
      rotation: Number(geometryRow.rotation),
      geometryVersion: geometryRow.version,
      calibrationVersion: geometryRow.calibration_version,
    },
    metadata: segment
      ? {
          ...(row.metadata ?? {}),
          segmentId: segment.id,
          segmentCode: segment.code,
          segmentName: segment.name,
        }
      : row.metadata ?? {},
  };
}

function mapLot(row: LotRow): CommercialLot {
  const price = Array.isArray(row.lot_prices) ? row.lot_prices.find((candidate: PriceRow) => candidate.is_active) : row.lot_prices;
  const activeReservation = Array.isArray(row.lot_reservations)
    ? row.lot_reservations.find((candidate: ReservationRow) => candidate.status === 'ACTIVE')
    : null;
  const activeNegotiation = Array.isArray(row.lot_negotiations)
    ? row.lot_negotiations.find((candidate: NegotiationRow) => candidate.status === 'ACTIVE')
    : null;
  const sale = Array.isArray(row.lot_sales) ? row.lot_sales.find((candidate: SaleRow) => candidate.status === 'CONFIRMED') : null;
  const activeContract = Array.isArray(row.lot_contracts)
    ? row.lot_contracts.find((candidate: ContractRow) => candidate.is_active)
    : null;
  return {
    id: row.id,
    entityId: row.entity_id,
    publicIdentifier: row.public_identifier,
    block: row.block,
    lotNumber: row.lot_number,
    levelLabel: row.level_label,
    displayName: row.display_name,
    description: row.description,
    status: row.status,
    officialAreaSqm: row.official_area_sqm === null ? null : Number(row.official_area_sqm),
    calculatedAreaSqm: row.calculated_area_sqm === null ? null : Number(row.calculated_area_sqm),
    areaValidationStatus: row.area_validation_status,
    frontageMeters: row.frontage_meters === null ? null : Number(row.frontage_meters),
    depthMeters: row.depth_meters === null ? null : Number(row.depth_meters),
    pricingMode: price?.pricing_mode ?? 'NEGOTIABLE',
    basePrice: price?.base_price === null || price?.base_price === undefined ? null : Number(price.base_price),
    pricePerSqm: price?.price_per_sqm === null || price?.price_per_sqm === undefined ? null : Number(price.price_per_sqm),
    askingPrice: price?.asking_price === null || price?.asking_price === undefined ? null : Number(price.asking_price),
    minimumPrice: price?.minimum_price === null || price?.minimum_price === undefined ? null : Number(price.minimum_price),
    infrastructure: row.infrastructure ?? [],
    hasElectricity: row.has_electricity,
    hasWater: row.has_water,
    hasInternet: row.has_internet,
    isCorner: row.is_corner,
    isCovered: row.is_covered,
    accessibilityNotes: row.accessibility_notes,
    commercialNotes: row.commercial_notes,
    internalNotes: row.internal_notes,
    currentBuyer: sale?.buyer_name ?? activeReservation?.company_name ?? activeNegotiation?.company_name ?? null,
    reservationExpiresAt: activeReservation?.expires_at ?? null,
    saleDate: sale?.sale_date ?? null,
    salespersonName: sale?.salesperson_name ?? activeReservation?.responsible_name ?? null,
    activeContractNumber: activeContract?.contract_number ?? sale?.contract_number ?? null,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function signedReferenceUrl(calibration: MapCalibration | null): Promise<MapCalibration | null> {
  if (!calibration?.referenceImagePath || calibration.referenceImagePath.startsWith('/')) return calibration;
  const { data, error } = await supabase.storage.from('map-references').createSignedUrl(calibration.referenceImagePath, 3600);
  if (error) return calibration;
  return { ...calibration, referenceImageUrl: data.signedUrl };
}

async function fetchCommissionCommercialMap(
  project: MapProject,
  scope: Extract<CommercialMapQueryScope, { mode: 'commission' }>,
): Promise<CommercialMapData> {
  const localSegment = getCommercialMapSegment(scope.segmentId as CommercialMapSegmentId);
  if (!localSegment) throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');

  const segmentResult = await db
    .from('map_segments')
    .select('id, project_id, slug, display_name, boundary_data, camera_config, is_active')
    .eq('project_id', project.id)
    .eq('slug', scope.segmentId)
    .eq('is_active', true)
    .maybeSingle();

  if (segmentResult.error) {
    if (isMissingMapSegmentInfrastructure(segmentResult.error)) {
      throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
    }
    throw segmentResult.error;
  }

  const segment = segmentResult.data as SegmentRow | null;
  if (!segment || segment.slug !== localSegment.id) {
    throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
  }
  const baselineEntityCount = Number(segment.boundary_data.expectedEntityCount);
  const baselineLotCount = Number(segment.boundary_data.expectedLotCount);
  const persistedDirection = segment.camera_config.direction;
  const cameraValues = [
    ...(Array.isArray(persistedDirection) ? persistedDirection : []),
    segment.camera_config.padding,
    segment.camera_config.minDistanceRatio,
    segment.camera_config.maxDistanceRatio,
  ].map(Number);
  if (
    segment.boundary_data.resolution !== 'explicit-entity-union'
    || !Number.isInteger(baselineEntityCount)
    || !Number.isInteger(baselineLotCount)
    || baselineLotCount <= 0
    || baselineEntityCount < baselineLotCount
    || !Array.isArray(persistedDirection)
    || persistedDirection.length !== 3
    || cameraValues.length !== 6
    || cameraValues.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
  }

  const inventoryResult = await db.rpc('get_commission_map_segment_inventory', {
    p_segment_id: segment.id,
  });
  if (inventoryResult.error) {
    if (isMissingMapSegmentInfrastructure(inventoryResult.error)) {
      throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
    }
    throw inventoryResult.error;
  }
  const inventoryRow = (Array.isArray(inventoryResult.data)
    ? inventoryResult.data[0]
    : inventoryResult.data) as {
      expected_entity_count?: number | string;
      expected_lot_count?: number | string;
      lineage_delta?: number | string;
    } | null;
  const expectedEntityCount = Number(inventoryRow?.expected_entity_count);
  const expectedLotCount = Number(inventoryRow?.expected_lot_count);
  const lineageDelta = Number(inventoryRow?.lineage_delta);
  if (
    !inventoryRow
    || !Number.isInteger(expectedEntityCount)
    || !Number.isInteger(expectedLotCount)
    || !Number.isInteger(lineageDelta)
    || expectedLotCount <= 0
    || expectedEntityCount < expectedLotCount
    || expectedEntityCount !== baselineEntityCount + lineageDelta
    || expectedLotCount !== baselineLotCount + lineageDelta
  ) {
    throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
  }

  const maintenanceResult = await db.rpc('expire_commission_segment_reservations', {
    p_segment_id: segment.id,
  });
  if (maintenanceResult.error) {
    if (isMissingMapSegmentInfrastructure(maintenanceResult.error)) {
      throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
    }
    throw maintenanceResult.error;
  }

  const entitiesResult = await fetchAllRows(() => db
    .from('map_entities')
    .select('*')
    .eq('project_id', project.id)
    .eq('segment_id', segment.id)
    .eq('is_archived', false));

  if (entitiesResult.error) {
    if (isMissingMapSegmentInfrastructure(entitiesResult.error)) {
      throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
    }
    throw entitiesResult.error;
  }

  const entityRows = (entitiesResult.data ?? []) as EntityRow[];
  if (entityRows.length === 0) throw commissionMapError('MAP_SEGMENT_EMPTY');

  const entityIds = entityRows.map((entity) => entity.id);
  const layerIds = [...new Set(entityRows.map((entity) => entity.layer_id))];
  const [layersResult, geometriesResult, lotsResult] = await Promise.all([
    db.from('map_layers').select('*').eq('project_id', project.id).in('id', layerIds).order('sort_order'),
    fetchAllRows(() => db.from('map_entity_geometries').select('*').eq('project_id', project.id).eq('is_current', true).in('entity_id', entityIds)),
    fetchAllRows(() => db.from('commercial_lots').select(`
      *,
      lot_prices(is_active, pricing_mode, base_price, price_per_sqm, asking_price, minimum_price),
      lot_reservations(status, company_name, expires_at, responsible_name),
      lot_negotiations(status, company_name, contact_name),
      lot_sales(status, buyer_name, sale_date, salesperson_name, contract_number),
      lot_contracts(is_active, contract_number)
    `).eq('project_id', project.id).is('archived_at', null).in('entity_id', entityIds)),
  ]);

  const firstError = [layersResult, geometriesResult, lotsResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const geometryByEntity = new Map<string, GeometryRow>(
    (geometriesResult.data ?? []).map((row: GeometryRow) => [row.entity_id, row]),
  );
  const entities = entityRows
    .filter((row) => geometryByEntity.has(row.id))
    .map((row) => mapEntity(row, geometryByEntity.get(row.id)!, localSegment.id));

  if (entities.length !== entityRows.length) {
    throw commissionMapError('MAP_SEGMENT_GEOMETRY_INCOMPLETE');
  }
  const lotRows = (lotsResult.data ?? []) as LotRow[];
  if (!isCommissionInventoryConsistent({
    expectedEntityCount,
    expectedLotCount,
    entityIds,
    lotEntityIds: lotRows.map((lot) => lot.entity_id),
  })) {
    throw commissionMapError('MAP_SEGMENT_INVENTORY_MISMATCH');
  }

  return {
    source: 'database',
    sourceMessage: project.isPublished
      ? null
      : 'O segmento está vinculado a uma versão cartográfica ainda não publicada.',
    project,
    // A calibration may reference the complete park plan. Commission scopes
    // deliberately omit it so the API response cannot reveal off-segment geometry.
    calibration: null,
    layers: (layersResult.data ?? []).map(mapLayer),
    entities,
    lots: lotRows.map(mapLot),
    scope: {
      mode: 'commission',
      commissionId: scope.commissionId,
      segmentId: localSegment.id,
      boundaryData: segment.boundary_data,
      cameraConfig: segment.camera_config,
    },
  };
}

export async function fetchCommercialMap(
  orgId: string,
  scope: CommercialMapQueryScope = { mode: 'full' },
): Promise<CommercialMapData> {
  if (scope.mode === 'full') {
    const maintenance = await db.rpc('expire_commercial_reservations', { p_org_id: orgId });
    if (maintenance.error && !isMissingReservationMaintenance(maintenance.error)) throw maintenance.error;
  }
  const { data: projectRow, error: projectError } = await db
    .from('map_projects')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (projectError) {
    if (isMissingMapInfrastructure(projectError)) {
      if (scope.mode === 'commission') {
        throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
      }
      return {
        ...OFFICIAL_REFERENCE_DATA,
        sourceMessage: 'A infraestrutura cartográfica aguarda a aplicação da migration. A referência oficial 2026 permanece disponível em modo seguro de leitura.',
      };
    }
    throw projectError;
  }

  if (!projectRow) {
    if (scope.mode === 'commission') {
      throw commissionMapError('MAP_SEGMENT_CONFIGURATION_UNAVAILABLE');
    }
    return OFFICIAL_REFERENCE_DATA;
  }
  const project = mapProject(projectRow);

  if (scope.mode === 'commission') {
    return fetchCommissionCommercialMap(project, scope);
  }

  const [
    layersResult,
    entitiesResult,
    geometriesResult,
    calibrationResult,
    lotsResult,
    lotPresenceResult,
    segmentsResult,
  ] = await Promise.all([
    db.from('map_layers').select('*').eq('project_id', project.id).order('sort_order'),
    fetchAllRows(() => db.from('map_entities').select('*').eq('project_id', project.id).eq('is_archived', false)),
    fetchAllRows(() => db.from('map_entity_geometries').select('*').eq('project_id', project.id).eq('is_current', true)),
    db.from('map_calibrations').select('*').eq('project_id', project.id).order('version', { ascending: false }).limit(1).maybeSingle(),
    fetchAllRows(() => db.from('commercial_lots').select('*, lot_prices(*), lot_reservations(*), lot_negotiations(*), lot_sales(*), lot_contracts(*)').eq('project_id', project.id).is('archived_at', null)),
    db.from('commercial_lots').select('id').eq('project_id', project.id).limit(1),
    db.from('map_segments').select('id, slug').eq('project_id', project.id).eq('is_active', true),
  ]);

  const segmentLookupError = segmentsResult.error
    && !isMissingMapSegmentInfrastructure(segmentsResult.error)
    ? segmentsResult.error
    : null;
  const firstError = [
    layersResult,
    entitiesResult,
    geometriesResult,
    calibrationResult,
    lotsResult,
    lotPresenceResult,
  ]
    .find((result) => result.error)?.error;
  if (firstError || segmentLookupError) throw firstError ?? segmentLookupError;
  const segmentSlugById = new Map<string, CommercialMapSegmentId>(
    ((segmentsResult.data ?? []) as SegmentLookupRow[])
      .map((segment) => [segment.id, segment.slug] as const)
      .filter((entry): entry is readonly [string, CommercialMapSegmentId] => (
        Boolean(getCommercialMapSegment(entry[1] as CommercialMapSegmentId))
      )),
  );
  const geometryByEntity = new Map<string, GeometryRow>((geometriesResult.data ?? []).map((row: GeometryRow) => [row.entity_id, row]));
  const entities = (entitiesResult.data ?? [])
    .filter((row: EntityRow) => geometryByEntity.has(row.id))
    .map((row: EntityRow) => mapEntity(
      row,
      geometryByEntity.get(row.id)!,
      row.segment_id ? segmentSlugById.get(row.segment_id) : undefined,
    ));
  const entityRows = (entitiesResult.data ?? []) as EntityRow[];
  const lotRows = (lotsResult.data ?? []) as LotRow[];

  if (isClearlyLegacy2024Seed(projectRow as ProjectRow, entityRows, (lotPresenceResult.data ?? []).length > 0)) {
    return {
      ...OFFICIAL_REFERENCE_DATA,
      sourceMessage: 'A base persistida ainda contém somente a referência oficial 2024 e não possui lotes comerciais. A referência 2026 está sendo exibida em modo seguro de leitura; a atualização persistida exige uma ação explícita de um administrador e nenhum dado foi alterado automaticamente.',
    };
  }

  return reconcileExporuralReference({
    source: 'database',
    sourceMessage: project.isPublished ? null : 'Projeto cartográfico em rascunho. Alterações ainda não estão publicadas para toda a equipe.',
    project,
    calibration: await signedReferenceUrl(calibrationResult.data ? mapCalibration(calibrationResult.data) : null),
    layers: (layersResult.data ?? []).map(mapLayer),
    entities,
    lots: lotRows.map(mapLot),
  });
}

export async function bootstrapOfficialReference(orgId: string): Promise<string> {
  const source = OFFICIAL_REFERENCE_DATA;
  const entityIdentifierById = new Map(source.entities.map((entity) => [entity.id, entity.publicIdentifier]));
  const { data, error } = await db.rpc('sync_commercial_map_reference_2026', {
    p_org_id: orgId,
    p_project: {
      ...source.project,
      referenceRevision: OFFICIAL_REFERENCE_REVISION,
    },
    p_layers: source.layers.map((layer) => ({
      key: layer.key,
      name: layer.name,
      description: layer.description,
      color: layer.color,
      opacity: layer.opacity,
      isVisible: layer.isVisible,
      isLocked: layer.isLocked,
      sortOrder: layer.sortOrder,
    })),
    p_entities: source.entities.map((entity) => ({
      publicIdentifier: entity.publicIdentifier,
      name: entity.name,
      description: entity.description,
      classification: entity.classification,
      layerKey: entity.layerId.replace('reference:', ''),
      parentPublicIdentifier: typeof entity.metadata.parentPublicIdentifier === 'string'
        ? entity.metadata.parentPublicIdentifier
        : null,
      verificationStatus: entity.verificationStatus,
      isSellable: entity.isSellable,
      geometry: entity.geometry,
      metadata: {
        ...entity.metadata,
        seedManaged: true,
        sourceRevision: entity.metadata.sourceRevision,
      },
    })),
    p_lots: source.lots.map((lot) => ({
      publicIdentifier: lot.publicIdentifier,
      entityPublicIdentifier: entityIdentifierById.get(lot.entityId) ?? lot.publicIdentifier,
      block: lot.block,
      lotNumber: lot.lotNumber,
      levelLabel: lot.levelLabel,
      displayName: lot.displayName,
      description: lot.description,
      infrastructure: lot.infrastructure,
      hasElectricity: lot.hasElectricity,
      hasWater: lot.hasWater,
      hasInternet: lot.hasInternet,
      isCorner: lot.isCorner,
      isCovered: lot.isCovered,
      accessibilityNotes: lot.accessibilityNotes,
      officialAreaSqm: lot.officialAreaSqm,
      calculatedAreaSqm: lot.calculatedAreaSqm,
      areaValidationStatus: lot.areaValidationStatus,
    })),
    p_calibration: source.calibration ? {
      referenceImagePath: source.calibration.referenceImagePath,
      opacity: source.calibration.opacity,
      isLocked: source.calibration.isLocked,
      imageOffsetX: source.calibration.imageOffsetX,
      imageOffsetY: source.calibration.imageOffsetY,
      imageScaleX: source.calibration.imageScaleX,
      imageScaleY: source.calibration.imageScaleY,
      imageRotationDegrees: source.calibration.imageRotationDegrees,
      pointA: source.calibration.pointA,
      pointB: source.calibration.pointB,
      knownDistanceMeters: source.calibration.knownDistanceMeters,
      mapUnitsPerMeter: source.calibration.mapUnitsPerMeter,
    } : {},
  });
  if (error) {
    if (isMissingReferenceSync(error)) {
      const migrationError = new Error('A sincronização segura do mapa 2026 ainda não está disponível no banco. Aplique a migration 20260711010000_upgrade_commercial_map_2026 antes de tentar novamente.');
      (migrationError as Error & { cause?: unknown }).cause = error;
      throw migrationError;
    }
    throw error;
  }
  return String(data);
}

export async function applyExporuralReference(orgId: string) {
  const source = OFFICIAL_REFERENCE_DATA;
  const entities = source.entities.filter((entity) => entity.metadata.areaCode === 'EXPORURAL');
  const entityIdentifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  const lots = source.lots.filter((lot) => entityIdentifiers.has(lot.publicIdentifier));
  const { data, error } = await db.rpc('apply_exporural_reference_2026', {
    p_org_id: orgId,
    p_source_revision: OFFICIAL_REFERENCE_REVISION,
    p_entities: entities.map((entity) => ({
      publicIdentifier: entity.publicIdentifier,
      name: entity.name,
      description: entity.description,
      classification: entity.classification,
      layerKey: entity.layerId.replace('reference:', ''),
      parentPublicIdentifier: typeof entity.metadata.parentPublicIdentifier === 'string'
        ? entity.metadata.parentPublicIdentifier
        : null,
      verificationStatus: entity.verificationStatus,
      isSellable: entity.isSellable,
      geometry: entity.geometry,
      metadata: {
        ...entity.metadata,
        seedManaged: true,
        sourceRevision: OFFICIAL_REFERENCE_REVISION,
      },
    })),
    p_lots: lots.map((lot) => ({
      publicIdentifier: lot.publicIdentifier,
      block: lot.block,
      lotNumber: lot.lotNumber,
      levelLabel: lot.levelLabel,
      displayName: lot.displayName,
      description: lot.description,
      officialAreaSqm: lot.officialAreaSqm,
      calculatedAreaSqm: lot.calculatedAreaSqm,
      areaValidationStatus: lot.areaValidationStatus,
      infrastructure: lot.infrastructure,
      hasElectricity: lot.hasElectricity,
      hasWater: lot.hasWater,
      hasInternet: lot.hasInternet,
      isCorner: lot.isCorner,
      isCovered: lot.isCovered,
      accessibilityNotes: lot.accessibilityNotes,
    })),
  });
  if (error) throw error;
  return data as {
    projectId: string;
    snapshotId: string;
    referenceRevision: string;
    geometryRevision: string;
    geometriesVersioned: number;
    lotsValidated: number;
  };
}

export async function saveGeometryRevision(params: {
  geometryId: string;
  geometry: PolygonGeometry;
  expectedVersion: number;
  reason: string;
}) {
  const { data, error } = await db.rpc('save_map_geometry', {
    p_geometry_id: params.geometryId,
    p_geometry: { type: 'Polygon', coordinates: params.geometry.coordinates },
    p_elevation: params.geometry.elevation,
    p_extrusion_height: params.geometry.extrusionHeight,
    p_rotation: params.geometry.rotation,
    p_expected_version: params.expectedVersion,
    p_change_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function createCommercialLot(params: {
  projectId: string;
  layerId: string;
  parentEntityId: string | null;
  publicIdentifier: string;
  displayName: string;
  description?: string;
  classification: 'SELLABLE_LOT' | 'INTERNAL_STAND';
  geometry: PolygonGeometry;
  block?: string;
  lotNumber?: string;
  levelLabel?: string;
  officialAreaSqm?: number | null;
  areaValidationStatus: 'UNVALIDATED' | 'VALIDATED';
  frontageMeters?: number | null;
  depthMeters?: number | null;
  pricingMode: CommercialLot['pricingMode'];
  fixedTotal?: number | null;
  pricePerSqm?: number | null;
  askingPrice?: number | null;
  minimumPrice?: number | null;
  reason: string;
}) {
  const { data, error } = await db.rpc('create_commercial_lot', {
    p_project_id: params.projectId,
    p_layer_id: params.layerId,
    p_parent_entity_id: params.parentEntityId,
    p_public_identifier: params.publicIdentifier,
    p_display_name: params.displayName,
    p_description: params.description || null,
    p_classification: params.classification,
    p_geometry: { type: 'Polygon', coordinates: params.geometry.coordinates },
    p_elevation: params.geometry.elevation,
    p_extrusion_height: params.geometry.extrusionHeight,
    p_block: params.block || null,
    p_lot_number: params.lotNumber || null,
    p_level_label: params.levelLabel || null,
    p_official_area_sqm: params.officialAreaSqm ?? null,
    p_area_validation_status: params.areaValidationStatus,
    p_frontage_meters: params.frontageMeters ?? null,
    p_depth_meters: params.depthMeters ?? null,
    p_pricing_mode: params.pricingMode,
    p_fixed_total: params.fixedTotal ?? null,
    p_price_per_sqm: params.pricePerSqm ?? null,
    p_asking_price: params.askingPrice ?? null,
    p_minimum_price: params.minimumPrice ?? null,
    p_calibration_version: params.geometry.calibrationVersion,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function splitCommercialLot(params: {
  sourceLotId: string;
  firstIdentifier: string;
  firstName: string;
  firstGeometry: PolygonGeometry;
  secondIdentifier: string;
  secondName: string;
  secondGeometry: PolygonGeometry;
  reason: string;
}): Promise<{ lotIds: string[]; entityIds: string[] }> {
  const { data, error } = await db.rpc('split_commercial_lot', {
    p_source_lot_id: params.sourceLotId,
    p_first_identifier: params.firstIdentifier,
    p_first_name: params.firstName,
    p_first_geometry: { type: 'Polygon', coordinates: params.firstGeometry.coordinates },
    p_second_identifier: params.secondIdentifier,
    p_second_name: params.secondName,
    p_second_geometry: { type: 'Polygon', coordinates: params.secondGeometry.coordinates },
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function mergeCommercialLots(params: {
  sourceLotIds: [string, string];
  publicIdentifier: string;
  displayName: string;
  geometry: PolygonGeometry;
  reason: string;
}): Promise<{ lotId: string; entityId: string }> {
  const { data, error } = await db.rpc('merge_commercial_lots', {
    p_source_lot_ids: params.sourceLotIds,
    p_public_identifier: params.publicIdentifier,
    p_display_name: params.displayName,
    p_geometry: { type: 'Polygon', coordinates: params.geometry.coordinates },
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function updateCommercialLot(params: {
  lotId: string;
  expectedUpdatedAt: string;
  patch: {
    publicIdentifier: string;
    displayName: string;
    description: string;
    block: string;
    lotNumber: string;
    levelLabel: string;
    officialAreaSqm: number | null;
    areaValidationStatus: 'UNVALIDATED' | 'VALIDATED';
    frontageMeters: number | null;
    depthMeters: number | null;
    pricingMode: CommercialLot['pricingMode'];
    fixedTotal: number | null;
    pricePerSqm: number | null;
    minimumPrice: number | null;
    infrastructure: string[];
    hasElectricity: boolean;
    hasWater: boolean;
    hasInternet: boolean;
    isCorner: boolean;
    isCovered: boolean;
    accessibilityNotes: string;
    commercialNotes: string;
    internalNotes: string;
  };
  reason: string;
}) {
  const { data, error } = await db.rpc('update_commercial_lot', {
    p_lot_id: params.lotId,
    p_expected_updated_at: params.expectedUpdatedAt,
    p_patch: params.patch,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function setCommercialLotAvailability(params: {
  lotId: string;
  status: Extract<CommercialLot['status'], 'AVAILABLE' | 'BLOCKED' | 'UNAVAILABLE'>;
  reason: string;
}) {
  const { data, error } = await db.rpc('set_commercial_lot_availability', {
    p_lot_id: params.lotId,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function setMapLayerLock(params: { layerId: string; isLocked: boolean; reason: string }) {
  const { data, error } = await db.rpc('set_map_layer_lock', {
    p_layer_id: params.layerId,
    p_is_locked: params.isLocked,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function setMapEntityVerification(params: { entityId: string; status: 'NEEDS_REVIEW' | 'VERIFIED'; reason: string }) {
  const { data, error } = await db.rpc('set_map_entity_verification', {
    p_entity_id: params.entityId,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function publishCommercialMap(params: { projectId: string; reason: string }) {
  const { data, error } = await db.rpc('publish_commercial_map', {
    p_project_id: params.projectId,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function saveMapCalibration(params: {
  projectId: string;
  referenceImagePath: string | null;
  opacity: number;
  isLocked: boolean;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScaleX: number;
  imageScaleY: number;
  imageRotationDegrees: number;
  pointA: [number, number] | null;
  pointB: [number, number] | null;
  knownDistanceMeters: number | null;
  mapUnitsPerMeter: number | null;
  status: 'UNVALIDATED' | 'VALIDATED' | 'INVALIDATED';
  reason: string;
}) {
  const { data, error } = await db.rpc('save_map_calibration', {
    p_project_id: params.projectId,
    p_reference_image_path: params.referenceImagePath,
    p_opacity: params.opacity,
    p_is_locked: params.isLocked,
    p_image_offset_x: params.imageOffsetX,
    p_image_offset_y: params.imageOffsetY,
    p_image_scale_x: params.imageScaleX,
    p_image_scale_y: params.imageScaleY,
    p_image_rotation_degrees: params.imageRotationDegrees,
    p_point_a: params.pointA,
    p_point_b: params.pointB,
    p_known_distance_meters: params.knownDistanceMeters,
    p_map_units_per_meter: params.mapUnitsPerMeter,
    p_status: params.status,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data;
}

export async function uploadMapReference(params: { orgId: string; projectId: string; file: File }) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(params.file.type)) throw new Error('Envie uma imagem JPEG, PNG ou WebP.');
  if (params.file.size > 25 * 1024 * 1024) throw new Error('A imagem de referência deve ter no máximo 25 MB.');
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(params.file);
    const tooLarge = bitmap.width > 4096 || bitmap.height > 4096;
    bitmap.close();
    if (tooLarge) throw new Error('A referência de trabalho deve ter no máximo 4096 × 4096 px. Preserve o original fora do renderer.');
  }
  const extension = params.file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const objectPath = `${params.orgId}/${params.projectId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('map-references').upload(objectPath, params.file, {
    cacheControl: '3600',
    contentType: params.file.type,
    upsert: false,
  });
  if (error) throw error;
  return objectPath;
}

export async function reserveLot(params: {
  lotId: string;
  companyName: string;
  documentNumber?: string;
  contactName: string;
  phone?: string;
  email?: string;
  expiresAt: string;
  notes?: string;
}) {
  const { data, error } = await db.rpc('reserve_commercial_lot', {
    p_lot_id: params.lotId,
    p_company_name: params.companyName,
    p_document_number: params.documentNumber || null,
    p_contact_name: params.contactName,
    p_phone: params.phone || null,
    p_email: params.email || null,
    p_expires_at: params.expiresAt,
    p_notes: params.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function startLotNegotiation(params: {
  lotId: string;
  companyName: string;
  documentNumber?: string;
  contactName?: string;
  proposedValue?: number | null;
  notes?: string;
}) {
  const { data, error } = await db.rpc('start_commercial_negotiation', {
    p_lot_id: params.lotId,
    p_company_name: params.companyName,
    p_document_number: params.documentNumber || null,
    p_contact_name: params.contactName || null,
    p_proposed_value: params.proposedValue ?? null,
    p_notes: params.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function registerLotSale(params: {
  lotId: string;
  buyerName: string;
  documentNumber?: string;
  negotiatedValue: number;
  saleDate: string;
  salespersonName: string;
  contractNumber?: string;
  paymentStatus?: string;
  notes?: string;
}) {
  const { data, error } = await db.rpc('register_commercial_sale', {
    p_lot_id: params.lotId,
    p_buyer_name: params.buyerName,
    p_document_number: params.documentNumber || null,
    p_negotiated_value: params.negotiatedValue,
    p_sale_date: params.saleDate,
    p_salesperson_name: params.salespersonName,
    p_contract_number: params.contractNumber || null,
    p_payment_status: params.paymentStatus || 'PENDING',
    p_notes: params.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function uploadLotContract(params: { orgId: string; lotId: string; file: File; contractNumber?: string }) {
  const validationError = validateContractFile(params.file);
  if (validationError) throw new Error(validationError);
  const extension = params.file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const objectPath = `${params.orgId}/${params.lotId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('map-contracts').upload(objectPath, params.file, {
    cacheControl: '3600',
    contentType: params.file.type,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await db.rpc('register_lot_contract_version', {
    p_lot_id: params.lotId,
    p_storage_path: objectPath,
    p_original_name: params.file.name,
    p_mime_type: params.file.type,
    p_file_size: params.file.size,
    p_contract_number: params.contractNumber || null,
  });
  if (error) {
    await supabase.storage.from('map-contracts').remove([objectPath]);
    throw error;
  }
  return data;
}

export async function getContractSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from('map-contracts').createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function fetchLotContractVersions(lotId: string): Promise<LotContractVersion[]> {
  const { data, error } = await db
    .from('lot_contracts')
    .select('contract_number, lot_contract_versions(*)')
    .eq('lot_id', lotId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  const versions = data?.lot_contract_versions ?? [];
  return Promise.all(versions.map(async (version: {
    id: string; version: number; storage_path: string; original_name: string; mime_type: string;
    file_size: number; uploaded_at: string; superseded_at: string | null;
  }) => ({
    id: version.id,
    contractNumber: data.contract_number,
    version: version.version,
    originalName: version.original_name,
    mimeType: version.mime_type,
    fileSize: Number(version.file_size),
    uploadedAt: version.uploaded_at,
    supersededAt: version.superseded_at,
    signedUrl: await getContractSignedUrl(version.storage_path),
  })));
}

export async function fetchLotActivity(lotId: string): Promise<MapActivity[]> {
  const { data, error } = await db.from('map_activity_logs').select('*').eq('lot_id', lotId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((row: ActivityRow) => ({
    id: row.id,
    entityId: row.entity_id,
    lotId: row.lot_id,
    action: row.action,
    reason: row.reason,
    actorUserId: row.actor_user_id,
    beforeState: row.before_state,
    afterState: row.after_state,
    createdAt: row.created_at,
  }));
}

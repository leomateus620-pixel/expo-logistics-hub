import { supabase } from '@/integrations/supabase/client';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2024';
import type {
  CommercialLot,
  CommercialMapData,
  LotContractVersion,
  MapActivity,
  MapCalibration,
  MapEntity,
  MapLayer,
  MapProject,
  PolygonGeometry,
} from '../types';
import { validateContractFile } from '../utils/contracts';

interface ProjectRow {
  id: string; org_id: string; name: string; description: string | null; coordinate_system: MapProject['coordinateSystem'];
  reference_width: number | string; reference_height: number | string; active_version: number; is_published: boolean;
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
  name: string; description: string | null; classification: MapEntity['classification'];
  verification_status: MapEntity['verificationStatus']; is_sellable: boolean; is_archived: boolean; metadata: Record<string, unknown> | null;
}
interface GeometryRow {
  id: string; entity_id: string; geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  elevation: number | string; extrusion_height: number | string; rotation: number | string; version: number; calibration_version: number | null;
}
interface PriceRow { is_active: boolean; pricing_mode: CommercialLot['pricingMode']; base_price: number | string | null; price_per_sqm: number | string | null; asking_price: number | string | null; minimum_price: number | string | null; }
interface ReservationRow { status: string; company_name: string; expires_at: string; responsible_name: string | null; }
interface SaleRow { status: string; buyer_name: string; sale_date: string; salesperson_name: string; contract_number: string | null; }
interface LotRow {
  id: string; entity_id: string; public_identifier: string; block: string | null; lot_number: string | null; level_label: string | null; display_name: string;
  description: string | null; status: CommercialLot['status']; official_area_sqm: number | string | null; calculated_area_sqm: number | string | null;
  area_validation_status: CommercialLot['areaValidationStatus']; frontage_meters: number | string | null; depth_meters: number | string | null;
  lot_prices: PriceRow[] | PriceRow | null; lot_reservations: ReservationRow[] | null; lot_sales: SaleRow[] | null;
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

function isMissingMapInfrastructure(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || Boolean(error.message?.includes('map_projects') && error.message.includes('schema cache'));
}

function isMissingReservationMaintenance(error: { code?: string; message?: string }): boolean {
  return error.code === '42883'
    || error.code === 'PGRST202'
    || Boolean(error.message?.includes('expire_commercial_reservations') && error.message.includes('schema cache'));
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

function mapEntity(row: EntityRow, geometryRow: GeometryRow): MapEntity {
  const storedGeometry = geometryRow.geometry;
  return {
    id: row.id,
    projectId: row.project_id,
    layerId: row.layer_id,
    parentEntityId: row.parent_entity_id,
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
    metadata: row.metadata ?? {},
  };
}

function mapLot(row: LotRow): CommercialLot {
  const price = Array.isArray(row.lot_prices) ? row.lot_prices.find((candidate: PriceRow) => candidate.is_active) : row.lot_prices;
  const activeReservation = Array.isArray(row.lot_reservations)
    ? row.lot_reservations.find((candidate: ReservationRow) => candidate.status === 'ACTIVE')
    : null;
  const sale = Array.isArray(row.lot_sales) ? row.lot_sales.find((candidate: SaleRow) => candidate.status === 'CONFIRMED') : null;
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
    currentBuyer: sale?.buyer_name ?? activeReservation?.company_name ?? null,
    reservationExpiresAt: activeReservation?.expires_at ?? null,
    saleDate: sale?.sale_date ?? null,
    salespersonName: sale?.salesperson_name ?? activeReservation?.responsible_name ?? null,
    activeContractNumber: sale?.contract_number ?? null,
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

export async function fetchCommercialMap(orgId: string): Promise<CommercialMapData> {
  const maintenance = await db.rpc('expire_commercial_reservations', { p_org_id: orgId });
  if (maintenance.error && !isMissingReservationMaintenance(maintenance.error)) throw maintenance.error;
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
      return {
        ...OFFICIAL_REFERENCE_DATA,
        sourceMessage: 'A infraestrutura cartográfica aguarda a aplicação da migration. A referência oficial permanece disponível em modo seguro de leitura.',
      };
    }
    throw projectError;
  }

  if (!projectRow) return OFFICIAL_REFERENCE_DATA;
  const project = mapProject(projectRow);

  const [layersResult, entitiesResult, geometriesResult, calibrationResult, lotsResult] = await Promise.all([
    db.from('map_layers').select('*').eq('project_id', project.id).order('sort_order'),
    db.from('map_entities').select('*').eq('project_id', project.id).eq('is_archived', false),
    db.from('map_entity_geometries').select('*').eq('project_id', project.id).eq('is_current', true),
    db.from('map_calibrations').select('*').eq('project_id', project.id).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('commercial_lots').select('*, lot_prices(*), lot_reservations(*), lot_sales(*)').eq('project_id', project.id).is('archived_at', null),
  ]);

  const firstError = [layersResult, entitiesResult, geometriesResult, calibrationResult, lotsResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const geometryByEntity = new Map<string, GeometryRow>((geometriesResult.data ?? []).map((row: GeometryRow) => [row.entity_id, row]));
  const entities = (entitiesResult.data ?? [])
    .filter((row: EntityRow) => geometryByEntity.has(row.id))
    .map((row: EntityRow) => mapEntity(row, geometryByEntity.get(row.id)!));

  return {
    source: 'database',
    sourceMessage: project.isPublished ? null : 'Projeto cartográfico em rascunho. Alterações ainda não estão publicadas para toda a equipe.',
    project,
    calibration: await signedReferenceUrl(calibrationResult.data ? mapCalibration(calibrationResult.data) : null),
    layers: (layersResult.data ?? []).map(mapLayer),
    entities,
    lots: (lotsResult.data ?? []).map(mapLot),
  };
}

export async function bootstrapOfficialReference(orgId: string): Promise<string> {
  const source = OFFICIAL_REFERENCE_DATA;
  const { data, error } = await db.rpc('bootstrap_commercial_map', {
    p_org_id: orgId,
    p_project: source.project,
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
      geometry: entity.geometry,
      metadata: entity.metadata,
    })),
    p_calibration: { opacity: source.calibration?.opacity ?? 0.28 },
  });
  if (error) throw error;
  return String(data);
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

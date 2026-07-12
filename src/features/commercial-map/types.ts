export type MapClassification =
  | 'SELLABLE_LOT'
  | 'INTERNAL_STAND'
  | 'QUADRA'
  | 'PAVILION'
  | 'BUILDING'
  | 'RESTAURANT'
  | 'FOOD_AREA'
  | 'RESTROOM'
  | 'CHEMICAL_RESTROOM'
  | 'GATE'
  | 'PARKING'
  | 'ROAD'
  | 'PEDESTRIAN_PATH'
  | 'GREEN_AREA'
  | 'TREE'
  | 'WATER'
  | 'ADMINISTRATION'
  | 'SECURITY'
  | 'EMERGENCY'
  | 'SERVICE'
  | 'ATTRACTION'
  | 'EVENT_VENUE'
  | 'LIVESTOCK_AREA'
  | 'RURAL_EXHIBITION'
  | 'RESTRICTED_AREA'
  | 'LANDMARK'
  | 'OTHER';

export type CommercialStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_NEGOTIATION'
  | 'SOLD'
  | 'BLOCKED'
  | 'UNAVAILABLE';

export type VerificationStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'VERIFIED' | 'ARCHIVED';
export type AreaValidationStatus = 'UNVALIDATED' | 'CALCULATED' | 'VALIDATED' | 'REJECTED';
export type PricingMode = 'FIXED_TOTAL' | 'PRICE_PER_SQUARE_METER' | 'NEGOTIABLE' | 'NOT_FOR_SALE';
export type MapSource = 'database' | 'official-reference';
export type MapPanel = 'layers' | 'results' | 'details' | 'calibration' | null;
export type MapWorkspaceMode = '3d' | 'list' | 'edit' | 'create';
export type CameraPreset = 'overview' | 'top' | 'isometric' | 'commercial' | 'pavilions' | 'parking' | 'gates';
export type EntitySortOrder = 'relevance' | 'name' | 'location' | 'status';
export type EntityTableDensity = 'compact' | 'comfortable';

export type Coordinate = [number, number];

export interface PolygonGeometry {
  id: string | null;
  type: 'Polygon';
  /** GeoJSON-compatible linear rings in the local Fenasoja coordinate system. */
  coordinates: Coordinate[][];
  elevation: number;
  extrusionHeight: number;
  rotation: number;
  geometryVersion: number;
  calibrationVersion: number | null;
}

export interface MapProject {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  coordinateSystem: 'LOCAL_NORMALIZED' | 'GEOREFERENCED';
  referenceWidth: number;
  referenceHeight: number;
  activeVersion: number;
  isPublished: boolean;
  /** Version of the official cartographic reference synchronized into the project. */
  referenceRevision: string | null;
}

export interface MapCalibration {
  id: string;
  projectId: string;
  referenceImagePath: string | null;
  referenceImageUrl?: string | null;
  opacity: number;
  isLocked: boolean;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScaleX: number;
  imageScaleY: number;
  imageRotationDegrees: number;
  pointA: Coordinate | null;
  pointB: Coordinate | null;
  knownDistanceMeters: number | null;
  mapUnitsPerMeter: number | null;
  status: 'UNVALIDATED' | 'VALIDATED' | 'INVALIDATED';
  version: number;
}

export interface MapLayer {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  opacity: number;
  isVisible: boolean;
  isLocked: boolean;
  sortOrder: number;
}

export interface MapEntity {
  id: string;
  projectId: string;
  layerId: string;
  parentEntityId: string | null;
  publicIdentifier: string;
  name: string;
  description: string | null;
  classification: MapClassification;
  verificationStatus: VerificationStatus;
  isSellable: boolean;
  isArchived: boolean;
  geometry: PolygonGeometry;
  metadata: Record<string, unknown>;
}

export interface CommercialLot {
  id: string;
  entityId: string;
  publicIdentifier: string;
  block: string | null;
  lotNumber: string | null;
  levelLabel: string | null;
  displayName: string;
  description: string | null;
  status: CommercialStatus;
  officialAreaSqm: number | null;
  calculatedAreaSqm: number | null;
  areaValidationStatus: AreaValidationStatus;
  frontageMeters: number | null;
  depthMeters: number | null;
  pricingMode: PricingMode;
  basePrice: number | null;
  pricePerSqm: number | null;
  askingPrice: number | null;
  minimumPrice: number | null;
  infrastructure: string[];
  hasElectricity: boolean;
  hasWater: boolean;
  hasInternet: boolean;
  isCorner: boolean;
  isCovered: boolean;
  accessibilityNotes: string | null;
  commercialNotes: string | null;
  internalNotes: string | null;
  currentBuyer: string | null;
  reservationExpiresAt: string | null;
  saleDate: string | null;
  salespersonName: string | null;
  activeContractNumber: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MapActivity {
  id: string;
  entityId: string | null;
  lotId: string | null;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export interface LotContractVersion {
  id: string;
  contractNumber: string | null;
  version: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  supersededAt: string | null;
  signedUrl: string;
}

export interface CommercialMapData {
  source: MapSource;
  sourceMessage: string | null;
  project: MapProject;
  calibration: MapCalibration | null;
  layers: MapLayer[];
  entities: MapEntity[];
  lots: CommercialLot[];
}

export interface MapPermissions {
  canView: boolean;
  canEdit: boolean;
  canEditGeometry: boolean;
  canManageLots: boolean;
  canManageSales: boolean;
  canManageContracts: boolean;
  canManageLayers: boolean;
  isMapAdmin: boolean;
}

export interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  areaMapUnits: number;
}

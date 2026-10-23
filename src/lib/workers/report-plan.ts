import { buildCommercialMiniMapGeometry, commercialMiniMapNumberLabel, type MiniMapOutline } from '../../features/commercial-map/dashboard/commercialDashboardGeometry';
import type { CommercialLot, MapEntity } from '../../features/commercial-map/types';
import type { CommercialReportSnapshot } from './commercial-report';

/** Stable markers shared by chat and PDF; ambiguous occupancy never selects a company. */
export function buildReportPlanGroups(inventory: readonly CommercialReportSnapshot['inventory'][number][]) {
  type Lot=CommercialReportSnapshot['inventory'][number];
  const grouped=new Map<string,{name:string;lots:Lot[];states:Set<string>}>();
  for(const lot of inventory)for(const association of lot.associations.length===1?lot.associations:[]){
    if(!association.displayName)continue;
    const key=association.exhibitorId??association.rowId;
    const group=grouped.get(key)??{name:association.displayName,lots:[],states:new Set<string>()};
    group.lots.push(lot);group.states.add(association.state);grouped.set(key,group);
  }
  return [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,group],index)=>({...group,key,marker:index+1}));
}

/** Adapter to the same pure projection/anchor/fit contracts used by Dashboard. */
export function buildReportPlan(inventory: readonly CommercialReportSnapshot['inventory'][number][], outlines: readonly CommercialReportSnapshot['planOutlines'][number][] = []) {
  const items = inventory.flatMap(record => {
    if (!record.geometry) return [];
    const entity: MapEntity = { id: record.entityId, projectId: '', layerId: '', parentEntityId: null,
      segmentId: record.segmentId, publicIdentifier: '', name: record.lotLabel, description: null,
      classification: 'SELLABLE_LOT', verificationStatus: 'VERIFIED', isSellable: true, isArchived: false,
      geometry: { id: null, elevation: 0, extrusionHeight: 0, rotation: 0, geometryVersion: 0, calibrationVersion: null, type: 'Polygon', coordinates: record.geometry.coordinates.map(ring => ring.map(point => [point[0], point[1]])) },
      metadata: 'labelAnchor' in record && record.labelAnchor ? { labelAnchor: record.labelAnchor } : {} };
    const lot: CommercialLot = { id: record.lotId, entityId: record.entityId, publicIdentifier: '', block: record.block,
      lotNumber: record.lotNumber, levelLabel: null, displayName: record.lotLabel, description: null,
      status: record.status as CommercialLot['status'], officialAreaSqm: record.currentArea, calculatedAreaSqm: null,
      areaValidationStatus: 'UNVALIDATED', frontageMeters: null, depthMeters: null, pricingMode: 'NOT_FOR_SALE',
      basePrice: null, pricePerSqm: null, askingPrice: null, minimumPrice: null, infrastructure: [], hasElectricity: false,
      hasWater: false, hasInternet: false, isCorner: false, isCovered: false, accessibilityNotes: null,
      commercialNotes: null, internalNotes: null, currentBuyer: null, reservationExpiresAt: null, saleDate: null, salespersonName: null, activeContractNumber: null, archivedAt: null, createdBy: null, updatedBy: null, createdAt: null, updatedAt: null };
    return [{ lot, entity, value: null }];
  });
  const boundaries: MiniMapOutline[] = outlines.map(outline => ({ id: outline.id, label: outline.label, kind: outline.kind, color: '#71849b', coordinates: outline.geometry.coordinates.map(ring => ring.map(point => [point[0], point[1]] as [number, number])) }));
  const geometry = buildCommercialMiniMapGeometry(items, boundaries);
  return { geometry, numberLabel: commercialMiniMapNumberLabel };
}

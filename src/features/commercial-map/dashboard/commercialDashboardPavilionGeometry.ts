import { COMMERCIAL_PAVILION_MODULE_PLANS } from '../utils/commercialPavilionModules';
import { commercialPavilionModelBounds, createCommercialPavilionLayout } from '../utils/commercialPavilions';
import { resolveCommercialPavilionWayfindingMarkers } from '../utils/commercialPavilionWayfinding';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { validDashboardRing, type MiniMapOutline } from './commercialDashboardGeometry';
import type { DashboardAccessMarker } from './CommercialMiniMap';

export function buildDashboardPavilionGeometry(snapshot: CommercialPavilionDashboardSnapshot) {
  const plan = COMMERCIAL_PAVILION_MODULE_PLANS[snapshot.definition.publicIdentifier];
  const cellOrder = new Map(plan.cells.map((cell, index) => [cell.id, index]));
  const records = [...snapshot.records].sort((a, b) =>
    (cellOrder.get(String(a.entity.metadata.pavilionModuleKey)) ?? Infinity)
    - (cellOrder.get(String(b.entity.metadata.pavilionModuleKey)) ?? Infinity)
    || (a.lot.lotNumber ?? '').localeCompare(b.lot.lotNumber ?? '', 'pt-BR', { numeric: true }));
  const unmatched = records.filter((record) => !cellOrder.has(String(record.entity.metadata.pavilionModuleKey))).length;
  const pending: string[] = [];
  if (unmatched) pending.push(`${unmatched} módulos sem chave correspondente à referência oficial; geometria e numeração cadastrais preservadas.`);
  const outlines: MiniMapOutline[] = [];
  const accesses: DashboardAccessMarker[] = [];
  const ring = validDashboardRing(snapshot.entity?.geometry.coordinates[0]);
  if (!snapshot.entity || !ring) {
    pending.push('Perímetro e acessos pendentes: geometria do pavilhão não disponível.');
    return { records, outlines, accesses, pending, referenceCount: plan.cells.length };
  }
  outlines.push({ id: snapshot.entity.id, kind: 'pavilion', label: snapshot.definition.officialName,
    color: '#315543', coordinates: snapshot.entity.geometry.coordinates });
  const xs = ring.map(([x]) => x), zs = ring.map(([, z]) => z);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const facing = snapshot.definition.facingRadians;
  const bounds = commercialPavilionModelBounds({
    width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs),
  }, facing);
  const layout = createCommercialPavilionLayout(bounds, snapshot.definition, undefined, plan);
  // Same clear floor/projection as the standard map. Only explicitly referenced
  // wall accesses are included; generic facade entrances are never used.
  const markers = resolveCommercialPavilionWayfindingMarkers({
    ...plan, wallAccesses: plan.wallAccesses.map((access) => ({ ...access, showMarker: true })),
  }, { width: layout.interior.clearWidth, depth: layout.interior.clearDepth });
  const rotate = ([x, z]: readonly [number, number]): [number, number] => [
    x * Math.cos(facing) + z * Math.sin(facing), -x * Math.sin(facing) + z * Math.cos(facing),
  ];
  for (const marker of markers) {
    const [x, z] = rotate(marker.position);
    const direction: [number, number] = marker.edge === 'front' ? [0, 1]
      : marker.edge === 'rear' ? [0, -1] : marker.edge === 'left' ? [-1, 0] : [1, 0];
    accesses.push({ id: marker.id, label: marker.label, kind: marker.kind,
      position: [centerX + x, centerZ + z], outward: rotate(direction) });
  }
  if (!accesses.length) pending.push('Nenhuma entrada ou saída confirmada nas referências deste pavilhão.');
  return { records, outlines, accesses, pending, referenceCount: plan.cells.length };
}

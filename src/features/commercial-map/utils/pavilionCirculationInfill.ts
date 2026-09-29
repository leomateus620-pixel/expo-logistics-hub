import type { CommercialPavilionModulePlan, NormalizedCommercialPavilionRect } from './commercialPavilionModules';

/** Visual floor continuity in the empty notch of P1/141. Never a lot or a
 * cadastral corridor. Derive the complement from existing render parts. */
export function pavilionCirculationInfill(plan: CommercialPavilionModulePlan): NormalizedCommercialPavilionRect[] {
  if (plan.publicIdentifier !== 'B1') return [];
  const cell = plan.cells.find(cell => cell.number === 141);
  if (!cell?.shape) return [];
  const parts = cell.shape.renderParts;
  const xs = [...new Set(parts.flatMap(p => [p.centerX - p.width / 2, p.centerX + p.width / 2]))].sort((a,b) => a-b);
  const zs = [...new Set(parts.flatMap(p => [p.centerZ - p.depth / 2, p.centerZ + p.depth / 2]))].sort((a,b) => a-b);
  const result: NormalizedCommercialPavilionRect[] = [];
  for (let i=1;i<xs.length;i++) for (let j=1;j<zs.length;j++) {
    if (xs[i]-xs[i-1]<1e-8 || zs[j]-zs[j-1]<1e-8) continue;
    const centerX=(xs[i-1]+xs[i])/2, centerZ=(zs[j-1]+zs[j])/2;
    if (parts.some(p => Math.abs(centerX-p.centerX)<p.width/2+1e-9 && Math.abs(centerZ-p.centerZ)<p.depth/2+1e-9)) continue;
    result.push({centerX,centerZ,width:xs[i]-xs[i-1],depth:zs[j]-zs[j-1]});
  }
  return result;
}

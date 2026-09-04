import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { scopeCommercialMapData } from '@/modules/commissions/commissionMapPortalRegistry';
const ind = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA as any, 'industria-comercio-servicos');
console.log(ind.entities.map((e:any)=>e.publicIdentifier).join('\n'));

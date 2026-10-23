import type { CommercialReportSnapshot } from './commercial-report.ts';

export type CommercialReportGroup = CommercialReportSnapshot['groups'][number] & {documents?:number;availableLots?:number;soldMapLots?:number;saleOpenLots?:number;blockedLots?:number};

/** A document's exhibitors come only from its explicit lot/order links. */
export function commercialReportContracts(snapshot:CommercialReportSnapshot) {
  return snapshot.contracts.filter(contract=>snapshot.spec.documentFilter==='multi_lot'?contract.lotIds.length>1:snapshot.spec.documentFilter==='with_prior_versions'?contract.versionCount>1:true)
    .map(contract=>({...contract,exhibitors:[...new Map(snapshot.rows.filter(row=>contract.lotIds.includes(row.lotId)&&(contract.scope==='LOT'||row.orderId===contract.orderId))
      .map(row=>[row.exhibitorId??`missing:${row.id}`,{id:row.exhibitorId,displayName:row.displayName}])).values()]}))
    .sort((a,b)=>b.lotIds.length-a.lotIds.length||a.id.localeCompare(b.id));
}

/** Full deterministic presentation groups shared by chat and PDF. */
export function commercialReportGroups(snapshot:CommercialReportSnapshot):CommercialReportGroup[] {
  const spec=snapshot.spec;
  const inventoryGroups=new Map<string,CommercialReportGroup>();
  if(spec.reportFocus==='inventory')for(const lot of snapshot.inventory){
    const key=spec.groupBy==='status'?lot.status:lot.pavilionId??lot.segmentId??'unclassified';
    const label=spec.groupBy==='status'?lot.status:lot.pavilionName??lot.segmentName??'Área sem classificação';
    const group=inventoryGroups.get(key)??{key,label,lots:0,orders:0,exhibitors:0,principalCents:null,feesCents:null,historicalArea:null,availableLots:0,soldMapLots:0,saleOpenLots:0,blockedLots:0};
    group.lots++;if(lot.status==='AVAILABLE')group.availableLots++;if(lot.status==='SOLD')group.soldMapLots++;if(lot.status==='SALE_OPEN')group.saleOpenLots++;if(lot.status==='BLOCKED')group.blockedLots++;
    inventoryGroups.set(key,group);
  }
  const contractGroups=new Map<string,{group:CommercialReportGroup;documents:Set<string>;lots:Set<string>;orders:Set<string>}>();
  if(spec.reportFocus==='contracts')for(const contract of commercialReportContracts(snapshot)){
    const linked=snapshot.inventory.filter(lot=>contract.lotIds.includes(lot.lotId));
    const identities=spec.groupBy==='exhibitor'?(contract.exhibitors.length?contract.exhibitors.map(exhibitor=>({key:exhibitor.id??`missing:${contract.id}`,label:exhibitor.displayName??'Identidade não comprovada',lotId:null})):[{key:`missing:${contract.id}`,label:'Identidade não comprovada',lotId:null}]):linked.length?linked.map(lot=>({key:lot.pavilionId??lot.segmentId??'unclassified',label:lot.pavilionName??lot.segmentName??'Área sem classificação',lotId:lot.lotId})):[{key:'unclassified',label:'Área sem classificação',lotId:null}];
    for(const identity of identities){
      const key=spec.groupBy==='status'?(contract.active?'active':'inactive'):spec.groupBy==='none'?'all':identity.key;
      const label=spec.groupBy==='status'?(contract.active?'Ativos':'Inativos'):spec.groupBy==='none'?'Todos os documentos':identity.label;
      const entry=contractGroups.get(key)??{group:{key,label,lots:0,orders:0,exhibitors:0,principalCents:null,feesCents:null,historicalArea:null,documents:0},documents:new Set<string>(),lots:new Set<string>(),orders:new Set<string>()};
      entry.documents.add(contract.id);if(identity.lotId)entry.lots.add(identity.lotId);if(contract.orderId)entry.orders.add(contract.orderId);
      entry.group.documents=entry.documents.size;entry.group.lots=entry.lots.size;entry.group.orders=entry.orders.size;contractGroups.set(key,entry);
    }
  }
  const compare=(a:typeof snapshot.groups[number],b:typeof snapshot.groups[number])=>{
    const field=spec.sortBy==='area'?'historicalArea':spec.sortBy==='value'?'principalCents':spec.sortBy==='lots'?'lots':undefined;
    if(field){const left=a[field],right=b[field];if(left===null&&right!==null)return 1;if(right===null&&left!==null)return -1;const delta=Number(left)-Number(right);if(delta)return spec.sortDirection==='desc'?-delta:delta;}
    return a.label.localeCompare(b.label,'pt-BR')||a.key.localeCompare(b.key);
  };
  const groups=[...(spec.reportFocus==='inventory'?inventoryGroups.values():spec.reportFocus==='contracts'?[...contractGroups.values()].map(entry=>entry.group):snapshot.groups)].sort(compare);
  return groups;
}

/** Pure projection of a complete, authorized snapshot; no paginated totals or new reads. */
export function commercialReportPreview(snapshot: CommercialReportSnapshot) {
  const spec=snapshot.spec,groups=commercialReportGroups(snapshot);
  const monetary=!['inventory','contracts'].includes(spec.reportFocus)&&snapshot.capabilities.monetaryValues&&spec.sortBy!=='lots'&&groups.every(group=>group.principalCents!==null);
  const fullChart=groups.map(group=>({label:group.label,value:monetary?group.principalCents!:spec.reportFocus==='contracts'?group.documents??0:group.lots}));
  const chart=fullChart.slice(0,fullChart.length>20?19:20);
  if(fullChart.length>20){
    const remaining=fullChart.slice(19).reduce((sum,group)=>sum+group.value,0);
    if(!Number.isSafeInteger(remaining))throw new Error('Agregado fora da faixa numérica.');
    chart.push({label:fullChart.some(group=>group.label==='Outros')?'Demais grupos':'Outros',value:remaining});
  }
  const contracts=commercialReportContracts(snapshot);
  const inventory=snapshot.inventory.map(lot=>({lotId:lot.lotId,lotLabel:lot.lotLabel,block:lot.block,pavilionName:lot.pavilionName,segmentName:lot.segmentName,status:lot.status,currentArea:lot.currentArea,
    hasGeometry:lot.geometry!==null,associationCount:lot.associations.length}));
  const inventorySummary=[...new Set(inventory.map(lot=>lot.status))].sort().map(status=>({status,lots:inventory.filter(lot=>lot.status===status).length}));
  const contractSummary={total:contracts.length,active:contracts.filter(contract=>contract.active).length,inactive:contracts.filter(contract=>!contract.active).length,
    versions:contracts.reduce((sum,contract)=>sum+contract.versionCount,0),multiLot:contracts.filter(contract=>contract.lotIds.length>1).length,withPriorVersions:contracts.filter(contract=>contract.versionCount>1).length};
  const focus=spec.reportFocus;
  const inventoryGrouped=focus==='inventory'&&spec.groupBy!=='none';
  const rowCount=focus==='contracts'?contracts.length:inventoryGrouped?groups.length:focus==='inventory'?inventory.length:focus==='exhibitors'?groups.length:snapshot.rows.length;
  return {schemaVersion:snapshot.schemaVersion,snapshotId:snapshot.snapshotId,generatedAt:snapshot.generatedAt,generation:snapshot.generation,
    spec:snapshot.spec,scope:snapshot.scope,totals:snapshot.totals,coverage:snapshot.coverage,capabilities:snapshot.capabilities,
    rows:focus==='sales'?snapshot.rows.slice(0,25):[],groups:groups.slice(0,20),groupCount:groups.length,
    chart:{unit:monetary?'BRL' as const:'count' as const,data:chart.map(group=>({...group,value:monetary?group.value/100:group.value})),population:chart.length,sourceGroups:groups.length},
    contracts:focus==='contracts'?contracts.slice(0,25):[],contractCount:contracts.length,contractSummary,
    inventory:focus==='inventory'?inventory.slice(0,25):[],inventoryCount:inventory.length,inventorySummary,
    rowCount,previewCount:Math.min(focus==='exhibitors'||inventoryGrouped?20:25,rowCount),
    plan:{lotCount:snapshot.inventory.length,missingGeometryCount:snapshot.inventory.filter(lot=>!lot.geometry).length},notes:snapshot.notes.slice(0,8),
    ...(snapshot.comparison?{comparison:snapshot.comparison}:{}),
  };
}

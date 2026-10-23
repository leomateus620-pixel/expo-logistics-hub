import { z } from 'zod';
import { commercialReportSnapshotSchema, commercialReportRowSchema, commercialReportContractSchema } from './commercial-report.ts';
import { encodeWorkerResponse, commercialReportBlockSchema, type WorkerResponse, type WorkerResponseBlock } from './response-contract.ts';
import { redactWorkerText, WorkerError, type WorkerCitation, type WorkerRequest } from './contracts.ts';
import type { WorkerIntent } from './intent.ts';

const previewSchema = commercialReportSnapshotSchema.pick({schemaVersion:true,snapshotId:true,generatedAt:true,generation:true,spec:true,scope:true,totals:true,coverage:true,capabilities:true}).extend({
  rows:z.array(commercialReportRowSchema).max(25),groups:z.array(commercialReportSnapshotSchema.shape.groups.element.extend({documents:z.number().int().nonnegative().optional(),availableLots:z.number().int().nonnegative().optional(),soldMapLots:z.number().int().nonnegative().optional(),saleOpenLots:z.number().int().nonnegative().optional(),blockedLots:z.number().int().nonnegative().optional()})).max(20),
  contracts:z.array(commercialReportContractSchema.extend({exhibitors:z.array(z.object({id:z.string().uuid().nullable(),displayName:z.string().max(300).nullable()}).strict()).max(200)})).max(25),contractCount:z.number().int().nonnegative(),
  contractSummary:z.object({total:z.number().int().nonnegative(),active:z.number().int().nonnegative(),inactive:z.number().int().nonnegative(),versions:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),multiLot:z.number().int().nonnegative(),withPriorVersions:z.number().int().nonnegative()}).strict(),
  inventory:z.array(z.object({lotId:z.string().uuid(),lotLabel:z.string().max(300),block:z.string().max(120).nullable(),pavilionName:z.string().max(300).nullable(),segmentName:z.string().max(300).nullable(),status:z.string().max(40),currentArea:z.number().nonnegative().nullable(),hasGeometry:z.boolean(),associationCount:z.number().int().nonnegative()}).strict()).max(25),
  inventoryCount:z.number().int().nonnegative(),inventorySummary:z.array(z.object({status:z.string().max(40),lots:z.number().int().nonnegative()}).strict()).max(20),
  comparison:commercialReportSnapshotSchema.shape.comparison,
  rowCount:z.number().int().nonnegative(),previewCount:z.number().int().min(0).max(25),
  groupCount:z.number().int().nonnegative().optional(),
  chart:z.object({unit:z.enum(['BRL','count']),data:z.array(z.object({label:z.string().max(300),value:z.number().finite().nonnegative()}).strict()).max(20),population:z.number().int().nonnegative(),sourceGroups:z.number().int().nonnegative()}).strict(),
  plan:z.object({lotCount:z.number().int().nonnegative(),missingGeometryCount:z.number().int().nonnegative()}).strict(),
  notes:z.array(z.string().max(2000)).max(8),artifact:z.object({snapshotId:z.string().uuid(),reportId:z.string().uuid().optional(),status:commercialReportBlockSchema.shape.status,expiresAt:z.string().datetime({offset:true}).optional()}).strict().optional(),
}).strict();
const clean=(value:string)=>redactWorkerText(value).replace(/[<>`]/g,'').trim();
const label=(value:string)=>clean(value).slice(0,180);
const number=(value:number|null)=>value===null?'Não informado':value.toLocaleString('pt-BR',{maximumFractionDigits:2});
const currency=(value:number|null)=>value===null?'Não informado':(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const states:Record<string,string>={pending:'Aguardando assinatura',signed:'Assinatura confirmada',partial:'Pedido parcialmente assinado',legacy:'Legado sem comprovação',cancelled:'Cancelado',inconsistent:'Revisar associação'};
const mapStates:Record<string,string>={AVAILABLE:'Disponível',BLOCKED:'Bloqueado',RESERVED:'Reservado',IN_NEGOTIATION:'Em negociação',SALE_OPEN:'Venda em aberto',SOLD:'Vendido',UNAVAILABLE:'Indisponível'};
const issueLabels:Record<string,string>={SIGNATURE_SALE_MISMATCH:'Divergência entre assinatura e venda',LEGACY_UNVERIFIED:'Legado sem confirmação',HISTORICAL_AREA_MISSING:'Área negociada ausente',VALUE_MISSING_OR_INVALID:'Valor ausente ou inválido',EXHIBITOR_IDENTITY_MISSING:'Identidade empresarial não comprovada',FEES_UNRECONCILED:'Taxas sem conciliação',HISTORICAL_ENTITY_ARCHIVED:'Estrutura histórica arquivada',HISTORICAL_LOT_ARCHIVED:'Lote histórico arquivado',GEOMETRY_MISSING:'Geometria ausente',CURRENT_AREA_MISSING:'Área atual ausente'};

/** Builds every visible fact from one validated server snapshot, never model prose. */
export function composeCommercialReportResponse(request:WorkerRequest,intent:WorkerIntent,value:unknown,citations:WorkerCitation[]):{content:string;citations:WorkerCitation[]} {
  const parsed=previewSchema.safeParse(value);
  if(!parsed.success)throw new WorkerError('invalid_report_preview',502);
  const snapshot=parsed.data,{totals,spec,capabilities}=snapshot;
  const displayed=spec.reportFocus==='contracts'?snapshot.contracts:spec.reportFocus==='inventory'?(spec.groupBy==='none'?snapshot.inventory:snapshot.groups):spec.reportFocus==='exhibitors'?snapshot.groups:snapshot.rows;
  if(snapshot.scope.projectId!==spec.projectId||snapshot.previewCount!==displayed.length||snapshot.previewCount>snapshot.rowCount||snapshot.artifact&&snapshot.artifact.snapshotId!==snapshot.snapshotId)throw new WorkerError('report_snapshot_mismatch',502);
  const scopeLabels=(spec.scopeSearch.length?spec.scopeSearch:[snapshot.scope.projectName]).slice(0,20).map(label);
  const filters=[...spec.saleStates.map(state=>states[state]),...(spec.contractFilter==='without_document'?['Sem documento vinculado']:spec.contractFilter==='with_document'?['Com documento vinculado']:[]),
    ...(spec.geography==='internal'?['Interiores de pavilhões']:spec.geography==='external'?['Áreas externas']:[]),
    ...(spec.period?[`${spec.period.basis==='signed'?'Assinadas':'Cadastradas'} de ${spec.period.from.split('-').reverse().join('/')} a ${spec.period.to.split('-').reverse().join('/')}`]:[]),
    ...(spec.documentFilter==='multi_lot'?['Documentos que abrangem vários lotes']:spec.documentFilter==='with_prior_versions'?['Documentos com versões anteriores']:[]),
    ...spec.inventoryStates.map(state=>mapStates[state]??'Situação não detalhada'),
    ...(spec.companySearch?[`Empresa: ${clean(spec.companySearch)}`]:[]),
    ...(spec.minArea!==undefined?[`Área mínima: ${number(spec.minArea)} m²`]:[]),...(spec.maxArea!==undefined?[`Área máxima: ${number(spec.maxArea)} m²`]:[]),
    ...(spec.minValueCents!==undefined?[`Principal mínimo: ${currency(spec.minValueCents)}`]:[]),...(spec.maxValueCents!==undefined?[`Principal máximo: ${currency(spec.maxValueCents)}`]:[]),
    ...(spec.missingArea?['Metragem ausente']:[]),...(spec.missingCompany?['Identidade empresarial não comprovada']:[]),
    ...(spec.reportFocus!=='inventory'?(spec.monetaryBasis==='principal_and_fees'?['Principal + taxas']:['Principal, sem taxas']):[])].slice(0,20);
  const title=`Relatório comercial · ${scopeLabels.join(' · ')}`.slice(0,180);
  const response:WorkerResponse={version:2,worker:'mapa',intent:'map_report',summary:`${totals.orders.toLocaleString('pt-BR')} ${totals.orders===1?'pedido distinto':'pedidos distintos'} no recorte consultado: ${totals.signedLots.toLocaleString('pt-BR')} ${totals.signedLots===1?'lote com assinatura confirmada':'lotes com assinatura confirmada'} e ${totals.pendingLots.toLocaleString('pt-BR')} aguardando assinatura.`,
    metadata:{organizationId:request.orgId,projectId:spec.projectId,...(snapshot.scope.editionYear?{edition:`Fenasoja ${snapshot.scope.editionYear}`}:{ }),timezone:'America/Sao_Paulo',scope:scopeLabels.join(' · ').slice(0,180),updatedAt:snapshot.generatedAt,completeness:snapshot.coverage.complete?'complete':'partial',filters:{commercial:spec},notes:[]},blocks:[]};
  if(spec.period)response.metadata.period={from:spec.period.from,to:spec.period.to,label:filters.find(filter=>filter.startsWith('Assinadas de')||filter.startsWith('Cadastradas de'))!};
  const indicators:Extract<WorkerResponseBlock,{type?:'indicators'}>['items']=[
    {label:'Pedidos distintos',value:totals.orders,unit:'count',description:'Um pedido pode conter vários lotes; pedidos parciais não duplicam o total.'},
    {label:'Com assinatura confirmada',value:totals.signedLots,unit:'count',description:'Quantidade de lotes com confirmação de assinatura comprovada no fluxo comercial.'},
    {label:'Aguardando assinatura',value:totals.pendingLots,unit:'count',description:'Itens ativos pendentes. Não representa recebimento.'},
    {label:'Legado sem comprovação',value:totals.legacyLots,unit:'count',description:'Histórico vendido sem comprovação de assinatura; preserva a situação do mapa.'},
  ];
  if(capabilities.monetaryValues&&totals.principalCents!==null)indicators.push({label:'Principal negociado',value:totals.principalCents/100,unit:'BRL',description:'Snapshots dos itens do recorte; taxas e recebimentos são dimensões separadas.'});
  if(capabilities.contractReferences&&totals.documents!==null)indicators.push({label:'Documentos ativos',value:totals.documents,unit:'count',description:'Documentos lógicos distintos com vínculos explícitos; anexação não comprova assinatura.'});
  response.blocks.push({type:'indicators',items:indicators});
  if(spec.reportFocus==='inventory'){
    response.summary=`${snapshot.inventoryCount.toLocaleString('pt-BR')} ${snapshot.inventoryCount===1?'espaço comercial':'espaços comerciais'} no inventário atual do recorte consultado.`;
    response.blocks=[{type:'indicators',items:snapshot.inventorySummary.slice(0,7).map(group=>({label:mapStates[group.status]??'Situação não detalhada',value:group.lots,unit:'count' as const}))}];
    if(!snapshot.inventorySummary.length)response.blocks=[];
  }else if(spec.reportFocus==='exhibitors'){
    response.summary=`${totals.exhibitors.toLocaleString('pt-BR')} ${totals.exhibitors===1?'expositor distinto':'expositores distintos'} com identidade comprovada no recorte consultado.`;
    response.blocks=[{type:'indicators',items:[{label:'Expositores distintos',value:totals.exhibitors,unit:'count'},{label:'Pedidos distintos',value:totals.orders,unit:'count'}]}];
  }else if(spec.reportFocus==='contracts'){
    if(!capabilities.contractReferences)throw new WorkerError('report_contract_information_restricted',403);
    response.summary=`${snapshot.contractCount.toLocaleString('pt-BR')} ${snapshot.contractCount===1?'documento lógico':'documentos lógicos'} no recorte consultado. A vinculação de documento não comprova assinatura.`;
    response.blocks=[{type:'indicators',items:[{label:'Documentos lógicos',value:snapshot.contractSummary.total,unit:'count'},{label:'Versões de documentos',value:snapshot.contractSummary.versions,unit:'count'},{label:'Abrangem vários lotes',value:snapshot.contractSummary.multiLot,unit:'count'},{label:'Com versões anteriores',value:snapshot.contractSummary.withPriorVersions,unit:'count'}]}];
  }
  if(spec.monetaryBasis==='principal_and_fees'&&capabilities.monetaryValues){
    const amounts:Extract<WorkerResponseBlock,{type?:'indicators'}>['items']=[];
    if(totals.feesCents!==null)amounts.push({label:'Taxas rateadas',value:totals.feesCents/100,unit:'BRL'});
    if(totals.totalCents!==null)amounts.push({label:'Principal + taxas',value:totals.totalCents/100,unit:'BRL'});
    if(amounts.length)response.blocks.push({type:'indicators',items:amounts});
  }
  const previewTitle=`Exibindo ${snapshot.previewCount.toLocaleString('pt-BR')} de ${snapshot.rowCount.toLocaleString('pt-BR')} ${spec.reportFocus==='contracts'?'documentos':spec.reportFocus==='inventory'?spec.groupBy==='none'?'espaços':'grupos':spec.reportFocus==='exhibitors'?'identidades':'itens'}`;
  if(spec.reportFocus==='contracts'&&snapshot.contracts.length)response.blocks.push({type:'table',title:previewTitle,columns:['Documento','Empresa / expositor','Abrangência','Lotes vinculados','Versão ativa','Versões','Situação','Cobertura do pedido'],rows:snapshot.contracts.map((contract,index)=>[
    clean(contract.reference??`Documento ${index+1}`).slice(0,400),capabilities.companyNames?contract.exhibitors.map(exhibitor=>clean(exhibitor.displayName??'Identificação não comprovada')).join('; ').slice(0,400)||'Identificação não comprovada':'Informação restrita',contract.scope==='LOT'?'Por lote':'Itens do pedido',number(contract.lotIds.length),number(contract.activeVersion),number(contract.versionCount),contract.active?'Ativo':'Inativo',contract.orderCoverage?contract.orderCoverage.complete?'Todos os lotes ativos':`${number(contract.orderCoverage.coveredLots)} de ${number(contract.orderCoverage.totalLots)} lotes ativos`:'Não se aplica',
  ])});
  else if(spec.reportFocus==='inventory'&&spec.groupBy!=='none'&&snapshot.groups.length)response.blocks.push({type:'table',title:previewTitle,columns:['Área / pavilhão','Espaços','Disponíveis','Vendidos no mapa','Em aberto','Bloqueados'],rows:snapshot.groups.map(group=>[
    clean(mapStates[group.label]??group.label).slice(0,400),number(group.lots),number(group.availableLots??0),number(group.soldMapLots??0),number(group.saleOpenLots??0),number(group.blockedLots??0),
  ])});
  else if(spec.reportFocus==='inventory'&&snapshot.inventory.length)response.blocks.push({type:'table',title:previewTitle,columns:['Espaço','Área / pavilhão','Quadra','Área atual (m²)','Situação','Geometria'],rows:snapshot.inventory.map(lot=>[
    clean(lot.lotLabel).slice(0,400),clean(lot.pavilionName??lot.segmentName??'Sem classificação').slice(0,400),clean(lot.block??'Sem quadra'),number(lot.currentArea),mapStates[lot.status]??'Situação não detalhada',lot.hasGeometry?'Cadastrada':'Não disponível',
  ])});
  else if(spec.reportFocus==='exhibitors'&&snapshot.groups.length)response.blocks.push({type:'table',title:previewTitle,columns:['Empresa / expositor','Lotes','Pedidos','Área negociada (m²)',...(capabilities.monetaryValues?['Principal (R$)']:[])],rows:snapshot.groups.map(group=>[
    clean(group.label).slice(0,400),number(group.lots),number(group.orders),number(group.historicalArea),...(capabilities.monetaryValues?[currency(group.principalCents)]:[]),
  ])});
  const headers=['Empresa / expositor','Lote','Área negociada (m²)','Assinatura',...(capabilities.monetaryValues?['Principal (R$)']:[]),...(capabilities.contractReferences?['Documentos ativos']:[]),...(spec.issuesOnly?['Revisão']:[])];
  if(spec.reportFocus==='sales'&&snapshot.rows.length)response.blocks.push({type:'table',title:previewTitle,columns:headers,
    rows:snapshot.rows.map(row=>[capabilities.companyNames?clean(row.displayName??'Identificação não comprovada').slice(0,400):'Informação restrita',clean(row.lotLabel).slice(0,400),number(row.historicalArea),states[row.state],
      ...(capabilities.monetaryValues?[currency(row.principalCents)]:[]),...(capabilities.contractReferences?[row.documentCount===null?'Não informado':number(row.documentCount)]:[]),...(spec.issuesOnly?[row.issues.map(code=>issueLabels[code]??'Vínculo precisa de revisão').join('; ').slice(0,400)]:[])])});
  if(!displayed.length)response.blocks.push({type:'empty',message:'Nenhum registro atende aos filtros informados. A ausência de resultado é limitada ao recorte e às permissões consultadas.'});
  if(spec.sections.includes('charts')&&snapshot.coverage.complete&&snapshot.chart.data.length){
    const groups=snapshot.chart.data.map(group=>({label:label(mapStates[group.label]??group.label),value:group.value}));
    if(new Set(groups.map(group=>group.label)).size===groups.length)response.blocks.push({type:'bar_chart',title:snapshot.chart.unit==='BRL'?'Principal negociado por grupo':spec.reportFocus==='contracts'?'Documentos por grupo':'Lotes por grupo',unit:snapshot.chart.unit,data:groups,population:snapshot.chart.population,complete:true});
  }
  if(snapshot.comparison&&spec.period){
    const earlier=snapshot.comparison.totals;
    response.blocks.push({type:'comparison',title:spec.period.basis==='signed'?'Comparação por data da assinatura':'Comparação por data de cadastro',currentLabel:`${spec.period.from.split('-').reverse().join('/')} a ${spec.period.to.split('-').reverse().join('/')}`,previousLabel:`${snapshot.comparison.period.from.split('-').reverse().join('/')} a ${snapshot.comparison.period.to.split('-').reverse().join('/')}`,unit:'count',items:[
      {label:'Pedidos distintos',current:totals.orders,previous:earlier.orders},{label:'Lotes com assinatura confirmada',current:totals.signedLots,previous:earlier.signedLots},{label:'Lotes aguardando assinatura',current:totals.pendingLots,previous:earlier.pendingLots},
    ]});
  }
  response.blocks.unshift({type:'commercial_report',snapshotId:snapshot.snapshotId,...(snapshot.artifact?.reportId?{reportId:snapshot.artifact.reportId}:{}),title,scopeLabels,filterLabels:filters.map(label),generatedAt:snapshot.generatedAt,generation:snapshot.generation,
    rowCount:snapshot.rowCount,previewCount:snapshot.previewCount,coverage:{...snapshot.coverage,issues:snapshot.coverage.issues.slice(0,30)},capabilities,status:snapshot.artifact?.status??'available',...(snapshot.artifact?.expiresAt?{expiresAt:snapshot.artifact.expiresAt}:{})});
  if(spec.sections.includes('plan_2d'))response.blocks.push({type:'commercial_plan',snapshotId:snapshot.snapshotId,generation:snapshot.generation,title:'Planta 2D do recorte',scopeLabels,lotCount:snapshot.plan.lotCount,missingGeometryCount:snapshot.plan.missingGeometryCount});
  response.metadata.notes=[
    ...(!capabilities.contractReferences?['Documentos: informação restrita. Ausência de permissão não significa ausência de contrato.']:[]),
    ...(!capabilities.companyNames?['Identificação empresarial: informação restrita.']:[]),
    ...(!capabilities.monetaryValues?['Valores: informação restrita.']:[]),
    ...(totals.soldMapLots!==totals.signedLots?[`Vendidos no mapa: ${number(totals.soldMapLots)}. Essa situação pode incluir legado; assinatura confirmada tem evidência própria.`]:[]),
    'Pagamento e assinatura são independentes. Documentos e empresas que cruzam áreas não têm contagens aditivas.',
    ...snapshot.notes.map(note=>clean(note).slice(0,1200)),
  ].slice(0,8);
  if(citations.length)response.blocks.push({type:'sources',items:citations});
  const content=encodeWorkerResponse(response);
  if(content.length>22000)throw new WorkerError('result_too_large',502);
  return {content,citations};
}

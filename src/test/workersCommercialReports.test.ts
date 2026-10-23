import { describe, expect, it, vi } from 'vitest';
import { commercialReportSpecSchema, type CommercialReportSnapshot } from '../lib/workers/commercial-report';
import { commercialReportPreview } from '../lib/workers/commercial-report-preview';
import { interpretWorkerIntent } from '../../supabase/functions/_shared/workers/intent';
import { composeWorkerResponse } from '../../supabase/functions/_shared/workers/response-composer';
import { decodeWorkerResponse, workerResponseSchema } from '../../supabase/functions/_shared/workers/response-contract';
import { runWorkerTurn, adaptCommercialResponseVersion, type WorkerTurnDependencies } from '../../supabase/functions/_shared/workers/engine';
import { asksForMutation, parseWorkerRequest, type ReadResult, type WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';

const project='10000000-0000-4000-8000-000000000001',org='10000000-0000-4000-8000-000000000002',sid='10000000-0000-4000-8000-000000000003',conversation='10000000-0000-4000-8000-000000000004';
const now=new Date('2026-10-23T13:00:00Z');
const request:WorkerRequest={orgId:org,requestId:'10000000-0000-4000-8000-000000000005',worker:'mapa',message:'Como estão as vendas da ExpoRural?',context:{route:'/equipe-ia/mapa',responseVersion:2}};
function snapshot():CommercialReportSnapshot{
 const spec=commercialReportSpecSchema.parse({projectId:project,scopeSearch:['ExpoRural']});
 return {schemaVersion:1,snapshotId:sid,generatedAt:now.toISOString(),generation:'a'.repeat(32),spec,scope:{projectId:project,projectName:'Fenasoja — dados sintéticos',editionYear:null,timezone:'America/Sao_Paulo'},
 totals:{orders:1,signedLots:31,pendingLots:5,legacyLots:1,cancelledItems:0,partialOrders:1,exhibitors:1,documents:1,soldMapLots:32,availableLots:2,inventoryLots:38,principalCents:360000,signedPrincipalCents:310000,pendingPrincipalCents:50000,legacyPrincipalCents:0,feesCents:101,totalCents:360101,historicalArea:720,currentArea:760},
 coverage:{complete:true,excludedRows:0,issues:[]},capabilities:{companyNames:true,monetaryValues:true,contractReferences:true},rows:[],inventory:[],contracts:[],groups:[],calibration:null,notes:['Dados sintéticos identificados para teste.'],planOutlines:[]};
}
function result(full=snapshot()):ReadResult{
 return {summary:'Consulta sintética',records:[{...commercialReportPreview(full),artifact:{snapshotId:full.snapshotId,status:'available'}}],citations:[{label:'Mapa Comercial',url:'/mapa-comercial',source:'app'}],commercialSnapshot:full};
}
function response(full=snapshot()){
 const evidence=result(full);delete evidence.commercialSnapshot;
 return composeWorkerResponse(request,interpretWorkerIntent(request,now),[{tool:'map_commercial_report_query',input:{},result:evidence}],now);
}
function dependencies(history:Array<{role:string;content:string}>=[]):WorkerTurnDependencies{
 return {provider:{model:'test',complete:vi.fn()},listTools:vi.fn(async()=>[{name:'map_commercial_report_query',description:'Consulta completa',readOnly:true as const,inputJsonSchema:{}}]),executeTool:vi.fn(async()=>result()),
 begin:vi.fn(async()=>({conversationId:conversation,replayed:false})),finish:vi.fn(),fail:vi.fn(),history:vi.fn(async()=>history),now:()=>now,
 captureCommercialReport:vi.fn(async value=>({snapshotId:value.snapshotId,status:'available' as const})),resolveCommercialReport:vi.fn(async()=>snapshot())};
}
describe('commercial intent and semantic continuity',()=>{
 it('preserves geography while changing signature, names, PDF, fees and presentation',()=>{
  let current=response();const history=[{role:'user',content:request.message},{role:'assistant',content:current.content}];
  const pending=interpretWorkerIntent({...request,message:'Mostre só as que aguardam assinatura.'},now,history);
  expect(pending).toMatchObject({kind:'map_report',commercialSpec:{scopeSearch:['ExpoRural'],saleStates:['pending']},generatePdf:false});
  const changed=snapshot();changed.spec={...changed.spec,...pending.commercialSpec};current=response(changed);
  history.push({role:'assistant',content:current.content});
  for(const message of ['Inclua os nomes das empresas e os lotes.','Agora gere em PDF com a planta.','Agora inclua taxas.','Tire os gráficos e mantenha a tabela.']){
   const intent=interpretWorkerIntent({...request,message},now,history);
   expect(intent.commercialSpec).toMatchObject({scopeSearch:['ExpoRural'],saleStates:['pending']});
   if(message.includes('PDF'))expect(intent).toMatchObject({generatePdf:true,commercialSpec:{sections:expect.arrayContaining(['plan_2d'])}});
   if(message.includes('taxas'))expect(intent.commercialSpec?.monetaryBasis).toBe('principal_and_fees');
   if(message.includes('gráficos'))expect(intent.commercialSpec?.sections).not.toContain('charts');
  }
 });
 it('keeps physical pavilion identity and does not infer an edition from a civil period',()=>{
  const intent=interpretWorkerIntent({...request,message:'Inclua somente assinadas no Pavilhão 12 em outubro de 2026.'},now);
  expect(intent).toMatchObject({kind:'map_report',commercialSpec:{scopeSearch:['Pavilhão 12'],saleStates:['signed'],period:{basis:'signed',from:'2026-10-01',to:'2026-10-31'}}});
  expect(intent.editionYear).toBeUndefined();expect(intent.commercialSpec?.editionYear).toBeUndefined();
 });
 it('asks about material contract ambiguity and unavailable historical reconstruction',()=>{
  expect(interpretWorkerIntent({...request,message:'Quantos contratos no Pavilhão 13?'},now).commercialClarification).toBe('contract_unit');
  expect(interpretWorkerIntent({...request,message:'Como estava o Pavilhão 13 em 01/10/2026?'},now).commercialClarification).toBe('historical_position');
 });
 it('allows report refresh while preserving business mutation protection',()=>{
  expect(asksForMutation('Atualize o relatório com as últimas vendas.')).toBe(false);
  expect(asksForMutation('Atualize o relatório e confirme a venda.')).toBe(true);
  expect(parseWorkerRequest({...request,context:{route:'/equipe-ia/mapa',commercialSnapshotId:sid,responseVersion:2}}).context?.commercialSnapshotId).toBe(sid);
  expect(()=>parseWorkerRequest({...request,context:{route:'/equipe-ia/mapa',commercialSnapshotId:'B12'}})).toThrow();
 });
});
describe('commercial evidence, v2 response and immutable PDF generation',()=>{
 it('downgrades verified facts for an older client before streaming and persistence',async()=>{
  const deps=dependencies();await runWorkerTurn({...request,context:undefined},deps,()=>{});
  const saved=decodeWorkerResponse(vi.mocked(deps.finish).mock.calls[0][1].content)!;
  expect(saved.version).toBe(1);expect(saved.summary).toContain('31 lotes');expect(saved.blocks.some(block=>block.type==='commercial_report'||block.type==='commercial_plan')).toBe(false);
  expect(saved.metadata.filters?.commercial).toBeUndefined();expect(adaptCommercialResponseVersion(response().content,request)).toBe(response().content);
 });
 it('renders authoritative totals independent of the preview and never invents restricted zeros',()=>{
  const decoded=decodeWorkerResponse(response().content)!;
  expect(decoded.version).toBe(2);expect(decoded.summary).toContain('31 lotes com assinatura confirmada');
  expect(decoded.metadata.edition).toBeUndefined();
  expect(decoded.blocks.find(b=>b.type==='commercial_report')).toMatchObject({snapshotId:sid,rowCount:0,previewCount:0,status:'available'});
  const restricted=snapshot();restricted.capabilities.contractReferences=false;restricted.totals.documents=null;
  const restrictedResponse=decodeWorkerResponse(response(restricted).content)!;
  expect(JSON.stringify(restrictedResponse.blocks)).not.toContain('"label":"Documentos ativos"');
  expect(restrictedResponse.metadata.notes.join(' ')).toContain('informação restrita');
  const legacy={...decoded,version:1};expect(workerResponseSchema.safeParse(legacy).success).toBe(false);
 });
 it('captures the full snapshot outside readOnly tools before persisting the preview',async()=>{
  const deps=dependencies();await runWorkerTurn(request,deps,()=>{});
  expect(deps.captureCommercialReport).toHaveBeenCalledWith(expect.objectContaining({snapshotId:sid}),{orgId:org,conversationId:conversation,requestId:request.requestId,generatePdf:false});
  expect(deps.provider.complete).not.toHaveBeenCalled();
  const content=vi.mocked(deps.finish).mock.calls[0][1].content;
  expect(content).not.toContain('commercialSnapshot');expect(content).not.toContain('"inventory"');expect(decodeWorkerResponse(content)?.version).toBe(2);
 });
 it('uses the exact authorized saved photograph for PDF continuation, including a newly requested plan',async()=>{
  const first=response();const deps=dependencies([{role:'user',content:request.message},{role:'assistant',content:first.content}]);
  deps.captureCommercialReport=vi.fn(async value=>({snapshotId:value.snapshotId,reportId:'10000000-0000-4000-8000-000000000009',status:'requested' as const}));
  await runWorkerTurn({...request,conversationId:conversation,message:'Agora gere em PDF com a planta.'},deps,()=>{});
  expect(deps.resolveCommercialReport).toHaveBeenCalledWith(sid,{orgId:org,conversationId:conversation});expect(deps.executeTool).not.toHaveBeenCalled();
  const captured=vi.mocked(deps.captureCommercialReport).mock.calls[0][0];
  expect(captured.generatedAt).toBe(now.toISOString());expect(captured.generation).toBe('a'.repeat(32));expect(captured.spec.sections).toContain('plan_2d');expect(captured.snapshotId).not.toBe(sid);
  const decoded=decodeWorkerResponse(vi.mocked(deps.finish).mock.calls[0][1].content)!;
  expect(decoded.blocks.find(b=>b.type==='commercial_report')).toMatchObject({status:'requested',reportId:'10000000-0000-4000-8000-000000000009'});
 });
 it('queries fresh sources on explicit update, keeping only the saved semantic filters',async()=>{
  const deps=dependencies();await runWorkerTurn({...request,conversationId:conversation,message:'Atualize os dados deste recorte comercial.',context:{route:'/equipe-ia/mapa',commercialSnapshotId:sid,responseVersion:2}},deps,()=>{});
  expect(deps.resolveCommercialReport).toHaveBeenCalled();expect(deps.executeTool).toHaveBeenCalledWith('map_commercial_report_query',expect.objectContaining({project_id:project,spec:expect.objectContaining({scopeSearch:['ExpoRural']})}));
 });
 it('does not leak saved snapshot contents when permission revalidation fails',async()=>{
  const deps=dependencies();deps.resolveCommercialReport=vi.fn(async()=>{throw new Error('Access revoked');});
  await expect(runWorkerTurn({...request,conversationId:conversation,message:'Atualize os dados deste recorte comercial.',context:{route:'/equipe-ia/mapa',commercialSnapshotId:sid,responseVersion:2}},deps,()=>{})).rejects.toThrow();
  expect(deps.executeTool).not.toHaveBeenCalled();expect(deps.captureCommercialReport).not.toHaveBeenCalled();expect(deps.finish).not.toHaveBeenCalled();
 });
});

describe('forty natural acceptance journeys use typed filters, never stored numeric answers',()=>{
 const cases:Array<[string,Record<string,unknown>]>= [
  ['Quantas vendas estão confirmadas?',{commercialSpec:{saleStates:['signed']}}],
  ['Quantas estão em aberto?',{commercialSpec:{saleStates:['pending']}}],
  ['Quantos pedidos estão parcialmente assinados?',{commercialSpec:{saleStates:['partial']}}],
  ['Quanto foi vendido por pavilhão?',{commercialSpec:{groupBy:'scope'}}],
  ['Qual área tem maior valor em andamento?',{commercialSpec:{saleStates:['pending'],sortBy:'value',sortDirection:'desc'}}],
  ['Mostre principal e taxas separados.',{commercialSpec:{monetaryBasis:'principal_and_fees'}}],
  ['Inclua somente assinaturas confirmadas neste mês.',{commercialSpec:{saleStates:['signed'],period:{basis:'signed',from:'2026-10-01',to:'2026-10-31'}}}],
  ['Quais foram as últimas vendas cadastradas?',{commercialSpec:{sortBy:'created',sortDirection:'desc'}}],
  ['Quais empresas estão no Pavilhão 13?',{commercialSpec:{reportFocus:'exhibitors',scopeSearch:['Pavilhão 13'],groupBy:'exhibitor'}}],
  ['Quais lotes uma determinada empresa ocupa?',{commercialClarification:'company_identity'}],
  ['Essa empresa aparece em mais de um pavilhão?',{commercialClarification:'company_identity'}],
  ['Quem ocupa a quadra R da ExpoRural?',{commercialSpec:{scopeSearch:['ExpoRural','Quadra R']}}],
  ['Liste empresa, lote, m² e situação.',{commercialSpec:{reportFocus:'sales'}}],
  ['Quais expositores possuem mais espaços?',{commercialSpec:{reportFocus:'exhibitors',groupBy:'exhibitor',sortBy:'lots',sortDirection:'desc'}}],
  ['Quem tem maior área contratada no Espaço do Automóvel?',{commercialSpec:{reportFocus:'exhibitors',scopeSearch:['Espaço do Automóvel'],sortBy:'area'}}],
  ['Mostre os espaços vendidos sem identificação empresarial comprovada.',{commercialSpec:{reportFocus:'sales',missingCompany:true,inventoryStates:['SOLD']}}],
  ['Quais vendas aguardam assinatura?',{commercialSpec:{saleStates:['pending']}}],
  ['Quais pedidos não têm documento vinculado?',{commercialSpec:{contractFilter:'without_document'}}],
  ['Quais contratos abrangem mais de um lote?',{commercialSpec:{reportFocus:'contracts',documentFilter:'multi_lot'}}],
  ['Quantos documentos ativos existem por pavilhão?',{commercialSpec:{reportFocus:'contracts',documentStates:'active',groupBy:'scope'}}],
  ['Mostre somente pedidos parcialmente assinados.',{commercialSpec:{saleStates:['partial']}}],
  ['Quais documentos têm versões anteriores?',{commercialSpec:{reportFocus:'contracts',documentFilter:'with_prior_versions'}}],
  ['Esse contrato cobre todos os lotes desse pedido?',{commercialClarification:'contract_identity'}],
  ['Liste contratos por empresa, com situação e abrangência.',{commercialSpec:{reportFocus:'contracts',groupBy:'exhibitor'}}],
  ['Compare ExpoRural e Espaço do Automóvel.',{commercialSpec:{scopeSearch:['ExpoRural','Espaço do Automóvel'],groupBy:'scope'}}],
  ['Separe pavilhões ICS e área externa ICS.',{commercialSpec:{scopeSearch:['Indústria, Comércio e Serviços'],geography:'all',groupBy:'scope'}}],
  ['Mostre ocupação e disponibilidade por pavilhão.',{commercialSpec:{reportFocus:'inventory',groupBy:'scope'}}],
  ['Compare vendas cadastradas em dois períodos.',{commercialClarification:'comparison_periods'}],
  ['Quais lotes estão com metragem ausente?',{commercialSpec:{reportFocus:'inventory',missingArea:true,groupBy:'none'}}],
  ['Quais associações precisam de revisão?',{commercialSpec:{reportFocus:'sales',issuesOnly:true}}],
  ['Gere o PDF dessas informações.',{generatePdf:true}],
  ['Faça um relatório executivo do Pavilhão 1.',{generatePdf:true,commercialSpec:{presentation:'executive',scopeSearch:['Pavilhão 1']}}],
  ['Inclua todas as linhas e a planta 2D.',{commercialSpec:{sections:expect.arrayContaining(['plan_2d'])}}],
  ['Gere um relatório das empresas da área externa.',{generatePdf:true,commercialSpec:{geography:'external',reportFocus:'exhibitors'}}],
  ['Faça o PDF somente das pendências de assinatura.',{generatePdf:true,commercialSpec:{saleStates:['pending']}}],
  ['Atualize o relatório com as últimas vendas.',{generatePdf:true,commercialSpec:{sortBy:'created',sortDirection:'desc'}}],
  ['Mantenha o pavilhão e troque o filtro para em aberto.',{commercialSpec:{saleStates:['pending']}}],
  ['Agora inclua taxas.',{commercialSpec:{monetaryBasis:'principal_and_fees'}}],
  ['Tire os gráficos e mantenha a tabela.',{commercialSpec:{sections:expect.not.arrayContaining(['charts'])}}],
  ['Gere a versão detalhada das três áreas externas.',{generatePdf:true,commercialSpec:{presentation:'detailed',geography:'external',scopeSearch:['Indústria, Comércio e Serviços','ExpoRural','Espaço do Automóvel']}}],
 ];
 const history=[{role:'user',content:request.message},{role:'assistant',content:response().content}];
 it.each(cases)('%s',(message,expected)=>{
  expect(interpretWorkerIntent({...request,message},now,history)).toMatchObject({kind:'map_report',...expected});
 });
 it('handles unquoted business names, accents, pavilion typo and arbitrary bounded numeric filters',()=>{
  expect(interpretWorkerIntent({...request,message:'Quais lotes a empresa Café do Sul ocupa?'},now)).toMatchObject({commercialSpec:{companySearch:'Café do Sul'}});
  expect(interpretWorkerIntent({...request,message:'Gere PDF do pavilao 12 com área maior que 42,75 e valor acima de R$ 1.234,56.'},now)).toMatchObject({commercialSpec:{scopeSearch:['Pavilhão 12'],minArea:42.75,minValueCents:123456}});
  expect(interpretWorkerIntent({...request,message:'Compare vendas cadastradas entre setembro e outubro de 2026.'},now)).toMatchObject({commercialSpec:{period:{basis:'created',from:'2026-10-01',to:'2026-10-31'},comparisonPeriod:{basis:'created',from:'2026-09-01',to:'2026-09-30'}}});
 });
 it('preserves cents over a complete 27-group population and creates a real Others partition',()=>{
  const full=snapshot();full.spec.sortBy='value';full.spec.sortDirection='desc';full.groups=Array.from({length:27},(_,index)=>({key:`group-${index}`,label:`Grupo ${index}`,lots:index+1,orders:1,exhibitors:1,principalCents:100+index,feesCents:0,historicalArea:10}));
  const preview=commercialReportPreview(full);
  expect(preview.groups).toHaveLength(20);expect(preview.chart.data).toHaveLength(20);expect(preview.chart.population).toBe(20);expect(preview.chart.sourceGroups).toBe(27);
  expect(Math.round(preview.chart.data.reduce((sum,group)=>sum+group.value,0)*100)).toBe(full.groups.reduce((sum,group)=>sum+group.principalCents!,0));
  expect(preview.chart.data.at(-1)?.label).toBe('Outros');
 });
});

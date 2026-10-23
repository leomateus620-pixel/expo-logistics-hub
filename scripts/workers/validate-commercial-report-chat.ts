/** End-to-end synthetic DB snapshot -> trusted preview -> typed persisted chat document. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {parseCommercialReportSnapshot,commercialReportSpecSchema} from '../../src/lib/workers/commercial-report';
import {commercialReportPreview} from '../../src/lib/workers/commercial-report-preview';
import {composeWorkerResponse} from '../../supabase/functions/_shared/workers/response-composer';
import {decodeWorkerResponse} from '../../supabase/functions/_shared/workers/response-contract';
import {interpretWorkerIntent} from '../../supabase/functions/_shared/workers/intent';
if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE. No live data is used.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href),db=new PGlite();
await db.exec(readFileSync('scripts/workers/fixtures/commercial-report-schema.sql','utf8'));
for(const file of ['20261023140000_workers_commercial_report_query.sql','20261023170000_workers_commercial_report_projection_parity.sql','20261023190000_workers_commercial_report_selectors.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
const project='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000099';
const cases=[
 {message:'Como estão as vendas da ExpoRural?',patch:{scopeSearch:['ExpoRural']}},
 {message:'Quantos documentos ativos existem por pavilhão?',patch:{reportFocus:'contracts',documentStates:'active'}},
 {message:'Quais expositores possuem mais espaços?',patch:{reportFocus:'exhibitors',groupBy:'exhibitor',sortBy:'lots',sortDirection:'desc'}},
 {message:'Mostre ocupação e disponibilidade por pavilhão.',patch:{reportFocus:'inventory'}},
 {message:'Compare assinadas entre setembro e outubro de 2026.',patch:{period:{from:'2026-10-01',to:'2026-10-31',basis:'signed'},comparisonPeriod:{from:'2026-09-01',to:'2026-09-30',basis:'signed'}}},
 {message:'Quais associações precisam de revisão?',patch:{issuesOnly:true}},
];
let checks=0;
for(const test of cases){
 const spec=commercialReportSpecSchema.parse({projectId:project,...test.patch});
 const raw=(await db.query('SELECT workers_map_commercial_report($1,$2::jsonb) data',[project,JSON.stringify(spec)])).rows[0].data;
 const snapshot=parseCommercialReportSnapshot(raw),preview=commercialReportPreview(snapshot);
 const request={orgId:org,requestId:crypto.randomUUID(),worker:'mapa' as const,message:test.message,context:{route:'/equipe-ia/mapa',responseVersion:2 as const}};
 const result={summary:'Dados sintéticos identificados.',records:[{...preview,artifact:{snapshotId:snapshot.snapshotId,status:'available'}}],citations:[{label:'Mapa Comercial',url:'/mapa-comercial',source:'app' as const}]};
 const response=decodeWorkerResponse(composeWorkerResponse(request,interpretWorkerIntent(request,new Date('2026-10-23T13:00:00Z')),[{tool:'map_commercial_report_query',input:{spec},result}],new Date('2026-10-23T13:00:00Z')).content);
 assert.ok(response);assert.equal(response.version,2);assert.equal(response.blocks[0].type,'commercial_report');
 assert.ok(!JSON.stringify(response.blocks.filter(block=>block.type==='table')).includes('"lotId"'));
 const card=response.blocks.find(block=>block.type==='commercial_report');assert.equal(card.rowCount,preview.rowCount);checks+=5;
 if(spec.reportFocus==='inventory'){
  const table=response.blocks.find(block=>block.type==='table');assert.ok(table);assert.equal(table.columns[1],'Espaços');
  assert.equal(preview.groups.reduce((sum,group)=>sum+group.lots,0),snapshot.inventory.length);checks+=3;
 }
 if(spec.reportFocus==='contracts'){
  assert.equal(preview.contractSummary.active,snapshot.contracts.filter(contract=>contract.active).length);checks++;
 }
 if(snapshot.comparison){assert.ok(response.blocks.some(block=>block.type==='comparison'));checks++;}
}
await db.close();console.log(JSON.stringify({ok:true,checks,scope:'synthetic PostgreSQL to chat',cases:cases.length,noPrivateFiles:true}));

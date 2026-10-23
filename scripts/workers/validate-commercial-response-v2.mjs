/** Synthetic PostgreSQL QA: v1 compatibility and authenticated immutable v2 card persistence. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE; this script never connects to a live database.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href),db=new PGlite();
await db.exec(readFileSync('scripts/workers/fixtures/commercial-report-schema.sql','utf8'));
await db.exec(`CREATE SCHEMA workers_private;CREATE SCHEMA storage;CREATE SCHEMA vault;CREATE SCHEMA net;CREATE SCHEMA cron;
CREATE TABLE organizations(id uuid PRIMARY KEY);INSERT INTO organizations VALUES('00000000-0000-4000-8000-000000000099');
CREATE TABLE ai_conversations(id uuid,org_id uuid,user_id uuid,UNIQUE(id,org_id,user_id));
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE vault.secrets(name text,decrypted_secret text);CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets;
CREATE FUNCTION vault.create_secret(value text,name text,description text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN INSERT INTO vault.secrets VALUES(name,value);RETURN gen_random_uuid();END $$;
CREATE TABLE cron.job(jobname text);CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES(name);RETURN 1;END $$;
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE FUNCTION public.ai_workers_redact_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(t,'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}','[e-mail protegido]','g') $$;
INSERT INTO ai_conversations VALUES('00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000090');`);
for(const file of ['20261023140000_workers_commercial_report_query.sql','20261023150000_workers_commercial_report_artifacts.sql','20261023170000_workers_commercial_report_projection_parity.sql','20261017060000_workers_identity_responses.sql','20261023160000_workers_commercial_response_v2.sql','20261023180000_workers_commercial_response_focus.sql','20261023190000_workers_commercial_report_selectors.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
const org='00000000-0000-4000-8000-000000000099',user='00000000-0000-4000-8000-000000000090',conv='00000000-0000-4000-8000-000000000080',request='00000000-0000-4000-8000-000000000070',project='00000000-0000-4000-8000-000000000001';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const spec={schemaVersion:1,projectId:project,orderIds:[],contractIds:[],issuesOnly:false,documentStates:'all',scopes:[],scopeSearch:[],geography:'all',saleStates:[],inventoryStates:[],contractFilter:'any',exhibitorIds:[],missingArea:false,missingCompany:false,monetaryBasis:'principal',groupBy:'scope',sortBy:'scope',sortDirection:'asc',sections:['summary','sales','charts'],presentation:'executive'};
const snapshot=(await q('SELECT workers_map_commercial_report($1,$2::jsonb) data',[project,JSON.stringify(spec)]))[0].data;
await q('SELECT workers_commercial_report_store($1,$2,$3,$4,$5::jsonb)',[org,user,conv,request,JSON.stringify(snapshot)]);
await db.exec(`SELECT set_config('test.user','${user}',false)`);
const base={version:1,worker:'mapa',intent:'map_sales',summary:'Dado sintético de teste.',metadata:{organizationId:org,projectId:project,timezone:'America/Sao_Paulo',scope:'Projeto sintético',updatedAt:snapshot.generatedAt,completeness:'complete',notes:[]},blocks:[{type:'table',columns:['Item'],rows:[['Empresa sintética']]}]};
const fence=v=>'```fenasoja-response\n'+JSON.stringify(v)+'\n```';
const sanitize=async(v,orgId=org)=>(await q('SELECT workers_private.sanitize_response_content($1,$2,$3::jsonb) data',[fence(v),orgId,'[]']))[0].data;
assert.equal(JSON.parse((await sanitize(base)).slice(21,-4)).version,1);
const card={type:'commercial_report',snapshotId:snapshot.snapshotId,title:'Relatório sintético',scopeLabels:['Projeto sintético'],filterLabels:['Principal, sem taxas'],generatedAt:snapshot.generatedAt,generation:snapshot.generation,rowCount:snapshot.rows.length,previewCount:25,coverage:snapshot.coverage,capabilities:snapshot.capabilities,status:'available'};
const response={...base,version:2,intent:'map_report',metadata:{...base.metadata,filters:{commercial:spec}},blocks:[base.blocks[0],card,{type:'commercial_plan',snapshotId:snapshot.snapshotId,generation:snapshot.generation,title:'Planta sintética',scopeLabels:[],lotCount:snapshot.inventory.length,missingGeometryCount:0}]};
const sanitized=JSON.parse((await sanitize(response)).slice(21,-4));
assert.equal(sanitized.version,2);assert.deepEqual(sanitized.blocks,response.blocks);assert.deepEqual(sanitized.metadata.filters.commercial,spec);
for(const patch of [{snapshotId:crypto.randomUUID()},{generation:'b'.repeat(32)},{rowCount:1},{url:'https://example.test/file.pdf'},{status:'ready'},{reportId:crypto.randomUUID()},{capabilities:{...card.capabilities,companyNames:false}}]){
 await assert.rejects(()=>sanitize({...response,blocks:[base.blocks[0],{...card,...patch}]}));
}
await assert.rejects(()=>sanitize({...response,metadata:{...response.metadata,organizationId:crypto.randomUUID()}}));
await assert.rejects(()=>sanitize({...response,metadata:{...response.metadata,filters:{commercial:{...spec,scopeSearch:['https://example.test']}}}}));
for(const focus of ['contracts','exhibitors','inventory']){
 const focusedSpec={...spec,reportFocus:focus,documentFilter:'any',groupBy:focus==='exhibitors'?'exhibitor':'scope'};
 const focused=(await q('SELECT workers_map_commercial_report($1,$2::jsonb) data',[project,JSON.stringify(focusedSpec)]))[0].data;
 await q('SELECT workers_commercial_report_store($1,$2,$3,$4,$5::jsonb)',[org,user,conv,crypto.randomUUID(),JSON.stringify(focused)]);
 const count=focus==='inventory'?new Set(focused.inventory.map(lot=>lot.pavilionId??lot.segmentId??'unclassified')).size:focused[focus==='contracts'?'contracts':'groups'].length;
 const focusedResponse={...response,metadata:{...response.metadata,filters:{commercial:focusedSpec}},blocks:[{...card,snapshotId:focused.snapshotId,generation:focused.generation,generatedAt:focused.generatedAt,rowCount:count,previewCount:Math.min(count,20),coverage:focused.coverage,capabilities:focused.capabilities}]};
 assert.equal(JSON.parse((await sanitize(focusedResponse)).slice(21,-4)).blocks[0].rowCount,count);
}
await db.exec(`SELECT set_config('test.user','00000000-0000-4000-8000-000000000091',false)`);
await assert.rejects(()=>sanitize(response));
await db.exec(readFileSync('supabase/migrations/20261023160000_workers_commercial_response_v2.sql','utf8'));
await db.close();console.log(JSON.stringify({ok:true,checks:16,scope:'isolated synthetic PostgreSQL',v1Compatibility:true,v2ImmutableEvidence:true,noPersistedDownloadUrls:true}));
